from datetime import datetime

from models.artist import Artist
from models.artist_tag import ArtistTag
from models.scrobble import Scrobble
from models.tag import Tag
from models.track import Track
from models.user_track import UserTrack
from repositories.user_tracks import bulk_store_recent_plays, ensure_tracks
from sqlalchemy import and_, delete, func, select, update
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


async def get_window_tracks(
    db: AsyncSession, user_id: str, start: datetime | None, end: datetime
) -> list[dict]:
    """One row per track played in [start, end), with the user's local stats.

    ``playcount`` and ``timestamp`` (last play) are read inside the window;
    ``userplaycount`` and ``first_played`` cover every stored listen.
    """
    in_window = Scrobble.played_at < end
    if start is not None:
        in_window = and_(in_window, Scrobble.played_at >= start)
    plays = func.count().filter(in_window)
    rows = await db.execute(
        select(
            Track.title,
            Track.artist,
            plays.label("plays"),
            func.count().label("all_plays"),
            func.min(Scrobble.played_at).label("first_played"),
            func.max(Scrobble.played_at).filter(in_window).label("last_played"),
            func.coalesce(UserTrack.userloved, False).label("loved"),
        )
        .join(Track, Track.id == Scrobble.track_id)
        .outerjoin(
            UserTrack,
            and_(UserTrack.user_id == Scrobble.user_id, UserTrack.track_id == Scrobble.track_id),
        )
        .where(Scrobble.user_id == user_id)
        .group_by(Track.id, Track.title, Track.artist, UserTrack.userloved)
        .having(plays > 0)
    )
    return [
        {
            "title": row.title,
            "artist": row.artist,
            "playcount": row.plays,
            "userplaycount": row.all_plays,
            "userloved": row.loved,
            "timestamp": int(row.last_played.timestamp()),
            "first_played": int(row.first_played.timestamp()),
        }
        for row in rows
    ]


async def get_known_artist_tags(db: AsyncSession, user_id: str) -> dict[str, list[dict]]:
    """Stored tags of the artists this user listened to (ADR 0003).

    An artist with no entry was never looked up; an empty list means Last.fm
    has no tags for them.
    """
    listened = (
        select(Track.artist)
        .join(Scrobble, Scrobble.track_id == Track.id)
        .where(Scrobble.user_id == user_id)
        .distinct()
    )
    rows = await db.execute(
        select(Artist.name, Tag.name, ArtistTag.weight)
        .outerjoin(ArtistTag, ArtistTag.artist == Artist.name)
        .outerjoin(Tag, Tag.id == ArtistTag.tag_id)
        .where(Artist.name.in_(listened))
    )
    known: dict[str, list[dict]] = {}
    for artist, tag, weight in rows.all():
        tags = known.setdefault(artist, [])
        if tag is not None:
            tags.append({"name": tag, "count": weight})
    return known


async def get_artist_ranks(
    db: AsyncSession, user_id: str, start: datetime | None, end: datetime
) -> dict[str, int]:
    """Artists by listens in [start, end): 1 is the most listened, ties by name."""
    in_period = and_(Scrobble.user_id == user_id, Scrobble.played_at < end)
    if start is not None:
        in_period = and_(in_period, Scrobble.played_at >= start)
    rows = await db.execute(
        select(Track.artist)
        .join(Scrobble, Scrobble.track_id == Track.id)
        .where(in_period)
        .group_by(Track.artist)
        .order_by(func.count().desc(), Track.artist)
    )
    return {artist: rank for rank, artist in enumerate(rows.scalars(), start=1)}
