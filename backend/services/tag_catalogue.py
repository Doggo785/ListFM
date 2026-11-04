"""Tag catalogue (ADR 0003): one Last.fm call per artist, shared between users.

Filled in the background after a sync, most listened artists first. Each
artist is committed on its own, so an interrupted pass resumes at the next
sync: finished artists are no longer due.
"""

import asyncio
import logging
from datetime import UTC, datetime, timedelta

from database import async_session
from repositories.tags import (
    artist_tags_fetched_since,
    get_artists_to_tag,
    replace_artist_tags,
)
from services.lastfm import PAGE_ERRORS, call_retrying_rate_limit, get_artist_tags
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

TAG_VALIDITY = timedelta(days=90)
# Past this many failures in a row Last.fm is down: wait for the next sync.
MAX_CONSECUTIVE_FAILURES = 5

# Users with a pass in flight (single worker, see AGENTS.md), and strong
# references so running tasks are not collected.
_running: set[str] = set()
_background_tasks: set[asyncio.Task] = set()


async def fill_tag_catalogue(db: AsyncSession, user_id: str) -> None:
    stale_before = datetime.now(UTC) - TAG_VALIDITY
    artists = await get_artists_to_tag(db, user_id, stale_before)
    failures = 0
    for artist in artists:
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
            logger.warning("tag catalogue: artist skipped: %s", type(exc).__name__)
            if failures == MAX_CONSECUTIVE_FAILURES:
                logger.warning("tag catalogue: stopping for user %s until the next sync", user_id)
                return


async def _fill_in_background(user_id: str) -> None:
    try:
        async with async_session() as db:
            await fill_tag_catalogue(db, user_id)
    except SQLAlchemyError as exc:
        logger.warning("tag catalogue failed for user %s: %s", user_id, type(exc).__name__)
    finally:
        _running.discard(user_id)


def start_tag_catalogue(user_id: str) -> None:
    if user_id in _running:
        return
    _running.add(user_id)
    task = asyncio.create_task(_fill_in_background(user_id))
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)
