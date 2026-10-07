from __future__ import annotations

import logging
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from contextlib import nullcontext
from datetime import UTC, datetime

import httpx
import pylast
from config import get_settings
from services.progress import PipelineCancelled, store as progress_store

logger = logging.getLogger(__name__)

PERIOD_MAP = {
    "7d": pylast.PERIOD_7DAYS,
    "1m": pylast.PERIOD_1MONTH,
    "3m": pylast.PERIOD_3MONTHS,
    "6m": pylast.PERIOD_6MONTHS,
    "12m": pylast.PERIOD_12MONTHS,
    "overall": pylast.PERIOD_OVERALL,
}

# Outbound Last.fm etiquette: ~4 calls/sec max, process-wide (the enrich
# ThreadPool shares one gate). Observed ceiling is ~5/sec with error 29
# past it; on 29 the whole process backs off for a minute (see below).
# Patch to 0 in tests to skip the sleeps.
LASTFM_MIN_INTERVAL = 0.25
_throttle_lock = threading.Lock()
_last_call_monotonic = 0.0
_rate_limit_until = 0.0
_lastfm_call_count = 0


def _throttled_call() -> None:
    """Space outbound Last.fm calls apart; count every gated call.

    Must wrap each network-touching block (not just each track): the pool
    runs 5 threads and without a shared gate they fire concurrently.
    Also honors the backoff window set after an error 29.
    """
    global _last_call_monotonic, _lastfm_call_count
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
        _lastfm_call_count += 1


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


def _note_possible_rate_limit(exc: Exception) -> None:
    """Arm the process-wide backoff after a Last.fm error 29.

    Call this from an except handler that still logs: ruff exempts
    logging-only handlers from BLE001, and the caller's justified noqa
    covers this bookkeeping call.
    """
    if is_rate_limit_error(exc):
        note_rate_limited()
        logger.warning("get_track_full_info: rate limited (29), backing off")


def reset_lastfm_call_count() -> None:
    global _lastfm_call_count
    with _throttle_lock:
        _lastfm_call_count = 0


def get_lastfm_call_count() -> int:
    with _throttle_lock:
        return _lastfm_call_count


def epoch_to_datetime(ts) -> datetime | None:
    """Last.fm epoch seconds (or None) to aware datetime, forgiving."""
    try:
        return datetime.fromtimestamp(int(ts), tz=UTC) if ts is not None else None
    except (TypeError, ValueError, OverflowError, OSError):
        return None


def get_user_info(username: str) -> dict:
    network = get_network()
    user = network.get_user(username)
    # Force a real API call so a non-existent username raises pylast.WSError
    # instead of being silently swallowed (which let link-lastfm accept any name).
    user.get_playcount()
    try:
        image_url = user.get_image(size=pylast.SIZE_LARGE)
    except Exception:  # noqa: BLE001 -- profile image is optional: degrade to None
        image_url = None
    return {
        "username": username,
        "image": image_url,
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


def get_top_tags(username: str) -> list[dict]:
    network = get_network()
    user = network.get_user(username)
    top_tags = user.get_top_tags(limit=10)
    return [{"name": tag.item.name, "count": int(tag.weight)} for tag in top_tags]


def get_top_tracks(username: str, period: str = "3m", limit: int = 50) -> list[dict]:
    network = get_network()
    user = network.get_user(username)
    pylast_period = PERIOD_MAP.get(period, pylast.PERIOD_OVERALL)
    top_tracks = user.get_top_tracks(period=pylast_period, limit=limit)
    return [
        {
            "title": t.item.title,
            "artist": t.item.artist.name if t.item.artist else "Unknown Artist",
            "playcount": t.weight,
            "rank": i + 1,
        }
        for i, t in enumerate(top_tracks)
    ]


def get_top_artists_tracks(username: str, period: str = "3m", limit: int = 50) -> list[dict]:
    network = get_network()
    user = network.get_user(username)
    pylast_period = PERIOD_MAP.get(period, pylast.PERIOD_OVERALL)
    top_artists = user.get_top_artists(period=pylast_period, limit=10)
    per_artist_limit = max(limit // max(len(top_artists), 1), 5)
    tracks = []
    for artist_item in top_artists:
        try:
            artist = network.get_artist(artist_item.item.name)
            top_tracks = artist.get_top_tracks(limit=per_artist_limit)
            for t in top_tracks:
                tracks.append({
                    "title": t.item.title,
                    "artist": t.item.artist.name if t.item.artist else artist_item.item.name,
                    "playcount": t.weight,
                })
        except Exception:
            logger.debug("get_top_tracks: skipping artist after error", exc_info=True)
            continue
        if len(tracks) >= limit:
            break
    return tracks[:limit]


def get_loved_tracks(username: str, limit: int = 50) -> list[dict]:
    network = get_network()
    user = network.get_user(username)
    loved = user.get_loved_tracks(limit=limit)
    return [
        {
            "title": t.track.title,
            "artist": t.track.artist.name if t.track.artist else "Unknown Artist",
            "userloved": True,
        }
        for t in loved
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


def get_track_full_info(
    network: pylast.LastFMNetwork,
    username: str,
    artist: str,
    title: str,
    tag_caches: dict | None = None,
    tag_lock: threading.Lock | None = None,
    only: set[str] | None = None,
    progress_key: str | None = None,
) -> dict:
    result = {
        "listeners": 0,
        "global_playcount": 0,
        "userplaycount": 0,
        "userloved": False,
        "artist_tags": [],
        "album": None,
        "album_tags": [],
    }

    def _want(key: str) -> bool:
        """Whether this enrich key is needed (None = full fetch, today's behavior).

        Skipped keys keep the safe defaults above: the caller (fetch-only-
        what-filters-need) guarantees no active filter reads them.
        """
        return only is None or key in only

    def _gated() -> None:
        """One throttled call that also reports progress and honors cancel.

        Checks the ticket first so a cancelled run stops between calls
        instead of draining every in-flight track, then counts the
        completed call so the UI ticks roughly once per second.
        """
        if progress_key is not None and progress_store.is_cancelled(progress_key):
            raise PipelineCancelled()
        _throttled_call()
        if progress_key is not None:
            progress_store.bump_calls(progress_key)

    try:
        track = pylast.Track(artist, title, network, username=username)
    except Exception:  # noqa: BLE001 -- unconstructable track: return the empty result
        return result

    if _want("listeners"):
        try:
            _gated()
            result["listeners"] = track.get_listener_count()
        except Exception as exc:
            _note_possible_rate_limit(exc)
            logger.debug("get_track_full_info: enrichment call failed", exc_info=True)

    if _want("global_playcount"):
        try:
            _gated()
            result["global_playcount"] = track.get_playcount()
        except Exception as exc:
            _note_possible_rate_limit(exc)
            logger.debug("get_track_full_info: enrichment call failed", exc_info=True)

    if _want("userplaycount"):
        try:
            _gated()
            result["userplaycount"] = track.get_userplaycount() or 0
        except Exception as exc:
            _note_possible_rate_limit(exc)
            logger.debug("get_track_full_info: enrichment call failed", exc_info=True)

    if _want("userloved"):
        try:
            _gated()
            result["userloved"] = bool(track.get_userloved())
        except Exception as exc:
            _note_possible_rate_limit(exc)
            logger.debug("get_track_full_info: enrichment call failed", exc_info=True)

    caches = tag_caches if tag_caches is not None else {}
    artist_cache = caches.setdefault("artist", {})
    album_cache = caches.setdefault("album", {})
    cache_guard = tag_lock if tag_lock is not None else nullcontext()

    if _want("artist_tags"):
        try:
            artist_key = artist.strip().lower()
            with cache_guard:
                if artist_key in artist_cache:
                    result["artist_tags"] = artist_cache[artist_key]
                else:
                    _gated()
                    artist_obj = network.get_artist(artist)
                    raw_tags = [
                        {"name": t.item.name, "count": int(t.weight)}
                        for t in artist_obj.get_top_tags(limit=10)
                        if int(t.weight) > 0
                    ]
                    result["artist_tags"] = _normalize_tags(raw_tags)
                    artist_cache[artist_key] = result["artist_tags"]
        except Exception as exc:
            _note_possible_rate_limit(exc)
            logger.debug("get_track_full_info: enrichment call failed", exc_info=True)

    if _want("album") or _want("album_tags"):
        try:
            _gated()
            album = track.get_album()
            if album and album.title:
                album_name = album.title
                result["album"] = album_name
                if _want("album_tags"):
                    album_key = f"{artist.strip().lower()}|{album_name.strip().lower()}"
                    with cache_guard:
                        if album_key in album_cache:
                            result["album_tags"] = album_cache[album_key]
                        else:
                            try:
                                _gated()
                                album_obj = network.get_album(artist, album_name)
                                raw_tags = [
                                    {"name": t.item.name, "count": int(t.weight)}
                                    for t in album_obj.get_top_tags(limit=10)
                                    if int(t.weight) > 0
                                ]
                                result["album_tags"] = _normalize_tags(raw_tags)
                            except Exception:  # noqa: BLE001 -- one bad album keeps the rest
                                result["album_tags"] = []
                            album_cache[album_key] = result["album_tags"]
        except Exception as exc:
            _note_possible_rate_limit(exc)
            logger.debug("get_track_full_info: enrichment call failed", exc_info=True)

    return result


def enrich_tracks(
    username: str,
    tracks: list[dict],
    max_enrich: int = 50,
    only: set[str] | None = None,
    progress_key: str | None = None,
) -> list[dict]:
    network = get_network()
    to_enrich = tracks[:max_enrich]
    tail = tracks[max_enrich:]
    tag_caches: dict = {}
    cache_lock = threading.Lock()

    def _enrich_one(track):
        if progress_key is not None and progress_store.is_cancelled(progress_key):
            raise PipelineCancelled()
        artist = track.get("artist", "")
        title = track.get("title", "")
        result = dict(track)
        result.update(
            get_track_full_info(
                network,
                username,
                artist,
                title,
                tag_caches,
                cache_lock,
                only,
                progress_key=progress_key,
            )
        )
        # Dispatch-provided loved flags (extended=1) survive: enrich
        # defaults must not clobber values fetched from the same source.
        if "userloved" in track:
            result["userloved"] = track["userloved"]
        return result

    enriched_order: list[dict | None] = [None] * len(to_enrich)
    completed = 0
    with ThreadPoolExecutor(max_workers=5) as pool:
        future_to_idx = {pool.submit(_enrich_one, t): i for i, t in enumerate(to_enrich)}
        for future in as_completed(future_to_idx):
            idx = future_to_idx[future]
            try:
                enriched_order[idx] = future.result()
            except PipelineCancelled:
                for pending in future_to_idx:
                    pending.cancel()
                raise
            except Exception:  # noqa: BLE001 -- failed enrichment falls back to the raw track
                enriched_order[idx] = to_enrich[idx]
            else:
                completed += 1
                if progress_key is not None:
                    progress_store.report(progress_key, "enrich", completed, len(to_enrich))

    return [r for r in enriched_order if r is not None] + tail


def deduplicate(raw_tracks: list[dict]) -> list[dict]:
    seen: set[str] = set()
    unique = []
    for track in raw_tracks:
        key = f"{track['artist'].strip().lower()}|{track['title'].strip().lower()}"
        if key not in seen:
            seen.add(key)
            unique.append(track)
    return unique
