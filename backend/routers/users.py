import logging
from datetime import UTC, datetime

from database import get_db
from fastapi import APIRouter, Depends, HTTPException
from models.user import User
from repositories.scrobbles import get_known_tags, get_listening_totals
from routers.deps import get_current_active_user, get_current_user_lastfm_username
from schemas import (
    KnownTag,
    ListeningStory,
    ListeningTotals,
    RunInFlight,
    ScrobbleSyncStatus,
    UserInfo,
)
from services.activity_log import log_activity
from services.album_covers import start_album_covers
from services.automation_runner import next_run_at, runs_in_flight
from services.lastfm import get_user_info
from services.listening_story import build_story
from services.progress import store as progress_store
from services.scrobble_sync import is_fresh, progress_key, start_scrobble_sync
from services.tag_catalogue import tags_progress_key
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
        log_activity("lastfm", username, f"échec : {type(e).__name__}")
        raise HTTPException(status_code=502, detail=LASTFM_UNAVAILABLE_DETAIL)


async def _sync_status(db: AsyncSession, user: User) -> ScrobbleSyncStatus:
    progress = progress_store.read(progress_key(user.id))
    tags = progress_store.read(tags_progress_key(user.id))
    tags_running = tags is not None and tags.stage == "tags"
    return ScrobbleSyncStatus(
        stage=progress.stage if progress else None,
        done=progress.done if progress else 0,
        total=progress.total if progress else 0,
        error=progress.error if progress else None,
        complete=user.scrobbles_complete_at is not None,
        synced_at=user.scrobbles_synced_at,
        eta_seconds=progress.eta_seconds() if progress and progress.stage == "sync" else None,
        since=_instant(progress.since if progress else None),
        reached=_instant(progress.reached if progress else None),
        tags_done=tags.done if tags and tags_running else 0,
        tags_total=tags.total if tags and tags_running else 0,
        tags_eta_seconds=tags.eta_seconds() if tags and tags_running else None,
        runs=[
            RunInFlight(automation_id=automation_id, name=name, stage=stage, done=done, total=total)
            for automation_id, name, stage, done, total in runs_in_flight(user.id)
        ],
        next_run_at=await next_run_at(db, user.id, user.timezone or "UTC"),
    )


def _instant(uts: float | None) -> datetime | None:
    return datetime.fromtimestamp(uts, tz=UTC) if uts is not None else None


@router.get("/scrobbles/sync", response_model=ScrobbleSyncStatus)
async def scrobble_sync_status(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """The background work: history sync, tag pass and runs, for the top line and the ribbon."""
    return await _sync_status(db, current_user)


@router.get("/scrobbles/totals", response_model=ListeningTotals)
async def listening_totals(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    return ListeningTotals(
        **await get_listening_totals(db, current_user.id),
        complete=current_user.scrobbles_complete_at is not None,
    )


@router.get("/scrobbles/story", response_model=ListeningStory)
async def listening_story(
    username: str = Depends(get_current_user_lastfm_username),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """The Dashboard's poster and year, from stored listens only; missing album art is looked up behind."""
    story, awaiting_art = await build_story(db, current_user.id, current_user.timezone or "UTC")
    # During a first import the albums shown change at every read: their art waits for the final ones.
    if awaiting_art and current_user.scrobbles_complete_at is not None:
        start_album_covers(current_user.id, username, awaiting_art)
    return story


@router.post("/scrobbles/sync", response_model=ScrobbleSyncStatus, status_code=202)
async def start_sync(
    username: str = Depends(get_current_user_lastfm_username),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Start a sync, unless one ran in the last minutes or is already running."""
    if not is_fresh(current_user):
        start_scrobble_sync(current_user.id, username)
    return await _sync_status(db, current_user)


@router.get("/tags", response_model=list[KnownTag])
async def known_tags(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Tags to suggest in a filter: those the catalogue knows for this user's artists."""
    return await get_known_tags(db, current_user.id)
