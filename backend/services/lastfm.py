from __future__ import annotations

import asyncio
import logging
import threading
import time
from datetime import UTC, datetime

import httpx
import pylast
from config import get_settings

logger = logging.getLogger(__name__)


# Outbound Last.fm etiquette: ~4 calls/sec max, process-wide. Observed ceiling is ~5/sec with error 29
# past it; on 29 the whole process backs off for a minute (see below).
# Patch to 0 in tests to skip the sleeps.
LASTFM_MIN_INTERVAL = 0.25
_throttle_lock = threading.Lock()
_last_call_monotonic = 0.0
_rate_limit_until = 0.0
RATE_LIMIT_RETRIES = 3
# What a failed Last.fm call raises: an error body, a transport or HTTP error,
# or an unexpected payload shape.
PAGE_ERRORS = (pylast.WSError, httpx.HTTPError, KeyError, TypeError, ValueError)
# Last.fm returns up to 100 tags per artist, the long tail being noise.
ARTIST_TAGS_KEPT = 10


def _throttled_call() -> None:
    """Space outbound Last.fm calls apart.

    Must wrap each network-touching block (not just each track): the pool
    runs 5 threads and without a shared gate they fire concurrently.
    Also honors the backoff window set after an error 29.
    """
    global _last_call_monotonic
    with _throttle_lock:
        now = time.monotonic()
        wait = max(
            LASTFM_MIN_INTERVAL - (now - _last_call_monotonic),
            _rate_limit_until - now,
        )
        if wait > 0:
            time.sleep(wait)
            now = time.monotonic()
        _last_call_monotonic = now


def note_rate_limited(retry_after: float = 60.0) -> None:
    """Back off all outbound calls after an error 29 (rate limit exceeded)."""
    global _rate_limit_until
    with _throttle_lock:
        _rate_limit_until = max(_rate_limit_until, time.monotonic() + retry_after)


def is_rate_limit_error(exc: BaseException) -> bool:
    """True for Last.fm error 29, unwrapping `raise ... from` chains."""
    seen_ids: set[int] = set()
    current: BaseException | None = exc
    while current is not None and id(current) not in seen_ids:
        seen_ids.add(id(current))
        if str(getattr(current, "status", "") or "") == "29":
            return True
        current = current.__cause__ or current.__context__
    return False








async def call_retrying_rate_limit(fn, *args):
    """One Last.fm call off the event loop, retried after a rate limit (29)."""
    for attempt in range(RATE_LIMIT_RETRIES + 1):
        try:
            return await asyncio.to_thread(fn, *args)
        except pylast.WSError as exc:
            if not is_rate_limit_error(exc) or attempt == RATE_LIMIT_RETRIES:
                raise
            # The shared throttle sleeps out the backoff before the next call.
            note_rate_limited()
    raise AssertionError("unreachable")


def epoch_to_datetime(ts) -> datetime | None:
    """Last.fm epoch seconds (or None) to aware datetime, forgiving."""
    try:
        return datetime.fromtimestamp(int(ts), tz=UTC) if ts is not None else None
    except (TypeError, ValueError, OverflowError, OSError):
        return None


def get_user_info(username: str) -> dict:
    """Profile in one user.getInfo call; unknown users raise pylast.WSError (6)."""
    user = _lastfm_json("user.getInfo", user=username)["user"]
    return {
        "username": username,
        "image": _pick_image(user.get("image")),
    }


def get_network() -> pylast.LastFMNetwork:
    settings = get_settings()
    return pylast.LastFMNetwork(
        api_key=settings.lastfm_api_key,
        api_secret=settings.lastfm_api_secret,
    )


LASTFM_API_URL = "https://ws.audioscrobbler.com/2.0/"


def _pick_image(images) -> str | None:
    """Usable image URL from an extended=1 image list (UI-sized first)."""
    if not isinstance(images, list):
        return None
    by_size = {
        img.get("size"): img.get("#text")
        for img in images
        if isinstance(img, dict) and img.get("#text")
    }
    for size in ("large", "extralarge", "medium", "small"):
        if by_size.get(size):
            return by_size[size]
    return None


def get_recent_tracks_extended(
    username: str, limit: int = 5, time_from: int | None = None, time_to: int | None = None
) -> list[dict] | None:
    """Recents with loved + image per track, or None when unusable.

    One paginated call with extended=1 instead of one call plus per-track
    lookups. Any unexpected shape or transport error returns None so the
    caller falls back to the pylast path (never worse than today).
    """
    params: dict[str, object] = {
        "method": "user.getrecenttracks",
        "user": username,
        "api_key": get_settings().lastfm_api_key,
        "format": "json",
        "limit": min(limit + 1, 200),
        "extended": 1,
    }
    if time_from:
        params["from"] = time_from
    if time_to:
        params["to"] = time_to
    try:
        response = httpx.get(LASTFM_API_URL, params=params, timeout=30)
        response.raise_for_status()
        nodes = response.json()["recenttracks"]["track"]
    except Exception:
        logger.debug("get_recent_tracks_extended: falling back to pylast", exc_info=True)
        return None
    if isinstance(nodes, dict):
        nodes = [nodes]
    if not isinstance(nodes, list):
        return None
    tracks = []
    for node in nodes:
        if not isinstance(node, dict):
            continue
        if node.get("@attr", {}).get("nowplaying") == "true":
            continue
        title = node.get("name")
        artist = node.get("artist", {})
        artist_name = artist.get("name") if isinstance(artist, dict) else artist
        if not title or not artist_name:
            continue
        date = node.get("date", {})
        timestamp = date.get("uts") if isinstance(date, dict) else None
        track: dict[str, object] = {
            "title": title,
            "artist": artist_name,
            "timestamp": int(timestamp) if timestamp else None,
        }
        if "loved" in node:
            track["userloved"] = node["loved"] == "1"
        image = _pick_image(node.get("image"))
        if image:
            track["image"] = image
        tracks.append(track)
        if len(tracks) >= limit:
            break
    return tracks


def _lastfm_json(method: str, **params: str) -> dict:
    """One Last.fm API call in JSON.

    A Last.fm error body raises pylast.WSError carrying its code, so callers
    tell "not found" (6) and "rate limited" (29) apart from transport errors.
    """
    response = httpx.get(
        LASTFM_API_URL,
        params={
            "method": method,
            **params,
            "api_key": get_settings().lastfm_api_key,
            "format": "json",
        },
        timeout=30,
    )
    data = response.json()
    if "error" in data:
        raise pylast.WSError(None, str(data["error"]), data.get("message", ""))
    response.raise_for_status()
    return data


def _as_list(nodes) -> list:
    """Last.fm returns a bare object instead of a one-item list."""
    if isinstance(nodes, dict):
        return [nodes]
    return nodes if isinstance(nodes, list) else []


def get_scrobble_page(
    username: str, page: int, limit: int, time_from: int | None, time_to: int
) -> tuple[list[tuple[str, str, int]], int]:
    """One page of dated listens as (title, artist, uts), plus the page count.

    Pages run newest first, so the last page holds the oldest listens. The
    now-playing entry has no date and is skipped. Raises pylast.WSError on a
    Last.fm error body (29 = rate limited).
    """
    params = {"user": username, "page": str(page), "limit": str(limit), "to": str(time_to)}
    if time_from is not None:
        params["from"] = str(time_from)
    _throttled_call()
    data = _lastfm_json("user.getRecentTracks", **params)["recenttracks"]
    listens = []
    for node in _as_list(data.get("track")):
        artist = node.get("artist", {})
        artist_name = artist.get("#text") if isinstance(artist, dict) else artist
        uts = (node.get("date") or {}).get("uts")
        if node.get("name") and artist_name and uts:
            listens.append((node["name"], artist_name, int(uts)))
    return listens, int(data["@attr"]["totalPages"])


def get_loved_page(username: str, page: int, limit: int) -> tuple[list[tuple[str, str]], int]:
    """One page of loved tracks as (title, artist), plus the page count."""
    _throttled_call()
    data = _lastfm_json(
        "user.getLovedTracks", user=username, page=str(page), limit=str(limit)
    )["lovedtracks"]
    loved = []
    for node in _as_list(data.get("track")):
        artist = node.get("artist", {})
        artist_name = artist.get("name") if isinstance(artist, dict) else artist
        if node.get("name") and artist_name:
            loved.append((node["name"], artist_name))
    return loved, int(data["@attr"]["totalPages"])




def get_artist_tags(artist: str) -> list[dict]:
    """An artist's top tags with counts from 0 to 100; an unknown artist has none."""
    _throttled_call()
    try:
        data = _lastfm_json("artist.getTopTags", artist=artist)["toptags"]
    except pylast.WSError as exc:
        if str(exc.status) == "6":
            return []
        raise
    return _normalize_tags(
        [{"name": t["name"], "count": int(t["count"])} for t in _as_list(data.get("tag"))[:ARTIST_TAGS_KEPT]]
    )


def get_recent_tracks(
    username: str, limit: int = 5, time_from: int | None = None, time_to: int | None = None
) -> list[dict]:
    extended = get_recent_tracks_extended(username, limit, time_from, time_to)
    if extended is not None:
        return extended
    network = get_network()
    user = network.get_user(username)
    recent = user.get_recent_tracks(limit=limit, time_from=time_from, time_to=time_to)
    return [
        {
            "title": t.track.title,
            "artist": t.track.artist.name if t.track.artist else "Unknown Artist",
            "timestamp": int(t.timestamp) if t.timestamp else None,
        }
        for t in recent
    ]








def _normalize_tags(raw_tags: list[dict]) -> list[dict]:
    if not raw_tags:
        return []
    max_count = max(t["count"] for t in raw_tags)
    if max_count == 0:
        return []
    return [
        {"name": t["name"], "count": round((t["count"] / max_count) * 100)}
        for t in raw_tags
    ]








