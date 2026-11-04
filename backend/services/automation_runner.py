"""Shared pipeline for running automations (preview + scheduled sweep).

Pipeline (ADR 0002, 0003): the user's stored listens in the window -> sort
-> filters on stored data -> limits.

``run_automation_pipeline_cached`` is used by the sweep and the preview
endpoint.
"""

import calendar
import logging
import random
from collections import Counter
from datetime import UTC, datetime, time, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from apscheduler.triggers.cron import CronTrigger
from database import async_session
from filter_types import ArtistRankPeriod
from models.automation import Automation
from models.automation_history import AutomationHistory
from models.generated_playlist import GeneratedPlaylist
from models.user import User
from repositories.automation_history import create_automation_history
from repositories.automations import get_automations_by_ids
from repositories.generated_playlists import (
    create_generated_playlist,
    get_tracks_of_recent_playlists,
)
from repositories.scrobbles import (
    get_artist_ranks,
    get_known_artist_tags,
    get_window_tracks,
)
from schemas import GeneratedPlaylistCreate, Track
from services.filter_engine import apply_filters, artist_rank_conditions
from services.lastfm import PAGE_ERRORS, is_rate_limit_error
from services.progress import store as progress_store
from services.scrobble_sync import (
    SyncSuperseded,
    is_syncing,
    start_scrobble_sync,
    sync_scrobbles,
)
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

logger = logging.getLogger(__name__)

# Backoff after failed attempt N before retry attempt N+1 runs.
# Attempt MAX_ATTEMPT is terminal: no further retry, failed stays visible.
RETRY_DELAYS = {
    1: timedelta(minutes=5),
    2: timedelta(minutes=20),
    3: timedelta(hours=1),
}
MAX_ATTEMPT = 4


# Tracks returned to the client next to the result, for the builder preview.
# shortcut: the client refilters these; drop the field with filter-engine.js (phase C).
SOURCE_TRACKS_SHOWN = 500


def _months_back(at: datetime, months: int) -> datetime:
    year, month = divmod(at.year * 12 + at.month - 1 - months, 12)
    day = min(at.day, calendar.monthrange(year, month + 1)[1])
    return at.replace(year=year, month=month + 1, day=day)


def _shift_back(at: datetime, span: dict) -> datetime:
    amount, unit = span["amount"], span["unit"]
    if unit == "day":
        return at - timedelta(days=amount)
    if unit == "week":
        return at - timedelta(weeks=amount)
    return _months_back(at, amount * (12 if unit == "year" else 1))


def window_bounds(window: dict, at: datetime) -> tuple[datetime | None, datetime]:
    """[start, end) of a window counted back from ``at`` (start None = every listen)."""
    end = _shift_back(at, window["ago"]) if window.get("ago") else at
    start = _shift_back(end, window["length"]) if window.get("length") else None
    return start, end


# Not a security need (shuffling a playlist); it costs nothing and keeps scanners quiet.
_rng = random.SystemRandom()


def sort_tracks(tracks: list[dict], sort: str) -> list[dict]:
    """Order candidates by the automation's sort (GLOSSARY: Tri)."""
    if sort == "random":
        return _rng.sample(tracks, len(tracks))
    if sort == "random_weighted":
        # Weighted sampling without replacement: key = u ** (1 / weight).
        return sorted(tracks, key=lambda t: _rng.random() ** (1 / max(t.get("playcount", 1), 1)), reverse=True)
    field = {"most_played": "playcount", "last_played": "timestamp", "first_played": "first_played"}[sort]
    return sorted(tracks, key=lambda t: (t.get(field, 0), t.get("timestamp", 0)), reverse=True)


def apply_limits(
    tracks: list[dict], max_tracks: int, max_per_artist: int | None, already_used: set[tuple[str, str]]
) -> list[dict]:
    """Take tracks in sort order until the size is reached (GLOSSARY: Limite)."""
    kept: list[dict] = []
    per_artist: Counter[str] = Counter()
    for track in tracks:
        if len(kept) == max_tracks:
            break
        if (track["title"], track["artist"]) in already_used:
            continue
        if max_per_artist is not None and per_artist[track["artist"]] >= max_per_artist:
            continue
        per_artist[track["artist"]] += 1
        kept.append(track)
    return kept


def _period_bounds(period: ArtistRankPeriod, at: datetime) -> tuple[datetime | None, datetime]:
    if period.since is not None and period.until is not None:
        # shortcut: fixed dates are read in UTC, use the user's timezone when the moment filter brings it.
        return (
            datetime.combine(period.since, time.min, tzinfo=UTC),
            datetime.combine(period.until + timedelta(days=1), time.min, tzinfo=UTC),
        )
    return window_bounds(period.model_dump(), at)


async def _artist_ranks_by_condition(
    db: AsyncSession,
    user_id: str,
    filter_groups: list,
    window_range: tuple[datetime | None, datetime],
    at: datetime,
) -> dict[str, dict[str, int]]:
    """Artist ranks for each artist_rank condition; one query per distinct period."""
    by_range: dict[tuple[datetime | None, datetime], dict[str, int]] = {}
    by_condition: dict[str, dict[str, int]] = {}
    for condition_id, period in artist_rank_conditions(filter_groups):
        bounds = window_range if period is None else _period_bounds(ArtistRankPeriod.model_validate(period), at)
        if bounds not in by_range:
            by_range[bounds] = await get_artist_ranks(db, user_id, *bounds)
        by_condition[condition_id] = by_range[bounds]
    return by_condition


async def run_automation_pipeline_cached(
    db: AsyncSession,
    *,
    user_id: str,
    username: str,
    window: dict,
    sort: str,
    filter_groups: list,
    max_tracks: int,
    max_per_artist: int | None = None,
    no_repeat_playlists: int | None = None,
    automation_id: str | None = None,
    at: datetime | None = None,
    progress_key: str | None = None,
) -> dict:
    """Window of stored listens -> sort -> filter -> limits (ADR 0002).

    Reads the database only: no Last.fm call, so a preview can run on every
    change (ADR 0003). A track whose artist has no stored tags yet matches no
    tag filter.
    """
    at = at or datetime.now(UTC)
    start, end = window_bounds(window, at)
    candidates = sort_tracks(await get_window_tracks(db, user_id, start, end), sort)
    artist_tags = await get_known_artist_tags(db, user_id)
    ranks_by_condition = await _artist_ranks_by_condition(db, user_id, filter_groups, (start, end), at)
    at_epoch = int(at.timestamp())
    for rank, track in enumerate(candidates, start=1):
        track["rank"] = rank
        # Counted from the run's date, so a retry judges the same tracks.
        track["first_played_age"] = at_epoch - track["first_played"]
        track["artist_ranks"] = {
            condition_id: ranks[track["artist"]]
            for condition_id, ranks in ranks_by_condition.items()
            if track["artist"] in ranks
        }
        if track["artist"] in artist_tags:
            track["artist_tags"] = artist_tags[track["artist"]]
    if progress_key is not None:
        progress_store.report(progress_key, "source", 0, len(candidates))
    already_used = (
        await get_tracks_of_recent_playlists(db, user_id, automation_id, no_repeat_playlists)
        if no_repeat_playlists and automation_id
        else set()
    )
    tracks = apply_limits(apply_filters(candidates, filter_groups), max_tracks, max_per_artist, already_used)
    if progress_key is not None:
        progress_store.report(progress_key, "filter", len(tracks), len(candidates))
    logger.info("pipeline: %d in window -> %d kept", len(candidates), len(tracks))
    return {
        "tracks": tracks,
        "total": len(tracks),
        "before_filter": len(candidates),
        "source_tracks": candidates[:SOURCE_TRACKS_SHOWN],
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


def is_due(
    automation: Automation, now: datetime | None = None, timezone: str = "UTC"
) -> bool:
    """Return True when the automation's cron schedule says it should run now.

    The cron is read in ``timezone`` (the owner's zone): "0 8 * * *" means
    08:00 on their clock. An automation that has never run (``last_run`` is
    None) is due immediately.
    """
    now = now or datetime.now(UTC)
    cron = getattr(automation, "cron", None)
    if not cron:
        return False
    try:
        trigger = CronTrigger.from_crontab(cron, timezone=ZoneInfo(timezone))
    except (ValueError, ZoneInfoNotFoundError):
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
    # GLOSSARY: Run vide. No playlist, not a failure, never retried.
    history.status = "completed" if result["total"] else "empty"
    history.tracks_generated = result["total"]
    history.tracks_before_filter = result["before_filter"]
    history.tracks_after_filter = result["total"]
    history.completed_at = datetime.now(UTC)
    automation.last_run = datetime.now(UTC)
    await db.flush()


class HistoryLoading(Exception):
    """The user's first full listening history sync has not finished."""


async def _sync_before_run(db: AsyncSession, automation: Automation) -> None:
    """Bring the listens up to date before a run; wait out the first full load.

    A failed incremental sync is logged and the run uses the stored listens.
    """
    user = await db.get(User, automation.user_id)
    if user is None or user.scrobbles_complete_at is None:
        # Restarts an interrupted first load; a no-op while one runs.
        start_scrobble_sync(automation.user_id, automation.lastfm_username)
        raise HistoryLoading
    if is_syncing(automation.user_id):
        return
    try:
        await sync_scrobbles(db, automation.user_id, automation.lastfm_username)
    except (*PAGE_ERRORS, SyncSuperseded):
        logger.warning("pre-run sync failed for automation %s, using stored listens", automation.id)
        await db.rollback()


def _public_error(exc: Exception) -> str:
    """Message shown in history and progress; the raw error goes to the logs only."""
    if isinstance(exc, HistoryLoading):
        return "Your listening history is still loading. The run will retry."
    if is_rate_limit_error(exc):
        return "Last.fm is rate limiting requests. Try again in a few minutes."
    return "The run failed (Last.fm or server error)."


async def _mark_failure(
    db: AsyncSession, history, exc: Exception, automation: Automation
) -> None:
    """Record a failed run on the history row and bump last_run.

    The retry chain owns failures; without the bump the sweep reruns the
    automation as attempt 1 every tick.
    """
    history.status = "failed"
    history.error_message = _public_error(exc)
    history.completed_at = datetime.now(UTC)
    automation.last_run = datetime.now(UTC)
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
        await _sync_before_run(db, automation)
        result = await run_automation_pipeline_cached(
            db,
            user_id=automation.user_id,
            username=automation.lastfm_username,
            window=automation.window,
            sort=automation.sort,
            filter_groups=automation.filter_groups,
            max_tracks=automation.output_max_size,
            max_per_artist=automation.output_max_per_artist,
            no_repeat_playlists=automation.output_no_repeat_playlists,
            automation_id=automation.id,
            at=scheduled_for,
            progress_key=progress_key,
        )
    except Exception as exc:
        logger.exception("run failed for automation %s", automation.id)
        await _mark_failure(db, history, exc, automation)
        if progress_key is not None:
            progress_store.finish(progress_key, error=_public_error(exc))
        return history

    if result["total"]:
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
        zones = dict(
            (
                await db.execute(
                    select(User.id, User.timezone).where(
                        User.id.in_({a.user_id for a in automations})
                    )
                )
            ).all()
        )
        due_jobs = [
            (a.id, now, 1)
            for a in automations
            if is_due(a, now, zones.get(a.user_id, "UTC"))
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
