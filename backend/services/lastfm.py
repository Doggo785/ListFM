from __future__ import annotations

import threading
from contextlib import nullcontext

import pylast
from concurrent.futures import ThreadPoolExecutor, as_completed
from config import get_settings

PERIOD_MAP = {
    "7d": pylast.PERIOD_7DAYS,
    "1m": pylast.PERIOD_1MONTH,
    "3m": pylast.PERIOD_3MONTHS,
    "6m": pylast.PERIOD_6MONTHS,
    "12m": pylast.PERIOD_12MONTHS,
    "overall": pylast.PERIOD_OVERALL,
}


def get_user_info(username: str) -> dict:
    network = get_network()
    user = network.get_user(username)
    # Force a real API call so a non-existent username raises pylast.WSError
    # instead of being silently swallowed (which let link-lastfm accept any name).
    user.get_playcount()
    try:
        image_url = user.get_image(size=pylast.SIZE_LARGE)
    except Exception:
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


def get_recent_tracks(username: str, limit: int = 5) -> list[dict]:
    network = get_network()
    user = network.get_user(username)
    recent = user.get_recent_tracks(limit=limit)
    return [
        {
            "title": t.track.title,
            "artist": t.track.artist.name if t.track.artist else "Unknown Artist",
            "timestamp": int(t.timestamp) if t.timestamp else None,
        }
        for t in recent
    ]


def get_top_tags(username: str, period: str = "3m") -> list[dict]:
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
) -> dict:
    result = {
        "listeners": 0,
        "global_playcount": 0,
        "userplaycount": 0,
        "userloved": False,
        "artist_tags": [],
        "album_tags": [],
    }
    try:
        track = pylast.Track(artist, title, network, username=username)
    except Exception:
        return result

    try:
        result["listeners"] = track.get_listener_count()
    except Exception:
        pass

    try:
        result["global_playcount"] = track.get_playcount()
    except Exception:
        pass

    try:
        result["userplaycount"] = track.get_userplaycount() or 0
    except Exception:
        pass

    try:
        result["userloved"] = bool(track.get_userloved())
    except Exception:
        pass

    caches = tag_caches if tag_caches is not None else {}
    artist_cache = caches.setdefault("artist", {})
    album_cache = caches.setdefault("album", {})
    cache_guard = tag_lock if tag_lock is not None else nullcontext()

    try:
        artist_key = artist.strip().lower()
        with cache_guard:
            if artist_key in artist_cache:
                result["artist_tags"] = artist_cache[artist_key]
            else:
                artist_obj = network.get_artist(artist)
                raw_tags = [
                    {"name": t.item.name, "count": int(t.weight)}
                    for t in artist_obj.get_top_tags(limit=10)
                    if int(t.weight) > 0
                ]
                result["artist_tags"] = _normalize_tags(raw_tags)
                artist_cache[artist_key] = result["artist_tags"]
    except Exception:
        pass

    try:
        album = track.get_album()
        if album and album.title:
            album_name = album.title
            album_key = f"{artist.strip().lower()}|{album_name.strip().lower()}"
            with cache_guard:
                if album_key in album_cache:
                    result["album_tags"] = album_cache[album_key]
                else:
                    try:
                        album_obj = network.get_album(artist, album_name)
                        raw_tags = [
                            {"name": t.item.name, "count": int(t.weight)}
                            for t in album_obj.get_top_tags(limit=10)
                            if int(t.weight) > 0
                        ]
                        result["album_tags"] = _normalize_tags(raw_tags)
                    except Exception:
                        result["album_tags"] = []
                    album_cache[album_key] = result["album_tags"]
    except Exception:
        pass

    return result


def enrich_tracks(username: str, tracks: list[dict], max_enrich: int = 50) -> list[dict]:
    network = get_network()
    to_enrich = tracks[:max_enrich]
    tail = tracks[max_enrich:]
    tag_caches = {}
    cache_lock = threading.Lock()

    def _enrich_one(track):
        artist = track.get("artist", "")
        title = track.get("title", "")
        result = dict(track)
        result.update(get_track_full_info(network, username, artist, title, tag_caches, cache_lock))
        return result

    enriched_order = [None] * len(to_enrich)
    with ThreadPoolExecutor(max_workers=5) as pool:
        future_to_idx = {pool.submit(_enrich_one, t): i for i, t in enumerate(to_enrich)}
        for future in as_completed(future_to_idx):
            idx = future_to_idx[future]
            try:
                enriched_order[idx] = future.result()
            except Exception:
                enriched_order[idx] = to_enrich[idx]

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
