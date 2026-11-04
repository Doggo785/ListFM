"""Tranche 2: live progress for runs and previews.

The pipeline reports (stage, done, total) to the progress store while a
slow POST runs; the UI polls a progress endpoint on a second connection.
Previews carry a client-made ticket, runs reuse f"run:{automation_id}"
(single-flight guarantees one run per automation at a time).
"""

import time
import uuid
from unittest.mock import patch

import pytest
from httpx import AsyncClient
from models.user import User
from repositories.automation_history import create_automation_history
from services.automation_runner import run_automation_pipeline_cached
from services.progress import store as progress_store

from .conftest import (
    _cleanup_user,
    _get_user_id_from_cookies,
    _TestSessionLocal,
    _unique_email,
)


async def _register_login_link(client: AsyncClient, email: str) -> None:
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
        link = await client.post("/api/auth/link-lastfm", json={"username": "sched_user"})
    assert link.status_code == 200


def _automation_body(filter_groups: list) -> dict:
    return {
        "name": "Progress playlist",
        "description": "test",
        "window": {"length": {"amount": 3, "unit": "month"}}, "sort": "most_played",
        "cron": "0 0 1 * *",
        "filterGroups": filter_groups,
        "output": {"maxSize": 50},
        "enabled": True,
    }


def _listeners_groups() -> list:
    return [{"conditions": [{"field": "listeners", "operator": "gt", "value": 0}]}]


@pytest.mark.asyncio
async def test_pipeline_reports_progress_to_store():
    """The pipeline leaves stage/filter reports on the ticket."""
    suffix = uuid.uuid4().hex[:8]
    base = {"artist": f"PA {suffix}", "title": f"PS {suffix}"}
    key = f"test:{suffix}"
    async with _TestSessionLocal() as db:
        db.add(User(id=f"u-{suffix}"))
        await db.commit()
    async with _TestSessionLocal() as db:
        progress_store.start(key)
        with (
            patch(
                "services.automation_runner.get_window_tracks",
                return_value=[{**base, "listeners": 10}],
            ),
        ):
            await run_automation_pipeline_cached(
                db,
                user_id=f"u-{suffix}",
                username="u",
                window={"length": None},
                sort="most_played",
                filter_groups=_listeners_groups(),
                max_tracks=50,
                progress_key=key,
            )
    progress = progress_store.read(key)
    assert progress.stage == "filter"
    assert progress.done == 1
    assert progress.total == 1








@pytest.mark.asyncio
async def test_preview_with_token_reports_done(client: AsyncClient):
    """POST preview with a ticket, then GET progress shows done."""
    email = _unique_email()
    try:
        await _register_login_link(client, email)
        suffix = uuid.uuid4().hex[:8]
        base = {"artist": f"PV {suffix}", "title": f"PT {suffix}"}
        token = uuid.uuid4().hex
        body = {
            "automation": _automation_body(
                [
                    {
                        "id": "g1",
                        "logic": "AND",
                        "conditions": [
                            {
                                "id": "c1",
                                "field": "userplaycount",
                                "operator": "gte",
                                "value": 0,
                                "valueMax": None,
                                "countMin": 0,
                                "tagSource": "artist",
                            }
                        ],
                        "groups": [],
                    }
                ]
            ),
            "progress_token": token,
        }
        with (
            patch(
                "services.automation_runner.get_window_tracks",
                return_value=[dict(base)],
            ),
        ):
            resp = await client.post("/api/automations/preview", json=body)
        assert resp.status_code == 200
        assert resp.json()["cancelled"] is False
        progress = await client.get(f"/api/automations/preview-progress/{token}")
        assert progress.status_code == 200
        assert progress.json()["stage"] == "done"
    finally:
        await _cleanup_user(client, email)


@pytest.mark.asyncio
async def test_preview_progress_unknown_ticket_404(client: AsyncClient):
    email = _unique_email()
    try:
        await _register_login_link(client, email)
        resp = await client.get("/api/automations/preview-progress/nope")
        assert resp.status_code == 404
        resp = await client.delete("/api/automations/preview-progress/nope")
        assert resp.status_code == 404
    finally:
        await _cleanup_user(client, email)


@pytest.mark.asyncio
async def test_preview_cancel_known_ticket(client: AsyncClient):
    email = _unique_email()
    try:
        await _register_login_link(client, email)
        token = uuid.uuid4().hex
        progress_store.start(f"preview:{token}")
        resp = await client.delete(f"/api/automations/preview-progress/{token}")
        assert resp.status_code == 204
        assert progress_store.is_cancelled(f"preview:{token}") is True
    finally:
        await _cleanup_user(client, email)




@pytest.mark.asyncio
async def test_run_progress_live_then_db_fallback(client: AsyncClient):
    """Run-progress reads the live ticket, then the history row once evicted."""
    email = _unique_email()
    try:
        await _register_login_link(client, email)
        created = await client.post("/api/automations", json=_automation_body([]))
        assert created.status_code == 201
        automation_id = created.json()["id"]
        tracks = [{"artist": "Artist A", "title": "Song A"}]
        with (
            patch(
                "services.automation_runner.get_window_tracks", return_value=tracks
            ),
        ):
            run = await client.post(f"/api/automations/{automation_id}/run")
        assert run.status_code == 200
        live = await client.get(f"/api/automations/{automation_id}/run-progress")
        assert live.status_code == 200
        assert live.json()["stage"] == "done"
        progress_store._entries.pop(f"run:{automation_id}", None)
        fallback = await client.get(f"/api/automations/{automation_id}/run-progress")
        assert fallback.status_code == 200
        assert fallback.json()["stage"] == "done"
    finally:
        await _cleanup_user_with_automations(client, email)


@pytest.mark.asyncio
async def test_run_with_token_reports_on_ticket(client: AsyncClient):
    """POST run with a token reports progress on run:{token}."""
    email = _unique_email()
    try:
        await _register_login_link(client, email)
        created = await client.post("/api/automations", json=_automation_body([]))
        automation_id = created.json()["id"]
        tracks = [{"artist": "Artist A", "title": "Song A"}]
        with (
            patch(
                "services.automation_runner.get_window_tracks", return_value=tracks
            ),
        ):
            run = await client.post(
                f"/api/automations/{automation_id}/run",
                json={"progress_token": "tok-1"},
            )
        assert run.status_code == 200
        progress = await client.get(
            f"/api/automations/{automation_id}/run-progress?token=tok-1"
        )
        assert progress.status_code == 200
        assert progress.json()["stage"] == "done"
        unknown = await client.get(
            f"/api/automations/{automation_id}/run-progress?token=nope"
        )
        assert unknown.status_code == 404
    finally:
        await _cleanup_user_with_automations(client, email)


@pytest.mark.asyncio
async def test_run_progress_no_runs_yet_404(client: AsyncClient):
    """Run-progress with no history row and no ticket is 404."""
    email = _unique_email()
    try:
        await _register_login_link(client, email)
        created = await client.post("/api/automations", json=_automation_body([]))
        automation_id = created.json()["id"]
        resp = await client.get(f"/api/automations/{automation_id}/run-progress")
        assert resp.status_code == 404
    finally:
        await _cleanup_user_with_automations(client, email)


@pytest.mark.asyncio
async def test_run_progress_failed_and_running_fallbacks(client: AsyncClient):
    """Evicted tickets fall back to failed (with message) or running rows."""
    email = _unique_email()
    try:
        await _register_login_link(client, email)
        created = await client.post("/api/automations", json=_automation_body([]))
        automation_id = created.json()["id"]
        tracks = [{"artist": "Artist A", "title": "Song A"}]
        with (
            patch(
                "services.automation_runner.get_window_tracks", return_value=tracks
            ),
            patch(
                "services.automation_runner.run_automation_pipeline_cached",
                side_effect=RuntimeError("lastfm down"),
            ),
        ):
            run = await client.post(f"/api/automations/{automation_id}/run")
        assert run.status_code == 200
        assert run.json()["status"] == "failed"
        progress_store._entries.pop(f"run:{automation_id}", None)
        failed = await client.get(f"/api/automations/{automation_id}/run-progress")
        assert failed.status_code == 200
        assert failed.json()["stage"] == "error"
        assert failed.json()["error"] == "The run failed (Last.fm or server error)."
        async with _TestSessionLocal() as db:
            await create_automation_history(
                db, automation_id=automation_id, status="running"
            )
            await db.commit()
        running = await client.get(f"/api/automations/{automation_id}/run-progress")
        assert running.json()["stage"] == "running"
    finally:
        await _cleanup_user_with_automations(client, email)


async def _cleanup_user_with_automations(client: AsyncClient, email: str) -> None:
    from models.automation import Automation
    from models.automation_history import AutomationHistory
    from models.generated_playlist import GeneratedPlaylist
    from models.playlist_track import PlaylistTrack
    from sqlalchemy import delete, select

    user_id = _get_user_id_from_cookies(client)
    async with _TestSessionLocal() as db:
        automation_ids = (
            await db.execute(select(Automation.id).where(Automation.user_id == user_id))
        ).scalars().all()
        if automation_ids:
            await db.execute(
                delete(AutomationHistory).where(
                    AutomationHistory.automation_id.in_(automation_ids)
                )
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
    await _cleanup_user(client, email)


def _slow_info(*args, **kwargs):
    time.sleep(0.2)
    return {
        "listeners": 1,
        "global_playcount": 2,
        "userplaycount": 3,
        "userloved": False,
        "artist_tags": [],
        "album": None,
        "album_tags": [],
    }




