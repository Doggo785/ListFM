import pylast
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
        }
        for t in recent
    ]


def get_top_tags(username: str, period: str = "3m") -> list[dict]:
    network = get_network()
    user = network.get_user(username)
    top_tags = user.get_top_tags(limit=10)
    return [{"name": tag.item.name, "count": tag.weight} for tag in top_tags]


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
        }
        for t in top_tracks
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
        }
        for t in loved
    ]


def deduplicate(raw_tracks: list[dict]) -> list[dict]:
    seen: set[str] = set()
    unique = []
    for track in raw_tracks:
        key = f"{track['artist'].strip().lower()}|{track['title'].strip().lower()}"
        if key not in seen:
            seen.add(key)
            unique.append(track)
    return unique
