"""Shared pipeline for running automations (preview + scheduled sweep).

Pipeline (ADR 0002, 0003): the user's stored listens in the window -> sort
-> filters on stored data -> limits.

``run_automation_pipeline_cached`` is used by the sweep and the preview
endpoint.
"""

import asyncio
import calendar
import logging
import random
import re
from collections import Counter
from datetime import UTC, datetime, time, timedelta
from time import monotonic
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from database import async_session
from filter_types import ArtistRankPeriod, ListeningMoment
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
    get_moment_plays,
    get_window_tracks,
)
from schemas import GeneratedPlaylistCreate, Track, cron_trigger
from services.activity_log import automation_label, log_activity, pipeline_summary
from services.filter_engine import apply_filters, conditions_on
from services.lastfm import PAGE_ERRORS, is_rate_limit_error
from services.progress import store as progress_store
from services.scrobble_sync import (
    SyncSuperseded,
    after_sync,
    is_syncing,
    start_scrobble_sync,
    sync_scrobbles,
)
from services.tag_catalogue import after_pass, is_tagging
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

# Runs in flight per user (single worker, see AGENTS.md): user_id -> {history_id: [automation_id, name, progress key,
# ended at]}. The app reads them through the sync status, so a scheduled run shows on the ribbon like a manual one.
_in_flight: dict[str, dict[str, list]] = {}
# A run often lasts a second, less than the app's 3 s between reads: an ended one stays listed this long, delivering.
RUN_LINGER_SECONDS = 5


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


def sort_tracks(tracks: list[dict], sort: str, plays_field: str = "playcount") -> list[dict]:
    """Order candidates by the automation's sort (GLOSSARY: Tri)."""
    if sort == "random":
        return _rng.sample(tracks, len(tracks))
    if sort == "random_weighted":
        # Weighted sampling without replacement: key = u ** (1 / weight).
        return sorted(tracks, key=lambda t: _rng.random() ** (1 / max(t.get(plays_field, 1), 1)), reverse=True)
    field = {"most_played": plays_field, "last_played": "timestamp", "first_played": "first_played"}[sort]
    return sorted(tracks, key=lambda t: (t.get(field, 0), t.get("timestamp", 0)), reverse=True)


# A reissue's end suffix: "(Bonus)", "[Deluxe Edition]", " - Remastered 2009". A live
# or acoustic version is other recordings, so it stays its own album.
_EDITION_WORDS = r"\b(?:bonus|deluxe|edition|édition|remaster(?:ed)?|expanded|anniversary)\b"
_NOT_A_VERSION = r"(?![^)\]]*\b(?:live|acoustic)\b)"
_EDITION_SUFFIX = re.compile(
    rf"\s*(?:[(\[]{_NOT_A_VERSION}[^)\]]*{_EDITION_WORDS}[^)\]]*[)\]]|\s-\s{_NOT_A_VERSION}.*{_EDITION_WORDS}.*)$"
)


def album_key(album: str) -> str:
    """The album a name counts as for a limit; the track keeps its original name."""
    key = album.casefold().strip()
    while (shorter := _EDITION_SUFFIX.sub("", key)) not in (key, ""):
        key = shorter
    return key


def apply_limits(
    tracks: list[dict],
    max_tracks: int,
    max_per_artist: int | None = None,
    max_per_album: int | None = None,
    already_used: frozenset[tuple[str, str]] | set[tuple[str, str]] = frozenset(),
) -> list[dict]:
    """Take tracks in sort order until the size is reached (GLOSSARY: Limite)."""
    kept: list[dict] = []
    per_artist: Counter[str] = Counter()
    # By artist too: two artists' "Greatest Hits" are two albums. No known album, no limit.
    per_album: Counter[tuple[str, str]] = Counter()
    for track in tracks:
        if len(kept) == max_tracks:
            break
        if (track["title"], track["artist"]) in already_used:
            continue
        if max_per_artist is not None and per_artist[track["artist"]] >= max_per_artist:
            continue
        album = track.get("album")
        counted_as = (track["artist"], album_key(album)) if album else None
        if counted_as and max_per_album is not None and per_album[counted_as] >= max_per_album:
            continue
        per_artist[track["artist"]] += 1
        if counted_as:
            per_album[counted_as] += 1
        kept.append(track)
    return kept


def _period_bounds(period: ArtistRankPeriod, at: datetime, timezone: str) -> tuple[datetime | None, datetime]:
    if period.since is not None and period.until is not None:
        zone = ZoneInfo(timezone)
        return (
            datetime.combine(period.since, time.min, tzinfo=zone),
            datetime.combine(period.until + timedelta(days=1), time.min, tzinfo=zone),
        )
    return window_bounds(period.model_dump(), at)


async def _artist_ranks_by_condition(
    db: AsyncSession,
    user_id: str,
    filter_groups: list,
    window_range: tuple[datetime | None, datetime],
    at: datetime,
    timezone: str,
) -> dict[str, dict[str, int]]:
    """Artist ranks for each artist_rank condition; one query per distinct period."""
    by_range: dict[tuple[datetime | None, datetime], dict[str, int]] = {}
    by_condition: dict[str, dict[str, int]] = {}
    for condition_id, period in conditions_on(filter_groups, "artist_rank", "period"):
        bounds = window_range if period is None else _period_bounds(ArtistRankPeriod.model_validate(period), at, timezone)
        if bounds not in by_range:
            by_range[bounds] = await get_artist_ranks(db, user_id, *bounds)
        by_condition[condition_id] = by_range[bounds]
    return by_condition


async def _moment_plays_by_condition(
    db: AsyncSession,
    user_id: str,
    moments: dict[str, ListeningMoment],
    window_range: tuple[datetime | None, datetime],
    timezone: str,
) -> dict[str, dict[tuple[str, str], int]]:
    """Listens at the moment of each condition; one query per distinct moment."""
    by_moment: dict[str, dict[tuple[str, str], int]] = {}
    by_condition: dict[str, dict[tuple[str, str], int]] = {}
    for condition_id, moment in moments.items():
        key = moment.model_dump_json()
        if key not in by_moment:
            by_moment[key] = await get_moment_plays(db, user_id, *window_range, timezone, [moment])
        by_condition[condition_id] = by_moment[key]
    return by_condition


async def run_automation_pipeline_cached(
    db: AsyncSession,
    *,
    user_id: str,
    username: str,
    window: dict,
    sort: str,
    sort_counts: str = "window",
    filter_groups: list,
    max_tracks: int,
    max_per_artist: int | None = None,
    max_per_album: int | None = None,
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
    timezone = await db.scalar(select(User.timezone).where(User.id == user_id)) or "UTC"
    # On the owner's clock: 1 March 00:00 in Paris is 28 February in UTC, and three months before that is not 1 December.
    at = (at or datetime.now(UTC)).astimezone(ZoneInfo(timezone))
    start, end = window_bounds(window, at)
    moments = {
        condition_id: ListeningMoment.model_validate(moment)
        for condition_id, moment in conditions_on(filter_groups, "listening_moment", "moment")
    }
    window_tracks = await get_window_tracks(db, user_id, start, end)
    plays_field = "playcount"
    if sort_counts == "moment" and moments:
        at_moments = await get_moment_plays(db, user_id, start, end, timezone, list(moments.values()))
        for track in window_tracks:
            track["moment_playcount"] = at_moments.get((track["title"], track["artist"]), 0)
        plays_field = "moment_playcount"
    candidates = sort_tracks(window_tracks, sort, plays_field)
    artist_tags = await get_known_artist_tags(db, user_id)
    ranks_by_condition = await _artist_ranks_by_condition(db, user_id, filter_groups, (start, end), at, timezone)
    plays_by_condition = await _moment_plays_by_condition(db, user_id, moments, (start, end), timezone)
    for track in candidates:
        track["artist_ranks"] = {
            condition_id: ranks[track["artist"]]
            for condition_id, ranks in ranks_by_condition.items()
            if track["artist"] in ranks
        }
        track_key = (track["title"], track["artist"])
        track["moment_plays"] = {
            condition_id: plays[track_key]
            for condition_id, plays in plays_by_condition.items()
            if track_key in plays
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
    # Ages count from the run's date, so a retry judges the same tracks.
    filtered = apply_filters(candidates, filter_groups, int(at.timestamp()))
    tracks = apply_limits(filtered, max_tracks, max_per_artist, max_per_album, already_used)
    window_artists = {track["artist"] for track in candidates}
    if progress_key is not None:
        progress_store.report(progress_key, "filter", len(tracks), len(candidates))
    return {
        "tracks": tracks,
        "total": len(tracks),
        "before_filter": len(candidates),
        "after_filter": len(filtered),
        # Rate of known tags: a tag filter sees only these artists (ADR 0003).
        "window_artists": len(window_artists),
        "known_tag_artists": len(window_artists & artist_tags.keys()),
        "source_tracks": candidates[:SOURCE_TRACKS_SHOWN],
        # end is exclusive: 1 September 00:00 means up to 31 August.
        "period": {
            "start": start.date().isoformat() if start else None,
            "end": (end - timedelta(microseconds=1)).date().isoformat(),
        },
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
    08:00 on their clock. An automation that has never run waits for the first
    date after its creation: running the period already over is the owner's call.
    """
    now = now or datetime.now(UTC)
    cron = getattr(automation, "cron", None)
    if not cron:
        return False
    try:
        trigger = cron_trigger(cron, ZoneInfo(timezone))
    except (ValueError, ZoneInfoNotFoundError):
        return False
    last_run = getattr(automation, "last_run", None) or automation.created_at
    next_run = trigger.get_next_fire_time(last_run, now)
    return next_run is not None and next_run <= now


# Widening steps: a frequent schedule is found in the first, without walking a year minute by minute.
_LAST_FIRE_LOOKBACKS = tuple(timedelta(days=days) for days in (1 / 24, 1, 32, 366, 1462))


def last_fire_time(cron: str, now: datetime, timezone: str) -> datetime | None:
    """When the schedule last fired, at or before ``now`` (None without a usable schedule).

    A run of a scheduled automation covers the period ending there, however late
    or by whatever it starts: a seasonal playlist stays on its season after
    downtime, or when run by hand in mid-season.
    """
    try:
        trigger = cron_trigger(cron, ZoneInfo(timezone))
    except (ValueError, ZoneInfoNotFoundError):
        return None
    for lookback in _LAST_FIRE_LOOKBACKS:
        last = None
        fire = trigger.get_next_fire_time(None, now - lookback)
        while fire is not None and fire <= now:
            last = fire
            fire = trigger.get_next_fire_time(None, fire + timedelta(seconds=1))
        if last is not None:
            return last
    return None


def next_fire_time(cron: str, now: datetime, timezone: str) -> datetime | None:
    """When the schedule fires next (None without a usable schedule)."""
    try:
        return cron_trigger(cron, ZoneInfo(timezone)).get_next_fire_time(None, now)
    except (ValueError, ZoneInfoNotFoundError):
        return None


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


class TagsLoading(Exception):
    """A tag pass is looking up this user's artists, and the run filters by tags."""


NOT_READY = (HistoryLoading, TagsLoading)
_WAITING_FOR = {
    HistoryLoading: "Your listening history is still loading.",
    TagsLoading: "The tag lookup is still running.",
}


def _filters_by_tags(filter_groups) -> bool:
    return any(value for _, value in conditions_on(filter_groups, "tags", "value"))


async def _check_ready(db: AsyncSession, automation: Automation) -> None:
    """A run waits for the first full load, and one filtering by tags for the tag pass in flight."""
    user = await db.get(User, automation.user_id)
    if user is None or user.scrobbles_complete_at is None:
        # Restarts an interrupted first load; a no-op while one runs.
        start_scrobble_sync(automation.user_id, automation.lastfm_username)
        raise HistoryLoading
    if _filters_by_tags(automation.filter_groups) and is_tagging(automation.user_id):
        raise TagsLoading


async def _sync_before_run(db: AsyncSession, automation: Automation) -> None:
    """Bring the listens up to date before a run.

    A failed incremental sync is logged and the run uses the stored listens.
    """
    if is_syncing(automation.user_id):
        return
    try:
        await sync_scrobbles(db, automation.user_id, automation.lastfm_username)
    except (*PAGE_ERRORS, SyncSuperseded):
        log_activity("sync", automation.lastfm_username, "échec, le run utilise les écoutes déjà en base")
        await db.rollback()


def _public_error(exc: Exception) -> str:
    """Message shown in history and progress; the raw error goes to the logs only."""
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


async def _mark_waiting(db: AsyncSession, history: AutomationHistory, exc: Exception, automation: Automation) -> None:
    """A run that cannot start yet waits on its row, never counted as a try; the sweep must not start it as due."""
    history.status = "waiting"
    history.error_message = _WAITING_FOR[type(exc)]
    history.completed_at = None
    automation.last_run = datetime.now(UTC)
    await db.flush()


async def _waiting_head(db: AsyncSession, automation_id: str) -> AutomationHistory | None:
    latest = (
        await db.execute(
            select(AutomationHistory)
            .where(AutomationHistory.automation_id == automation_id)
            .order_by(AutomationHistory.started_at.desc(), AutomationHistory.id.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    return latest if latest is not None and latest.status == "waiting" else None


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
    A run that cannot start yet (see _check_ready) waits on its row instead,
    and any later start of the automation picks that row up: one wait, one line.
    Returns the history row (uncommitted — the caller commits).
    """
    scheduled_for = scheduled_for or datetime.now(UTC)
    started_at = datetime.now(UTC)
    label = automation_label(automation.name)
    history = await _waiting_head(db, automation.id)
    if history is None:
        history = await create_automation_history(
            db,
            automation_id=automation.id,
            status="running",
            filter_groups_used=_filter_groups_to_json(automation.filter_groups),
            target_size=automation.output_max_size,
            scheduled_for=scheduled_for,
            attempt=attempt,
            started_at=started_at,
        )
    else:
        # The settings at the run, not at the wait: they may have changed meanwhile.
        history.scheduled_for = scheduled_for
        history.filter_groups_used = _filter_groups_to_json(automation.filter_groups)
        history.target_size = automation.output_max_size
    try:
        await _check_ready(db, automation)
    except NOT_READY as exc:
        if history.status != "waiting":
            log_activity("run", label, "en attente des écoutes" if isinstance(exc, HistoryLoading) else "en attente des tags")
        await _mark_waiting(db, history, exc, automation)
        if progress_key is not None:
            progress_store.finish(progress_key)
        return history
    history.status = "running"
    history.error_message = None
    history.started_at = started_at

    # A run started by the sweep has no ticket from a client: it gets its own, so the app can follow it.
    key = progress_key or f"run:{automation.id}:{history.id}"
    if progress_key is None:
        progress_store.start(key)
    entry = [automation.id, automation.name, key, None]
    _in_flight.setdefault(automation.user_id, {})[history.id] = entry
    try:
        return await _run_and_record(db, automation, history, key, label, scheduled_for)
    finally:
        entry[3] = monotonic()


async def _run_and_record(
    db: AsyncSession, automation: Automation, history: AutomationHistory, key: str, label: str, scheduled_for: datetime
) -> AutomationHistory:
    try:
        progress_store.report(key, "sync", 0, 0)
        await _sync_before_run(db, automation)
        pipeline_started = monotonic()
        result = await run_automation_pipeline_cached(
            db,
            user_id=automation.user_id,
            username=automation.lastfm_username,
            window=automation.window,
            sort=automation.sort,
            sort_counts=automation.sort_counts,
            filter_groups=automation.filter_groups,
            max_tracks=automation.output_max_size,
            max_per_artist=automation.output_max_per_artist,
            max_per_album=automation.output_max_per_album,
            no_repeat_playlists=automation.output_no_repeat_playlists,
            automation_id=automation.id,
            at=scheduled_for,
            progress_key=key,
        )
    except Exception as exc:
        logger.exception("run failed for automation %s", automation.id)
        log_activity("run", label, f"échec : {type(exc).__name__}")
        await _mark_failure(db, history, exc, automation)
        progress_store.finish(key, error=_public_error(exc))
        return history

    log_activity("run", label, pipeline_summary(result, monotonic() - pipeline_started))
    if result["total"]:
        playlist = await _persist_result_playlist(db, automation, result)
        history.generated_playlist_id = playlist.id
    await _mark_success(db, history, result, automation)
    progress_store.finish(key)
    return history


def runs_in_flight(user_id: str) -> list[tuple[str, str, str, int, int]]:
    """This user's runs at work now, as (automation_id, name, stage, done, total). One just ended is delivering."""
    entries = _in_flight.get(user_id, {})
    for history_id, (*_, ended) in list(entries.items()):
        if ended is not None and monotonic() - ended > RUN_LINGER_SECONDS:
            del entries[history_id]
    if not entries:
        _in_flight.pop(user_id, None)
    runs = []
    for automation_id, name, key, ended in entries.values():
        progress = progress_store.read(key)
        stage = "done" if ended is not None else progress.stage if progress else "queued"
        runs.append((automation_id, name, stage, progress.done if progress else 0, progress.total if progress else 0))
    return runs


async def next_run_at(db: AsyncSession, user_id: str, timezone: str, now: datetime | None = None) -> datetime | None:
    """When this user's next run should start: now if one is due and waits for the sweep, else the soonest
    scheduled date or retry. The app wakes up for it instead of reading the status every minute."""
    now = now or datetime.now(UTC)
    automations = (
        await db.execute(
            select(Automation).where(
                Automation.user_id == user_id, Automation.enabled.is_(True), Automation.deleted_at.is_(None)
            )
        )
    ).scalars().all()
    times = []
    for automation in automations:
        if is_due(automation, now, timezone):
            times.append(now)
        elif automation.cron and (fire := next_fire_time(automation.cron, now, timezone)) is not None:
            times.append(fire)
    if automations:
        # Each automation's latest run: a failure not yet at its last attempt is retried after its backoff.
        latest = (
            await db.execute(
                select(AutomationHistory)
                .where(AutomationHistory.automation_id.in_([a.id for a in automations]))
                .order_by(AutomationHistory.automation_id, AutomationHistory.started_at.desc(), AutomationHistory.id.desc())
                .distinct(AutomationHistory.automation_id)
            )
        ).scalars().all()
        times += [
            max(now, row.started_at + RETRY_DELAYS[row.attempt])
            for row in latest
            if row.status == "failed" and row.attempt < MAX_ATTEMPT
        ]
    return min(times, default=None)


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
            period_start=result["period"]["start"],
            period_end=result["period"]["end"],
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
        # From the attempt, not the period it covers: that one can be months old.
        if row.started_at + RETRY_DELAYS[row.attempt] <= now
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
            (a.id, last_fire_time(a.cron, now, zones.get(a.user_id) or "UTC") or now, 1)
            for a in automations
            if is_due(a, now, zones.get(a.user_id) or "UTC")
        ]
        try:
            retryable = await get_retryable_failures(db, now)
            # Started again each tick: after a restart nothing else would, and a run still not ready just waits on.
            waiting = await get_waiting_runs(db)
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
    for row in waiting:
        await _run_single(session_factory, row.automation_id, scheduled_for=row.scheduled_for, attempt=row.attempt)
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


async def get_waiting_runs(db: AsyncSession, user_id: str | None = None) -> list[AutomationHistory]:
    """Runs waiting on their row (see run_automation), oldest first: only a chain head still waits."""
    query = (
        select(AutomationHistory)
        .join(Automation, Automation.id == AutomationHistory.automation_id)
        .where(Automation.deleted_at.is_(None), Automation.enabled.is_(True))
        .order_by(AutomationHistory.automation_id, AutomationHistory.started_at.desc(), AutomationHistory.id.desc())
        .distinct(AutomationHistory.automation_id)
    )
    if user_id is not None:
        query = query.where(Automation.user_id == user_id)
    heads = (await db.execute(query)).scalars().all()
    return sorted((row for row in heads if row.status == "waiting"), key=lambda row: row.started_at)


async def run_waiting(user_id: str, session_factory=async_session) -> None:
    """Start this user's waiting runs; one still not ready keeps waiting."""
    async with session_factory() as db:
        rows = await get_waiting_runs(db, user_id)
    for row in rows:
        await _run_single(session_factory, row.automation_id, scheduled_for=row.scheduled_for, attempt=row.attempt)


# Strong references, so running tasks are not collected.
_waiting_tasks: set[asyncio.Task] = set()


def start_waiting_runs(user_id: str) -> None:
    """The listens or the tags runs wait for are in: start them, in the background."""
    task = asyncio.create_task(run_waiting(user_id))
    _waiting_tasks.add(task)
    task.add_done_callback(_waiting_tasks.discard)


def _on_ready(user_id: str) -> None:
    # Looked up at call time, so a test can stub start_waiting_runs.
    start_waiting_runs(user_id)


after_sync.append(_on_ready)
after_pass.append(_on_ready)
