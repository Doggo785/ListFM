import uuid
from datetime import datetime, timezone
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.generated_playlist import GeneratedPlaylist
from schemas import GeneratedPlaylistCreate


async def get_generated_playlists(db: AsyncSession, username: str) -> list[GeneratedPlaylist]:
    """Get all generated playlists for a user, newest first."""
    result = await db.execute(
        select(GeneratedPlaylist)
        .where(GeneratedPlaylist.username == username)
        .order_by(GeneratedPlaylist.generated_at.desc())
    )
    return list(result.scalars().all())


async def get_generated_playlist(db: AsyncSession, playlist_id: str, username: str) -> GeneratedPlaylist | None:
    """Get a single generated playlist by ID, scoped to user."""
    result = await db.execute(
        select(GeneratedPlaylist).where(
            GeneratedPlaylist.id == playlist_id,
            GeneratedPlaylist.username == username,
        )
    )
    return result.scalar_one_or_none()


async def create_generated_playlist(
    db: AsyncSession, username: str, data: GeneratedPlaylistCreate
) -> GeneratedPlaylist:
    """Create a new generated playlist record."""
    playlist = GeneratedPlaylist(
        id=str(uuid.uuid4()),
        username=username,
        automation_id=data.automation_id,
        name=data.name,
        source_type=data.source_type,
        source_period=data.source_period,
        tracks=data.tracks,
        track_count=data.track_count,
        filter_groups=data.filter_groups,
        generated_at=datetime.now(timezone.utc),
    )
    db.add(playlist)
    await db.commit()
    await db.refresh(playlist)
    return playlist


async def delete_generated_playlist(db: AsyncSession, playlist_id: str, username: str) -> bool:
    """Delete a generated playlist. Returns True if deleted, False if not found."""
    playlist = await get_generated_playlist(db, playlist_id, username)
    if playlist is None:
        return False
    await db.delete(playlist)
    await db.commit()
    return True
