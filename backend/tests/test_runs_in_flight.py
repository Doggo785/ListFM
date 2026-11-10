"""Runs at work, manual or scheduled, and the next one: what the app reads to show them on the ribbon."""

import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import patch

from models.automation import Automation
from models.automation_history import AutomationHistory
from services import automation_runner
from sqlalchemy import update

from .conftest import _TestSessionLocal, _unique_email
from .test_automation_scheduler import (
    _cleanup_user_with_automations,
    _create_body,
    _get_user_id_from_cookies,
    _register_login_link,
)


async def test_a_scheduled_run_shows_while_it_works_then_leaves(client):
    email = _unique_email()
    seen = []
    try:
        await _register_login_link(client, email)
        assert (await client.post("/api/automations", json=_create_body())).status_code == 201

        async def tracks_while_looking(*args, **kwargs):
            # Mid-run, as the app would read it.
            seen.append((await client.get("/api/scrobbles/sync")).json()["runs"])
            return [{"artist": "Artist A", "first_played": 0, "title": "Song A"}]

        with (
            patch.object(automation_runner, "is_due", return_value=True),
            patch.object(automation_runner, "get_window_tracks", side_effect=tracks_while_looking),
        ):
            await automation_runner.run_due_automations(session_factory=_TestSessionLocal)
        assert len(seen) == 1
        assert [(run["name"], run["stage"]) for run in seen[0]] == [("Scheduled playlist", "sync")]
        # Ended, it stays a moment as delivering: the app reads every 3 s, a run can last one.
        assert [run["stage"] for run in (await client.get("/api/scrobbles/sync")).json()["runs"]] == ["done"]
        with patch.object(automation_runner, "monotonic", return_value=automation_runner.monotonic() + 60):
            assert (await client.get("/api/scrobbles/sync")).json()["runs"] == []
    finally:
        await _cleanup_user_with_automations(client, email)


async def test_next_run_is_the_soonest_date_now_when_due_or_a_retry(client):
    email = _unique_email()
    try:
        await _register_login_link(client, email)
        user_id = _get_user_id_from_cookies(client)
        now = datetime(2026, 11, 10, 12, 0, tzinfo=UTC)
        async with _TestSessionLocal() as db:
            assert await automation_runner.next_run_at(db, user_id, "UTC", now) is None
        created = (await client.post("/api/automations", json=_create_body())).json()
        async with _TestSessionLocal() as db:
            # "0 0 1 * *": the first of next month at midnight.
            assert await automation_runner.next_run_at(db, user_id, "UTC", now) == datetime(2026, 12, 1, tzinfo=UTC)
            with patch.object(automation_runner, "is_due", return_value=True):
                assert await automation_runner.next_run_at(db, user_id, "UTC", now) == now
            db.add(AutomationHistory(
                id=str(uuid.uuid4()), automation_id=created["id"], status="failed", attempt=1,
                scheduled_for=now - timedelta(hours=1), started_at=now - timedelta(minutes=2),
            ))
            await db.commit()
            # The failure is retried 5 minutes after its attempt.
            assert await automation_runner.next_run_at(db, user_id, "UTC", now) == now + timedelta(minutes=3)
            await db.execute(update(Automation).where(Automation.id == created["id"]).values(enabled=False))
            await db.commit()
            assert await automation_runner.next_run_at(db, user_id, "UTC", now) is None
    finally:
        await _cleanup_user_with_automations(client, email)
