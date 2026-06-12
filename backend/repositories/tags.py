import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from models.tag import Tag
from models.track_tag import TrackTag
from models.album_tag import AlbumTag


async def get_tag_by_name(db: AsyncSession, name: str) -> Tag | None:
    result = await db.execute(select(Tag).where(Tag.name == name))
    return result.scalar_one_or_none()


async def get_or_create_tag(db: AsyncSession, name: str) -> Tag:
    """Get or create a tag atomically using INSERT ON CONFLICT.

    Caller is responsible for committing the session.
    """
    stmt = (
        insert(Tag)
        .values(id=str(uuid.uuid4()), name=name, created_at=datetime.now(timezone.utc))
        .on_conflict_do_update(
            index_elements=["name"],
            set_={"name": name},  # no-op update to return existing row
        )
        .returning(Tag)
    )
    result = await db.execute(stmt)
    await db.flush()
    return result.scalar_one()


async def upsert_track_tag(
    db: AsyncSession,
    track_id: str,
    tag_name: str,
    weight: int,
) -> TrackTag:
    """Upsert a track-tag association.

    Caller is responsible for committing the session.
    """
    tag = await get_or_create_tag(db, tag_name)

    stmt = (
        insert(TrackTag)
        .values(
            track_id=track_id,
            tag_id=tag.id,
            weight=weight,
            fetched_at=datetime.now(timezone.utc),
        )
        .on_conflict_do_update(
            index_elements=["track_id", "tag_id"],
            set_={
                "weight": weight,
                "fetched_at": datetime.now(timezone.utc),
            },
        )
        .returning(TrackTag)
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
            fetched_at=datetime.now(timezone.utc),
        )
        .on_conflict_do_update(
            index_elements=["album_id", "tag_id"],
            set_={
                "weight": weight,
                "fetched_at": datetime.now(timezone.utc),
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
