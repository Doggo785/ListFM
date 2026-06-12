import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.automation import Automation
from schemas import AutomationCreate, AutomationUpdate


async def get_automations(db: AsyncSession, user_id: str) -> list[Automation]:
    """Get all automations for a user."""
    result = await db.execute(
        select(Automation).where(
            Automation.user_id == user_id,
            Automation.deleted_at.is_(None),
        ).order_by(Automation.created_at.desc())
    )
    return list(result.scalars().all())


async def get_automation(db: AsyncSession, automation_id: str, user_id: str) -> Automation | None:
    """Get a single automation by ID, scoped to user."""
    result = await db.execute(
        select(Automation).where(
            Automation.id == automation_id,
            Automation.user_id == user_id,
            Automation.deleted_at.is_(None),
        )
    )
    return result.scalar_one_or_none()


async def create_automation(db: AsyncSession, user_id: str, lastfm_username: str, data: AutomationCreate) -> Automation:
    """Create a new automation for a user.

    Caller is responsible for committing the session.
    """
    now = datetime.now(timezone.utc)
    automation = Automation(
        id=str(uuid.uuid4()),
        user_id=user_id,
        lastfm_username=lastfm_username,
        name=data.name,
        description=data.description,
        source_type=data.source.type,
        source_period=data.source.period,
        cron=data.cron,
        filter_groups=data.filter_groups,
        output_max_size=data.output.get("maxSize", 50),
        enabled=data.enabled,
        created_at=now,
        updated_at=now,
    )
    db.add(automation)
    await db.flush()
    await db.refresh(automation)
    return automation


async def update_automation(
    db: AsyncSession, automation_id: str, user_id: str, data: AutomationUpdate
) -> Automation | None:
    """Update an automation. Returns None if not found.

    Caller is responsible for committing the session.
    """
    automation = await get_automation(db, automation_id, user_id)
    if automation is None:
        return None

    update_data = data.model_dump(exclude_unset=True)
    if "source" in update_data and update_data["source"] is not None:
        source = update_data.pop("source")
        update_data["source_type"] = source["type"]
        update_data["source_period"] = source["period"]
    if "output" in update_data and update_data["output"] is not None:
        output = update_data.pop("output")
        update_data["output_max_size"] = output.get("maxSize", automation.output_max_size)

    for field, value in update_data.items():
        setattr(automation, field, value)

    automation.updated_at = datetime.now(timezone.utc)
    await db.flush()
    await db.refresh(automation)
    return automation


async def delete_automation(db: AsyncSession, automation_id: str, user_id: str) -> bool:
    """Soft delete an automation. Returns True if deleted, False if not found.

    Caller is responsible for committing the session.
    """
    automation = await get_automation(db, automation_id, user_id)
    if automation is None:
        return False
    automation.deleted_at = datetime.now(timezone.utc)
    await db.flush()
    return True
