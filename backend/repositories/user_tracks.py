from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
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
    """Atomically upsert a user-track record.

    Caller is responsible for committing the session.
    """
    now = datetime.now(timezone.utc)

    update_values = {
        "user_playcount": user_playcount,
        "userloved": userloved,
        "last_synced_at": now,
    }
    if last_played_at:
        update_values["last_played_at"] = last_played_at

    stmt = (
        insert(UserTrack)
        .values(
            user_id=user_id,
            track_id=track_id,
            user_playcount=user_playcount,
            userloved=userloved,
            last_played_at=last_played_at,
            last_synced_at=now,
            created_at=now,
        )
        .on_conflict_do_update(
            index_elements=["user_id", "track_id"],
            set_=update_values,
        )
        .returning(UserTrack)
    )
    result = await db.execute(stmt)
    await db.flush()
    return result.scalar_one()


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
    """Update last_played_at for a user track. Only updates if the new value is more recent.

    Caller is responsible for committing the session.
    """
    now = datetime.now(timezone.utc)

    # Use atomic upsert — only update last_played_at if the new value is greater
    stmt = (
        insert(UserTrack)
        .values(
            user_id=user_id,
            track_id=track_id,
            last_played_at=last_played_at,
            last_synced_at=now,
            created_at=now,
        )
        .on_conflict_do_update(
            index_elements=["user_id", "track_id"],
            set_={
                "last_played_at": last_played_at,
                "last_synced_at": now,
            },
        )
        .returning(UserTrack)
    )
    result = await db.execute(stmt)
    await db.flush()
    return result.scalar_one()
