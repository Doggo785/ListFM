"""P1-8 (8a): throttle gate, call counter, artist-tag persistence, album key.

The live Last.fm layer stays synchronous; these tests never touch the real
API (interval patched to 0, pylast objects faked). DB tests use the throwaway
listfm_test database (autouse truncate in conftest).
"""

import time
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import pytest
from sqlalchemy import update

from models.artist_tag import ArtistTag
from repositories.tags import get_fresh_artist_tags, upsert_artist_tag
from services import lastfm
from services.lastfm import (
    _throttled_call,
    get_lastfm_call_count,
    get_track_full_info,
    reset_lastfm_call_count,
)

from .conftest import _TestSessionLocal


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
async def test_artist_tags_roundtrip_when_fresh():
    """Upserted artist tags read back with weights while fresh."""
    async with _TestSessionLocal() as db:
        await upsert_artist_tag(db, "Some Artist", "rock", 90)
        await upsert_artist_tag(db, "Some Artist", "indie", 40)
        await db.commit()
        tags = await get_fresh_artist_tags(db, "Some Artist")
    assert tags is not None
    assert {t["name"]: t["count"] for t in tags} == {"rock": 90, "indie": 40}


@pytest.mark.asyncio
async def test_artist_tags_missing_or_stale_return_none():
    """Unknown artists and stale rows read as a cache miss (None)."""
    async with _TestSessionLocal() as db:
        assert await get_fresh_artist_tags(db, "Nobody Ever") is None
        await upsert_artist_tag(db, "Stale Artist", "rock", 80)
        await db.execute(
            update(ArtistTag)
            .where(ArtistTag.artist == "Stale Artist")
            .values(fetched_at=datetime.now(timezone.utc) - timedelta(hours=25))
        )
        await db.commit()
        assert await get_fresh_artist_tags(db, "Stale Artist") is None


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
