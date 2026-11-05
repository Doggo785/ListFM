import uuid
from datetime import UTC, datetime, timedelta

from filter_types import ListeningMoment
from models.album import Album
from models.artist import Artist
from models.artist_tag import ArtistTag
from models.scrobble import Scrobble
from models.tag import Tag
from models.track import Track
from models.user_track import UserTrack
from repositories.user_tracks import bulk_store_recent_plays, ensure_tracks
from sqlalchemy import (
    Row,
    and_,
    between,
    bindparam,
    delete,
    extract,
    func,
    or_,
    select,
    tuple_,
    update,
)
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


async def store_track_albums(db: AsyncSession, listens: list[tuple[str, str, str | None]]) -> None:
    """Set each track's album from (title, artist, album), newest first. Caller commits.

    A track keeps one album, the one of its latest listen seen, even when it
    was also played from a single: a limit per album needs no more than that.
    """
    # Longer than the column: treat as no album rather than fail the page.
    albums: dict[tuple[str, str], str] = {}
    for title, artist, album in listens:
        if album and len(album) <= Album.title.type.length:
            albums.setdefault((artist, title), album)
    if not albums:
        return
    album_keys = {(album, artist) for (artist, _), album in albums.items()}
    now = datetime.now(UTC)
    await db.execute(
        insert(Album)
        .values(
            [
                {"id": str(uuid.uuid4()), "title": album, "artist": artist, "created_at": now}
                for album, artist in sorted(album_keys)
            ]
        )
        .on_conflict_do_nothing(index_elements=["title", "artist"])
    )
    album_rows = await db.execute(
        select(Album.id, Album.title, Album.artist).where(tuple_(Album.title, Album.artist).in_(album_keys))
    )
    album_ids = {(row.title, row.artist): row.id for row in album_rows}
    by_key = await ensure_tracks(db, list(albums))
    table = Track.__table__
    await db.execute(
        update(table)
        .where(
            table.c.id == bindparam("track_id"),
            table.c.album_id.is_distinct_from(bindparam("new_album_id")),
        )
        .values(album_id=bindparam("new_album_id")),
        # Sorted: two syncs updating shared tracks in the same order cannot deadlock.
        sorted(
            (
                {"track_id": by_key[key].id, "new_album_id": album_ids[(album, key[0])]}
                for key, album in albums.items()
            ),
            key=lambda row: row["track_id"],
        ),
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


async def get_listening_totals(db: AsyncSession, user_id: str) -> dict[str, int]:
    """What the stored history holds for this user, whatever a window would keep."""
    row = (
        await db.execute(
            select(
                func.count().label("listens"),
                func.count(Scrobble.track_id.distinct()).label("tracks"),
                func.count(Track.artist.distinct()).label("artists"),
                func.count(Track.album_id.distinct()).label("albums"),
            )
            .select_from(Scrobble)
            .join(Track, Track.id == Scrobble.track_id)
            .where(Scrobble.user_id == user_id)
        )
    ).one()
    return dict(row._mapping)


async def get_daily_listens(db: AsyncSession, user_id: str, start: datetime, timezone: str) -> dict[datetime, int]:
    """Listens per local day since start."""
    rows = await db.execute(
        select(func.date_trunc("day", func.timezone(timezone, Scrobble.played_at)).label("day"), func.count().label("listens"))
        .where(Scrobble.user_id == user_id, Scrobble.played_at >= start)
        .group_by("day")
    )
    return {row.day: row.listens for row in rows}


async def get_monthly_albums(db: AsyncSession, user_id: str, start: datetime, timezone: str) -> list[Row]:
    """Plays per local month, artist and album since start. A track without an album has a null album id."""
    rows = await db.execute(
        select(
            func.date_trunc("month", func.timezone(timezone, Scrobble.played_at)).label("month"),
            Track.artist,
            Album.id,
            Album.title,
            Album.image_url,
            Album.image_fetched_at,
            func.count().label("plays"),
        )
        .join(Track, Track.id == Scrobble.track_id)
        .outerjoin(Album, Album.id == Track.album_id)
        .where(Scrobble.user_id == user_id, Scrobble.played_at >= start)
        .group_by("month", Track.artist, Album.id)
    )
    return list(rows)


async def get_top_artists(db: AsyncSession, user_id: str, start: datetime | None, limit: int) -> list[Row]:
    """The most played artists since start, or over all listens."""
    query = (
        select(Track.artist, func.count().label("plays"))
        .join(Scrobble, Scrobble.track_id == Track.id)
        .where(Scrobble.user_id == user_id)
        .group_by(Track.artist)
        .order_by(func.count().desc(), Track.artist)
        .limit(limit)
    )
    if start is not None:
        query = query.where(Scrobble.played_at >= start)
    return list(await db.execute(query))


async def get_top_albums(db: AsyncSession, user_id: str, start: datetime | None, limit: int) -> list[Row]:
    """The most played albums since start, or over all listens."""
    query = (
        select(Album.id, Album.title, Album.artist, Album.image_url, Album.image_fetched_at, func.count().label("plays"))
        .join(Track, Track.album_id == Album.id)
        .join(Scrobble, Scrobble.track_id == Track.id)
        .where(Scrobble.user_id == user_id)
        .group_by(Album.id)
        .order_by(func.count().desc(), Album.title)
        .limit(limit)
    )
    if start is not None:
        query = query.where(Scrobble.played_at >= start)
    return list(await db.execute(query))


async def count_listens_since(db: AsyncSession, user_id: str, start: datetime) -> int:
    return await db.scalar(select(func.count()).select_from(Scrobble).where(Scrobble.user_id == user_id, Scrobble.played_at >= start)) or 0


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
            Album.title.label("album"),
            plays.label("plays"),
            func.count().label("all_plays"),
            func.min(Scrobble.played_at).label("first_played"),
            func.max(Scrobble.played_at).filter(in_window).label("last_played"),
            func.coalesce(UserTrack.userloved, False).label("loved"),
        )
        .join(Track, Track.id == Scrobble.track_id)
        .outerjoin(Album, Album.id == Track.album_id)
        .outerjoin(
            UserTrack,
            and_(UserTrack.user_id == Scrobble.user_id, UserTrack.track_id == Scrobble.track_id),
        )
        .where(Scrobble.user_id == user_id)
        .group_by(Track.id, Track.title, Track.artist, Album.title, UserTrack.userloved)
        .having(plays > 0)
    )
    return [
        {
            "title": row.title,
            "artist": row.artist,
            "album": row.album,
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


def _in_moment(local_time, moment: ListeningMoment):
    """SQL test of a listen's local time against a moment."""
    clauses = []
    overnight = False
    if moment.fromHour is not None and moment.toHour is not None:
        hour = extract("hour", local_time)
        overnight = moment.fromHour > moment.toHour
        clauses.append(
            or_(hour >= moment.fromHour, hour < moment.toHour)
            if overnight
            else and_(hour >= moment.fromHour, hour < moment.toHour)
        )
    if moment.fromDay is not None and moment.toDay is not None:
        # Moved back by toHour, a listen after midnight falls on the day the night began.
        day_time = local_time - timedelta(hours=moment.toHour or 0) if overnight else local_time
        day = extract("isodow", day_time)
        clauses.append(
            between(day, moment.fromDay, moment.toDay)
            if moment.fromDay <= moment.toDay
            else or_(day >= moment.fromDay, day <= moment.toDay)
        )
    return and_(*clauses)


async def get_moment_plays(
    db: AsyncSession,
    user_id: str,
    start: datetime | None,
    end: datetime,
    timezone: str,
    moments: list[ListeningMoment],
) -> dict[tuple[str, str], int]:
    """Listens in [start, end) at any of these moments, per (title, artist)."""
    local_time = func.timezone(timezone, Scrobble.played_at)
    in_period = and_(
        Scrobble.user_id == user_id,
        Scrobble.played_at < end,
        or_(*[_in_moment(local_time, moment) for moment in moments]),
    )
    if start is not None:
        in_period = and_(in_period, Scrobble.played_at >= start)
    rows = await db.execute(
        select(Track.title, Track.artist, func.count().label("plays"))
        .join(Scrobble, Scrobble.track_id == Track.id)
        .where(in_period)
        .group_by(Track.title, Track.artist)
    )
    return {(row.title, row.artist): row.plays for row in rows}


async def get_known_tags(db: AsyncSession, user_id: str, limit: int = 500) -> list[dict]:
    """The catalogue's tags among this user's artists, the most widespread first."""
    listened = (
        select(Track.artist)
        .join(Scrobble, Scrobble.track_id == Track.id)
        .where(Scrobble.user_id == user_id)
        .distinct()
    )
    name = func.lower(Tag.name)
    artists = func.count(func.distinct(ArtistTag.artist))
    rows = await db.execute(
        select(name.label("name"), artists.label("artists"))
        .join(ArtistTag, ArtistTag.tag_id == Tag.id)
        .where(ArtistTag.artist.in_(listened))
        .group_by(name)
        .order_by(artists.desc(), name)
        .limit(limit)
    )
    return [{"name": row.name, "artists": row.artists} for row in rows]
