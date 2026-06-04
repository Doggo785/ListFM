from fastapi import APIRouter
from services.lastfm import (
    get_top_tracks,
    get_recent_tracks,
    get_loved_tracks,
    get_top_artists_tracks,
    enrich_tracks,
    deduplicate,
)

router = APIRouter(prefix="/api/automations", tags=["automations"])


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
