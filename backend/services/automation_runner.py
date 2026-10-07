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
from datetime import UTC, datetime, timedelta

from apscheduler.triggers.cron import CronTrigger
from database import async_session
from models.automation import Automation
from models.automation_history import AutomationHistory
from models.generated_playlist import GeneratedPlaylist
from repositories.automation_history import create_automation_history
from repositories.automations import get_automations_by_ids
from repositories.generated_playlists import create_generated_playlist
from schemas import GeneratedPlaylistCreate, Track
from services.enrich_cache import enrich_tracks_cached
from services.filter_engine import apply_filters
from services.lastfm import (
    deduplicate,
    enrich_tracks,
    get_loved_tracks,
    get_recent_tracks,
    get_top_artists_tracks,
    get_top_tracks,
)
from services.progress import store as progress_store
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

logger = logging.getLogger(__name__)

DEFAULT_TRACK_LIMIT = 50

# Backoff after failed attempt N before retry attempt N+1 runs.
# Attempt MAX_ATTEMPT is terminal: no further retry, failed stays visible.
RETRY_DELAYS = {
    1: timedelta(minutes=5),
    2: timedelta(minutes=20),
    3: timedelta(hours=1),
}
MAX_ATTEMPT = 4


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
    needs = needed_fields(filter_groups)
    if deduped and all("userloved" in t for t in deduped):
        # extended=1 dispatch already fetched loved flags: no live call.
        needs.discard("userloved")
    # No enrich key needed (no filters, or only dispatch fields like rank):
    # skip the live layer entirely instead of fetching data nobody reads.
    # Anything else runs the full fetch + write-back, unchanged.
    enriched = (
        deduped
        if not needs
        else enrich_tracks(username, deduped, max_enrich=limit)
    )
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
    progress_key: str | None = None,
) -> dict:
    """Cache-first pipeline: dispatch live, enrich from DB cache, filter.

    Returns the sync pipeline's keys plus ``cache_hits``, ``cache_misses``
    and ``lastfm_calls`` for logs and UI. When ``progress_key`` is set,
    each stage reports (stage, done, total) to the progress store so the
    UI can poll a live counter.
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
    if progress_key is not None:
        # done=0 on purpose: the list is fetched but nothing is enriched
        # yet. Reporting done=len here would pin the bar at 100% (the bug
        # the user saw); it climbs with each finished track instead.
        progress_store.report(progress_key, "source", 0, len(deduped))
    needs = needed_fields(filter_groups)
    if deduped and all("userloved" in t for t in deduped):
        # extended=1 dispatch already fetched loved flags: no live call.
        needs.discard("userloved")
    if not needs:
        enriched, stats = deduped, {"hits": 0, "misses": 0, "lastfm_calls": 0}
    else:
        enriched, stats = await enrich_tracks_cached(
            db,
            user_id=user_id,
            username=username,
            tracks=deduped,
            max_enrich=limit,
            progress_key=progress_key,
        )
    filtered = apply_filters(enriched, filter_groups)
    if progress_key is not None:
        progress_store.report(progress_key, "filter", len(filtered), len(deduped))
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
        select(Automation)
        .where(
            Automation.enabled.is_(True),
            Automation.deleted_at.is_(None),
        )
        .order_by(Automation.created_at, Automation.id)
    )
    return list(result.scalars().all())


def is_due(automation: Automation, now: datetime | None = None) -> bool:
    """Return True when the automation's cron schedule says it should run now.

    An automation that has never run (``last_run`` is None) is due immediately.
    """
    now = now or datetime.now(UTC)
    cron = getattr(automation, "cron", None)
    if not cron:
        return False
    try:
        trigger = CronTrigger.from_crontab(cron, timezone=UTC)
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


# Enrich keys a filter tree can read. playcount/rank/timestamp come from the
# dispatch list itself, so they need no enrichment. Anything unknown falls
# back to the full set (safe: fetch more, never filter on missing data).
# Non-empty needs always run a FULL fetch + write-back (today's behavior):
# partial fetches skip write-back only once per-group freshness lands
# (next tranche), so repeated runs keep warming the cache like before.
FULL_FETCH_KEYS = frozenset(
    {
        "listeners",
        "global_playcount",
        "userplaycount",
        "userloved",
        "artist_tags",
        "album",
        "album_tags",
    }
)
_FIELD_TO_ENRICH_KEYS = {
    "userplaycount": {"userplaycount"},
    "userloved": {"userloved"},
    "global_playcount": {"global_playcount"},
    "listeners": {"listeners"},
    "tags": {"artist_tags", "album", "album_tags"},
}


def _fg_get(obj, key, default=None):
    if isinstance(obj, dict):
        return obj.get(key, default)
    return getattr(obj, key, default)


def needed_fields(filter_groups) -> set[str]:
    """Enrich keys the active filters actually read (empty = skip enrich).

    Walks conditions and nested groups (dicts or Pydantic models, like the
    filter engine). Unknown field -> full set: fetch more rather than risk
    filtering on defaults.
    """
    if not filter_groups:
        return set()
    needed: set[str] = set()
    for group in filter_groups:
        for condition in _fg_get(group, "conditions") or []:
            field = _fg_get(condition, "field")
            if field in _FIELD_TO_ENRICH_KEYS:
                needed.update(_FIELD_TO_ENRICH_KEYS[field])
            elif field in ("playcount", "rank", "timestamp", None):
                continue
            else:
                return set(FULL_FETCH_KEYS)
        needed.update(needed_fields(_fg_get(group, "groups") or []))
        if needed >= FULL_FETCH_KEYS:
            return set(FULL_FETCH_KEYS)
    return needed


async def _mark_success(db: AsyncSession, history, result: dict, automation: Automation) -> None:
    """Record a completed run on the history row and bump last_run."""
    history.status = "completed"
    history.tracks_generated = result["total"]
    history.tracks_before_filter = result["before_filter"]
    history.tracks_after_filter = result["total"]
    history.completed_at = datetime.now(UTC)
    automation.last_run = datetime.now(UTC)
    await db.flush()


async def _mark_failure(db: AsyncSession, history, exc: Exception) -> None:
    """Record a failed run on the history row."""
    history.status = "failed"
    history.error_message = str(exc)[:2000]
    history.completed_at = datetime.now(UTC)
    await db.flush()


async def run_automation(
    db: AsyncSession,
    automation: Automation,
    *,
    scheduled_for: datetime | None = None,
    attempt: int = 1,
    progress_key: str | None = None,
) -> AutomationHistory:
    """Run one automation's pipeline and record history + last_run.

    ``scheduled_for`` is when the run was decided (tick time for the sweep,
    now for a manual trigger); ``started_at`` stamps the actual pipeline
    start. Retries reuse the chain's original ``scheduled_for`` with
    ``attempt`` + 1, so a late manual retry never rewrites the season label.

    On success the produced tracks are persisted as a GeneratedPlaylist
    linked from the history row, so every run stays openable with its exact
    track snapshot. The synchronous pipeline (pylast + ThreadPoolExecutor)
    runs in the default executor so the event loop is never blocked.
    Returns the history row (uncommitted — the caller commits).
    """
    scheduled_for = scheduled_for or datetime.now(UTC)
    started_at = datetime.now(UTC)
    history = await create_automation_history(
        db,
        automation_id=automation.id,
        status="running",
        filter_groups_used=_filter_groups_to_json(automation.filter_groups),
        scheduled_for=scheduled_for,
        attempt=attempt,
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
            progress_key=progress_key,
        )
    except Exception as exc:  # noqa: BLE001 - record any pipeline failure
        await _mark_failure(db, history, exc)
        if progress_key is not None:
            progress_store.finish(progress_key, error=str(exc)[:500])
        return history

    playlist = await _persist_result_playlist(db, automation, result)
    history.generated_playlist_id = playlist.id
    await _mark_success(db, history, result, automation)
    if progress_key is not None:
        progress_store.finish(progress_key)
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
        # Persist only: these rows carry no fetched data (the enrich cache
        # wrote the real values already), so never stamp them as fetched.
        mark_fetched=False,
    )


async def get_retryable_failures(
    db: AsyncSession, now: datetime | None = None
) -> list[AutomationHistory]:
    """Failed rows whose backoff expired and that are still the chain head.

    The chain head (latest row per automation, across all statuses) is
    resolved in the database with ROW_NUMBER(): a newer manual run or cron
    tick supersedes the old chain instead of doubling it. Attempt
    MAX_ATTEMPT rows are terminal and never returned.
    """
    now = now or datetime.now(UTC)
    # Automations owning at least one non-terminal failure (served by the
    # (status, attempt) index); only their chains get ranked below.
    candidates = (
        select(AutomationHistory.automation_id)
        .where(
            AutomationHistory.status == "failed",
            AutomationHistory.attempt < MAX_ATTEMPT,
        )
        .distinct()
        .scalar_subquery()
    )
    # Rank every row of those chains newest-first; rn == 1 is the chain
    # head regardless of status, so a newer completed/manual run buries
    # the old failure instead of being retried on top of it.
    ranked = (
        select(
            AutomationHistory,
            func.row_number()
            .over(
                partition_by=AutomationHistory.automation_id,
                order_by=(
                    AutomationHistory.started_at.desc(),
                    AutomationHistory.id.desc(),
                ),
            )
            .label("rn"),
        )
        .where(AutomationHistory.automation_id.in_(candidates))
        .subquery()
    )
    head = aliased(AutomationHistory, ranked)
    result = await db.execute(
        select(head).where(
            ranked.c.rn == 1,
            head.status == "failed",
            head.attempt < MAX_ATTEMPT,
        )
    )
    return [
        row
        for row in result.scalars().all()
        if row.scheduled_for + RETRY_DELAYS[row.attempt] <= now
    ]


async def _try_run_lock(db: AsyncSession, automation_id: str) -> bool:
    """Non-blocking per-automation lock shared with POST /run.

    Whoever holds it runs; the other side skips (409 for manual triggers,
    skip + log for the sweep). Transaction-scoped: released on
    commit/rollback/disconnect, so a crashed run never wedges the chain.
    """
    return bool(
        (
            await db.execute(
                select(
                    func.pg_try_advisory_xact_lock(
                        func.hashtextextended(automation_id, 0)
                    )
                )
            )
        ).scalar()
    )


async def _run_single(
    session_factory,
    automation_id: str,
    *,
    scheduled_for: datetime,
    attempt: int,
) -> bool:
    """Run one automation in its own session with isolated commit/rollback.

    Returns True when the run committed. Any error rolls back only this
    run's session, so one automation can never poison the rest of the sweep.
    """
    async with session_factory() as db:
        automation = (await get_automations_by_ids(db, [automation_id])).get(
            automation_id
        )
        if automation is None:
            logger.info(
                "sweep skipping run for %s: automation gone or disabled",
                automation_id,
            )
            return False
        if not await _try_run_lock(db, automation_id):
            logger.info(
                "sweep skipping automation %s: run already in flight",
                automation_id,
            )
            return False
        try:
            await run_automation(
                db, automation, scheduled_for=scheduled_for, attempt=attempt
            )
            await db.commit()
        except Exception:
            await db.rollback()
            logger.exception("sweep run failed for automation %s", automation_id)
            return False
        return True


async def run_due_automations(session_factory=async_session) -> None:
    """Sweep all enabled automations and run those that are due.

    Re-reads automations from the DB every cycle, so create/update/delete are
    picked up automatically with no resync code. Phase 2 retries failed runs
    whose backoff expired, keeping the chain's original ``scheduled_for``.
    Every run takes the shared advisory lock first: a manual trigger
    in flight wins, the sweep skips instead of doubling it (and vice versa
    via the endpoint's 409). ``session_factory`` is injectable for tests.

    Each run owns its session: one automation's DB failure rolls back only
    its own transaction, never the rest of the sweep. Due runs go in
    deterministic creation order; retries go oldest season first.
    """
    async with session_factory() as db:
        now = datetime.now(UTC)
        automations = await get_enabled_automations(db)
        due_jobs = [
            (a.id, now, 1) for a in automations if is_due(a, now)
        ]
        try:
            retryable = await get_retryable_failures(db, now)
        except Exception:
            logger.exception("sweep failed reading retryable failures")
            return
    for automation_id, scheduled_for, attempt in due_jobs:
        await _run_single(
            session_factory,
            automation_id,
            scheduled_for=scheduled_for,
            attempt=attempt,
        )
    for failed in sorted(retryable, key=lambda r: (r.scheduled_for, r.automation_id)):
        logger.info(
            "retrying automation %s (attempt %d, scheduled for %s)",
            failed.automation_id,
            failed.attempt + 1,
            failed.scheduled_for.isoformat(),
        )
        await _run_single(
            session_factory,
            failed.automation_id,
            scheduled_for=failed.scheduled_for,
            attempt=failed.attempt + 1,
        )
