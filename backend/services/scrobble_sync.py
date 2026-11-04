"""Listening history sync (ADR 0001).

The first sync loads every listen, later ones only what is newer than the
last stored listen. Pages are read oldest first and committed one by one,
so an interrupted sync resumes where it stopped: the next one starts after
the newest stored listen. The loved list has no date order, so it is read
in full each time.
"""

import asyncio
import time
from datetime import UTC, datetime, timedelta

from database import async_session
from models.user import User
from repositories.scrobbles import (
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


class SyncSuperseded(Exception):
    """The user linked another Last.fm account while this sync ran."""


def progress_key(user_id: str) -> str:
    return f"sync:{user_id}"


def _check_current(user_id: str, username: str) -> None:
    """Stop before writing if a relink replaced this sync's account."""
    if user_id in _running and _running[user_id] != username:
        raise SyncSuperseded


async def _sync_listens(db: AsyncSession, user_id: str, username: str, page_size: int) -> None:
    latest = await get_latest_played_at(db, user_id)
    time_from = int(latest.timestamp()) + 1 if latest else None
    # A fixed upper bound keeps page numbers stable while new listens arrive.
    time_to = int(datetime.now(UTC).timestamp())
    key = progress_key(user_id)

    _, total_pages = await call_retrying_rate_limit(get_scrobble_page, username, 1, page_size, time_from, time_to)
    log_activity("sync", username, f"début, {total_pages} pages")
    for done, page in enumerate(range(total_pages, 0, -1), start=1):
        listens, _ = await call_retrying_rate_limit(get_scrobble_page, username, page, page_size, time_from, time_to)
        _check_current(user_id, username)
        await store_scrobbles(
            db,
            user_id,
            [(title, artist, datetime.fromtimestamp(uts, tz=UTC)) for title, artist, uts, _ in listens],
        )
        await store_track_albums(db, [(title, artist, album) for title, artist, _, album in listens])
        await db.commit()
        progress_store.report(key, "sync", done, total_pages)
        progress_store.bump_calls(key)
        log_activity("sync", username, f"page {done}/{total_pages}  +{len(listens)} écoutes")


async def _sync_loved(db: AsyncSession, user_id: str, username: str) -> None:
    loved, total_pages = await call_retrying_rate_limit(get_loved_page, username, 1, PAGE_SIZE)
    for page in range(2, total_pages + 1):
        more, _ = await call_retrying_rate_limit(get_loved_page, username, page, PAGE_SIZE)
        loved.extend(more)
    _check_current(user_id, username)
    await replace_loved(db, user_id, loved)
    log_activity("sync", username, f"{len(loved)} morceaux aimés")


async def sync_scrobbles(db: AsyncSession, user_id: str, username: str) -> None:
    """Bring a user's stored listens and loved flags up to date with Last.fm."""
    started = time.monotonic()
    try:
        await _sync_listens(db, user_id, username, PAGE_SIZE)
    except PAGE_ERRORS as exc:
        if is_rate_limit_error(exc):
            raise
        log_activity("sync", username, f"pages de {PAGE_SIZE} refusées, nouvel essai par {FALLBACK_PAGE_SIZE}")
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
    log_activity("sync", username, f"terminé  {format_duration(time.monotonic() - started)}")
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
    except SyncSuperseded:
        log_activity("sync", username, "annulé, un autre compte Last.fm a été lié")
    except (*PAGE_ERRORS, SQLAlchemyError) as exc:
        log_activity("sync", username, f"échec : {type(exc).__name__}, reprise à la prochaine synchro")
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

