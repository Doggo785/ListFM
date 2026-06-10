import uuid
from datetime import datetime, timezone
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.tag import Tag
from models.track_tag import TrackTag
from models.album_tag import AlbumTag


async def get_tag_by_name(db: AsyncSession, name: str) -> Tag | None:
    result = await db.execute(select(Tag).where(Tag.name == name))
    return result.scalar_one_or_none()


async def get_or_create_tag(db: AsyncSession, name: str) -> Tag:
    existing = await get_tag_by_name(db, name)
    if existing:
        return existing
    
    tag = Tag(
        id=str(uuid.uuid4()),
        name=name,
        created_at=datetime.now(timezone.utc),
    )
    db.add(tag)
    await db.commit()
    await db.refresh(tag)
    return tag


async def upsert_track_tag(
    db: AsyncSession,
    track_id: str,
    tag_name: str,
    weight: int,
) -> TrackTag:
    tag = await get_or_create_tag(db, tag_name)
    
    result = await db.execute(
        select(TrackTag).where(TrackTag.track_id == track_id, TrackTag.tag_id == tag.id)
    )
    existing = result.scalar_one_or_none()
    
    if existing:
        existing.weight = weight
        existing.fetched_at = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(existing)
        return existing
    
    track_tag = TrackTag(
        track_id=track_id,
        tag_id=tag.id,
        weight=weight,
        fetched_at=datetime.now(timezone.utc),
    )
    db.add(track_tag)
    await db.commit()
    await db.refresh(track_tag)
    return track_tag


async def upsert_album_tag(
    db: AsyncSession,
    album_id: str,
    tag_name: str,
    weight: int,
) -> AlbumTag:
    tag = await get_or_create_tag(db, tag_name)
    
    result = await db.execute(
        select(AlbumTag).where(AlbumTag.album_id == album_id, AlbumTag.tag_id == tag.id)
    )
    existing = result.scalar_one_or_none()
    
    if existing:
        existing.weight = weight
        existing.fetched_at = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(existing)
        return existing
    
    album_tag = AlbumTag(
        album_id=album_id,
        tag_id=tag.id,
        weight=weight,
        fetched_at=datetime.now(timezone.utc),
    )
    db.add(album_tag)
    await db.commit()
    await db.refresh(album_tag)
    return album_tag


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
