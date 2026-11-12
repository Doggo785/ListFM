"""Tag catalogue (ADR 0003): one Last.fm call per artist, shared between users.

Filled in the background after a sync, most listened artists first. Each
artist is committed on its own, so an interrupted pass resumes at the next
sync: finished artists are no longer due.
"""

import asyncio
import time
from collections.abc import Callable
from datetime import UTC, datetime, timedelta

from database import async_session
from repositories.tags import (
    artist_tags_fetched_since,
    get_artists_to_tag,
    replace_artist_tags,
)
from services.activity_log import format_duration, log_activity
from services.lastfm import PAGE_ERRORS, call_retrying_rate_limit, get_artist_tags
from services.progress import store as progress_store
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

TAG_VALIDITY = timedelta(days=90)
# Past this many failures in a row Last.fm is down: wait for the next sync.
MAX_CONSECUTIVE_FAILURES = 5
# One console line per this many artists: a line per call would bury everything else.
LOG_EVERY = 100

# Users with a pass in flight (single worker, see AGENTS.md), and strong
# references so running tasks are not collected.
_running: set[str] = set()
_background_tasks: set[asyncio.Task] = set()
# Called with the user id once a pass ends: runs filtering by tags wait for it.
after_pass: list[Callable[[str], None]] = []


def tags_progress_key(user_id: str) -> str:
    return f"tags:{user_id}"


async def fill_tag_catalogue(db: AsyncSession, user_id: str, username: str) -> None:
    stale_before = datetime.now(UTC) - TAG_VALIDITY
    artists = await get_artists_to_tag(db, user_id, stale_before)
    if not artists:
        return
    started = time.monotonic()
    log_activity("tags", username, f"start, {len(artists)} artists to look up")
    failures = 0
    key = tags_progress_key(user_id)
    for done, artist in enumerate(artists):
        progress_store.report(key, "tags", done, len(artists))
        if done and done % LOG_EVERY == 0:
            log_activity("tags", username, f"{done}/{len(artists)} artists")
        # Another user's pass may have reached this shared artist meanwhile.
        already_fetched = await artist_tags_fetched_since(db, artist, stale_before)
        await db.commit()  # no connection held during the Last.fm call
        if already_fetched:
            continue
        try:
            tags = await call_retrying_rate_limit(get_artist_tags, artist)
            await replace_artist_tags(db, artist, tags)
            await db.commit()
            failures = 0
        except (*PAGE_ERRORS, SQLAlchemyError) as exc:
            await db.rollback()
            failures += 1
            log_activity("tags", username, f"artist skipped: {type(exc).__name__}")
            if failures == MAX_CONSECUTIVE_FAILURES:
                log_activity("tags", username, f"stopped after {failures} failures in a row, resumes on the next sync")
                return
    log_activity("tags", username, f"done, {len(artists)} artists  {format_duration(time.monotonic() - started)}")


async def _fill_in_background(user_id: str, username: str) -> None:
    try:
        async with async_session() as db:
            await fill_tag_catalogue(db, user_id, username)
    except SQLAlchemyError as exc:
        log_activity("tags", username, f"failed: {type(exc).__name__}, resumes on the next sync")
    finally:
        progress_store.finish(tags_progress_key(user_id))
        _running.discard(user_id)
        for callback in after_pass:
            callback(user_id)


def is_tagging(user_id: str) -> bool:
    return user_id in _running


def start_tag_catalogue(user_id: str, username: str) -> None:
    if user_id in _running:
        return
    _running.add(user_id)
    progress_store.start(tags_progress_key(user_id))
    task = asyncio.create_task(_fill_in_background(user_id, username))
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)
