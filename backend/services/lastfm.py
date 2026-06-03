import pylast
from config import get_settings


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
    top_tracks = user.get_top_tracks(period=period, limit=limit)
    return [
        {
            "title": t.track.title,
            "artist": t.track.artist.name if t.track.artist else "Unknown Artist",
            "playcount": t.weight,
        }
        for t in top_tracks
    ]


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
