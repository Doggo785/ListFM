import uuid
from datetime import UTC, datetime, timedelta

from models.album import Album
from models.album_tag import AlbumTag
from models.artist import Artist
from models.artist_tag import ArtistTag
from models.tag import Tag
from models.track_tag import TrackTag
from sqlalchemy import select
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


async def get_fresh_tag_caches(
    db: AsyncSession, artists: set[str], ttl: timedelta
) -> dict[str, dict[str, list[dict]]]:
    """Known tags of these artists and their albums, fetched within ``ttl``.

    Shaped like enrich_tracks' tag_caches: lowercased "artist" and
    "artist|album" keys. Empty lists are real answers (fetched, no tags).
    """
    caches: dict[str, dict[str, list[dict]]] = {"artist": {}, "album": {}}
    if not artists:
        return caches
    since = datetime.now(UTC) - ttl
    fresh_artists = (
        await db.execute(
            select(Artist.name).where(
                Artist.name.in_(artists), Artist.tags_fetched_at >= since
            )
        )
    ).scalars().all()
    for name in fresh_artists:
        caches["artist"][name.strip().lower()] = []
    if fresh_artists:
        rows = await db.execute(
            select(ArtistTag.artist, Tag.name, ArtistTag.weight)
            .join(Tag, Tag.id == ArtistTag.tag_id)
            .where(ArtistTag.artist.in_(fresh_artists))
        )
        for artist, name, weight in rows.all():
            caches["artist"][artist.strip().lower()].append({"name": name, "count": weight})

    albums = (
        await db.execute(
            select(Album).where(Album.artist.in_(artists), Album.tags_fetched_at >= since)
        )
    ).scalars().all()
    album_keys = {
        a.id: f"{a.artist.strip().lower()}|{a.title.strip().lower()}" for a in albums
    }
    for key in album_keys.values():
        caches["album"][key] = []
    if album_keys:
        rows = await db.execute(
            select(AlbumTag.album_id, Tag.name, AlbumTag.weight)
            .join(Tag, Tag.id == AlbumTag.tag_id)
            .where(AlbumTag.album_id.in_(album_keys))
        )
        for album_id, name, weight in rows.all():
            caches["album"][album_keys[album_id]].append({"name": name, "count": weight})
    return caches


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
