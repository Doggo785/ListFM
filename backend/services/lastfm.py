from __future__ import annotations

import asyncio
import logging
import threading
import time

import httpx
import pylast
from config import get_settings
from services.activity_log import log_activity

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
# The grey star Last.fm serves for an album with no cover.
NO_IMAGE_HASH = "2a96cbd8b46e442fc41c2b86b821562f"
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
    log_activity("lastfm", "", f"limite atteinte (erreur 29), pause de {retry_after:.0f} s")


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


def get_user_info(username: str) -> dict:
    """Profile in one user.getInfo call; unknown users raise pylast.WSError (6)."""
    user = _lastfm_json("user.getInfo", user=username)["user"]
    log_activity("lastfm", username, "profil")
    return {
        "username": username,
        "image": _pick_image(user.get("image")),
    }


LASTFM_API_URL = "https://ws.audioscrobbler.com/2.0/"


def _pick_image(images, sizes=("large", "extralarge", "medium", "small")) -> str | None:
    """Usable image URL from a Last.fm image list (UI-sized first)."""
    if not isinstance(images, list):
        return None
    by_size = {
        img.get("size"): img.get("#text")
        for img in images
        if isinstance(img, dict) and img.get("#text")
    }
    for size in sizes:
        if by_size.get(size):
            return by_size[size]
    return None


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
) -> tuple[list[tuple[str, str, int, str | None]], int]:
    """One page of dated listens as (title, artist, uts, album), plus the page count.

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
            album = node.get("album")
            listens.append(
                (node["name"], artist_name, int(uts), (album.get("#text") if isinstance(album, dict) else album) or None)
            )
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


def get_album_image(artist: str, album: str) -> str | None:
    """An album's cover in its best size for the screen. An unknown album or a placeholder has none."""
    _throttled_call()
    try:
        data = _lastfm_json("album.getInfo", artist=artist, album=album)["album"]
    except pylast.WSError as exc:
        if str(exc.status) == "6":
            return None
        raise
    image = _pick_image(data.get("image"), ("extralarge", "large", "medium", "small"))
    return None if image is None or NO_IMAGE_HASH in image else image


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


