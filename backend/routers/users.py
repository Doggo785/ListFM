from fastapi import APIRouter, HTTPException
from services.lastfm import get_recent_tracks, get_top_tags, get_top_tracks, get_loved_tracks, get_user_info
from schemas import RecentTracksResponse, Track, UserInfo

router = APIRouter(prefix="/api", tags=["users"])


@router.get("/{username}/info", response_model=UserInfo)
def user_info(username: str):
    try:
        info = get_user_info(username)
        return UserInfo(**info)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Last.fm API error: {e}")


@router.get("/{username}/recent-tracks", response_model=RecentTracksResponse)
def user_recent_tracks(username: str, limit: int = 5):
    try:
        tracks = get_recent_tracks(username, limit=limit)
        return RecentTracksResponse(tracks=[Track(**t) for t in tracks])
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Last.fm API error: {e}")


@router.get("/{username}/top-tags")
def user_top_tags(username: str, period: str = "3m"):
    try:
        return {"tags": get_top_tags(username, period)}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Last.fm API error: {e}")


@router.get("/{username}/top-tracks")
def user_top_tracks(username: str, period: str = "3m", limit: int = 50):
    try:
        return {"tracks": get_top_tracks(username, period, limit)}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Last.fm API error: {e}")


@router.get("/{username}/loved-tracks")
def user_loved_tracks(username: str, limit: int = 50):
    try:
        return {"tracks": get_loved_tracks(username, limit)}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Last.fm API error: {e}")


@router.get("/{username}/source-tracks")
def user_source_tracks(username: str, source: str = "top_tracks", period: str = "3m", limit: int = 50):
    try:
        match source:
            case "top_tracks":
                tracks = get_top_tracks(username, period, limit)
            case "recent_tracks":
                tracks = get_recent_tracks(username, limit)
            case "loved_tracks":
                tracks = get_loved_tracks(username, limit)
            case _:
                raise HTTPException(status_code=400, detail=f"Unknown source: {source}")
        return {"tracks": tracks}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Last.fm API error: {e}")
