"""Tranche 3: extended=1 recents (loved + image free in one call).

Ground truth: a real user.getRecentTracks&extended=1 response carries
"loved": "0"/"1", album names and sized images per track. Anything
unexpected falls back to the pylast path (never worse than today).
"""

from unittest.mock import patch

from services.lastfm import get_recent_tracks

_EXTENDED_PAGE = {
    "recenttracks": {
        "track": [
            {
                "artist": {"name": "Rihanna", "mbid": "", "url": "https://example/x"},
                "mbid": "070a4ab0",
                "name": "Stay",
                "image": [
                    {"size": "small", "#text": "http://img/34s/a.png"},
                    {"size": "large", "#text": "http://img/174/b.png"},
                ],
                "album": {"mbid": "", "#text": "Unapologetic"},
                "url": "https://example/y",
                "date": {"uts": "1759330000", "#text": "2 Oct 2026"},
                "loved": "1",
            },
            {
                "artist": {"name": "M83"},
                "name": "Midnight City",
                "image": [],
                "album": {"mbid": "", "#text": ""},
                "date": {"uts": "1759320000"},
            },
            {
                "artist": {"name": "Live Artist"},
                "name": "Live Song",
                "@attr": {"nowplaying": "true"},
            },
        ]
    }
}


class _FakeResponse:
    def __init__(self, payload):
        self._payload = payload

    def raise_for_status(self):
        pass

    def json(self):
        return self._payload


def _extended(**over):
    payload = {"recenttracks": {"track": over.get("tracks", _EXTENDED_PAGE["recenttracks"]["track"])}}
    return _FakeResponse(payload)


def test_extended_parses_loved_image_and_skips_nowplaying():
    with patch("services.lastfm.httpx.get", return_value=_extended()):
        tracks = get_recent_tracks("u", limit=10)
    assert len(tracks) == 2
    first, second = tracks
    assert first["title"] == "Stay"
    assert first["artist"] == "Rihanna"
    assert first["timestamp"] == 1759330000
    assert first["userloved"] is True
    assert first["image"] == "http://img/174/b.png"
    assert second["title"] == "Midnight City"
    assert "userloved" not in second
    assert "image" not in second
    assert second["timestamp"] == 1759320000


def test_extended_loved_zero_is_false():
    tracks_node = [dict(_EXTENDED_PAGE["recenttracks"]["track"][0], loved="0")]
    with patch("services.lastfm.httpx.get", return_value=_extended(tracks=tracks_node)):
        tracks = get_recent_tracks("u", limit=10)
    assert tracks[0]["userloved"] is False


def test_extended_sends_paging_and_range_params():
    seen = {}

    def fake_get(url, params=None, timeout=None):
        seen.update(params)
        return _extended()

    with patch("services.lastfm.httpx.get", side_effect=fake_get):
        get_recent_tracks("u", limit=50, time_from=1000, time_to=2000)
    assert seen["extended"] == 1
    assert seen["limit"] == 51
    assert seen["from"] == 1000
    assert seen["to"] == 2000
    assert seen["method"] == "user.getrecenttracks"


def test_extended_unexpected_shape_returns_none():
    from services.lastfm import get_recent_tracks_extended

    with patch(
        "services.lastfm.httpx.get", return_value=_FakeResponse({"nope": True})
    ):
        assert get_recent_tracks_extended("u") is None


def test_transport_error_falls_back_to_pylast():
    """httpx blowing up uses the legacy path with identical output shape."""

    class _FakeArtist:
        name = "Old Artist"

    class _FakePlayed:
        timestamp = "1759330000"

        class track:
            title = "Old Song"
            artist = _FakeArtist()

    class _FakeUser:
        def get_recent_tracks(self, limit=None, time_from=None, time_to=None):
            assert time_from == 1000 and time_to == 2000
            return [_FakePlayed()]

    with (
        patch("services.lastfm.httpx.get", side_effect=RuntimeError("down")),
        patch("services.lastfm.get_network") as mock_network,
    ):
        mock_network.return_value.get_user.return_value = _FakeUser()
        tracks = get_recent_tracks("u", limit=5, time_from=1000, time_to=2000)
    assert tracks == [{"title": "Old Song", "artist": "Old Artist", "timestamp": 1759330000}]
