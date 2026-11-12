import uuid
from datetime import UTC, datetime

from models.album_tag import AlbumTag
from models.artist import Artist
from models.artist_tag import ArtistTag
from models.scrobble import Scrobble
from models.tag import Tag
from models.track import Track
from models.track_tag import TrackTag
from sqlalchemy import delete, func, or_, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession


async def get_tag_by_name(db: AsyncSession, name: str) -> Tag | None:
    result = await db.execute(select(Tag).where(Tag.name == name))
    return result.scalar_one_or_none()


async def get_or_create_tag(db: AsyncSession, name: str) -> Tag:
    """Get or create a tag atomically using INSERT ON CONFLICT.

    Caller is responsible for committing the session.
    """
    stmt = (
        insert(Tag)
        .values(id=str(uuid.uuid4()), name=name, created_at=datetime.now(UTC))
        .on_conflict_do_update(
            index_elements=["name"],
            set_={"name": name},  # no-op update to return existing row
        )
        .returning(Tag)
    )
    result = await db.execute(stmt)
    await db.flush()
    return result.scalar_one()


async def upsert_album_tag(
    db: AsyncSession,
    album_id: str,
    tag_name: str,
    weight: int,
) -> AlbumTag:
    """Upsert an album-tag association.

    Caller is responsible for committing the session.
    """
    tag = await get_or_create_tag(db, tag_name)

    stmt = (
        insert(AlbumTag)
        .values(
            album_id=album_id,
            tag_id=tag.id,
            weight=weight,
            fetched_at=datetime.now(UTC),
        )
        .on_conflict_do_update(
            index_elements=["album_id", "tag_id"],
            set_={
                "weight": weight,
                "fetched_at": datetime.now(UTC),
            },
        )
        .returning(AlbumTag)
    )
    result = await db.execute(stmt)
    await db.flush()
    return result.scalar_one()


async def get_track_tags(db: AsyncSession, track_id: str) -> list[dict]:
    """Get all tags for a track with normalized names."""
    result = await db.execute(
        select(TrackTag, Tag.name)
        .join(Tag)
        .where(TrackTag.track_id == track_id)
    )
    return [{"name": name, "count": tt.weight} for tt, name in result.all()]


async def get_album_tags(db: AsyncSession, album_id: str) -> list[dict]:
    """Get all tags for an album with normalized names."""
    result = await db.execute(
        select(AlbumTag, Tag.name)
        .join(Tag)
        .where(AlbumTag.album_id == album_id)
    )
    return [{"name": name, "count": at.weight} for at, name in result.all()]


async def get_artist_tags(db: AsyncSession, artist: str) -> list[dict]:
    """Get all tags for an artist with normalized names."""
    result = await db.execute(
        select(ArtistTag, Tag.name)
        .join(Tag)
        .where(ArtistTag.artist == artist)
    )
    return [{"name": name, "count": at.weight} for at, name in result.all()]


async def upsert_artist_tag(
    db: AsyncSession,
    artist: str,
    tag_name: str,
    weight: int,
) -> ArtistTag:
    """Upsert an artist-tag association.

    Caller is responsible for committing the session.
    """
    tag = await get_or_create_tag(db, tag_name)

    stmt = (
        insert(ArtistTag)
        .values(
            artist=artist,
            tag_id=tag.id,
            weight=weight,
            fetched_at=datetime.now(UTC),
        )
        .on_conflict_do_update(
            index_elements=["artist", "tag_id"],
            set_={
                "weight": weight,
                "fetched_at": datetime.now(UTC),
            },
        )
        .returning(ArtistTag)
    )
    result = await db.execute(stmt)
    await db.flush()
    return result.scalar_one()




async def mark_artist_tags_fetched(db: AsyncSession, artists: set[str]) -> None:
    """Stamp these artists' tags as freshly fetched. Caller commits."""
    if not artists:
        return
    now = datetime.now(UTC)
    stmt = insert(Artist).values([{"name": a, "tags_fetched_at": now} for a in artists])
    await db.execute(
        stmt.on_conflict_do_update(
            index_elements=["name"], set_={"tags_fetched_at": stmt.excluded.tags_fetched_at}
        )
    )


async def replace_artist_tags(db: AsyncSession, artist: str, tags: list[dict]) -> None:
    """Store what Last.fm says about this artist now, tags it dropped included. Caller commits."""
    await db.execute(delete(ArtistTag).where(ArtistTag.artist == artist))
    for tag in tags:
        await upsert_artist_tag(db, artist, tag["name"], tag["count"])
    await mark_artist_tags_fetched(db, {artist})


async def get_artists_to_tag(db: AsyncSession, user_id: str, stale_before: datetime) -> list[tuple[str, bool]]:
    """This user's artists with unknown or expired tags, most listened first, each with True when unknown."""
    # Listens counted per track first: the primary key puts played_at before track_id, so joining
    # scrobbles track by track rereads all of the user's listens each time (minutes on a big history).
    plays = (
        select(Scrobble.track_id, func.count().label("plays"))
        .where(Scrobble.user_id == user_id)
        .group_by(Scrobble.track_id)
        .subquery()
    )
    rows = await db.execute(
        select(Track.artist, Artist.name.is_(None))
        .join(plays, plays.c.track_id == Track.id)
        .outerjoin(Artist, Artist.name == Track.artist)
        .where(or_(Artist.name.is_(None), Artist.tags_fetched_at < stale_before))
        .group_by(Track.artist, Artist.name)
        .order_by(func.sum(plays.c.plays).desc(), Track.artist)
    )
    return [(artist, unknown) for artist, unknown in rows.all()]


async def artist_tags_fetched_since(db: AsyncSession, artist: str, since: datetime) -> bool:
    fetched_at = await db.scalar(select(Artist.tags_fetched_at).where(Artist.name == artist))
    return fetched_at is not None and fetched_at >= since
