import asyncio
import logging

from database import get_db
from fastapi import APIRouter, Depends, HTTPException, Query
from models.user import User
from repositories.user_tracks import bulk_store_recent_plays, get_recent_user_tracks
from routers.deps import get_current_active_user, get_current_user_lastfm_username
from schemas import RecentTracksResponse, ScrobbleSyncStatus, Track, UserInfo
from services.lastfm import (
    epoch_to_datetime,
    get_recent_tracks,
    get_user_info,
)
from services.progress import store as progress_store
from services.scrobble_sync import is_fresh, progress_key, start_scrobble_sync
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

LASTFM_UNAVAILABLE_DETAIL = "Last.fm service unavailable"

router = APIRouter(prefix="/api", tags=["users"])


@router.get("/info", response_model=UserInfo)
def user_info(username: str = Depends(get_current_user_lastfm_username)):
    try:
        info = get_user_info(username)
        return UserInfo(**info)
    except Exception as e:  # noqa: BLE001 -- deliberate boundary: log then 502, never leak upstream internals
        logger.error("Last.fm API error: %s", e)
        raise HTTPException(status_code=502, detail=LASTFM_UNAVAILABLE_DETAIL)


@router.get("/recent-tracks", response_model=RecentTracksResponse)
async def user_recent_tracks(
    limit: int = Query(default=5, ge=1, le=200),
    username: str = Depends(get_current_user_lastfm_username),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Recents are always fetched live (one Last.fm call); stored plays are
    only the fallback when Last.fm is down."""
    try:
        # Single Last.fm call; run it off the loop.
        tracks = await asyncio.to_thread(get_recent_tracks, username, limit)
    except Exception as e:  # noqa: BLE001 -- deliberate boundary: log, fall back, never leak upstream internals
        logger.error("Last.fm API error: %s", e)
        stored = await get_recent_user_tracks(db, current_user.id, limit)
        if not stored:
            raise HTTPException(status_code=502, detail=LASTFM_UNAVAILABLE_DETAIL)
        logger.info("recent-tracks: Last.fm down, serving %d stored plays", len(stored))
        return RecentTracksResponse(
            tracks=[Track(title=t["title"], artist=t["artist"], album=t["album"]) for t in stored]
        )
    await _store_recent_tracks(db, current_user.id, tracks)
    try:
        await db.commit()
    except SQLAlchemyError:
        # The dashboard must never break on a store failure: serve live data.
        await db.rollback()
        logger.warning("recent-tracks: store failed, serving live", exc_info=True)
    return RecentTracksResponse(tracks=[Track(**t) for t in tracks])


async def _store_recent_tracks(db: AsyncSession, user_id: str, tracks: list[dict]) -> None:
    """Record recent plays in bulk without fabricating user stats or sync state."""
    await bulk_store_recent_plays(
        db,
        user_id,
        [
            (track["title"], track["artist"], epoch_to_datetime(track.get("timestamp")))
            for track in tracks
        ],
    )


def _sync_status(user: User) -> ScrobbleSyncStatus:
    progress = progress_store.read(progress_key(user.id))
    return ScrobbleSyncStatus(
        stage=progress.stage if progress else None,
        done=progress.done if progress else 0,
        total=progress.total if progress else 0,
        error=progress.error if progress else None,
        complete=user.scrobbles_complete_at is not None,
        synced_at=user.scrobbles_synced_at,
    )


@router.get("/scrobbles/sync", response_model=ScrobbleSyncStatus)
async def scrobble_sync_status(current_user: User = Depends(get_current_active_user)):
    """Listening history sync status, for the progress bar and the partial-data banner."""
    return _sync_status(current_user)


@router.post("/scrobbles/sync", response_model=ScrobbleSyncStatus, status_code=202)
async def start_sync(
    username: str = Depends(get_current_user_lastfm_username),
    current_user: User = Depends(get_current_active_user),
):
    """Start a sync, unless one ran in the last minutes or is already running."""
    if not is_fresh(current_user):
        start_scrobble_sync(current_user.id, username)
    return _sync_status(current_user)
