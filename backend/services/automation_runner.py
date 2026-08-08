"""Shared pipeline for running automations (preview + scheduled sweep).

Pipeline: dispatch source tracks -> deduplicate -> enrich_tracks ->
apply_filters (server-side filter engine) -> explicit track limit.

The pipeline itself is synchronous (pylast + ThreadPoolExecutor inside
``enrich_tracks``); the scheduler runs it via ``run_in_executor`` so it never
blocks the event loop.
"""

import asyncio
from datetime import datetime, timezone

from apscheduler.triggers.cron import CronTrigger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import async_session
from models.automation import Automation
from repositories.automation_history import create_automation_history
from services.filter_engine import apply_filters
from services.lastfm import (
    get_top_tracks,
    get_recent_tracks,
    get_loved_tracks,
    get_top_artists_tracks,
    enrich_tracks,
    deduplicate,
)

DEFAULT_TRACK_LIMIT = 50


class UnsupportedSourceTypeError(ValueError):
    """Raised when an automation source type is not one of the known types."""


def dispatch_source_tracks(source_type: str, username: str, period: str, limit: int) -> list[dict]:
    """Fetch raw source tracks for an automation source type."""
    match source_type:
        case "top_tracks":
            return get_top_tracks(username, period, limit)
        case "recent_tracks":
            return get_recent_tracks(username, limit)
        case "loved_tracks":
            return get_loved_tracks(username, limit)
        case "top_artists":
            return get_top_artists_tracks(username, period, limit)
        case _:
            raise UnsupportedSourceTypeError(f"Unsupported source type: {source_type}")


def run_automation_pipeline(
    username: str,
    source_type: str,
    period: str,
    filter_groups: list,
    max_tracks: int,
    track_limit: int = DEFAULT_TRACK_LIMIT,
) -> dict:
    """Run the full automation pipeline and return the result summary.

    Returns ``{tracks, total, before_filter, source_tracks}``.
    """
    limit = track_limit if not max_tracks else min(max_tracks, track_limit)
    source_tracks = dispatch_source_tracks(source_type, username, period, limit)
    deduped = deduplicate(source_tracks)
    enriched = enrich_tracks(username, deduped, max_enrich=limit)
    filtered = apply_filters(enriched, filter_groups)
    tracks = filtered[:limit]
    return {
        "tracks": tracks,
        "total": len(tracks),
        "before_filter": len(deduped),
        "source_tracks": source_tracks,
    }


async def get_enabled_automations(db: AsyncSession) -> list[Automation]:
    """All non-deleted, enabled automations across every user."""
    result = await db.execute(
        select(Automation).where(
            Automation.enabled.is_(True),
            Automation.deleted_at.is_(None),
        )
    )
    return list(result.scalars().all())


def is_due(automation: Automation, now: datetime | None = None) -> bool:
    """Return True when the automation's cron schedule says it should run now.

    An automation that has never run (``last_run`` is None) is due immediately.
    """
    now = now or datetime.now(timezone.utc)
    cron = getattr(automation, "cron", None)
    if not cron:
        return False
    try:
        trigger = CronTrigger.from_crontab(cron, timezone=timezone.utc)
    except ValueError:
        return False
    last_run = getattr(automation, "last_run", None)
    if last_run is None:
        return True
    next_run = trigger.get_next_fire_time(last_run, now)
    return next_run is not None and next_run <= now


def _filter_groups_to_json(filter_groups):
    """Convert FilterGroup Pydantic models to plain JSON dicts for the JSONB column."""
    if filter_groups is None:
        return None
    return [
        g.model_dump(mode="json") if hasattr(g, "model_dump") else g
        for g in filter_groups
    ]


async def run_automation(db: AsyncSession, automation: Automation) -> None:
    """Run one automation's pipeline and record history + last_run.

    The synchronous pipeline (pylast + ThreadPoolExecutor) runs in the default
    executor so the event loop is never blocked.
    """
    started_at = datetime.now(timezone.utc)
    history = await create_automation_history(
        db,
        automation_id=automation.id,
        status="running",
        filter_groups_used=_filter_groups_to_json(automation.filter_groups),
        started_at=started_at,
    )

    loop = asyncio.get_running_loop()
    try:
        result = await loop.run_in_executor(
            None,
            run_automation_pipeline,
            automation.lastfm_username,
            automation.source_type,
            automation.source_period,
            automation.filter_groups,
            automation.output_max_size,
        )
    except Exception as exc:  # noqa: BLE001 - record any pipeline failure
        history.status = "failed"
        history.error_message = str(exc)[:2000]
        history.completed_at = datetime.now(timezone.utc)
        await db.flush()
        return

    history.status = "completed"
    history.tracks_generated = result["total"]
    history.tracks_before_filter = result["before_filter"]
    history.tracks_after_filter = result["total"]
    history.completed_at = datetime.now(timezone.utc)
    automation.last_run = datetime.now(timezone.utc)
    await db.flush()


async def run_due_automations(session_factory=async_session) -> None:
    """Sweep all enabled automations and run those that are due.

    Re-reads automations from the DB every cycle, so create/update/delete are
    picked up automatically with no resync code. ``session_factory`` is
    injectable for tests.
    """
    async with session_factory() as db:
        automations = await get_enabled_automations(db)
        for automation in automations:
            if not is_due(automation):
                continue
            await run_automation(db, automation)
        await db.commit()