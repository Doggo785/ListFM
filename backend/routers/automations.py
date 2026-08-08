from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_db
from schemas import AutomationCreate, AutomationUpdate, AutomationRead
from models.user import User
from routers.deps import get_current_user_lastfm_username, get_current_active_user
from repositories.automations import (
    get_automations,
    get_automation,
    create_automation,
    update_automation,
    delete_automation,
)
from services.automation_runner import run_automation_pipeline, UnsupportedSourceTypeError

router = APIRouter(prefix="/api", tags=["automations"])


@router.post("/automations/preview")
def preview_automation(
    body: dict,
    username: str = Depends(get_current_user_lastfm_username),
):
    automation = body.get("automation", {})
    source = automation.get("source", {})
    source_type = source.get("type", "top_tracks")
    period = source.get("period", "3m")
    max_size = automation.get("output", {}).get("maxSize", 50)
    filter_groups = automation.get("filterGroups") or automation.get("filter_groups") or []

    try:
        result = run_automation_pipeline(
            username=username,
            source_type=source_type,
            period=period,
            filter_groups=filter_groups,
            max_tracks=max_size,
        )
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
    automation_id: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    automation = await get_automation(db, automation_id, current_user.id)
    if automation is None:
        raise HTTPException(status_code=404, detail="Automation not found")
    return automation


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
