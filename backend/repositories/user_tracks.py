import uuid
from datetime import UTC, datetime

from models.album import Album
from models.track import Track
from models.user_track import UserTrack
from sqlalchemy import desc, func, select, tuple_
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

EPOCH_FLOOR = datetime(1970, 1, 1, tzinfo=UTC)


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
    now = datetime.now(UTC)

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
    now = datetime.now(UTC)

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
    excluded_last_played = insert(UserTrack).excluded.last_played_at
    stmt = (
        insert(UserTrack)
        .values(
            user_id=user_id,
            track_id=track_id,
            last_played_at=last_played_at,
            created_at=datetime.now(UTC),
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


async def _tracks_by_key(
    db: AsyncSession, pairs: list[tuple[str, str]]
) -> dict[tuple[str, str], Track]:
    """Map (artist, title) pairs to their track rows (bulk lookup)."""
    existing = await db.execute(
        select(Track).where(tuple_(Track.artist, Track.title).in_(pairs))
    )
    return {(t.artist, t.title): t for t in existing.scalars().all()}


async def bulk_store_recent_plays(
    db: AsyncSession,
    user_id: str,
    plays: list[tuple[str, str, datetime | None]],
) -> None:
    """Record recent plays in bulk: (title, artist, played_at) triples.

    Same guarantees as upsert_last_played_at (never fabricates user stats
    or refreshes enrich sync state; last_played_at moves monotonically),
    but in a constant handful of round-trips: one track lookup, one insert
    for missing tracks, one upsert for the plays. Caller commits.
    """
    merged: dict[tuple[str, str], datetime | None] = {}
    for title, artist, played_at in plays:
        key = (artist, title)
        prev = merged.get(key)
        if key not in merged or (
            played_at is not None and (prev is None or played_at > prev)
        ):
            merged[key] = played_at
    dated = {k: v for k, v in merged.items() if v is not None}
    if not dated:
        return

    pairs = list(dated)
    by_key = await _tracks_by_key(db, pairs)
    missing = [p for p in pairs if p not in by_key]
    if missing:
        now = datetime.now(UTC)
        await db.execute(
            insert(Track)
            .values(
                [
                    {
                        "id": str(uuid.uuid4()),
                        "title": title,
                        "artist": artist,
                        "last_fetched_at": None,
                        "created_at": now,
                    }
                    for artist, title in missing
                ]
            )
            .on_conflict_do_nothing(index_elements=["artist", "title"])
        )
        await db.flush()
        by_key = await _tracks_by_key(db, pairs)

    now = datetime.now(UTC)
    stmt = insert(UserTrack).values(
        [
            {
                "user_id": user_id,
                "track_id": by_key[key].id,
                "last_played_at": played_at,
                "created_at": now,
            }
            for key, played_at in dated.items()
            if key in by_key
        ]
    )
    stmt = stmt.on_conflict_do_update(
        index_elements=["user_id", "track_id"],
        set_={
            "last_played_at": func.greatest(
                func.coalesce(UserTrack.last_played_at, EPOCH_FLOOR),
                func.coalesce(stmt.excluded.last_played_at, EPOCH_FLOOR),
            ),
        },
    )
    await db.execute(stmt)
    await db.flush()
