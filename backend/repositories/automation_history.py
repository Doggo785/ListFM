"""Write-only repository for the existing ``automation_history`` table.

The table and its migration already exist (see models/automation_history.py);
this module only inserts rows. No read API or UI yet (write-only phase).
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from models.automation_history import AutomationHistory


async def create_automation_history(
    db: AsyncSession,
    *,
    automation_id: str,
    status: str,
    tracks_generated: int = 0,
    tracks_before_filter: int = 0,
    tracks_after_filter: int = 0,
    error_message: str | None = None,
    filter_groups_used: list | None = None,
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
        tracks_generated=tracks_generated,
        tracks_before_filter=tracks_before_filter,
        tracks_after_filter=tracks_after_filter,
        error_message=error_message,
        filter_groups_used=filter_groups_used,
        started_at=started_at or datetime.now(timezone.utc),
        completed_at=completed_at,
    )
    db.add(history)
    await db.flush()
    return history