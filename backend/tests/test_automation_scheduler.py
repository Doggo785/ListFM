"""Tests for the scheduled automation runner (APScheduler sweep).

Covers:
- a due automation produces exactly one automation_history row and sets last_run
- a not-due automation is skipped (no history row, no last_run)
- ENABLE_SCHEDULER=false (default) means no scheduler is created
- bounded retries: failed runs retry with the original scheduled_for
  (5min -> 20min -> 1h), then stay failed; newer chains supersede old ones
"""

from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import pytest
from httpx import ASGITransport, AsyncClient
import uuid
from sqlalchemy import delete, func, select

from .conftest import _TestSessionLocal, _cleanup_user, _get_user_id_from_cookies, _unique_email
from models.automation import Automation
from models.automation_history import AutomationHistory
from models.generated_playlist import GeneratedPlaylist
from models.playlist_track import PlaylistTrack
from models.track import Track
from repositories.automation_history import create_automation_history
from services.automation_runner import MAX_ATTEMPT, run_due_automations


async def _register_login_link(client: AsyncClient, email: str) -> None:
    """Register, log in, and link a Last.fm account (mocked get_user_info)."""
    reg = await client.post(
        "/api/auth/register",
        json={"email": email, "password": "StrongP@ss1!"},
    )
    assert reg.status_code == 201
    client.cookies.clear()
    login = await client.post(
        "/api/auth/login",
        json={"email": email, "password": "StrongP@ss1!"},
    )
    assert login.status_code == 200
    mock_info = {"username": "sched_user", "image": None}
    with patch("routers.auth_oauth.get_user_info", return_value=mock_info):
        link = await client.post(
            "/api/auth/link-lastfm",
            json={"username": "sched_user"},
        )
    assert link.status_code == 200


def _create_body() -> dict:
    return {
        "name": "Scheduled playlist",
        "description": "test",
        "source": {"type": "top_tracks", "period": "3m"},
        "cron": "0 0 1 * *",
        "filter_groups": [],
        "output": {"maxSize": 50},
        "enabled": True,
    }


async def _cleanup_user_with_automations(client: AsyncClient, email: str) -> None:
    """Delete the user's history + automations first (FK) then the user."""
    user_id = _get_user_id_from_cookies(client)
    async with _TestSessionLocal() as db:
        automation_ids = (
            await db.execute(select(Automation.id).where(Automation.user_id == user_id))
        ).scalars().all()
        if automation_ids:
            await db.execute(
                delete(AutomationHistory).where(AutomationHistory.automation_id.in_(automation_ids))
            )
            playlist_ids = (
                await db.execute(
                    select(GeneratedPlaylist.id).where(
                        GeneratedPlaylist.automation_id.in_(automation_ids)
                    )
                )
            ).scalars().all()
            if playlist_ids:
                await db.execute(
                    delete(PlaylistTrack).where(PlaylistTrack.playlist_id.in_(playlist_ids))
                )
                await db.execute(
                    delete(GeneratedPlaylist).where(GeneratedPlaylist.id.in_(playlist_ids))
                )
        await db.execute(delete(Automation).where(Automation.user_id == user_id))
        await db.commit()
    await _cleanup_user(email=email)


@pytest.mark.asyncio
async def test_scheduler_tick_runs_due_automation(client: AsyncClient):
    """A due automation produces one history row and sets last_run."""
    email = _unique_email()
    try:
        await _register_login_link(client, email)
        created = await client.post("/api/automations", json=_create_body())
        assert created.status_code == 201
        automation_id = created.json()["id"]

        tracks = [{"artist": "Artist A", "title": "Song A"}]
        with patch("services.automation_runner.is_due", return_value=True), patch(
            "services.automation_runner.get_top_tracks", return_value=tracks
        ), patch(
            "services.enrich_cache.enrich_tracks", side_effect=lambda u, t, max_enrich=50: t
        ):
            await run_due_automations(session_factory=_TestSessionLocal)

        async with _TestSessionLocal() as db:
            history = (await db.execute(select(AutomationHistory))).scalars().all()
            assert len(history) == 1
            assert history[0].automation_id == automation_id
            assert history[0].status == "completed"
            assert history[0].tracks_generated == 1
            automation = (
                await db.execute(select(Automation).where(Automation.id == automation_id))
            ).scalar_one()
            assert automation.last_run is not None
    finally:
        await _cleanup_user_with_automations(client, email)


@pytest.mark.asyncio
async def test_scheduler_skip_not_due(client: AsyncClient):
    """A not-due automation is skipped: no history row, no last_run."""
    email = _unique_email()
    try:
        await _register_login_link(client, email)
        created = await client.post("/api/automations", json=_create_body())
        assert created.status_code == 201
        automation_id = created.json()["id"]

        with patch("services.automation_runner.is_due", return_value=False):
            await run_due_automations(session_factory=_TestSessionLocal)

        async with _TestSessionLocal() as db:
            history = (await db.execute(select(AutomationHistory))).scalars().all()
            assert len(history) == 0
            automation = (
                await db.execute(select(Automation).where(Automation.id == automation_id))
            ).scalar_one()
            assert automation.last_run is None
    finally:
        await _cleanup_user_with_automations(client, email)


@pytest.mark.asyncio
async def test_scheduler_run_persists_playlist_and_links_history(client: AsyncClient):
    """A completed run persists a GeneratedPlaylist (+ tracks) linked from history."""
    email = _unique_email()
    try:
        await _register_login_link(client, email)
        created = await client.post("/api/automations", json=_create_body())
        assert created.status_code == 201
        automation_id = created.json()["id"]

        tracks = [
            {"artist": "Artist A", "title": "Song A"},
            {"artist": "Artist B", "title": "Song B"},
        ]
        with patch("services.automation_runner.is_due", return_value=True), patch(
            "services.automation_runner.get_top_tracks", return_value=tracks
        ), patch(
            "services.enrich_cache.enrich_tracks", side_effect=lambda u, t, max_enrich=50: t
        ):
            await run_due_automations(session_factory=_TestSessionLocal)

        async with _TestSessionLocal() as db:
            history = (await db.execute(select(AutomationHistory))).scalars().all()
            assert len(history) == 1
            assert history[0].status == "completed"
            assert history[0].generated_playlist_id is not None

            playlist = (
                await db.execute(
                    select(GeneratedPlaylist).where(
                        GeneratedPlaylist.id == history[0].generated_playlist_id
                    )
                )
            ).scalar_one()
            assert playlist.automation_id == automation_id
            assert playlist.track_count == 2

            links = (
                await db.execute(
                    select(PlaylistTrack).where(PlaylistTrack.playlist_id == playlist.id)
                )
            ).scalars().all()
            assert len(links) == 2
            assert sorted(t.position for t in links) == [0, 1]
    finally:
        await _cleanup_user_with_automations(client, email)


@pytest.mark.asyncio
async def test_scheduler_failed_run_persists_no_playlist(client: AsyncClient):
    """A failed run records history with no linked playlist."""
    email = _unique_email()
    try:
        await _register_login_link(client, email)
        created = await client.post("/api/automations", json=_create_body())
        assert created.status_code == 201

        with patch("services.automation_runner.is_due", return_value=True), patch(
            "services.automation_runner.get_top_tracks",
            side_effect=Exception("upstream down"),
        ):
            await run_due_automations(session_factory=_TestSessionLocal)

        async with _TestSessionLocal() as db:
            history = (await db.execute(select(AutomationHistory))).scalars().all()
            assert len(history) == 1
            assert history[0].status == "failed"
            assert history[0].generated_playlist_id is None
            playlists = (await db.execute(select(GeneratedPlaylist))).scalars().all()
            assert playlists == []
    finally:
        await _cleanup_user_with_automations(client, email)


@pytest.mark.asyncio
async def test_history_endpoint_returns_entries_newest_first(client: AsyncClient):
    """GET /automations/{id}/history returns the run rows with playlist links."""
    email = _unique_email()
    try:
        await _register_login_link(client, email)
        created = await client.post("/api/automations", json=_create_body())
        assert created.status_code == 201
        automation_id = created.json()["id"]

        tracks = [{"artist": "Artist A", "title": "Song A"}]
        with patch("services.automation_runner.is_due", return_value=True), patch(
            "services.automation_runner.get_top_tracks", return_value=tracks
        ), patch(
            "services.enrich_cache.enrich_tracks", side_effect=lambda u, t, max_enrich=50: t
        ):
            await run_due_automations(session_factory=_TestSessionLocal)
            await run_due_automations(session_factory=_TestSessionLocal)

        resp = await client.get(f"/api/automations/{automation_id}/history")
        assert resp.status_code == 200
        entries = resp.json()
        assert len(entries) == 2
        for entry in entries:
            assert entry["automation_id"] == automation_id
            assert entry["status"] == "completed"
            assert entry["generated_playlist_id"] is not None
            assert entry["tracks_generated"] == 1
        started = [e["started_at"] for e in entries]
        assert started == sorted(started, reverse=True)
    finally:
        await _cleanup_user_with_automations(client, email)


@pytest.mark.asyncio
async def test_history_endpoint_404_unknown_or_foreign(client: AsyncClient):
    """History of an unknown id — or another user's automation — is 404."""
    email = _unique_email()
    other_email = _unique_email()
    try:
        await _register_login_link(client, email)
        created = await client.post("/api/automations", json=_create_body())
        automation_id = created.json()["id"]

        resp = await client.get("/api/automations/00000000-0000-0000-0000-000000000000/history")
        assert resp.status_code == 404

        async with AsyncClient(
            transport=ASGITransport(app=client._transport.app), base_url="http://test"
        ) as fresh:
            reg = await fresh.post(
                "/api/auth/register",
                json={"email": other_email, "password": "StrongP@ss1!"},
            )
            assert reg.status_code == 201
            resp = await fresh.get(f"/api/automations/{automation_id}/history")
            assert resp.status_code == 404
    finally:
        await _cleanup_user_with_automations(client, email)
        await _cleanup_user(email=other_email)


@pytest.mark.asyncio
async def test_run_now_triggers_manual_run(client: AsyncClient):
    """POST /automations/{id}/run executes the pipeline and returns history."""
    email = _unique_email()
    try:
        await _register_login_link(client, email)
        created = await client.post("/api/automations", json=_create_body())
        assert created.status_code == 201
        automation_id = created.json()["id"]

        tracks = [{"artist": "Artist A", "title": "Song A"}]
        with patch(
            "services.automation_runner.get_top_tracks", return_value=tracks
        ), patch(
            "services.enrich_cache.enrich_tracks", side_effect=lambda u, t, max_enrich=50: t
        ):
            resp = await client.post(f"/api/automations/{automation_id}/run")
        assert resp.status_code == 200
        entry = resp.json()
        assert entry["automation_id"] == automation_id
        assert entry["status"] == "completed"
        assert entry["tracks_generated"] == 1
        assert entry["generated_playlist_id"] is not None
    finally:
        await _cleanup_user_with_automations(client, email)


@pytest.mark.asyncio
async def test_run_now_404_unknown_or_foreign(client: AsyncClient):
    """Run-now on an unknown id — or another user's automation — is 404."""
    email = _unique_email()
    other_email = _unique_email()
    try:
        await _register_login_link(client, email)
        created = await client.post("/api/automations", json=_create_body())
        automation_id = created.json()["id"]

        resp = await client.post("/api/automations/00000000-0000-0000-0000-000000000000/run")
        assert resp.status_code == 404

        async with AsyncClient(
            transport=ASGITransport(app=client._transport.app), base_url="http://test"
        ) as fresh:
            reg = await fresh.post(
                "/api/auth/register",
                json={"email": other_email, "password": "StrongP@ss1!"},
            )
            assert reg.status_code == 201
            resp = await fresh.post(f"/api/automations/{automation_id}/run")
            assert resp.status_code == 404
    finally:
        await _cleanup_user_with_automations(client, email)
        await _cleanup_user(email=other_email)


@pytest.mark.asyncio
async def test_playlist_tracks_endpoint_returns_ordered_tracks(client: AsyncClient):
    """GET /generated-playlists/{id}/tracks returns the run's frozen tracks."""
    email = _unique_email()
    try:
        await _register_login_link(client, email)
        created = await client.post("/api/automations", json=_create_body())
        automation_id = created.json()["id"]

        tracks = [
            {"artist": "Artist A", "title": "Song A"},
            {"artist": "Artist B", "title": "Song B"},
        ]
        with patch(
            "services.automation_runner.get_top_tracks", return_value=tracks
        ), patch(
            "services.enrich_cache.enrich_tracks", side_effect=lambda u, t, max_enrich=50: t
        ):
            run_resp = await client.post(f"/api/automations/{automation_id}/run")
        assert run_resp.status_code == 200
        playlist_id = run_resp.json()["generated_playlist_id"]

        resp = await client.get(f"/api/generated-playlists/{playlist_id}/tracks")
        assert resp.status_code == 200
        entries = resp.json()
        assert [(e["title"], e["artist"]) for e in entries] == [
            ("Song A", "Artist A"),
            ("Song B", "Artist B"),
        ]
        assert [e["position"] for e in entries] == [0, 1]

        resp = await client.get("/api/generated-playlists/00000000-0000-0000-0000-000000000000/tracks")
        assert resp.status_code == 404
    finally:
        await _cleanup_user_with_automations(client, email)


@pytest.mark.asyncio
async def test_playlist_tracks_endpoint_404_foreign(client: AsyncClient):
    """Another user's playlist tracks are 404 (no existence leak)."""
    email = _unique_email()
    other_email = _unique_email()
    try:
        await _register_login_link(client, email)
        created = await client.post("/api/automations", json=_create_body())
        automation_id = created.json()["id"]

        tracks = [{"artist": "Artist A", "title": "Song A"}]
        with patch(
            "services.automation_runner.get_top_tracks", return_value=tracks
        ), patch(
            "services.enrich_cache.enrich_tracks", side_effect=lambda u, t, max_enrich=50: t
        ):
            run_resp = await client.post(f"/api/automations/{automation_id}/run")
        playlist_id = run_resp.json()["generated_playlist_id"]

        async with AsyncClient(
            transport=ASGITransport(app=client._transport.app), base_url="http://test"
        ) as fresh:
            reg = await fresh.post(
                "/api/auth/register",
                json={"email": other_email, "password": "StrongP@ss1!"},
            )
            assert reg.status_code == 201
            mock_info = {"username": "other_user", "image": None}
            with patch("routers.auth_oauth.get_user_info", return_value=mock_info):
                link = await fresh.post(
                    "/api/auth/link-lastfm",
                    json={"username": "other_user"},
                )
            assert link.status_code == 200
            resp = await fresh.get(f"/api/generated-playlists/{playlist_id}/tracks")
            assert resp.status_code == 404
    finally:
        await _cleanup_user_with_automations(client, email)
        await _cleanup_user(email=other_email)


@pytest.mark.asyncio
async def test_manual_save_does_not_stamp_tracks_fetched(client: AsyncClient):
    """Manual playlist save records identity only, never a fetch stamp."""
    email = _unique_email()
    try:
        await _register_login_link(client, email)
        created = await client.post("/api/automations", json=_create_body())
        automation_id = created.json()["id"]
        suffix = uuid.uuid4().hex[:8]
        resp = await client.post(
            "/api/generated-playlists",
            json={
                "automation_id": automation_id,
                "source_type": "top_tracks",
                "source_period": "3m",
                "tracks": [{"title": f"Saved Song {suffix}", "artist": f"Saved Artist {suffix}"}],
                "track_count": 1,
            },
        )
        assert resp.status_code == 201
        async with _TestSessionLocal() as db:
            row = (
                await db.execute(
                    select(Track).where(
                        Track.artist == f"Saved Artist {suffix}",
                        Track.title == f"Saved Song {suffix}",
                    )
                )
            ).scalar_one()
            assert row.listeners == 0
            assert row.last_fetched_at is None
    finally:
        await _cleanup_user_with_automations(client, email)


@pytest.mark.asyncio
async def test_run_now_concurrent_returns_409_then_succeeds(client: AsyncClient):
    """A trigger while the run lock is held gets 409; freed lock runs 200."""
    email = _unique_email()
    try:
        await _register_login_link(client, email)
        created = await client.post("/api/automations", json=_create_body())
        assert created.status_code == 201
        automation_id = created.json()["id"]

        async with _TestSessionLocal() as db:
            # Simulate an in-flight run from elsewhere (same lock, other session).
            await db.execute(select(func.pg_advisory_lock(func.hashtextextended(automation_id, 0))))
            resp = await client.post(f"/api/automations/{automation_id}/run")
            assert resp.status_code == 409
            assert resp.json()["detail"] == "Automation already running"
            # Session-level locks survive ROLLBACK and pool reuse: unlock now.
            await db.execute(select(func.pg_advisory_unlock(func.hashtextextended(automation_id, 0))))

        tracks = [{"artist": "Artist A", "title": "Song A"}]
        with patch(
            "services.automation_runner.get_top_tracks", return_value=tracks
        ), patch(
            "services.enrich_cache.enrich_tracks", side_effect=lambda u, t, max_enrich=50: t
        ):
            resp = await client.post(f"/api/automations/{automation_id}/run")
        assert resp.status_code == 200
        assert resp.json()["status"] == "completed"
    finally:
        await _cleanup_user_with_automations(client, email)


def test_scheduler_disabled_when_flag_false():
    """ENABLE_SCHEDULER=false (the default) must not create a scheduler."""
    from backend.main import create_scheduler

    with patch("backend.main.settings") as mock_settings:
        mock_settings.enable_scheduler = False
        assert create_scheduler() is None


async def _insert_failed_run(
    automation_id: str,
    *,
    attempt: int,
    scheduled_for: datetime,
    started_at: datetime | None = None,
) -> str:
    """Insert a committed failed history row (simulates a past failed run)."""
    async with _TestSessionLocal() as db:
        row = await create_automation_history(
            db,
            automation_id=automation_id,
            status="failed",
            error_message="Last.fm exploded",
            scheduled_for=scheduled_for,
            attempt=attempt,
            started_at=started_at or scheduled_for,
            completed_at=(started_at or scheduled_for) + timedelta(seconds=10),
        )
        await db.commit()
        return row.id


async def _history_rows(automation_id: str) -> list[AutomationHistory]:
    async with _TestSessionLocal() as db:
        result = await db.execute(
            select(AutomationHistory)
            .where(AutomationHistory.automation_id == automation_id)
            .order_by(AutomationHistory.attempt)
        )
        return list(result.scalars().all())


def _sweep_patches(tracks: list[dict]):
    """is_due off (phase 1 never fires); live source + enrich mocked."""
    return (
        patch("services.automation_runner.is_due", return_value=False),
        patch("services.automation_runner.get_top_tracks", return_value=tracks),
        patch(
            "services.enrich_cache.enrich_tracks",
            side_effect=lambda u, t, max_enrich=50: t,
        ),
    )


@pytest.mark.asyncio
async def test_retry_reruns_failed_with_original_scheduled_for(client: AsyncClient):
    """An eligible failure retries as attempt+1 with the same scheduled_for."""
    email = _unique_email()
    try:
        await _register_login_link(client, email)
        created = await client.post("/api/automations", json=_create_body())
        assert created.status_code == 201
        automation_id = created.json()["id"]

        origin = datetime.now(timezone.utc) - timedelta(minutes=6)
        await _insert_failed_run(automation_id, attempt=1, scheduled_for=origin)

        tracks = [{"artist": "Artist A", "title": "Song A"}]
        p1, p2, p3 = _sweep_patches(tracks)
        with p1, p2, p3:
            await run_due_automations(session_factory=_TestSessionLocal)

        rows = await _history_rows(automation_id)
        assert len(rows) == 2
        retry = rows[1]
        assert retry.attempt == 2
        assert retry.scheduled_for == origin
        assert retry.status == "completed"
        assert retry.generated_playlist_id is not None
    finally:
        await _cleanup_user_with_automations(client, email)


@pytest.mark.asyncio
async def test_retry_waits_for_backoff(client: AsyncClient):
    """A failure younger than its backoff delay is not retried."""
    email = _unique_email()
    try:
        await _register_login_link(client, email)
        created = await client.post("/api/automations", json=_create_body())
        automation_id = created.json()["id"]

        origin = datetime.now(timezone.utc) - timedelta(minutes=1)
        await _insert_failed_run(automation_id, attempt=1, scheduled_for=origin)

        tracks = [{"artist": "Artist A", "title": "Song A"}]
        p1, p2, p3 = _sweep_patches(tracks)
        with p1, p2, p3:
            await run_due_automations(session_factory=_TestSessionLocal)

        assert len(await _history_rows(automation_id)) == 1
    finally:
        await _cleanup_user_with_automations(client, email)


@pytest.mark.asyncio
async def test_retry_stops_after_max_attempt(client: AsyncClient):
    """An attempt-MAX failure is terminal: no further retry, ever."""
    email = _unique_email()
    try:
        await _register_login_link(client, email)
        created = await client.post("/api/automations", json=_create_body())
        automation_id = created.json()["id"]

        origin = datetime.now(timezone.utc) - timedelta(hours=2)
        await _insert_failed_run(
            automation_id, attempt=MAX_ATTEMPT, scheduled_for=origin
        )

        tracks = [{"artist": "Artist A", "title": "Song A"}]
        p1, p2, p3 = _sweep_patches(tracks)
        with p1, p2, p3:
            await run_due_automations(session_factory=_TestSessionLocal)

        assert len(await _history_rows(automation_id)) == 1
    finally:
        await _cleanup_user_with_automations(client, email)


@pytest.mark.asyncio
async def test_newer_chain_supersedes_old_failure(client: AsyncClient):
    """A newer run (manual or cron) buries the old chain: no double retry."""
    email = _unique_email()
    try:
        await _register_login_link(client, email)
        created = await client.post("/api/automations", json=_create_body())
        automation_id = created.json()["id"]

        old_origin = datetime.now(timezone.utc) - timedelta(hours=2)
        await _insert_failed_run(automation_id, attempt=1, scheduled_for=old_origin)
        # A newer completed run supersedes the old failed chain.
        async with _TestSessionLocal() as db:
            await create_automation_history(
                db,
                automation_id=automation_id,
                status="completed",
                tracks_generated=1,
                scheduled_for=datetime.now(timezone.utc) - timedelta(minutes=30),
                attempt=1,
            )
            await db.commit()

        tracks = [{"artist": "Artist A", "title": "Song A"}]
        p1, p2, p3 = _sweep_patches(tracks)
        with p1, p2, p3:
            await run_due_automations(session_factory=_TestSessionLocal)

        assert len(await _history_rows(automation_id)) == 2
    finally:
        await _cleanup_user_with_automations(client, email)


@pytest.mark.asyncio
async def test_retry_skips_disabled_automation(client: AsyncClient):
    """An eligible failure of a disabled automation is left alone."""
    email = _unique_email()
    try:
        await _register_login_link(client, email)
        created = await client.post("/api/automations", json=_create_body())
        automation_id = created.json()["id"]
        patched = await client.patch(
            f"/api/automations/{automation_id}", json={"enabled": False}
        )
        assert patched.status_code == 200

        origin = datetime.now(timezone.utc) - timedelta(minutes=6)
        await _insert_failed_run(automation_id, attempt=1, scheduled_for=origin)

        tracks = [{"artist": "Artist A", "title": "Song A"}]
        p1, p2, p3 = _sweep_patches(tracks)
        with p1, p2, p3:
            await run_due_automations(session_factory=_TestSessionLocal)

        assert len(await _history_rows(automation_id)) == 1
    finally:
        await _cleanup_user_with_automations(client, email)


@pytest.mark.asyncio
async def test_sweep_skips_when_lock_held(client: AsyncClient):
    """Sweep shares the run lock: held lock means no due run and no retry."""
    email = _unique_email()
    try:
        await _register_login_link(client, email)
        created = await client.post("/api/automations", json=_create_body())
        assert created.status_code == 201
        automation_id = created.json()["id"]

        origin = datetime.now(timezone.utc) - timedelta(minutes=6)
        await _insert_failed_run(automation_id, attempt=1, scheduled_for=origin)

        async with _TestSessionLocal() as db:
            # Simulate a manual run in flight from elsewhere.
            await db.execute(
                select(func.pg_advisory_lock(func.hashtextextended(automation_id, 0)))
            )
            tracks = [{"artist": "Artist A", "title": "Song A"}]
            with patch(
                "services.automation_runner.is_due", return_value=True
            ), patch(
                "services.automation_runner.get_top_tracks", return_value=tracks
            ), patch(
                "services.enrich_cache.enrich_tracks",
                side_effect=lambda u, t, max_enrich=50: t,
            ):
                await run_due_automations(session_factory=_TestSessionLocal)
            await db.execute(
                select(func.pg_advisory_unlock(func.hashtextextended(automation_id, 0)))
            )

        # Only the seeded failure: neither phase 1 nor the retry fired.
        assert len(await _history_rows(automation_id)) == 1
    finally:
        await _cleanup_user_with_automations(client, email)


@pytest.mark.asyncio
async def test_run_now_starts_fresh_chain(client: AsyncClient):
    """POST /run records attempt 1 with a fresh scheduled_for."""
    email = _unique_email()
    try:
        await _register_login_link(client, email)
        created = await client.post("/api/automations", json=_create_body())
        automation_id = created.json()["id"]

        tracks = [{"artist": "Artist A", "title": "Song A"}]
        with patch(
            "services.automation_runner.get_top_tracks", return_value=tracks
        ), patch(
            "services.enrich_cache.enrich_tracks",
            side_effect=lambda u, t, max_enrich=50: t,
        ):
            resp = await client.post(f"/api/automations/{automation_id}/run")
        assert resp.status_code == 200
        entry = resp.json()
        assert entry["attempt"] == 1
        assert entry["scheduled_for"] is not None
    finally:
        await _cleanup_user_with_automations(client, email)