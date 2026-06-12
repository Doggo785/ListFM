import uuid
from datetime import datetime, timedelta, timezone
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.track import Track

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
) -> Track:
    existing = await get_track_by_artist_title(db, artist, title)
    if existing:
        now = datetime.now(timezone.utc)
        if existing.last_fetched_at is None or existing.last_fetched_at < (now - CACHE_TTL):
            existing.listeners = listeners
            existing.global_playcount = global_playcount
            existing.image_url = image_url or existing.image_url
            existing.album_id = album_id or existing.album_id
            existing.last_fetched_at = now
            await db.commit()
            await db.refresh(existing)
        return existing
    
    now = datetime.now(timezone.utc)
    track = Track(
        id=str(uuid.uuid4()),
        title=title,
        artist=artist,
        album_id=album_id,
        listeners=listeners,
        global_playcount=global_playcount,
        image_url=image_url,
        last_fetched_at=now,
        created_at=now,
    )
    db.add(track)
    await db.commit()
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
