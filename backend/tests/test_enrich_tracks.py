"""Unit tests for services.lastfm.enrich_tracks with a mocked network.

These tests never touch the real Last.fm API: `get_network` returns a dummy
object and `get_track_full_info` is stubbed. They pin the parallel-enrichment
contract: order preserved, tail beyond max_enrich untouched, and a failed
enrichment falls back to the raw track.
"""

from unittest.mock import patch

from services.lastfm import enrich_tracks

_TRACKS = [
    {"artist": "A", "title": "one"},
    {"artist": "B", "title": "two"},
    {"artist": "C", "title": "three"},
]


def _info(network, username, artist, title, caches, lock, only=None, progress_key=None):
    return {"listeners": 7, "artist": artist, "title": title}


def test_enrich_tracks_preserves_order_and_passes_tail_through():
    """Enriched tracks keep input order; tracks beyond max_enrich are untouched."""
    with (
        patch("services.lastfm.get_network", return_value=object()),
        patch("services.lastfm.get_track_full_info", side_effect=_info),
    ):
        out = enrich_tracks("user", _TRACKS, max_enrich=2)
    assert out[0]["listeners"] == 7
    assert out[1]["listeners"] == 7
    assert out[0]["title"] == "one"
    assert out[1]["title"] == "two"
    assert out[2] == {"artist": "C", "title": "three"}


def test_enrich_tracks_falls_back_to_raw_track_on_failure():
    """A track whose enrichment raises is returned unenriched, others unaffected."""

    def _flaky(network, username, artist, title, caches, lock, only=None, progress_key=None):
        if title == "two":
            raise RuntimeError("boom")
        return {"listeners": 7}

    with (
        patch("services.lastfm.get_network", return_value=object()),
        patch("services.lastfm.get_track_full_info", side_effect=_flaky),
    ):
        out = enrich_tracks("user", _TRACKS, max_enrich=3)
    assert out[0] == {"artist": "A", "title": "one", "listeners": 7}
    assert out[1] == {"artist": "B", "title": "two", "fetch_failed": True}
    assert out[2] == {"artist": "C", "title": "three", "listeners": 7}


def test_top_artists_tracks_carry_no_worldwide_playcount():
    """The artist's top-track weight is global; it must not pose as the user's plays."""
    from types import SimpleNamespace

    from services import lastfm

    track = SimpleNamespace(
        item=SimpleNamespace(title="Song", artist=SimpleNamespace(name="Band")),
        weight=1_000_000,
    )
    artist = SimpleNamespace(get_top_tracks=lambda limit: [track])
    network = SimpleNamespace(
        get_user=lambda name: SimpleNamespace(
            get_top_artists=lambda period, limit: [
                SimpleNamespace(item=SimpleNamespace(name="Band"))
            ]
        ),
        get_artist=lambda name: artist,
    )
    with patch.object(lastfm, "get_network", return_value=network):
        out = lastfm.get_top_artists_tracks("u", "3m", limit=5)
    assert out == [{"title": "Song", "artist": "Band"}]
