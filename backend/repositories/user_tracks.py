from datetime import datetime, timezone

from sqlalchemy import desc, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from models.album import Album
from models.track import Track
from models.user_track import UserTrack

EPOCH_FLOOR = datetime(1970, 1, 1, tzinfo=timezone.utc)


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


async def upsert_last_played_at(
    db: AsyncSession,
    user_id: str,
    track_id: str,
    last_played_at: datetime,
) -> None:
    """Record a play timestamp without touching user stats or sync state.

    Used by the recents dashboard path: it must never fabricate
    user_playcount/userloved (defaults stay until a real enrich sync) nor
    refresh last_synced_at (that would mark enrich data fresh without
    verifying it). Only last_played_at moves forward (monotonic max).
    Caller is responsible for committing the session.
    """
    from sqlalchemy import func

    excluded_last_played = insert(UserTrack).excluded.last_played_at
    stmt = (
        insert(UserTrack)
        .values(
            user_id=user_id,
            track_id=track_id,
            last_played_at=last_played_at,
            created_at=datetime.now(timezone.utc),
        )
        .on_conflict_do_update(
            index_elements=["user_id", "track_id"],
            set_={
                "last_played_at": func.greatest(
                    func.coalesce(UserTrack.last_played_at, EPOCH_FLOOR),
                    func.coalesce(excluded_last_played, EPOCH_FLOOR),
                ),
            },
        )
    )
    await db.execute(stmt)
    await db.flush()


async def get_recent_user_tracks(
    db: AsyncSession, user_id: str, limit: int
) -> list[dict]:
    """Newest plays with track identity, newest first (may be empty)."""
    result = await db.execute(
        select(Track.title, Track.artist, Album.title, UserTrack.last_played_at)
        .join(Track, Track.id == UserTrack.track_id)
        .outerjoin(Album, Album.id == Track.album_id)
        .where(UserTrack.user_id == user_id, UserTrack.last_played_at.is_not(None))
        .order_by(desc(UserTrack.last_played_at))
        .limit(limit)
    )
    return [
        {"title": title, "artist": artist, "album": album, "played_at": played_at}
        for title, artist, album, played_at in result.all()
    ]
