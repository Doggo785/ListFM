"""Album art for the playlists (same idea as ADR 0003's tag catalogue): looked up
apart from the pipeline, one Last.fm call per album, shared between users.

Started when a user opens their playlists, for the albums those playlists hold.
Each album is committed on its own, so an interrupted pass resumes at the next visit.
"""

import asyncio
from datetime import UTC, datetime

from database import async_session
from models.album import Album
from repositories.generated_playlists import get_albums_missing_cover
from services.activity_log import log_activity
from services.lastfm import PAGE_ERRORS, call_retrying_rate_limit, get_album_image
from sqlalchemy import update
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

# Past this many failures in a row Last.fm is down: wait for the next visit.
MAX_CONSECUTIVE_FAILURES = 5

# Users with a pass in flight (single worker, see AGENTS.md), and strong
# references so running tasks are not collected.
_running: set[str] = set()
_background_tasks: set[asyncio.Task] = set()


async def fill_album_covers(db: AsyncSession, user_id: str, username: str) -> None:
    albums = await get_albums_missing_cover(db, user_id)
    await db.commit()  # no connection held during the Last.fm calls
    if not albums:
        return
    log_activity("pochettes", username, f"début, {len(albums)} albums à chercher")
    failures = 0
    found = 0
    for album_id, title, artist in albums:
        try:
            image = await call_retrying_rate_limit(get_album_image, artist, title)
            await db.execute(
                update(Album).where(Album.id == album_id).values(image_url=image, image_fetched_at=datetime.now(UTC))
            )
            await db.commit()
            failures = 0
            found += image is not None
        except (*PAGE_ERRORS, SQLAlchemyError) as exc:
            await db.rollback()
            failures += 1
            log_activity("pochettes", username, f"album ignoré : {type(exc).__name__}")
            if failures == MAX_CONSECUTIVE_FAILURES:
                log_activity("pochettes", username, f"arrêt après {failures} échecs de suite, reprise à la prochaine visite")
                return
    log_activity("pochettes", username, f"terminé, {found} pochettes sur {len(albums)} albums")


async def _fill_in_background(user_id: str, username: str) -> None:
    try:
        async with async_session() as db:
            await fill_album_covers(db, user_id, username)
    except SQLAlchemyError as exc:
        log_activity("pochettes", username, f"échec : {type(exc).__name__}, reprise à la prochaine visite")
    finally:
        _running.discard(user_id)


def start_album_covers(user_id: str, username: str) -> None:
    if user_id in _running:
        return
    _running.add(user_id)
    task = asyncio.create_task(_fill_in_background(user_id, username))
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)
