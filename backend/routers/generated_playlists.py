from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from schemas import GeneratedPlaylistCreate, GeneratedPlaylistRead
from models.user import User
from routers.deps import resolve_user_id, get_current_active_user
from repositories.generated_playlists import (
    get_generated_playlists,
    get_generated_playlist,
    create_generated_playlist,
    delete_generated_playlist,
)

router = APIRouter(prefix="/api", tags=["generated_playlists"])


@router.get("/{username}/generated-playlists", response_model=list[GeneratedPlaylistRead])
async def list_generated_playlists(username: str, db: AsyncSession = Depends(get_db)):
    user_id = await resolve_user_id(db, username)
    return await get_generated_playlists(db, user_id)


@router.get("/{username}/generated-playlists/{playlist_id}", response_model=GeneratedPlaylistRead)
async def get_single_generated_playlist(
    username: str, playlist_id: str, db: AsyncSession = Depends(get_db)
):
    user_id = await resolve_user_id(db, username)
    playlist = await get_generated_playlist(db, playlist_id, user_id)
    if playlist is None:
        raise HTTPException(status_code=404, detail="Generated playlist not found")
    return playlist


@router.post("/{username}/generated-playlists", response_model=GeneratedPlaylistRead, status_code=201)
async def save_generated_playlist(
    username: str,
    data: GeneratedPlaylistCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    user_id = await resolve_user_id(db, username)
    if user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    playlist = await create_generated_playlist(db, user_id, username, data)
    try:
        await db.commit()
    except Exception:
        await db.rollback()
        raise HTTPException(status_code=500, detail="Failed to save playlist")
    return playlist


@router.delete("/{username}/generated-playlists/{playlist_id}", status_code=204)
async def delete_single_generated_playlist(
    username: str,
    playlist_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    user_id = await resolve_user_id(db, username)
    if user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    deleted = await delete_generated_playlist(db, playlist_id, user_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Generated playlist not found")
    try:
        await db.commit()
    except Exception:
        await db.rollback()
        raise HTTPException(status_code=500, detail="Failed to delete playlist")
