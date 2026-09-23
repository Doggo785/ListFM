"""Shared pipeline for running automations (preview + scheduled sweep).

Pipeline: dispatch source tracks -> deduplicate -> enrich (DB cache first,
live Last.fm only on misses) -> apply_filters (server-side filter engine)
-> explicit track limit.

The sync ``run_automation_pipeline`` is kept for direct (already-async-safe)
callers; ``run_automation_pipeline_cached`` is the async cache-first path
used by the sweep and the preview endpoint. Blocking pylast calls always run
in the default executor, never on the event loop.
"""

import asyncio
import functools
import logging
from datetime import datetime, timezone

from apscheduler.triggers.cron import CronTrigger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import async_session
from models.automation import Automation
from models.automation_history import AutomationHistory
from models.generated_playlist import GeneratedPlaylist
from repositories.automation_history import create_automation_history
from repositories.generated_playlists import create_generated_playlist
from schemas import GeneratedPlaylistCreate, Track
from services.enrich_cache import enrich_tracks_cached
from services.filter_engine import apply_filters
from services.lastfm import (
    get_top_tracks,
    get_recent_tracks,
    get_loved_tracks,
    get_top_artists_tracks,
    enrich_tracks,
    deduplicate,
)

logger = logging.getLogger(__name__)

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


async def run_automation_pipeline_cached(
    db: AsyncSession,
    *,
    user_id: str,
    username: str,
    source_type: str,
    period: str,
    filter_groups: list,
    max_tracks: int,
    track_limit: int = DEFAULT_TRACK_LIMIT,
) -> dict:
    """Cache-first pipeline: dispatch live, enrich from DB cache, filter.

    Returns the sync pipeline's keys plus ``cache_hits``, ``cache_misses``
    and ``lastfm_calls`` for logs and UI.
    """
    limit = track_limit if not max_tracks else min(max_tracks, track_limit)
    loop = asyncio.get_running_loop()
    source_tracks = await loop.run_in_executor(
        None,
        functools.partial(
            dispatch_source_tracks,
            source_type=source_type,
            username=username,
            period=period,
            limit=limit,
        ),
    )
    deduped = deduplicate(source_tracks)
    enriched, stats = await enrich_tracks_cached(
        db, user_id=user_id, username=username, tracks=deduped, max_enrich=limit
    )
    filtered = apply_filters(enriched, filter_groups)
    tracks = filtered[:limit]
    logger.info(
        "pipeline: %d source -> %d kept (%d cache hits, %d misses, %d Last.fm calls)",
        len(deduped),
        len(tracks),
        stats["hits"],
        stats["misses"],
        stats["lastfm_calls"],
    )
    return {
        "tracks": tracks,
        "total": len(tracks),
        "before_filter": len(deduped),
        "source_tracks": source_tracks,
        "cache_hits": stats["hits"],
        "cache_misses": stats["misses"],
        "lastfm_calls": stats["lastfm_calls"],
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


async def _mark_success(db: AsyncSession, history, result: dict, automation: Automation) -> None:
    """Record a completed run on the history row and bump last_run."""
    history.status = "completed"
    history.tracks_generated = result["total"]
    history.tracks_before_filter = result["before_filter"]
    history.tracks_after_filter = result["total"]
    history.completed_at = datetime.now(timezone.utc)
    automation.last_run = datetime.now(timezone.utc)
    await db.flush()


async def _mark_failure(db: AsyncSession, history, exc: Exception) -> None:
    """Record a failed run on the history row."""
    history.status = "failed"
    history.error_message = str(exc)[:2000]
    history.completed_at = datetime.now(timezone.utc)
    await db.flush()


async def run_automation(db: AsyncSession, automation: Automation) -> AutomationHistory:
    """Run one automation's pipeline and record history + last_run.

    On success the produced tracks are persisted as a GeneratedPlaylist
    linked from the history row, so every run stays openable with its exact
    track snapshot. The synchronous pipeline (pylast + ThreadPoolExecutor)
    runs in the default executor so the event loop is never blocked.
    Returns the history row (uncommitted — the caller commits).
    """
    started_at = datetime.now(timezone.utc)
    history = await create_automation_history(
        db,
        automation_id=automation.id,
        status="running",
        filter_groups_used=_filter_groups_to_json(automation.filter_groups),
        started_at=started_at,
    )

    try:
        result = await run_automation_pipeline_cached(
            db,
            user_id=automation.user_id,
            username=automation.lastfm_username,
            source_type=automation.source_type,
            period=automation.source_period,
            filter_groups=automation.filter_groups,
            max_tracks=automation.output_max_size,
        )
    except Exception as exc:  # noqa: BLE001 - record any pipeline failure
        await _mark_failure(db, history, exc)
        return history

    playlist = await _persist_result_playlist(db, automation, result)
    history.generated_playlist_id = playlist.id
    await _mark_success(db, history, result, automation)
    return history


async def _persist_result_playlist(
    db: AsyncSession, automation: Automation, result: dict
) -> GeneratedPlaylist:
    """Persist a pipeline result as the automation's generated playlist."""
    tracks = [
        Track(title=t["title"], artist=t["artist"]) for t in result["tracks"]
    ]
    return await create_generated_playlist(
        db,
        automation.user_id,
        automation.lastfm_username,
        GeneratedPlaylistCreate(
            automation_id=automation.id,
            name=automation.name,
            description=automation.description,
            source_type=automation.source_type,
            source_period=automation.source_period,
            tracks=tracks,
            track_count=len(tracks),
            filter_groups=_filter_groups_to_json(automation.filter_groups),
        ),
    )


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