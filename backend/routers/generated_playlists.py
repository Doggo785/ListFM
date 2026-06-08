from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from schemas import GeneratedPlaylistCreate, GeneratedPlaylistRead
from repositories.generated_playlists import (
    get_generated_playlists,
    get_generated_playlist,
    create_generated_playlist,
    delete_generated_playlist,
)

router = APIRouter(prefix="/api", tags=["generated_playlists"])


@router.get("/{username}/generated-playlists", response_model=list[GeneratedPlaylistRead])
async def list_generated_playlists(username: str, db: AsyncSession = Depends(get_db)):
    """List all generated playlists for a user."""
    return await get_generated_playlists(db, username)


@router.get("/{username}/generated-playlists/{playlist_id}", response_model=GeneratedPlaylistRead)
async def get_single_generated_playlist(
    username: str, playlist_id: str, db: AsyncSession = Depends(get_db)
):
    """Get a single generated playlist by ID."""
    playlist = await get_generated_playlist(db, playlist_id, username)
    if playlist is None:
        raise HTTPException(status_code=404, detail="Generated playlist not found")
    return playlist


@router.post("/{username}/generated-playlists", response_model=GeneratedPlaylistRead, status_code=201)
async def save_generated_playlist(
    username: str, data: GeneratedPlaylistCreate, db: AsyncSession = Depends(get_db)
):
    """Manually save a generated playlist to library."""
    return await create_generated_playlist(db, username, data)


@router.post("/{username}/generated-playlists/auto-save", response_model=GeneratedPlaylistRead, status_code=201)
async def auto_save_generated_playlist(
    username: str, data: GeneratedPlaylistCreate, db: AsyncSession = Depends(get_db)
):
    """Auto-save a generated playlist (called automatically after preview)."""
    return await create_generated_playlist(db, username, data)


@router.delete("/{username}/generated-playlists/{playlist_id}", status_code=204)
async def delete_single_generated_playlist(
    username: str, playlist_id: str, db: AsyncSession = Depends(get_db)
):
    """Delete a generated playlist."""
    deleted = await delete_generated_playlist(db, playlist_id, username)
    if not deleted:
        raise HTTPException(status_code=404, detail="Generated playlist not found")
