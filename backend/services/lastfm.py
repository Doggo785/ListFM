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
    tracks = []
    for artist_item in top_artists:
        try:
            artist = network.get_artist(artist_item.item.name)
            top_tracks = artist.get_top_tracks(limit=max(limit // max(len(top_artists), 1), 5))
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


def get_track_full_info(network: pylast.LastFMNetwork, username: str, artist: str, title: str) -> dict:
    result = {
        "listeners": 0,
        "global_playcount": 0,
        "userplaycount": 0,
        "userloved": False,
        "tags": [],
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

    try:
        top_tags = track.get_top_tags(limit=10)
        result["tags"] = [{"name": tag.item.name, "count": int(tag.weight)} for tag in top_tags if int(tag.weight) > 0]
    except Exception:
        pass

    return result


def enrich_tracks(username: str, tracks: list[dict], max_enrich: int = 50) -> list[dict]:
    network = get_network()
    to_enrich = tracks[:max_enrich]
    tail = tracks[max_enrich:]

    def _enrich_one(track):
        artist = track.get("artist", "")
        title = track.get("title", "")
        result = dict(track)
        result.update(get_track_full_info(network, username, artist, title))
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
