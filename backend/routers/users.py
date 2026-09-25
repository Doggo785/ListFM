import asyncio
import logging
from datetime import UTC, datetime

from database import get_db
from fastapi import APIRouter, Depends, HTTPException, Query
from models.user import User
from repositories.tracks import CACHE_TTL
from repositories.user_tracks import bulk_store_recent_plays, get_recent_user_tracks
from routers.deps import get_current_active_user, get_current_user_lastfm_username
from schemas import RecentTracksResponse, Track, UserInfo
from services.lastfm import (
    epoch_to_datetime,
    get_loved_tracks,
    get_recent_tracks,
    get_top_artists_tracks,
    get_top_tags,
    get_top_tracks,
    get_user_info,
)
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
    try:
        stored = await get_recent_user_tracks(db, current_user.id, limit)
        if stored and _stored_recents_fresh(stored):
            logger.info("recent-tracks: db (%d rows)", len(stored))
            return RecentTracksResponse(
                tracks=[Track(title=t["title"], artist=t["artist"], album=t["album"]) for t in stored]
            )
        # Live fetch is a single Last.fm call; run it off the loop.
        tracks = await asyncio.to_thread(get_recent_tracks, username, limit)
        await _store_recent_tracks(db, current_user.id, tracks)
        try:
            await db.commit()
        except SQLAlchemyError:
            # The dashboard must never break on a cache persist failure:
            # degrade to live data and log loudly.
            await db.rollback()
            logger.warning("recent-tracks: cache store failed, serving live", exc_info=True)
        return RecentTracksResponse(tracks=[Track(**t) for t in tracks])
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001 -- deliberate boundary: log then 502, never leak upstream internals
        logger.error("Last.fm API error: %s", e)
        raise HTTPException(status_code=502, detail=LASTFM_UNAVAILABLE_DETAIL)


def _stored_recents_fresh(stored: list[dict]) -> bool:
    """Stored recents are servable when the newest play is within the TTL."""
    newest = stored[0].get("played_at")
    return newest is not None and newest >= (
        datetime.now(UTC) - CACHE_TTL
    )


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


@router.get("/top-tags")
def user_top_tags(username: str = Depends(get_current_user_lastfm_username)):
    try:
        return {"tags": get_top_tags(username)}
    except Exception as e:  # noqa: BLE001 -- deliberate boundary: log then 502, never leak upstream internals
        logger.error("Last.fm API error: %s", e)
        raise HTTPException(status_code=502, detail=LASTFM_UNAVAILABLE_DETAIL)


@router.get("/top-tracks")
def user_top_tracks(
    period: str = "3m",
    limit: int = Query(default=50, ge=1, le=200),
    username: str = Depends(get_current_user_lastfm_username),
):
    try:
        return {"tracks": get_top_tracks(username, period, limit)}
    except Exception as e:  # noqa: BLE001 -- deliberate boundary: log then 502, never leak upstream internals
        logger.error("Last.fm API error: %s", e)
        raise HTTPException(status_code=502, detail=LASTFM_UNAVAILABLE_DETAIL)


@router.get("/loved-tracks")
def user_loved_tracks(
    limit: int = Query(default=50, ge=1, le=200),
    username: str = Depends(get_current_user_lastfm_username),
):
    try:
        return {"tracks": get_loved_tracks(username, limit)}
    except Exception as e:  # noqa: BLE001 -- deliberate boundary: log then 502, never leak upstream internals
        logger.error("Last.fm API error: %s", e)
        raise HTTPException(status_code=502, detail=LASTFM_UNAVAILABLE_DETAIL)


@router.get("/source-tracks")
def user_source_tracks(
    source: str = "top_tracks",
    period: str = "3m",
    limit: int = Query(default=50, ge=1, le=200),
    username: str = Depends(get_current_user_lastfm_username),
):
    try:
        match source:
            case "top_tracks":
                tracks = get_top_tracks(username, period, limit)
            case "recent_tracks":
                tracks = get_recent_tracks(username, limit)
            case "loved_tracks":
                tracks = get_loved_tracks(username, limit)
            case "top_artists":
                tracks = get_top_artists_tracks(username, period, limit)
            case _:
                raise HTTPException(status_code=400, detail=f"Unknown source: {source}")
        return {"tracks": tracks}
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001 -- deliberate boundary: log then 502, never leak upstream internals
        logger.error("Last.fm API error: %s", e)
        raise HTTPException(status_code=502, detail=LASTFM_UNAVAILABLE_DETAIL)
