from datetime import datetime, timezone
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.user_track import UserTrack


async def get_user_track(db: AsyncSession, user_id: str, track_id: str) -> UserTrack | None:
    result = await db.execute(
        select(UserTrack).where(UserTrack.user_id == user_id, UserTrack.track_id == track_id)
    )
    return result.scalar_one_or_none()


async def upsert_user_track(
    db: AsyncSession,
    user_id: str,
    track_id: str,
    user_playcount: int = 0,
    userloved: bool = False,
    last_played_at: datetime | None = None,
) -> UserTrack:
    existing = await get_user_track(db, user_id, track_id)
    
    now = datetime.now(timezone.utc)
    
    if existing:
        existing.user_playcount = user_playcount
        existing.userloved = userloved
        if last_played_at:
            existing.last_played_at = last_played_at
        existing.last_synced_at = now
        await db.commit()
        await db.refresh(existing)
        return existing
    
    user_track = UserTrack(
        user_id=user_id,
        track_id=track_id,
        user_playcount=user_playcount,
        userloved=userloved,
        last_played_at=last_played_at,
        last_synced_at=now,
        created_at=now,
    )
    db.add(user_track)
    await db.commit()
    await db.refresh(user_track)
    return user_track


async def get_user_tracks_needing_sync(
    db: AsyncSession,
    user_id: str,
    since: datetime | None = None,
) -> list[UserTrack]:
    """Get user tracks that need syncing (last_synced_at is null or older than since)."""
    query = select(UserTrack).where(UserTrack.user_id == user_id)
    if since:
        query = query.where(UserTrack.last_synced_at < since)
    else:
        query = query.where(UserTrack.last_synced_at.is_(None))
    
    result = await db.execute(query)
    return list(result.scalars().all())


async def update_last_played(
    db: AsyncSession,
    user_id: str,
    track_id: str,
    last_played_at: datetime,
) -> UserTrack:
    existing = await get_user_track(db, user_id, track_id)
    now = datetime.now(timezone.utc)
    
    if existing:
        if last_played_at > (existing.last_played_at or datetime.min.replace(tzinfo=timezone.utc)):
            existing.last_played_at = last_played_at
        existing.last_synced_at = now
        await db.commit()
        await db.refresh(existing)
        return existing
    
    user_track = UserTrack(
        user_id=user_id,
        track_id=track_id,
        last_played_at=last_played_at,
        last_synced_at=now,
        created_at=now,
    )
    db.add(user_track)
    await db.commit()
    await db.refresh(user_track)
    return user_track
