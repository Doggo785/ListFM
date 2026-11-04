"""Outbound throttle, rate-limit backoff and artist-tag persistence."""

import time
import uuid
from unittest.mock import patch

import pytest
from models.user import User
from repositories.tags import get_artist_tags, upsert_artist_tag
from services import lastfm
from services.lastfm import _throttled_call

from .conftest import _TestSessionLocal


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
async def test_artist_tags_roundtrip():
    """Upserted artist tags read back with weights."""
    async with _TestSessionLocal() as db:
        await upsert_artist_tag(db, "Some Artist", "rock", 90)
        await upsert_artist_tag(db, "Some Artist", "indie", 40)
        await db.commit()
        tags = await get_artist_tags(db, "Some Artist")
    assert {t["name"]: t["count"] for t in tags} == {"rock": 90, "indie": 40}




class _FakeTags:
    def __init__(self, tags):
        self._tags = tags

    def get_top_tags(self, limit=None):
        return self._tags


class _FakeNetwork:
    def get_artist(self, name):
        return _FakeTags([])

    def get_album(self, artist, title):
        return _FakeTags([])










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






class _FakeResponse:
    def __init__(self, status_code, payload):
        self.status_code = status_code
        self._payload = payload

    def json(self):
        return self._payload

    def raise_for_status(self):
        if self.status_code >= 400:
            raise lastfm.httpx.HTTPStatusError("bad", request=None, response=None)






