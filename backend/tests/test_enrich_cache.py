"""P1-8 (8a): throttle gate, call counter, artist-tag persistence, album key.

The live Last.fm layer stays synchronous; these tests never touch the real
API (interval patched to 0, pylast objects faked). DB tests use the throwaway
listfm_test database (autouse truncate in conftest).
"""

import time
import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import patch

import pytest
from httpx import AsyncClient
from models.track import Track
from models.user import User
from repositories.tags import get_artist_tags, upsert_artist_tag
from repositories.user_tracks import get_user_track
from services import lastfm
from services.automation_runner import run_automation_pipeline_cached
from services.enrich_cache import enrich_tracks_cached
from services.lastfm import (
    _throttled_call,
    get_lastfm_call_count,
    get_track_full_info,
    reset_lastfm_call_count,
)
from sqlalchemy import select, update

from .conftest import _cleanup_user, _TestSessionLocal, _unique_email


def _live_info(**over):
    info = {
        "listeners": 10,
        "global_playcount": 20,
        "userplaycount": 5,
        "userloved": True,
        "artist_tags": [{"name": "rock", "count": 100}],
        "album": "Cached Album",
        "album_tags": [{"name": "indie", "count": 90}],
    }
    info.update(over)
    return info


async def _make_user_id() -> str:
    """Minimal throwaway user row (autouse truncate cleans it up)."""
    async with _TestSessionLocal() as db:
        user_id = str(uuid.uuid4())
        db.add(User(id=user_id))
        await db.commit()
        return user_id


@pytest.mark.asyncio
async def test_throttle_spaces_calls():
    """Two gated calls with a 50ms interval are at least ~50ms apart."""
    with patch.object(lastfm, "LASTFM_MIN_INTERVAL", 0.05):
        start = time.monotonic()
        _throttled_call()
        _throttled_call()
        assert time.monotonic() - start >= 0.04


@pytest.mark.asyncio
async def test_call_counter_counts_gated_calls():
    """The counter tracks gated calls after an explicit reset."""
    with patch.object(lastfm, "LASTFM_MIN_INTERVAL", 0):
        reset_lastfm_call_count()
        assert get_lastfm_call_count() == 0
        _throttled_call()
        _throttled_call()
        assert get_lastfm_call_count() == 2


@pytest.mark.asyncio
async def test_artist_tags_roundtrip():
    """Upserted artist tags read back with weights."""
    async with _TestSessionLocal() as db:
        await upsert_artist_tag(db, "Some Artist", "rock", 90)
        await upsert_artist_tag(db, "Some Artist", "indie", 40)
        await db.commit()
        tags = await get_artist_tags(db, "Some Artist")
    assert {t["name"]: t["count"] for t in tags} == {"rock": 90, "indie": 40}


@pytest.mark.asyncio
async def test_stale_track_row_forces_refetch():
    """A track row older than the global TTL refetches live even with tags stored."""
    user_id = await _make_user_id()
    suffix = uuid.uuid4().hex[:8]
    tracks = [{"artist": f"Stale Artist {suffix}", "title": f"Stale Song {suffix}"}]
    live = [{**tracks[0], **_live_info()}]
    async with _TestSessionLocal() as db:
        with patch(
            "services.enrich_cache.enrich_tracks", return_value=live
        ) as mock_enrich:
            await enrich_tracks_cached(
                db, user_id=user_id, username="u", tracks=tracks, max_enrich=10
            )
            assert mock_enrich.call_count == 1
            await db.execute(
                update(Track)
                .where(
                    Track.artist == tracks[0]["artist"],
                    Track.title == tracks[0]["title"],
                )
                .values(last_fetched_at=datetime.now(UTC) - timedelta(days=8))  # beyond GLOBAL_TTL
            )
            await db.commit()
            out, stats = await enrich_tracks_cached(
                db, user_id=user_id, username="u", tracks=tracks, max_enrich=10
            )
            assert mock_enrich.call_count == 2
    assert stats["misses"] == 1
    assert out[0]["listeners"] == 10


class _FakeTags:
    def __init__(self, tags):
        self._tags = tags

    def get_top_tags(self, limit=None):
        return self._tags


class _FakeAlbum:
    def __init__(self, title):
        self.title = title

    def get_top_tags(self, limit=None):
        return []


class _FakeTrack:
    def __init__(self, *args, **kwargs):
        pass

    def get_listener_count(self):
        return 1234

    def get_playcount(self):
        return 5678

    def get_userplaycount(self):
        return 42

    def get_userloved(self):
        return 1

    def get_album(self):
        return _FakeAlbum(title="Fake Album")


class _FakeNetwork:
    def get_artist(self, name):
        return _FakeTags([])

    def get_album(self, artist, title):
        return _FakeTags([])


@pytest.mark.asyncio
async def test_full_info_reports_album_title():
    """get_track_full_info exposes the album title for cache write-back."""
    with patch.object(lastfm, "LASTFM_MIN_INTERVAL", 0), patch.object(
        lastfm.pylast, "Track", _FakeTrack
    ):
        info = get_track_full_info(_FakeNetwork(), "someuser", "A", "T")
    assert info["album"] == "Fake Album"
    assert info["listeners"] == 1234
    assert info["userplaycount"] == 42
    assert info["artist_tags"] == []
    assert info["album_tags"] == []


@pytest.mark.asyncio
async def test_cached_enrich_second_run_makes_no_live_calls():
    """A warm cache serves identical tracks with zero live fetches."""
    user_id = await _make_user_id()
    suffix = uuid.uuid4().hex[:8]
    tracks = [
        {"artist": f"Warm Artist {suffix}", "title": f"Warm Song {suffix} {i}"}
        for i in range(3)
    ]
    live = [{**t, **_live_info()} for t in tracks]
    async with _TestSessionLocal() as db:
        with patch(
            "services.enrich_cache.enrich_tracks", return_value=live
        ) as mock_enrich:
            out1, stats1 = await enrich_tracks_cached(
                db, user_id=user_id, username="u", tracks=tracks, max_enrich=10
            )
            assert stats1 == {"hits": 0, "misses": 3, "lastfm_calls": 0}
            out2, stats2 = await enrich_tracks_cached(
                db, user_id=user_id, username="u", tracks=tracks, max_enrich=10
            )
            assert mock_enrich.call_count == 1
    assert stats2["hits"] == 3
    assert stats2["misses"] == 0
    assert stats2["lastfm_calls"] == 0
    assert out2 == out1
    assert out2[0]["listeners"] == 10
    assert out2[0]["album"] == "Cached Album"
    assert out2[0]["artist_tags"] == [{"name": "rock", "count": 100}]
    assert out2[0]["album_tags"] == [{"name": "indie", "count": 90}]
    assert out2[0]["userplaycount"] == 5
    assert [t["title"] for t in out2] == [t["title"] for t in out1]


@pytest.mark.asyncio
async def test_cached_enrich_persists_and_reuses_user_data(client: AsyncClient):
    """userplaycount/userloved round-trip through user_tracks keyed by user."""
    email = _unique_email()
    try:
        reg = await client.post(
            "/api/auth/register",
            json={"email": email, "password": "StrongP@ss1!"},
        )
        assert reg.status_code == 201
        async with _TestSessionLocal() as db:
            user_id = (
                await db.execute(select(User.id).where(User.email == email))
            ).scalar_one()
        suffix = uuid.uuid4().hex[:8]
        tracks = [{"artist": f"User Artist {suffix}", "title": f"User Song {suffix}"}]
        live = [{**tracks[0], **_live_info(userplaycount=77, userloved=False)}]
        async with _TestSessionLocal() as db:
            with patch(
                "services.enrich_cache.enrich_tracks", return_value=live
            ) as mock_enrich:
                out1, _ = await enrich_tracks_cached(
                    db, user_id=user_id, username="u", tracks=tracks, max_enrich=10
                )
                assert out1[0]["userplaycount"] == 77
                assert out1[0]["userloved"] is False
                track_id = (
                    await db.execute(
                        select(Track.id).where(
                            Track.artist == tracks[0]["artist"],
                            Track.title == tracks[0]["title"],
                        )
                    )
                ).scalar_one()
                row = await get_user_track(db, user_id, track_id)
                assert row is not None
                assert row.user_playcount == 77
                assert row.userloved is False
                out2, stats2 = await enrich_tracks_cached(
                    db, user_id=user_id, username="u", tracks=tracks, max_enrich=10
                )
                assert mock_enrich.call_count == 1
        assert stats2["hits"] == 1
        assert out2[0]["userplaycount"] == 77
    finally:
        await _cleanup_user(email=email)


@pytest.mark.asyncio
async def test_pipeline_cached_reports_cache_stats():
    """The cached pipeline returns the sync keys plus cache counters."""
    user_id = await _make_user_id()
    suffix = uuid.uuid4().hex[:8]
    tracks = [{"artist": f"Pipe Artist {suffix}", "title": f"Pipe Song {suffix}"}]
    live = [{**tracks[0], **_live_info()}]
    # Non-empty needs: the full fetch + write-back path (empty needs skip
    # the live layer by design, so warming is pinned here, not on []).
    groups = [{"conditions": [{"field": "userplaycount", "operator": "gt", "value": 1}]}]
    async with _TestSessionLocal() as db:
        with patch(
            "services.automation_runner.get_top_tracks", return_value=tracks
        ), patch("services.enrich_cache.enrich_tracks", return_value=live):
            first = await run_automation_pipeline_cached(
                db,
                user_id=user_id,
                username="u",
                source_type="top_tracks",
                period="3m",
                filter_groups=groups,
                max_tracks=10,
            )
            assert first["total"] == 1
            assert first["cache_misses"] == 1
            second = await run_automation_pipeline_cached(
                db,
                user_id=user_id,
                username="u",
                source_type="top_tracks",
                period="3m",
                filter_groups=groups,
                max_tracks=10,
            )
            assert second["cache_hits"] == 1
            assert second["lastfm_calls"] == 0
            assert second["tracks"] == first["tracks"]


def test_is_rate_limit_error_detects_29_and_chains():
    """Only error 29 counts, directly or wrapped in `raise ... from`."""
    assert lastfm.is_rate_limit_error(lastfm.pylast.WSError(None, "29", "slow down")) is True
    assert lastfm.is_rate_limit_error(lastfm.pylast.WSError(None, "8", "other")) is False
    assert lastfm.is_rate_limit_error(RuntimeError("boom")) is False
    try:
        try:
            raise lastfm.pylast.WSError(None, "29", "slow down")
        except lastfm.pylast.WSError as inner:
            raise lastfm.pylast.PyLastError() from inner
    except lastfm.pylast.PyLastError as chained:
        assert lastfm.is_rate_limit_error(chained) is True


def test_note_possible_rate_limit_arms_backoff_only_on_29():
    """A 29 arms the process-wide backoff; other errors just log."""
    with patch.object(lastfm, "note_rate_limited") as mock_note:
        lastfm._note_possible_rate_limit(lastfm.pylast.WSError(None, "29", "slow down"))
        mock_note.assert_called_once_with()
        lastfm._note_possible_rate_limit(RuntimeError("boom"))
        assert mock_note.call_count == 1


def test_throttled_call_honors_backoff_window():
    """After note_rate_limited, gated calls sleep out the window."""
    with patch.object(lastfm, "LASTFM_MIN_INTERVAL", 0):
        try:
            lastfm.note_rate_limited(0.2)
            start = time.monotonic()
            _throttled_call()
            assert time.monotonic() - start >= 0.15
        finally:
            lastfm._rate_limit_until = 0.0


def test_enrich_29_error_arms_backoff_and_keeps_defaults():
    """A 29 on one getter degrades that field and arms the backoff."""

    class _FlakyTrack:
        def get_listener_count(self):
            raise lastfm.pylast.WSError(None, "29", "Rate limit exceeded")

        def get_playcount(self):
            return 5

        def get_userplaycount(self):
            return 0

        def get_userloved(self):
            return False

        def get_album(self):
            return None

    with (
        patch("services.lastfm.get_network", return_value=object()),
        patch("services.lastfm.pylast.Track", return_value=_FlakyTrack()),
        patch.object(lastfm, "LASTFM_MIN_INTERVAL", 0),
        patch.object(lastfm, "note_rate_limited") as mock_note,
    ):
        try:
            out = get_track_full_info(object(), "u", "A", "T")
        finally:
            lastfm._rate_limit_until = 0.0
    assert out["listeners"] == 0
    assert out["global_playcount"] == 5
    mock_note.assert_called_once_with()
