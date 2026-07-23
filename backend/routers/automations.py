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
from services.lastfm import (
    get_top_tracks,
    get_recent_tracks,
    get_loved_tracks,
    get_top_artists_tracks,
    enrich_tracks,
    deduplicate,
)

router = APIRouter(prefix="/api", tags=["automations"])


@router.post("/preview")
def preview_automation(
    body: dict,
    username: str = Depends(get_current_user_lastfm_username),
):
    automation = body.get("automation", {})
    source = automation.get("source", {})
    source_type = source.get("type", "top_tracks")
    period = source.get("period", "3m")
    limit = min(automation.get("output", {}).get("maxSize", 15), 15)

    try:
        match source_type:
            case "top_tracks":
                tracks = get_top_tracks(username, period, limit)
            case "recent_tracks":
                tracks = get_recent_tracks(username, limit)
            case "loved_tracks":
                tracks = get_loved_tracks(username, limit)
            case "top_artists":
                tracks = get_top_artists_tracks(username, period, limit)
            case _:
                return {"error": f"Unknown source type: {source_type}"}

        tracks = deduplicate(tracks)
        tracks = enrich_tracks(username, tracks, max_enrich=limit)
        return {"tracks": tracks, "total": len(tracks)}
    except Exception as e:
        return {"error": str(e)}


@router.get("/automations", response_model=list[AutomationRead])
async def list_automations(
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
