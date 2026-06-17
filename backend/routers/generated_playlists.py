from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from schemas import GeneratedPlaylistCreate, GeneratedPlaylistRead
from models.user import User
from routers.deps import get_current_user_lastfm_username, get_current_active_user
from repositories.generated_playlists import (
    get_generated_playlists,
    get_generated_playlist,
    create_generated_playlist,
    delete_generated_playlist,
)

router = APIRouter(prefix="/api", tags=["generated_playlists"])


@router.get("/generated-playlists", response_model=list[GeneratedPlaylistRead])
async def list_generated_playlists(
    username: str = Depends(get_current_user_lastfm_username),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    return await get_generated_playlists(db, current_user.id)


@router.get("/generated-playlists/{playlist_id}", response_model=GeneratedPlaylistRead)
async def get_single_generated_playlist(
    playlist_id: str,
    username: str = Depends(get_current_user_lastfm_username),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    playlist = await get_generated_playlist(db, playlist_id, current_user.id)
    if playlist is None:
        raise HTTPException(status_code=404, detail="Generated playlist not found")
    return playlist


@router.post("/generated-playlists", response_model=GeneratedPlaylistRead, status_code=201)
async def save_generated_playlist(
    data: GeneratedPlaylistCreate,
    username: str = Depends(get_current_user_lastfm_username),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    playlist = await create_generated_playlist(db, current_user.id, username, data)
    try:
        await db.commit()
    except Exception:
        await db.rollback()
        raise HTTPException(status_code=500, detail="Failed to save playlist")
    return playlist


@router.delete("/generated-playlists/{playlist_id}", status_code=204)
async def delete_single_generated_playlist(
    playlist_id: str,
    username: str = Depends(get_current_user_lastfm_username),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    deleted = await delete_generated_playlist(db, playlist_id, current_user.id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Generated playlist not found")
    try:
        await db.commit()
    except Exception:
        await db.rollback()
        raise HTTPException(status_code=500, detail="Failed to delete playlist")
