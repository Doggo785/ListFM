from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_db
from schemas import AutomationCreate, AutomationUpdate, AutomationRead
from models.user import User
from routers.deps import resolve_user_id, get_current_active_user
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
def preview_automation(body: dict):
    username = body.get("username")
    automation = body.get("automation", {})
    source = automation.get("source", {})
    source_type = source.get("type", "top_tracks")
    period = source.get("period", "3m")
    limit = min(automation.get("output", {}).get("maxSize", 15), 15)

    if not username:
        return {"error": "username is required"}

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


@router.get("/{username}/automations", response_model=list[AutomationRead])
async def list_automations(username: str, db: AsyncSession = Depends(get_db)):
    user_id = await resolve_user_id(db, username)
    return await get_automations(db, user_id)


@router.get("/{username}/automations/{automation_id}", response_model=AutomationRead)
async def get_single_automation(username: str, automation_id: str, db: AsyncSession = Depends(get_db)):
    user_id = await resolve_user_id(db, username)
    automation = await get_automation(db, automation_id, user_id)
    if automation is None:
        raise HTTPException(status_code=404, detail="Automation not found")
    return automation


@router.post("/{username}/automations", response_model=AutomationRead, status_code=201)
async def create_new_automation(
    username: str,
    data: AutomationCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    user_id = await resolve_user_id(db, username)
    if user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    automation = await create_automation(db, user_id, username, data)
    try:
        await db.commit()
    except Exception:
        await db.rollback()
        raise HTTPException(status_code=500, detail="Failed to save automation")
    return automation


@router.patch("/{username}/automations/{automation_id}", response_model=AutomationRead)
async def update_existing_automation(
    username: str,
    automation_id: str,
    data: AutomationUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    user_id = await resolve_user_id(db, username)
    if user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    automation = await update_automation(db, automation_id, user_id, data)
    if automation is None:
        raise HTTPException(status_code=404, detail="Automation not found")
    try:
        await db.commit()
    except Exception:
        await db.rollback()
        raise HTTPException(status_code=500, detail="Failed to save automation")
    return automation


@router.delete("/{username}/automations/{automation_id}", status_code=204)
async def delete_existing_automation(
    username: str,
    automation_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    user_id = await resolve_user_id(db, username)
    if user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    deleted = await delete_automation(db, automation_id, user_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Automation not found")
    try:
        await db.commit()
    except Exception:
        await db.rollback()
        raise HTTPException(status_code=500, detail="Failed to delete automation")
