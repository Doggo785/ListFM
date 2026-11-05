"""Album art for the playlists (same idea as ADR 0003's tag catalogue): looked up
apart from the pipeline, one Last.fm call per album, shared between users.

Started when a user opens their playlists or their Dashboard, only for the albums shown.
Each album is committed on its own, so an interrupted pass resumes at the next visit.
"""

import asyncio
from datetime import UTC, datetime

from database import async_session
from models.album import Album
from repositories.generated_playlists import get_cover_candidates
from services.activity_log import log_activity
from services.lastfm import PAGE_ERRORS, call_retrying_rate_limit, get_album_image
from sqlalchemy import Row, update
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

COVERS_NEEDED = 2  # A cover shows two albums (lib/playlistCover.js).
# Not every album has art, so a few more get tried: past these, the cover makes do with what it found.
MAX_ALBUMS_TRIED = 8
# Past this many failures in a row Last.fm is down: wait for the next visit.
MAX_CONSECUTIVE_FAILURES = 5

# Users with a pass in flight (single worker, see AGENTS.md), and strong
# references so running tasks are not collected.
_running: set[str] = set()
_background_tasks: set[asyncio.Task] = set()


async def _look_up(db: AsyncSession, album: Row) -> str | None:
    image = await call_retrying_rate_limit(get_album_image, album.artist, album.title)
    await db.execute(update(Album).where(Album.id == album.id).values(image_url=image, image_fetched_at=datetime.now(UTC)))
    await db.commit()
    return image


async def _walk_albums(db: AsyncSession, lists: list[list[Row]], needed: int, username: str) -> None:
    """Look up each list's albums in order and stop at the covers it shows: most albums are never asked for."""
    images: dict[str, str | None] = {}  # What this pass learned or read, so a shared album costs one call.
    calls = 0
    failures = 0
    for albums in lists:
        covers = 0
        for album in albums[:MAX_ALBUMS_TRIED]:
            if album.id not in images:
                if album.image_fetched_at is not None:
                    images[album.id] = album.image_url
                else:
                    try:
                        images[album.id] = await _look_up(db, album)
                        calls += 1
                        failures = 0
                    except (*PAGE_ERRORS, SQLAlchemyError) as exc:
                        await db.rollback()
                        failures += 1
                        log_activity("pochettes", username, f"album ignoré : {type(exc).__name__}")
                        if failures == MAX_CONSECUTIVE_FAILURES:
                            log_activity("pochettes", username, f"arrêt après {failures} échecs de suite, reprise à la prochaine visite")
                            return
                        continue
            covers += images[album.id] is not None
            if covers == needed:
                break
    if calls:
        log_activity("pochettes", username, f"terminé, {calls} albums cherchés")


async def fill_album_covers(db: AsyncSession, user_id: str, username: str) -> None:
    playlists = await get_cover_candidates(db, user_id)
    await db.commit()  # no connection held during the Last.fm calls
    await _walk_albums(db, playlists, COVERS_NEEDED, username)


async def _fill_in_background(user_id: str, username: str, lists: list[list[Row]] | None = None) -> None:
    try:
        async with async_session() as db:
            if lists is None:
                await fill_album_covers(db, user_id, username)
            else:
                await _walk_albums(db, lists, 1, username)
    except SQLAlchemyError as exc:
        log_activity("pochettes", username, f"échec : {type(exc).__name__}, reprise à la prochaine visite")
    finally:
        _running.discard(user_id)


def start_album_covers(user_id: str, username: str, lists: list[list[Row]] | None = None) -> None:
    """Fill the covers of these album lists, one each, or by default those of the user's playlists."""
    if user_id in _running:
        return
    _running.add(user_id)
    task = asyncio.create_task(_fill_in_background(user_id, username, lists))
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)
