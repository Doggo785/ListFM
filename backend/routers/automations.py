import logging
from datetime import UTC, datetime

from database import get_db
from fastapi import APIRouter, Depends, HTTPException
from models.automation import Automation
from models.user import User
from repositories.automation_history import get_automation_history
from repositories.automations import (
    create_automation,
    delete_automation,
    get_automations,
    update_automation,
)
from routers.deps import (
    get_current_active_user,
    get_current_user_lastfm_username,
    get_owned_automation,
)
from schemas import (
    LASTFM_USERNAME_REGEX,
    AutomationCreate,
    AutomationHistoryRead,
    AutomationRead,
    AutomationUpdate,
    PreviewRequest,
    ProgressRead,
    RunRequest,
)
from services.automation_runner import (
    UnsupportedSourceTypeError,
    run_automation,
    run_automation_pipeline_cached,
)
from services.progress import PipelineCancelled, store as progress_store
from sqlalchemy import func, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/api", tags=["automations"])

logger = logging.getLogger(__name__)


@router.post("/automations/preview")
async def preview_automation(
    body: PreviewRequest,
    username: str = Depends(get_current_user_lastfm_username),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    if not LASTFM_USERNAME_REGEX.match(username):
        raise HTTPException(status_code=422, detail="Invalid Last.fm username")
    automation = body.automation
    progress_key = f"preview:{body.progress_token}" if body.progress_token else None
    if progress_key is not None:
        progress_store.start(progress_key)

    # Cache-first pipeline: repeated previews of the same tracks hit the DB
    # instead of Last.fm. Cache writes commit below (a broken cache layer
    # fails the preview loudly instead of degrading silently).
    try:
        result = await run_automation_pipeline_cached(
            db,
            user_id=current_user.id,
            username=username,
            source_type=automation.source.type,
            period=automation.source.period,
            filter_groups=automation.filter_groups,
            max_tracks=automation.output.maxSize,
            progress_key=progress_key,
        )
    except PipelineCancelled:
        if progress_key is not None:
            progress_store.finish(progress_key)
        logger.info("preview ticket %s cancelled by user", body.progress_token)
        return {
            "tracks": [],
            "total": 0,
            "before_filter": 0,
            "source_tracks": [],
            "cache_hits": 0,
            "cache_misses": 0,
            "lastfm_calls": 0,
            "cancelled": True,
        }
    except UnsupportedSourceTypeError:
        raise HTTPException(status_code=422, detail="Unsupported source type")
    except HTTPException:
        raise
    except Exception:  # noqa: BLE001 -- any upstream failure becomes a clean 502
        raise HTTPException(status_code=502, detail="Unable to fetch tracks from Last.fm")

    try:
        await db.commit()
    except SQLAlchemyError:
        await db.rollback()
        raise HTTPException(status_code=500, detail="Failed to save preview cache")

    if progress_key is not None:
        progress_store.finish(progress_key)
    result["cancelled"] = False
    return result


@router.get("/automations/preview-progress/{token}", response_model=ProgressRead)
async def preview_progress(
    token: str,
    current_user: User = Depends(get_current_active_user),
):
    """Live progress snapshot for an in-flight preview ticket."""
    progress = progress_store.read(f"preview:{token}")
    if progress is None:
        raise HTTPException(status_code=404, detail="Unknown or expired progress ticket")
    return ProgressRead(
        stage=progress.stage, done=progress.done, total=progress.total, error=progress.error
    )


@router.delete("/automations/preview-progress/{token}", status_code=204)
async def cancel_preview(
    token: str,
    current_user: User = Depends(get_current_active_user),
):
    """Flag a preview ticket cancelled; the pipeline stops between tracks."""
    if not progress_store.cancel(f"preview:{token}"):
        raise HTTPException(status_code=404, detail="Unknown or expired progress ticket")
    logger.info("preview ticket %s flagged cancelled", token)


@router.get(
    "/automations/{automation_id}/run-progress", response_model=ProgressRead
)
async def run_progress(
    automation: Automation = Depends(get_owned_automation),
    db: AsyncSession = Depends(get_db),
    token: str | None = None,
):
    """Live progress snapshot for the automation's in-flight run.

    With a client ticket (?token=), only the ticket is read: a missing
    ticket is 404 (the UI treats it as "not created yet" for a grace
    period). Without a ticket, falls back to the latest history row once
    the live ticket is gone (finished runs, server restart), so polling
    always terminates.
    """
    if token:
        progress = progress_store.read(f"run:{token}")
        if progress is None:
            raise HTTPException(status_code=404, detail="Unknown or expired progress ticket")
        return ProgressRead(
            stage=progress.stage,
            done=progress.done,
            total=progress.total,
            error=progress.error,
        )
    progress = progress_store.read(f"run:{automation.id}")
    if progress is not None:
        return ProgressRead(
            stage=progress.stage,
            done=progress.done,
            total=progress.total,
            error=progress.error,
        )
    rows = await get_automation_history(db, automation.id)
    if not rows:
        raise HTTPException(status_code=404, detail="No runs yet")
    latest = rows[0]
    if latest.status == "completed":
        done = latest.tracks_after_filter or 0
        return ProgressRead(stage="done", done=done, total=done)
    if latest.status == "failed":
        return ProgressRead(stage="error", done=0, total=0, error=latest.error_message)
    return ProgressRead(stage="running", done=0, total=0)


@router.get("/automations", response_model=list[AutomationRead])
async def list_automations(
    username: str = Depends(get_current_user_lastfm_username),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    return await get_automations(db, current_user.id)


@router.get("/automations/{automation_id}", response_model=AutomationRead)
async def get_single_automation(
    automation: Automation = Depends(get_owned_automation),
):
    return automation


@router.get(
    "/automations/{automation_id}/history",
    response_model=list[AutomationHistoryRead],
)
async def get_automation_history_entries(
    automation: Automation = Depends(get_owned_automation),
    db: AsyncSession = Depends(get_db),
):
    return await get_automation_history(db, automation.id)


@router.post(
    "/automations/{automation_id}/run", response_model=AutomationHistoryRead
)
async def run_automation_now(
    automation: Automation = Depends(get_owned_automation),
    db: AsyncSession = Depends(get_db),
    body: RunRequest | None = None,
):
    """Trigger one manual run now (same pipeline as the scheduled sweep).

    A manual trigger starts a fresh chain (scheduled_for = now, attempt = 1):
    it never rewrites another chain's season label, and it supersedes any
    pending auto-retry of an older chain (only the latest row retries).

    Single-flight per automation via a transaction-scoped advisory lock
    shared with the sweep: a second trigger while one runs gets an instant
    409 instead of a duplicate run (refreshing the page resets only the
    client-side guard).
    The lock releases on commit/rollback/disconnect, so a crashed run can
    never wedge the automation.

    With body.progress_token, progress reports to a client ticket
    (GET run-progress?token=); otherwise to the legacy run:{id} ticket.
    """
    locked = (
        await db.execute(
            select(func.pg_try_advisory_xact_lock(func.hashtextextended(automation.id, 0)))
        )
    ).scalar()
    if not locked:
        raise HTTPException(status_code=409, detail="Automation already running")
    token = body.progress_token if body and body.progress_token else None
    progress_key = f"run:{token}" if token else f"run:{automation.id}"
    progress_store.start(progress_key)
    history = await run_automation(
        db, automation, scheduled_for=datetime.now(UTC), attempt=1, progress_key=progress_key
    )
    try:
        await db.commit()
    except SQLAlchemyError:
        await db.rollback()
        raise HTTPException(status_code=500, detail="Failed to run automation")
    return history


@router.post("/automations", response_model=AutomationRead, status_code=201)
async def create_new_automation(
    data: AutomationCreate,
    username: str = Depends(get_current_user_lastfm_username),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    automation = await create_automation(db, current_user.id, username, data)
    try:
        await db.commit()
    except SQLAlchemyError:
        await db.rollback()
        raise HTTPException(status_code=500, detail="Failed to save automation")
    return automation


@router.patch("/automations/{automation_id}", response_model=AutomationRead)
async def update_existing_automation(
    automation_id: str,
    data: AutomationUpdate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    automation = await update_automation(db, automation_id, current_user.id, data)
    if automation is None:
        raise HTTPException(status_code=404, detail="Automation not found")
    try:
        await db.commit()
    except SQLAlchemyError:
        await db.rollback()
        raise HTTPException(status_code=500, detail="Failed to save automation")
    return automation


@router.delete("/automations/{automation_id}", status_code=204)
async def delete_existing_automation(
    automation_id: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    deleted = await delete_automation(db, automation_id, current_user.id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Automation not found")
    try:
        await db.commit()
    except SQLAlchemyError:
        await db.rollback()
        raise HTTPException(status_code=500, detail="Failed to delete automation")
