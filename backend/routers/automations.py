import asyncio
import functools

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_db
from schemas import (
    AutomationCreate,
    AutomationUpdate,
    AutomationRead,
    AutomationHistoryRead,
    PreviewRequest,
    LASTFM_USERNAME_REGEX,
)
from repositories.automation_history import get_automation_history
from models.automation import Automation
from models.user import User
from routers.deps import (
    get_current_user_lastfm_username,
    get_current_active_user,
    get_owned_automation,
)
from repositories.automations import (
    get_automations,
    create_automation,
    update_automation,
    delete_automation,
)
from services.automation_runner import (
    run_automation,
    run_automation_pipeline,
    UnsupportedSourceTypeError,
)

router = APIRouter(prefix="/api", tags=["automations"])


@router.post("/automations/preview")
async def preview_automation(
    body: PreviewRequest,
    username: str = Depends(get_current_user_lastfm_username),
):
    if not LASTFM_USERNAME_REGEX.match(username):
        raise HTTPException(status_code=422, detail="Invalid Last.fm username")
    automation = body.automation

    # The pipeline is synchronous (pylast + ThreadPoolExecutor): keep it off
    # the event loop, like the scheduled sweep does. functools.partial carries
    # keyword arguments through run_in_executor (which only forwards *args),
    # so a future parameter reorder in the pipeline cannot silently misbind.
    loop = asyncio.get_running_loop()
    pipeline = functools.partial(
        run_automation_pipeline,
        username=username,
        source_type=automation.source.type,
        period=automation.source.period,
        filter_groups=automation.filter_groups,
        max_tracks=automation.output.maxSize,
    )
    try:
        result = await loop.run_in_executor(None, pipeline)
    except UnsupportedSourceTypeError:
        raise HTTPException(status_code=422, detail="Unsupported source type")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=502, detail="Unable to fetch tracks from Last.fm")

    return result


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
):
    """Trigger one manual run now (same pipeline as the scheduled sweep)."""
    history = await run_automation(db, automation)
    try:
        await db.commit()
    except Exception:
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
    except Exception:
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
    except Exception:
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
    except Exception:
        await db.rollback()
        raise HTTPException(status_code=500, detail="Failed to delete automation")
