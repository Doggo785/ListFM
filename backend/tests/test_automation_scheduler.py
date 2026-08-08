"""Tests for the scheduled automation runner (APScheduler sweep).

Covers:
- a due automation produces exactly one automation_history row and sets last_run
- a not-due automation is skipped (no history row, no last_run)
- ENABLE_SCHEDULER=false (default) means no scheduler is created
"""

from unittest.mock import patch

import pytest
from httpx import AsyncClient
from sqlalchemy import delete, select

from .conftest import _TestSessionLocal, _cleanup_user, _get_user_id_from_cookies, _unique_email
from models.automation import Automation
from models.automation_history import AutomationHistory
from services.automation_runner import run_due_automations


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
            "services.automation_runner.enrich_tracks", side_effect=lambda u, t, max_enrich=50: t
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


def test_scheduler_disabled_when_flag_false():
    """ENABLE_SCHEDULER=false (the default) must not create a scheduler."""
    from backend.main import create_scheduler

    with patch("backend.main.settings") as mock_settings:
        mock_settings.enable_scheduler = False
        assert create_scheduler() is None