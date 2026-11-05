import uuid
from datetime import UTC, datetime

from models.track import Track
from models.user_track import UserTrack
from sqlalchemy import delete, func, select, tuple_
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


async def _tracks_by_key(
    db: AsyncSession, pairs: list[tuple[str, str]]
) -> dict[tuple[str, str], Track]:
    """Map (artist, title) pairs to their track rows (bulk lookup)."""
    existing = await db.execute(
        select(Track).where(tuple_(Track.artist, Track.title).in_(pairs))
    )
    return {(t.artist, t.title): t for t in existing.scalars().all()}


async def ensure_tracks(
    db: AsyncSession, pairs: list[tuple[str, str]]
) -> dict[tuple[str, str], Track]:
    """Map (artist, title) pairs to track rows, creating the missing ones."""
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
    return by_key


async def bulk_store_recent_plays(
    db: AsyncSession,
    user_id: str,
    plays: list[tuple[str, str, datetime | None]],
) -> None:
    """Record recent plays in bulk: (title, artist, played_at) triples.

    Never fabricates user stats or refreshes enrich sync state, and
    last_played_at only moves forward. A constant handful of round-trips:
    one track lookup, one insert for missing tracks, one upsert for the
    plays. Caller commits.
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

    by_key = await ensure_tracks(db, list(dated))

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


async def delete_user_tracks(db: AsyncSession, user_id: str) -> None:
    """Drop a user's personal cache (play counts, loved, last played)."""
    await db.execute(delete(UserTrack).where(UserTrack.user_id == user_id))
