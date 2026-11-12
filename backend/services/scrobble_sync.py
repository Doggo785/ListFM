"""Listening history sync (ADR 0001).

The first sync loads every listen, later ones only what is newer than the
last stored listen. Pages are committed one by one, and the stored listens
always form one unbroken stretch, so an interrupted sync resumes where it
stopped:

- what is newer than the newest stored listen is read oldest first;
- a first load reads the rest newest first, from before the oldest stored
  listen: the recent months a playlist asks for are in within seconds.

The loved list has no date order, so it is read in full each time.
"""

import asyncio
import time
from collections.abc import Callable
from datetime import UTC, datetime, timedelta

from database import async_session
from models.user import User
from repositories.scrobbles import (
    get_earliest_played_at,
    get_latest_played_at,
    replace_loved,
    store_scrobbles,
    store_track_albums,
)
from services.activity_log import format_duration, log_activity
from services.lastfm import (
    PAGE_ERRORS,
    call_retrying_rate_limit,
    get_loved_page,
    get_scrobble_page,
    is_rate_limit_error,
)
from services.progress import store as progress_store
from services.tag_catalogue import start_tag_catalogue
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

# 1000 is past Last.fm's documented maximum of 200 but works (felhag/lastfm-stats-web);
# 200 is the fallback when a large page fails.
PAGE_SIZE = 1000
FALLBACK_PAGE_SIZE = 200
# Previews sync at most this often; a run always syncs.
PREVIEW_SYNC_INTERVAL = timedelta(minutes=10)

# user_id -> Last.fm username of the sync in flight (single worker, see
# AGENTS.md), and strong references so running tasks are not collected.
_running: dict[str, str] = {}
_background_tasks: set[asyncio.Task] = set()
# Called with the user id after a background sync ends well: runs waiting for the listens start then.
after_sync: list[Callable[[str], None]] = []


class SyncSuperseded(Exception):
    """The user linked another Last.fm account while this sync ran."""


def progress_key(user_id: str) -> str:
    return f"sync:{user_id}"


def stop_scrobble_sync(user_id: str) -> None:
    """A sync running for an account being deleted stops before its next write."""
    if user_id in _running:
        _running[user_id] = ""


def _check_current(user_id: str, username: str) -> None:
    """Stop before writing if a relink replaced this sync's account."""
    if user_id in _running and _running[user_id] != username:
        raise SyncSuperseded


async def _stretches(db: AsyncSession, user_id: str) -> tuple[list[tuple[int | None, int, bool]], float | None]:
    """What to read, as (time_from, time_to, older), and the oldest stored listen. Older stretches predate it."""
    user = await db.get(User, user_id)
    first_load = user is None or user.scrobbles_complete_at is None
    newest = await get_latest_played_at(db, user_id)
    oldest = await get_earliest_played_at(db, user_id)
    # Fixed upper bounds keep page numbers stable while new listens arrive.
    now = int(datetime.now(UTC).timestamp())
    stretches = []
    if newest is not None or not first_load:
        stretches.append((int(newest.timestamp()) + 1 if newest else None, now, False))
    if first_load:
        stretches.append((None, int(oldest.timestamp()) - 1 if oldest else now, True))
    return stretches, oldest.timestamp() if oldest else None


async def _plan(username: str, page_size: int, stretches: list) -> list:
    """Each stretch with its page count and the pages already read: page 1 to count them,
    and an older stretch's last one, which dates the start of the history."""
    plans = []
    for time_from, time_to, older in stretches:
        first, pages = await call_retrying_rate_limit(get_scrobble_page, username, 1, page_size, time_from, time_to)
        read = {1: first}
        if older and pages > 1:
            read[pages] = (await call_retrying_rate_limit(get_scrobble_page, username, pages, page_size, time_from, time_to))[0]
        plans.append((time_from, time_to, older, pages, read))
    return plans


async def _sync_listens(db: AsyncSession, user_id: str, username: str, page_size: int) -> None:
    stretches, oldest = await _stretches(db, user_id)
    plans = await _plan(username, page_size, stretches)
    total = sum(pages for _, _, _, pages, _ in plans)
    # How far back the stored history reaches, and where the whole history starts: said before the start
    # is read, so the app can lay the years out.
    reached = since = oldest
    for _, _, older, pages, read in plans:
        if older and pages:
            since = min((uts for _, _, uts, _ in read[pages]), default=since)
    key = progress_key(user_id)
    progress_store.report(key, "sync", 0, total, since=since, reached=reached)
    log_activity("sync", username, f"start, {total} pages")
    done = 0
    for time_from, time_to, older, pages, read in plans:
        for page in range(1, pages + 1) if older else range(pages, 0, -1):
            listens = read.pop(page, None)
            if listens is None:
                listens, _ = await call_retrying_rate_limit(get_scrobble_page, username, page, page_size, time_from, time_to)
            _check_current(user_id, username)
            await store_scrobbles(
                db,
                user_id,
                [(title, artist, datetime.fromtimestamp(uts, tz=UTC)) for title, artist, uts, _ in listens],
            )
            await store_track_albums(db, [(title, artist, album) for title, artist, _, album in listens], older=older)
            await db.commit()
            done += 1
            if older:
                reached = min((uts for _, _, uts, _ in listens), default=reached)
            progress_store.report(key, "sync", done, total, since=since, reached=reached)
            progress_store.bump_calls(key)
            log_activity("sync", username, f"page {done}/{total}  +{len(listens)} listens")


async def _sync_loved(db: AsyncSession, user_id: str, username: str) -> None:
    loved, total_pages = await call_retrying_rate_limit(get_loved_page, username, 1, PAGE_SIZE)
    for page in range(2, total_pages + 1):
        more, _ = await call_retrying_rate_limit(get_loved_page, username, page, PAGE_SIZE)
        loved.extend(more)
    _check_current(user_id, username)
    await replace_loved(db, user_id, loved)
    log_activity("sync", username, f"{len(loved)} loved tracks")


async def sync_scrobbles(db: AsyncSession, user_id: str, username: str) -> None:
    """Bring a user's stored listens and loved flags up to date with Last.fm."""
    started = time.monotonic()
    try:
        await _sync_listens(db, user_id, username, PAGE_SIZE)
    except PAGE_ERRORS as exc:
        if is_rate_limit_error(exc):
            raise
        log_activity("sync", username, f"pages of {PAGE_SIZE} refused, retrying with {FALLBACK_PAGE_SIZE}")
        await db.rollback()
        # Committed pages stay: the retry starts after the newest stored listen.
        await _sync_listens(db, user_id, username, FALLBACK_PAGE_SIZE)
    await _sync_loved(db, user_id, username)
    _check_current(user_id, username)
    user = await db.get(User, user_id)
    if user is not None:
        now = datetime.now(UTC)
        user.scrobbles_synced_at = now
        user.scrobbles_complete_at = user.scrobbles_complete_at or now
    await db.commit()
    log_activity("sync", username, f"done  {format_duration(time.monotonic() - started)}")
    start_tag_catalogue(user_id, username)


def is_fresh(user: User, max_age: timedelta = PREVIEW_SYNC_INTERVAL) -> bool:
    synced = user.scrobbles_synced_at
    return synced is not None and datetime.now(UTC) - synced < max_age


async def _sync_in_background(user_id: str, username: str) -> None:
    key = progress_key(user_id)
    try:
        async with async_session() as db:
            await sync_scrobbles(db, user_id, username)
        progress_store.finish(key)
        for callback in after_sync:
            callback(user_id)
    except SyncSuperseded:
        log_activity("sync", username, "cancelled, another Last.fm account was linked")
    except (*PAGE_ERRORS, SQLAlchemyError) as exc:
        log_activity("sync", username, f"failed: {type(exc).__name__}, resumes on the next sync")
        progress_store.finish(key, error="Listening history sync failed. It will resume on the next sync.")
    finally:
        if _running.get(user_id) == username:
            del _running[user_id]


def is_syncing(user_id: str) -> bool:
    return user_id in _running


def start_scrobble_sync(user_id: str, username: str) -> bool:
    """Start a background sync unless one already runs for this account.

    A sync still running for a previously linked account stops itself at
    its next page (see _check_current).
    """
    if _running.get(user_id) == username:
        return False
    _running[user_id] = username
    progress_store.start(progress_key(user_id))
    task = asyncio.create_task(_sync_in_background(user_id, username))
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)
    return True

