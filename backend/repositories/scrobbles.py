from datetime import datetime

from models.scrobble import Scrobble
from models.user_track import UserTrack
from repositories.user_tracks import bulk_store_recent_plays, ensure_tracks
from sqlalchemy import delete, func, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession


async def get_latest_played_at(db: AsyncSession, user_id: str) -> datetime | None:
    return (
        await db.execute(select(func.max(Scrobble.played_at)).where(Scrobble.user_id == user_id))
    ).scalar_one()


async def store_scrobbles(
    db: AsyncSession, user_id: str, listens: list[tuple[str, str, datetime]]
) -> None:
    """Record listens as (title, artist, played_at); replays are ignored. Caller commits."""
    if not listens:
        return
    # Creates missing tracks and moves user_tracks.last_played_at forward.
    await bulk_store_recent_plays(db, user_id, list(listens))
    by_key = await ensure_tracks(db, list({(artist, title) for title, artist, _ in listens}))
    await db.execute(
        insert(Scrobble)
        .values(
            [
                {"user_id": user_id, "played_at": played_at, "track_id": by_key[(artist, title)].id}
                for title, artist, played_at in listens
                if (artist, title) in by_key
            ]
        )
        .on_conflict_do_nothing()
    )


async def replace_loved(db: AsyncSession, user_id: str, loved: list[tuple[str, str]]) -> None:
    """Make the loved flags match Last.fm's full loved list. Caller commits."""
    by_key = await ensure_tracks(db, list({(artist, title) for title, artist in loved})) if loved else {}
    loved_ids = {track.id for track in by_key.values()}
    await db.execute(
        update(UserTrack)
        .where(UserTrack.user_id == user_id, UserTrack.userloved.is_(True), UserTrack.track_id.not_in(loved_ids))
        .values(userloved=False)
    )
    if loved_ids:
        stmt = insert(UserTrack).values(
            [{"user_id": user_id, "track_id": track_id, "userloved": True} for track_id in loved_ids]
        )
        await db.execute(
            stmt.on_conflict_do_update(index_elements=["user_id", "track_id"], set_={"userloved": True})
        )


async def delete_scrobbles(db: AsyncSession, user_id: str) -> None:
    """Drop a user's listening history (relinking another Last.fm account)."""
    await db.execute(delete(Scrobble).where(Scrobble.user_id == user_id))
