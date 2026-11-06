"""Tests for the scheduled automation runner (APScheduler sweep).

Covers:
- a due automation produces exactly one automation_history row and sets last_run
- a not-due automation is skipped (no history row, no last_run)
- ENABLE_SCHEDULER=false (default) means no scheduler is created
- bounded retries: failed runs retry with the original scheduled_for
  (5min -> 20min -> 1h), then stay failed; newer chains supersede old ones
"""

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from httpx import ASGITransport, AsyncClient
from models.automation import Automation
from models.automation_history import AutomationHistory
from models.generated_playlist import GeneratedPlaylist
from models.playlist_track import PlaylistTrack
from models.user import User
from repositories.automation_history import create_automation_history
from routers.automations import _history_loaded_or_409
from services.automation_runner import MAX_ATTEMPT, run_due_automations
from sqlalchemy import delete, func, select

from .conftest import (
    _cleanup_user,
    _get_user_id_from_cookies,
    _register_and_login,
    _TestSessionLocal,
    _unique_email,
    link_lastfm,
)


async def _register_login_link(client: AsyncClient, email: str) -> None:
    """Register, log in, and link a Last.fm account."""
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
    link = await link_lastfm(client, "sched_user")
    assert link.status_code == 200


def _create_body() -> dict:
    return {
        "name": "Scheduled playlist",
        "description": "test",
        "window": {"length": {"amount": 3, "unit": "month"}}, "sort": "most_played",
        "cron": "0 0 1 * *",
        "filterGroups": [],
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

        tracks = [{"artist": "Artist A", "first_played": 0, "title": "Song A"}]
        with patch("services.automation_runner.is_due", return_value=True), patch(
            "services.automation_runner.get_window_tracks", return_value=tracks
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
            {"artist": "Artist A", "first_played": 0, "title": "Song A"},
            {"artist": "Artist B", "first_played": 0, "title": "Song B"},
        ]
        with patch("services.automation_runner.is_due", return_value=True), patch(
            "services.automation_runner.get_window_tracks", return_value=tracks
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
            "services.automation_runner.get_window_tracks",
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
async def test_failed_run_is_not_rerun_by_next_sweep(client: AsyncClient):
    """A failed run bumps last_run: the next sweep leaves it to the retry chain."""
    email = _unique_email()
    try:
        await _register_login_link(client, email)
        created = await client.post("/api/automations", json=_create_body())
        assert created.status_code == 201

        with patch(
            "services.automation_runner.get_window_tracks",
            side_effect=Exception("upstream down"),
        ):
            # Its date came once: the first sweep runs it, the next one reads the real schedule.
            with patch("services.automation_runner.is_due", return_value=True):
                await run_due_automations(session_factory=_TestSessionLocal)
            await run_due_automations(session_factory=_TestSessionLocal)

        async with _TestSessionLocal() as db:
            history = (await db.execute(select(AutomationHistory))).scalars().all()
            assert [(h.status, h.attempt) for h in history] == [("failed", 1)]
    finally:
        await _cleanup_user_with_automations(client, email)


@pytest.mark.asyncio
async def test_failed_run_shows_a_generic_error_not_the_exception_text(client: AsyncClient):
    """Internal error text stays in the logs; history gets a generic message."""
    email = _unique_email()
    try:
        await _register_login_link(client, email)
        created = await client.post("/api/automations", json=_create_body())
        assert created.status_code == 201

        with patch("services.automation_runner.is_due", return_value=True), patch(
            "services.automation_runner.get_window_tracks",
            side_effect=Exception("postgres://admin:hunter2@db internal detail"),
        ):
            await run_due_automations(session_factory=_TestSessionLocal)

        history = await client.get(f"/api/automations/{created.json()['id']}/history")
        assert history.status_code == 200
        shown = str(history.json())
        assert "hunter2" not in shown
        assert "The run failed" in shown
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

        tracks = [{"artist": "Artist A", "first_played": 0, "title": "Song A"}]
        with patch("services.automation_runner.is_due", return_value=True), patch(
            "services.automation_runner.get_window_tracks", return_value=tracks
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

        tracks = [{"artist": "Artist A", "first_played": 0, "title": "Song A"}]
        with patch(
            "services.automation_runner.get_window_tracks", return_value=tracks
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
async def test_manual_run_waits_for_the_first_load_and_leaves_no_row(client: AsyncClient):
    email = _unique_email()
    try:
        await _register_login_link(client, email)
        created = await client.post("/api/automations", json=_create_body())
        automation_id = created.json()["id"]
        failed_id = await _insert_failed_run(automation_id, attempt=1, scheduled_for=datetime.now(UTC))

        tracks = [{"artist": "Artist A", "first_played": 0, "title": "Song A"}]
        with (
            patch("routers.automations._history_loaded_or_409", _history_loaded_or_409),
            patch("routers.automations.start_scrobble_sync") as start,
            patch("services.automation_runner.get_window_tracks", return_value=tracks),
        ):
            for path in ("run", f"history/{failed_id}/retry"):
                resp = await client.post(f"/api/automations/{automation_id}/{path}")
                assert resp.status_code == 409
                assert "still loading" in resp.json()["detail"]
            assert start.call_count == 2
            history = await client.get(f"/api/automations/{automation_id}/history")
            assert [row["id"] for row in history.json()] == [failed_id]

            async with _TestSessionLocal() as db:
                user = await db.get(User, _get_user_id_from_cookies(client))
                user.scrobbles_complete_at = datetime.now(UTC)
                await db.commit()
            resp = await client.post(f"/api/automations/{automation_id}/run")
        assert resp.json()["status"] == "completed"
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
            {"artist": "Artist A", "first_played": 0, "title": "Song A"},
            {"artist": "Artist B", "first_played": 0, "title": "Song B"},
        ]
        with patch(
            "services.automation_runner.get_window_tracks", return_value=tracks
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

        tracks = [{"artist": "Artist A", "first_played": 0, "title": "Song A"}]
        with patch(
            "services.automation_runner.get_window_tracks", return_value=tracks
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
            link = await link_lastfm(fresh, "other_user")
            assert link.status_code == 200
            resp = await fresh.get(f"/api/generated-playlists/{playlist_id}/tracks")
            assert resp.status_code == 404
    finally:
        await _cleanup_user_with_automations(client, email)
        await _cleanup_user(email=other_email)


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

        tracks = [{"artist": "Artist A", "first_played": 0, "title": "Song A"}]
        with patch(
            "services.automation_runner.get_window_tracks", return_value=tracks
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
    """is_due off (phase 1 never fires); listens mocked."""
    return (
        patch("services.automation_runner.is_due", return_value=False),
        patch("services.automation_runner.get_window_tracks", return_value=tracks),
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

        origin = datetime.now(UTC) - timedelta(minutes=6)
        await _insert_failed_run(automation_id, attempt=1, scheduled_for=origin)

        tracks = [{"artist": "Artist A", "first_played": 0, "title": "Song A"}]
        p1, p2 = _sweep_patches(tracks)
        with p1, p2:
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

        origin = datetime.now(UTC) - timedelta(minutes=1)
        await _insert_failed_run(automation_id, attempt=1, scheduled_for=origin)

        tracks = [{"artist": "Artist A", "first_played": 0, "title": "Song A"}]
        p1, p2 = _sweep_patches(tracks)
        with p1, p2:
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

        origin = datetime.now(UTC) - timedelta(hours=2)
        await _insert_failed_run(
            automation_id, attempt=MAX_ATTEMPT, scheduled_for=origin
        )

        tracks = [{"artist": "Artist A", "first_played": 0, "title": "Song A"}]
        p1, p2 = _sweep_patches(tracks)
        with p1, p2:
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

        old_origin = datetime.now(UTC) - timedelta(hours=2)
        await _insert_failed_run(automation_id, attempt=1, scheduled_for=old_origin)
        # A newer completed run supersedes the old failed chain.
        async with _TestSessionLocal() as db:
            await create_automation_history(
                db,
                automation_id=automation_id,
                status="completed",
                tracks_generated=1,
                scheduled_for=datetime.now(UTC) - timedelta(minutes=30),
                attempt=1,
            )
            await db.commit()

        tracks = [{"artist": "Artist A", "first_played": 0, "title": "Song A"}]
        p1, p2 = _sweep_patches(tracks)
        with p1, p2:
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

        origin = datetime.now(UTC) - timedelta(minutes=6)
        await _insert_failed_run(automation_id, attempt=1, scheduled_for=origin)

        tracks = [{"artist": "Artist A", "first_played": 0, "title": "Song A"}]
        p1, p2 = _sweep_patches(tracks)
        with p1, p2:
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

        origin = datetime.now(UTC) - timedelta(minutes=6)
        await _insert_failed_run(automation_id, attempt=1, scheduled_for=origin)

        async with _TestSessionLocal() as db:
            # Simulate a manual run in flight from elsewhere.
            await db.execute(
                select(func.pg_advisory_lock(func.hashtextextended(automation_id, 0)))
            )
            tracks = [{"artist": "Artist A", "first_played": 0, "title": "Song A"}]
            with patch(
                "services.automation_runner.is_due", return_value=True
            ), patch(
                "services.automation_runner.get_window_tracks", return_value=tracks
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

        tracks = [{"artist": "Artist A", "first_played": 0, "title": "Song A"}]
        with patch(
            "services.automation_runner.get_window_tracks", return_value=tracks
        ):
            resp = await client.post(f"/api/automations/{automation_id}/run")
        assert resp.status_code == 200
        entry = resp.json()
        assert entry["attempt"] == 1
        assert entry["scheduled_for"] is not None
    finally:
        await _cleanup_user_with_automations(client, email)

SEASONS = "0 0 1 3,6,9,12 *"


def test_last_fire_time_finds_the_season_that_just_ended():
    from zoneinfo import ZoneInfo

    from services.automation_runner import last_fire_time, window_bounds

    paris = ZoneInfo("Europe/Paris")
    fire = last_fire_time(SEASONS, datetime(2026, 12, 15, 12, 0, tzinfo=UTC), "Europe/Paris")
    assert fire == datetime(2026, 12, 1, tzinfo=paris)
    # Read back from the database in UTC, a retry still covers the same months.
    start, end = window_bounds({"length": {"amount": 3, "unit": "month"}, "ago": None}, fire.astimezone(UTC).astimezone(paris))
    assert (start, end) == (datetime(2026, 9, 1, tzinfo=paris), datetime(2026, 12, 1, tzinfo=paris))


def test_last_fire_time_reaches_rare_and_frequent_schedules():
    from services.automation_runner import last_fire_time

    now = datetime(2026, 11, 5, 10, 30, tzinfo=UTC)
    assert last_fire_time("* * * * *", now, "UTC") == datetime(2026, 11, 5, 10, 30, tzinfo=UTC)
    assert last_fire_time("0 0 1 1 *", now, "UTC") == datetime(2026, 1, 1, tzinfo=UTC)
    assert last_fire_time("0 0 29 2 *", now, "UTC") == datetime(2024, 2, 29, tzinfo=UTC)
    assert last_fire_time("not a cron", now, "UTC") is None


def test_a_new_automation_waits_for_its_next_date():
    from types import SimpleNamespace

    from services.automation_runner import is_due

    automation = SimpleNamespace(cron=SEASONS, last_run=None, created_at=datetime(2026, 11, 5, tzinfo=UTC))
    assert is_due(automation, datetime(2026, 11, 5, 12, tzinfo=UTC)) is False
    assert is_due(automation, datetime(2026, 12, 1, 0, 1, tzinfo=UTC)) is True


@pytest.mark.asyncio
async def test_running_a_scheduled_automation_by_hand_covers_the_last_full_period(client: AsyncClient):
    """Created mid-season, it makes the season that ended, not a window straddling two."""
    email = _unique_email()
    try:
        await _register_login_link(client, email)
        created = await client.post("/api/automations", json={**_create_body(), "cron": SEASONS})
        assert created.status_code == 201
        automation_id = created.json()["id"]

        await run_due_automations(session_factory=_TestSessionLocal)
        assert await _history_rows(automation_id) == []

        tracks = [{"artist": "Artist A", "first_played": 0, "title": "Song A"}]
        with patch("services.automation_runner.get_window_tracks", return_value=tracks) as window_tracks:
            assert (await client.post(f"/api/automations/{automation_id}/run")).status_code == 200

        scheduled = (await _history_rows(automation_id))[0].scheduled_for
        assert (scheduled.month, scheduled.day) in [(3, 1), (6, 1), (9, 1), (12, 1)]
        start, end = window_tracks.call_args.args[2:4]
        assert end == scheduled
        assert (end.year * 12 + end.month) - (start.year * 12 + start.month) == 3
    finally:
        await _cleanup_user_with_automations(client, email)


@pytest.mark.asyncio
async def test_retry_delay_counts_from_the_attempt_not_the_period(client: AsyncClient):
    """A first run covers an old period: its failure must still wait its backoff."""
    email = _unique_email()
    try:
        await _register_login_link(client, email)
        created = await client.post("/api/automations", json=_create_body())
        automation_id = created.json()["id"]
        await _insert_failed_run(
            automation_id,
            attempt=1,
            scheduled_for=datetime.now(UTC) - timedelta(days=60),
            started_at=datetime.now(UTC) - timedelta(minutes=1),
        )

        tracks = [{"artist": "Artist A", "first_played": 0, "title": "Song A"}]
        p1, p2 = _sweep_patches(tracks)
        with p1, p2:
            await run_due_automations(session_factory=_TestSessionLocal)

        assert len(await _history_rows(automation_id)) == 1
    finally:
        await _cleanup_user_with_automations(client, email)


def test_is_due_reads_cron_in_owner_timezone():
    """08:00 means 08:00 on the owner's clock, not 08:00 UTC."""
    from types import SimpleNamespace

    from services.automation_runner import is_due

    # Last run yesterday evening; now is 08:30 Paris = 07:30 UTC, so the
    # 08:00 Paris tick has passed and the 08:00 UTC one has not.
    automation = SimpleNamespace(
        cron="0 8 * * *", last_run=datetime(2026, 11, 2, 20, 0, tzinfo=UTC)
    )
    now = datetime(2026, 11, 3, 7, 30, tzinfo=UTC)
    assert is_due(automation, now, "Europe/Paris") is True
    assert is_due(automation, now, "UTC") is False


@pytest.mark.asyncio
async def test_set_timezone_stores_valid_zone_and_rejects_unknown(client: AsyncClient):
    email = _unique_email()
    try:
        await _register_login_link(client, email)
        assert (await client.get("/api/auth/me")).json()["timezone"] is None

        ok = await client.put("/api/auth/me/timezone", json={"timezone": "Europe/Paris"})
        assert ok.status_code == 200
        assert (await client.get("/api/auth/me")).json()["timezone"] == "Europe/Paris"

        bad = await client.put("/api/auth/me/timezone", json={"timezone": "Mars/Olympus"})
        assert bad.status_code == 422
        assert (await client.get("/api/auth/me")).json()["timezone"] == "Europe/Paris"
    finally:
        await _cleanup_user_with_automations(client, email)


def test_public_error_names_rate_limits_only():
    import pylast
    from services.automation_runner import _public_error

    assert "rate limiting" in _public_error(pylast.WSError(None, "29", "Rate limit exceeded"))
    assert _public_error(RuntimeError("secret")) == "The run failed (Last.fm or server error)."


async def _retry(client: AsyncClient, automation_id: str, history_id: str):
    return await client.post(f"/api/automations/{automation_id}/history/{history_id}/retry")


@pytest.mark.asyncio
async def test_retry_route_keeps_the_scheduled_date_and_the_window(client: AsyncClient):
    email = _unique_email()
    try:
        await _register_login_link(client, email)
        automation_id = (await client.post("/api/automations", json=_create_body())).json()["id"]
        origin = datetime(2026, 1, 15, 8, tzinfo=UTC)
        failed_id = await _insert_failed_run(automation_id, attempt=2, scheduled_for=origin)

        tracks = [{"artist": "Artist A", "first_played": 0, "title": "Song A"}]
        with patch("services.automation_runner.get_window_tracks", return_value=tracks) as window:
            resp = await _retry(client, automation_id, failed_id)
        assert resp.status_code == 200, resp.text
        # The window ends at the original date, not at the retry's.
        assert window.call_args.args[3] == origin

        retry = (await _history_rows(automation_id))[1]
        assert (retry.attempt, retry.scheduled_for, retry.status) == (3, origin, "completed")
        assert retry.generated_playlist_id is not None

        # It succeeded: nothing left to retry, whichever row is named.
        assert (await _retry(client, automation_id, retry.id)).status_code == 409
        assert (await _retry(client, automation_id, failed_id)).status_code == 409
    finally:
        await _cleanup_user_with_automations(client, email)


@pytest.mark.asyncio
async def test_retry_route_allows_an_attempt_past_the_automatic_limit(client: AsyncClient):
    email = _unique_email()
    try:
        await _register_login_link(client, email)
        automation_id = (await client.post("/api/automations", json=_create_body())).json()["id"]
        origin = datetime.now(UTC) - timedelta(days=1)
        failed_id = await _insert_failed_run(automation_id, attempt=MAX_ATTEMPT, scheduled_for=origin)
        tracks = [{"artist": "Artist A", "first_played": 0, "title": "Song A"}]
        with patch("services.automation_runner.get_window_tracks", return_value=tracks):
            assert (await _retry(client, automation_id, failed_id)).status_code == 200
        assert (await _history_rows(automation_id))[1].attempt == MAX_ATTEMPT + 1
    finally:
        await _cleanup_user_with_automations(client, email)


@pytest.mark.asyncio
async def test_retry_route_refuses_other_runs_and_other_users(client: AsyncClient):
    email = _unique_email()
    other_email = _unique_email()
    try:
        await _register_login_link(client, email)
        automation_id = (await client.post("/api/automations", json=_create_body())).json()["id"]
        now = datetime.now(UTC)
        older = await _insert_failed_run(automation_id, attempt=1, scheduled_for=now - timedelta(days=2))
        latest = await _insert_failed_run(automation_id, attempt=1, scheduled_for=now - timedelta(days=1))

        assert (await _retry(client, automation_id, older)).status_code == 409
        assert (await _retry(client, automation_id, "unknown")).status_code == 404

        await _register_and_login(client, other_email)
        assert (await _retry(client, automation_id, latest)).status_code == 404
        assert len(await _history_rows(automation_id)) == 2
    finally:
        await _cleanup_user_with_automations(client, other_email)


async def _history_json(client: AsyncClient, automation_id: str) -> list[dict]:
    return (await client.get(f"/api/automations/{automation_id}/history")).json()


@pytest.mark.asyncio
async def test_a_run_keeps_the_size_it_asked_for(client: AsyncClient):
    email = _unique_email()
    try:
        await _register_login_link(client, email)
        body = _create_body()
        body["output"] = {"maxSize": 50}
        automation_id = (await client.post("/api/automations", json=body)).json()["id"]
        tracks = [{"artist": "Artist A", "first_played": 0, "title": "Song A"}]
        with patch("services.automation_runner.get_window_tracks", return_value=tracks):
            assert (await client.post(f"/api/automations/{automation_id}/run")).status_code == 200

        body["output"] = {"maxSize": 10}
        assert (await client.patch(f"/api/automations/{automation_id}", json=body)).status_code == 200

        run = (await _history_json(client, automation_id))[0]
        assert (run["tracks_generated"], run["target_size"]) == (1, 50)
    finally:
        await _cleanup_user_with_automations(client, email)


@pytest.mark.asyncio
async def test_history_says_what_a_failed_run_does_next(client: AsyncClient):
    email = _unique_email()
    try:
        await _register_login_link(client, email)
        automation_id = (await client.post("/api/automations", json=_create_body())).json()["id"]
        started = datetime(2026, 1, 15, 8, tzinfo=UTC)
        await _insert_failed_run(automation_id, attempt=1, scheduled_for=started)
        await _insert_failed_run(
            automation_id, attempt=2, scheduled_for=started, started_at=started + timedelta(minutes=5)
        )

        settings = SimpleNamespace(enable_scheduler=True)
        with patch("routers.automations.get_settings", return_value=settings):
            head, older = await _history_json(client, automation_id)
            # Only the latest row retries, 20 minutes after attempt 2 started.
            assert datetime.fromisoformat(head["next_retry_at"]) == started + timedelta(minutes=25)
            assert older["next_retry_at"] is None
            assert head["retries_exhausted"] is False

            # A paused automation is skipped by the sweep: promising a retry would be a lie.
            await client.patch(f"/api/automations/{automation_id}", json={"enabled": False})
            assert (await _history_json(client, automation_id))[0]["next_retry_at"] is None
            await client.patch(f"/api/automations/{automation_id}", json={"enabled": True})

        # Without the scheduler nothing retries by itself either.
        with patch("routers.automations.get_settings", return_value=SimpleNamespace(enable_scheduler=False)):
            assert (await _history_json(client, automation_id))[0]["next_retry_at"] is None

        await _insert_failed_run(
            automation_id, attempt=MAX_ATTEMPT, scheduled_for=started, started_at=started + timedelta(hours=2)
        )
        with patch("routers.automations.get_settings", return_value=settings):
            last = (await _history_json(client, automation_id))[0]
        assert last["retries_exhausted"] is True
        assert last["next_retry_at"] is None
    finally:
        await _cleanup_user_with_automations(client, email)


@pytest.mark.asyncio
async def test_latest_runs_gives_each_live_automation_its_last_run(client: AsyncClient):
    email = _unique_email()
    try:
        await _register_login_link(client, email)
        ids = [(await client.post("/api/automations", json=_create_body())).json()["id"] for _ in range(3)]
        first_id, deleted_id = ids[0], ids[1]  # The third never ran: it has no line.
        started = datetime(2026, 1, 15, 8, tzinfo=UTC)
        await _insert_failed_run(first_id, attempt=1, scheduled_for=started)
        latest_id = await _insert_failed_run(
            first_id, attempt=2, scheduled_for=started, started_at=started + timedelta(minutes=5)
        )
        await _insert_failed_run(deleted_id, attempt=1, scheduled_for=started)
        assert (await client.delete(f"/api/automations/{deleted_id}")).status_code == 204

        settings = SimpleNamespace(enable_scheduler=True)
        with patch("routers.automations.get_settings", return_value=settings):
            runs = (await client.get("/api/automations/latest-runs")).json()
        assert [run["id"] for run in runs] == [latest_id]
        assert runs[0]["next_retry_at"] is not None
    finally:
        await _cleanup_user_with_automations(client, email)
