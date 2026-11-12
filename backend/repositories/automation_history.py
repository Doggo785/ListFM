"""Repository for the ``automation_history`` table: one row per attempt of a run."""

import uuid
from datetime import UTC, datetime

from models.automation import Automation
from models.automation_history import AutomationHistory
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import distinct_on
from sqlalchemy.ext.asyncio import AsyncSession


async def create_automation_history(
    db: AsyncSession,
    *,
    automation_id: str,
    status: str,
    target_size: int | None = None,
    tracks_generated: int = 0,
    tracks_before_filter: int = 0,
    tracks_after_filter: int = 0,
    error_message: str | None = None,
    filter_groups_used: list | None = None,
    generated_playlist_id: str | None = None,
    scheduled_for: datetime | None = None,
    attempt: int = 1,
    started_at: datetime | None = None,
    completed_at: datetime | None = None,
) -> AutomationHistory:
    """Insert a new automation_history row.

    Caller is responsible for committing the session.
    """
    history = AutomationHistory(
        id=str(uuid.uuid4()),
        automation_id=automation_id,
        status=status,
        target_size=target_size,
        tracks_generated=tracks_generated,
        tracks_before_filter=tracks_before_filter,
        tracks_after_filter=tracks_after_filter,
        error_message=error_message,
        filter_groups_used=filter_groups_used,
        generated_playlist_id=generated_playlist_id,
        scheduled_for=scheduled_for or datetime.now(UTC),
        attempt=attempt,
        started_at=started_at or datetime.now(UTC),
        completed_at=completed_at,
    )
    db.add(history)
    await db.flush()
    return history


async def get_automation_history(
    db: AsyncSession, automation_id: str, limit: int = 50
) -> list[AutomationHistory]:
    """Read an automation's run history, newest first."""
    result = await db.execute(
        select(AutomationHistory)
        .where(AutomationHistory.automation_id == automation_id)
        .order_by(AutomationHistory.started_at.desc())
        .limit(limit)
    )
    return list(result.scalars().all())


async def get_latest_runs(db: AsyncSession, user_id: str) -> list[tuple[AutomationHistory, bool]]:
    """Each live automation's latest run, with whether the automation is enabled."""
    result = await db.execute(
        select(AutomationHistory, Automation.enabled)
        .join(Automation, Automation.id == AutomationHistory.automation_id)
        .where(Automation.user_id == user_id, Automation.deleted_at.is_(None))
        .ext(distinct_on(AutomationHistory.automation_id))
        .order_by(AutomationHistory.automation_id, AutomationHistory.started_at.desc(), AutomationHistory.id.desc())
    )
    return [(row, enabled) for row, enabled in result.all()]
