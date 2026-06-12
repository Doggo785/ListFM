from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from schemas import GeneratedPlaylistCreate, GeneratedPlaylistRead
from repositories.users import get_user_by_lastfm_username
from repositories.generated_playlists import (
    get_generated_playlists,
    get_generated_playlist,
    create_generated_playlist,
    delete_generated_playlist,
)

router = APIRouter(prefix="/api", tags=["generated_playlists"])


async def _resolve_user_id(db: AsyncSession, username: str) -> str:
    user = await get_user_by_lastfm_username(db, username)
    if user is None:
        raise HTTPException(status_code=404, detail=f"User '{username}' not found")
    return user.id


@router.get("/{username}/generated-playlists", response_model=list[GeneratedPlaylistRead])
async def list_generated_playlists(username: str, db: AsyncSession = Depends(get_db)):
    user_id = await _resolve_user_id(db, username)
    return await get_generated_playlists(db, user_id)


@router.get("/{username}/generated-playlists/{playlist_id}", response_model=GeneratedPlaylistRead)
async def get_single_generated_playlist(
    username: str, playlist_id: str, db: AsyncSession = Depends(get_db)
):
    user_id = await _resolve_user_id(db, username)
    playlist = await get_generated_playlist(db, playlist_id, user_id)
    if playlist is None:
        raise HTTPException(status_code=404, detail="Generated playlist not found")
    return playlist


@router.post("/{username}/generated-playlists", response_model=GeneratedPlaylistRead, status_code=201)
async def save_generated_playlist(
    username: str, data: GeneratedPlaylistCreate, db: AsyncSession = Depends(get_db)
):
    user_id = await _resolve_user_id(db, username)
    playlist = await create_generated_playlist(db, user_id, username, data)
    await db.commit()
    return playlist


@router.post("/{username}/generated-playlists/auto-save", response_model=GeneratedPlaylistRead, status_code=201)
async def auto_save_generated_playlist(
    username: str, data: GeneratedPlaylistCreate, db: AsyncSession = Depends(get_db)
):
    user_id = await _resolve_user_id(db, username)
    playlist = await create_generated_playlist(db, user_id, username, data)
    await db.commit()
    return playlist


@router.delete("/{username}/generated-playlists/{playlist_id}", status_code=204)
async def delete_single_generated_playlist(
    username: str, playlist_id: str, db: AsyncSession = Depends(get_db)
):
    user_id = await _resolve_user_id(db, username)
    deleted = await delete_generated_playlist(db, playlist_id, user_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Generated playlist not found")
    await db.commit()
