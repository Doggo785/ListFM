import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.album import Album

CACHE_TTL = timedelta(hours=24)


async def get_album_by_id(db: AsyncSession, album_id: str) -> Album | None:
    result = await db.execute(select(Album).where(Album.id == album_id))
    return result.scalar_one_or_none()


async def get_album_by_title_artist(db: AsyncSession, title: str, artist: str) -> Album | None:
    result = await db.execute(
        select(Album).where(Album.title == title, Album.artist == artist)
    )
    return result.scalar_one_or_none()


async def get_or_create_album(
    db: AsyncSession,
    title: str,
    artist: str,
) -> Album:
    """Get an existing album or create a new one.

    Uses SELECT FOR UPDATE to prevent race conditions on concurrent inserts.
    Caller is responsible for committing the session.
    """
    now = datetime.now(timezone.utc)

    result = await db.execute(
        select(Album)
        .where(Album.title == title, Album.artist == artist)
        .with_for_update()
    )
    existing = result.scalar_one_or_none()

    if existing:
        if existing.last_fetched_at is None or existing.last_fetched_at < (now - CACHE_TTL):
            existing.last_fetched_at = now
        return existing

    album = Album(
        id=str(uuid.uuid4()),
        title=title,
        artist=artist,
        last_fetched_at=now,
        created_at=now,
    )
    db.add(album)
    await db.flush()
    await db.refresh(album)
    return album
