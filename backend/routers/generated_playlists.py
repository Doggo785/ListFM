from database import get_db
from fastapi import APIRouter, Depends, HTTPException
from models.user import User
from repositories.generated_playlists import (
    delete_generated_playlist,
    get_generated_playlists,
    get_playlist_tracks,
)
from routers.deps import get_current_active_user, get_current_user_lastfm_username
from schemas import GeneratedPlaylistRead, PlaylistTrackItem
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/api", tags=["generated_playlists"])


@router.get("/generated-playlists", response_model=list[GeneratedPlaylistRead])
async def list_generated_playlists(
    username: str = Depends(get_current_user_lastfm_username),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    return await get_generated_playlists(db, current_user.id)


@router.get(
    "/generated-playlists/{playlist_id}/tracks",
    response_model=list[PlaylistTrackItem],
)
async def get_single_generated_playlist_tracks(
    playlist_id: str,
    username: str = Depends(get_current_user_lastfm_username),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    tracks = await get_playlist_tracks(db, playlist_id, current_user.id)
    if tracks is None:
        raise HTTPException(status_code=404, detail="Generated playlist not found")
    return tracks


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
    except SQLAlchemyError:
        await db.rollback()
        raise HTTPException(status_code=500, detail="Failed to delete playlist")
