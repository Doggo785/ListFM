"""T3: sweep commits per automation + deterministic order."""

from unittest.mock import patch

from sqlalchemy import select

from .conftest import (
    _cleanup_user,
    _TestSessionLocal,
    _unique_email,
)
from .test_automation_scheduler import (
    _cleanup_user_with_automations,
    _create_body,
    _register_login_link,
)


async def test_enabled_automations_ordered_deterministically(client):
    """Enabled automations come back in creation order (stable sweep)."""
    from models.automation import Automation
    from services.automation_runner import get_enabled_automations

    email = _unique_email()
    try:
        await _register_login_link(client, email)
        for _ in range(3):
            created = await client.post("/api/automations", json=_create_body())
            assert created.status_code == 201

        async with _TestSessionLocal() as db:
            automations = await get_enabled_automations(db)
            ids = [a.id for a in automations]
            assert len(ids) == 3
            created_order = (
                await db.execute(
                    select(Automation.id).order_by(Automation.created_at, Automation.id)
                )
            ).scalars().all()
            assert ids == list(created_order)
    finally:
        await _cleanup_user_with_automations(client, email)


async def test_sweep_commits_per_automation(client):
    """Two due automations commit independently (not one global commit)."""
    from services import automation_runner

    email = _unique_email()
    commit_calls = []

    try:
        await _register_login_link(client, email)
        for _ in range(2):
            created = await client.post("/api/automations", json=_create_body())
            assert created.status_code == 201

        tracks = [{"artist": "Artist A", "title": "Song A"}]

        real_factory = _TestSessionLocal

        def counting_factory():
            db = real_factory()
            orig = db.commit

            async def counting_commit():
                commit_calls.append(1)
                return await orig()

            db.commit = counting_commit  # type: ignore[method-assign]
            return db

        with (
            patch.object(automation_runner, "is_due", return_value=True),
            patch.object(automation_runner, "get_top_tracks", return_value=tracks),
            patch(
                "services.enrich_cache.enrich_tracks",
                side_effect=lambda u, t, max_enrich=50, **kwargs: t,
            ),
        ):
            await automation_runner.run_due_automations(session_factory=counting_factory)

        # One commit per automation at minimum: a single global commit = 1.
        assert len(commit_calls) >= 2
    finally:
        await _cleanup_user_with_automations(client, email)
        await _cleanup_user(email=email)


async def test_sweep_isolates_run_failure(client):
    """One automation's DB error does not cancel the other's run."""
    from models.automation_history import AutomationHistory
    from services import automation_runner
    from sqlalchemy import select

    email = _unique_email()
    try:
        await _register_login_link(client, email)
        created = await client.post("/api/automations", json=_create_body())
        assert created.status_code == 201
        created2 = await client.post("/api/automations", json=_create_body())
        assert created2.status_code == 201

        tracks = [{"artist": "Artist A", "title": "Song A"}]
        calls = {"n": 0}
        rollbacks = []
        real_run = automation_runner.run_automation
        real_factory = _TestSessionLocal

        def rollback_counting_factory():
            db = real_factory()
            orig_rollback = db.rollback

            async def counting_rollback():
                rollbacks.append(1)
                return await orig_rollback()

            db.rollback = counting_rollback  # type: ignore[method-assign]
            return db

        async def flaky_run(db, automation, **kwargs):
            calls["n"] += 1
            if calls["n"] == 1:
                raise RuntimeError("db down for first")
            return await real_run(db, automation, **kwargs)

        with (
            patch.object(automation_runner, "is_due", return_value=True),
            patch.object(automation_runner, "get_top_tracks", return_value=tracks),
            patch(
                "services.enrich_cache.enrich_tracks",
                side_effect=lambda u, t, max_enrich=50, **kwargs: t,
            ),
            patch.object(automation_runner, "run_automation", side_effect=flaky_run),
        ):
            await automation_runner.run_due_automations(
                session_factory=rollback_counting_factory
            )

        # The failed run must leave a clean transaction behind.
        assert len(rollbacks) >= 1
        async with _TestSessionLocal() as db:
            rows = (await db.execute(select(AutomationHistory))).scalars().all()
            # First failed at commit/run level (rolled back), second completed.
            assert len(rows) == 1
            assert rows[0].status == "completed"
    finally:
        await _cleanup_user_with_automations(client, email)


async def test_sweep_survives_retry_failures(client):
    """Retry read/run errors never crash the sweep."""
    from datetime import UTC, datetime, timedelta

    from models.automation import Automation as _A
    from repositories.automation_history import create_automation_history
    from services import automation_runner
    from sqlalchemy import select as _select

    email = _unique_email()
    try:
        await _register_login_link(client, email)
        created = await client.post("/api/automations", json=_create_body())
        assert created.status_code == 201

        # Retry-read failure path: sweep returns cleanly.
        with (
            patch.object(automation_runner, "is_due", return_value=False),
            patch.object(
                automation_runner,
                "get_retryable_failures",
                side_effect=RuntimeError("db down"),
            ),
        ):
            await automation_runner.run_due_automations(
                session_factory=_TestSessionLocal
            )

        # Retry-run failure path: eligible failure + run raising.
        origin = datetime.now(UTC) - timedelta(minutes=6)
        async with _TestSessionLocal() as db:
            auto_id = (await db.execute(_select(_A.id).limit(1))).scalars().one()
            await create_automation_history(
                db,
                automation_id=auto_id,
                status="failed",
                error_message="boom",
                scheduled_for=origin,
                attempt=1,
                started_at=origin,
            )
            await db.commit()

        with (
            patch.object(automation_runner, "is_due", return_value=False),
            patch.object(
                automation_runner, "run_automation", side_effect=RuntimeError("down")
            ),
        ):
            await automation_runner.run_due_automations(
                session_factory=_TestSessionLocal
            )
    finally:
        await _cleanup_user_with_automations(client, email)


async def test_retries_run_oldest_season_first(client):
    """Retryable failures are retried in scheduled_for order."""
    from datetime import UTC, datetime, timedelta

    from repositories.automation_history import create_automation_history
    from services import automation_runner

    email = _unique_email()
    try:
        await _register_login_link(client, email)
        created = await client.post("/api/automations", json=_create_body())
        assert created.status_code == 201
        created2 = await client.post("/api/automations", json=_create_body())
        assert created2.status_code == 201
        first_id = created.json()["id"]
        second_id = created2.json()["id"]

        older = datetime.now(UTC) - timedelta(hours=2)
        newer = datetime.now(UTC) - timedelta(minutes=30)
        by_automation = {first_id: newer, second_id: older}
        async with _TestSessionLocal() as db:
            for automation_id, scheduled_for in by_automation.items():
                await create_automation_history(
                    db,
                    automation_id=automation_id,
                    status="failed",
                    error_message="boom",
                    scheduled_for=scheduled_for,
                    attempt=1,
                    started_at=scheduled_for,
                )
            await db.commit()

        call_order: list[str] = []
        real_run = automation_runner.run_automation

        async def recording_run(db, automation, **kwargs):
            call_order.append(automation.id)
            return await real_run(db, automation, **kwargs)

        tracks = [{"artist": "Artist A", "title": "Song A"}]
        with (
            patch.object(automation_runner, "is_due", return_value=False),
            patch.object(automation_runner, "get_top_tracks", return_value=tracks),
            patch(
                "services.enrich_cache.enrich_tracks",
                side_effect=lambda u, t, max_enrich=50, **kwargs: t,
            ),
            patch.object(automation_runner, "run_automation", side_effect=recording_run),
        ):
            await automation_runner.run_due_automations(
                session_factory=_TestSessionLocal
            )

        assert call_order == [second_id, first_id]
    finally:
        await _cleanup_user_with_automations(client, email)
