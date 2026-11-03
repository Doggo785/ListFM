"""Listening history sync (ADR 0001).

The first sync loads every listen, later ones only what is newer than the
last stored listen. Pages are read oldest first and committed one by one,
so an interrupted sync resumes where it stopped: the next one starts after
the newest stored listen. The loved list has no date order, so it is read
in full each time.
"""

import asyncio
import logging
from datetime import UTC, datetime, timedelta

import httpx
import pylast
from database import async_session
from models.user import User
from repositories.scrobbles import get_latest_played_at, replace_loved, store_scrobbles
from services.lastfm import (
    get_loved_page,
    get_scrobble_page,
    is_rate_limit_error,
    note_rate_limited,
)
from services.progress import store as progress_store
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

# 1000 is past Last.fm's documented maximum of 200 but works (felhag/lastfm-stats-web);
# 200 is the fallback when a large page fails.
PAGE_SIZE = 1000
FALLBACK_PAGE_SIZE = 200
RATE_LIMIT_RETRIES = 3
# Previews sync at most this often; a run always syncs.
PREVIEW_SYNC_INTERVAL = timedelta(minutes=10)

# user_id -> Last.fm username of the sync in flight (single worker, see
# AGENTS.md), and strong references so running tasks are not collected.
_running: dict[str, str] = {}
_background_tasks: set[asyncio.Task] = set()

# What a failed Last.fm page raises: an error body, a transport or HTTP
# error, or an unexpected payload shape.
PAGE_ERRORS = (pylast.WSError, httpx.HTTPError, KeyError, TypeError, ValueError)


class SyncSuperseded(Exception):
    """The user linked another Last.fm account while this sync ran."""


def progress_key(user_id: str) -> str:
    return f"sync:{user_id}"


def _check_current(user_id: str, username: str) -> None:
    """Stop before writing if a relink replaced this sync's account."""
    if user_id in _running and _running[user_id] != username:
        raise SyncSuperseded


async def _call(fn, *args):
    """One Last.fm page off the event loop, retried after a rate limit (29)."""
    for attempt in range(RATE_LIMIT_RETRIES + 1):
        try:
            return await asyncio.to_thread(fn, *args)
        except pylast.WSError as exc:
            if not is_rate_limit_error(exc) or attempt == RATE_LIMIT_RETRIES:
                raise
            # The shared throttle sleeps out the backoff before the next call.
            note_rate_limited()
    raise AssertionError("unreachable")


async def _sync_listens(db: AsyncSession, user_id: str, username: str, page_size: int) -> None:
    latest = await get_latest_played_at(db, user_id)
    time_from = int(latest.timestamp()) + 1 if latest else None
    # A fixed upper bound keeps page numbers stable while new listens arrive.
    time_to = int(datetime.now(UTC).timestamp())
    key = progress_key(user_id)

    _, total_pages = await _call(get_scrobble_page, username, 1, page_size, time_from, time_to)
    for done, page in enumerate(range(total_pages, 0, -1), start=1):
        listens, _ = await _call(get_scrobble_page, username, page, page_size, time_from, time_to)
        _check_current(user_id, username)
        await store_scrobbles(
            db,
            user_id,
            [(title, artist, datetime.fromtimestamp(uts, tz=UTC)) for title, artist, uts in listens],
        )
        await db.commit()
        progress_store.report(key, "sync", done, total_pages)
        progress_store.bump_calls(key)


async def _sync_loved(db: AsyncSession, user_id: str, username: str) -> None:
    loved, total_pages = await _call(get_loved_page, username, 1, PAGE_SIZE)
    for page in range(2, total_pages + 1):
        more, _ = await _call(get_loved_page, username, page, PAGE_SIZE)
        loved.extend(more)
    _check_current(user_id, username)
    await replace_loved(db, user_id, loved)


async def sync_scrobbles(db: AsyncSession, user_id: str, username: str) -> None:
    """Bring a user's stored listens and loved flags up to date with Last.fm."""
    try:
        await _sync_listens(db, user_id, username, PAGE_SIZE)
    except PAGE_ERRORS as exc:
        if is_rate_limit_error(exc):
            raise
        logger.warning("scrobble sync: pages of %d failed, retrying with %d", PAGE_SIZE, FALLBACK_PAGE_SIZE)
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


def is_fresh(user: User, max_age: timedelta = PREVIEW_SYNC_INTERVAL) -> bool:
    synced = user.scrobbles_synced_at
    return synced is not None and datetime.now(UTC) - synced < max_age


async def _sync_in_background(user_id: str, username: str) -> None:
    key = progress_key(user_id)
    try:
        async with async_session() as db:
            await sync_scrobbles(db, user_id, username)
        progress_store.finish(key)
    except SyncSuperseded:
        logger.info("scrobble sync for user %s superseded by a relink", user_id)
    except (*PAGE_ERRORS, SQLAlchemyError) as exc:
        logger.warning("scrobble sync failed for user %s: %s", user_id, type(exc).__name__)
        progress_store.finish(key, error="Listening history sync failed. It will resume on the next sync.")
    finally:
        if _running.get(user_id) == username:
            del _running[user_id]


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

