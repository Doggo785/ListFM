import uuid
from datetime import datetime, timezone
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.generated_playlist import GeneratedPlaylist
from models.playlist_track import PlaylistTrack
from schemas import GeneratedPlaylistCreate
from repositories.tracks import get_or_create_track


async def get_generated_playlists(db: AsyncSession, user_id: str) -> list[GeneratedPlaylist]:
    """Get all generated playlists for a user, newest first."""
    result = await db.execute(
        select(GeneratedPlaylist)
        .where(
            GeneratedPlaylist.user_id == user_id,
            GeneratedPlaylist.deleted_at.is_(None),
        )
        .order_by(GeneratedPlaylist.generated_at.desc())
    )
    return list(result.scalars().all())


async def get_generated_playlist(db: AsyncSession, playlist_id: str, user_id: str) -> GeneratedPlaylist | None:
    """Get a single generated playlist by ID, scoped to user."""
    result = await db.execute(
        select(GeneratedPlaylist).where(
            GeneratedPlaylist.id == playlist_id,
            GeneratedPlaylist.user_id == user_id,
            GeneratedPlaylist.deleted_at.is_(None),
        )
    )
    return result.scalar_one_or_none()


async def create_generated_playlist(
    db: AsyncSession, user_id: str, lastfm_username: str, data: GeneratedPlaylistCreate
) -> GeneratedPlaylist:
    """Create a new generated playlist record."""
    now = datetime.now(timezone.utc)
    playlist = GeneratedPlaylist(
        id=str(uuid.uuid4()),
        user_id=user_id,
        automation_id=data.automation_id,
        lastfm_username=lastfm_username,
        name=data.name,
        description=data.description,
        track_count=data.track_count,
        filter_groups=data.filter_groups,
        generated_at=now,
    )
    db.add(playlist)
    
    for i, track_data in enumerate(data.tracks):
        track = await get_or_create_track(
            db, title=track_data.title, artist=track_data.artist
        )
        playlist_track = PlaylistTrack(
            playlist_id=playlist.id,
            track_id=track.id,
            position=i,
        )
        db.add(playlist_track)
    
    await db.commit()
    await db.refresh(playlist)
    return playlist


async def delete_generated_playlist(db: AsyncSession, playlist_id: str, user_id: str) -> bool:
    """Soft delete a generated playlist. Returns True if deleted, False if not found."""
    playlist = await get_generated_playlist(db, playlist_id, user_id)
    if playlist is None:
        return False
    playlist.deleted_at = datetime.now(timezone.utc)
    await db.commit()
    return True
