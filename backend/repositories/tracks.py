import uuid
from datetime import UTC, datetime, timedelta

from models.track import Track
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

CACHE_TTL = timedelta(hours=24)


async def get_track_by_id(db: AsyncSession, track_id: str) -> Track | None:
    result = await db.execute(select(Track).where(Track.id == track_id))
    return result.scalar_one_or_none()


async def get_track_by_artist_title(db: AsyncSession, artist: str, title: str) -> Track | None:
    result = await db.execute(
        select(Track).where(Track.artist == artist, Track.title == title)
    )
    return result.scalar_one_or_none()


async def get_or_create_track(
    db: AsyncSession,
    title: str,
    artist: str,
    album_id: str | None = None,
    listeners: int = 0,
    global_playcount: int = 0,
    image_url: str | None = None,
    mark_fetched: bool = True,
) -> Track:
    """Get an existing track or create a new one.

    Uses SELECT FOR UPDATE to prevent race conditions on concurrent inserts.
    With mark_fetched=False the row is returned/created without stamping
    last_fetched_at, so the enrich cache still treats it as unfetched
    (used by paths that only record identity, like recent plays).
    Caller is responsible for committing the session.
    """
    now = datetime.now(UTC)

    # Lock the row if it exists to prevent concurrent duplicate inserts
    result = await db.execute(
        select(Track)
        .where(Track.artist == artist, Track.title == title)
        .with_for_update()
    )
    existing = result.scalar_one_or_none()

    if existing:
        # Update only if stale
        if mark_fetched and (
            existing.last_fetched_at is None or existing.last_fetched_at < (now - CACHE_TTL)
        ):
            existing.listeners = listeners
            existing.global_playcount = global_playcount
            existing.image_url = image_url or existing.image_url
            existing.album_id = album_id or existing.album_id
            existing.last_fetched_at = now
        return existing

    track = Track(
        id=str(uuid.uuid4()),
        title=title,
        artist=artist,
        album_id=album_id,
        listeners=listeners,
        global_playcount=global_playcount,
        image_url=image_url,
        last_fetched_at=now if mark_fetched else None,
        created_at=now,
    )
    db.add(track)
    await db.flush()
    await db.refresh(track)
    return track


async def upsert_track(
    db: AsyncSession,
    title: str,
    artist: str,
    album_id: str | None = None,
    listeners: int = 0,
    global_playcount: int = 0,
    image_url: str | None = None,
) -> Track:
    return await get_or_create_track(
        db, title, artist, album_id, listeners, global_playcount, image_url
    )
