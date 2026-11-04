"""Listening history sync (ADR 0001): full load, incremental, fallback, loved, relink."""

import asyncio
import math
import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import patch

import pylast
import pytest
from httpx import AsyncClient
from models.scrobble import Scrobble
from models.track import Track
from models.user import User
from models.user_track import UserTrack
from services import scrobble_sync
from sqlalchemy import func, select

from .conftest import _register_and_login, _TestSessionLocal, _unique_email


class FakeLastfm:
    """Recent tracks paged newest first like Last.fm, plus a loved list."""

    def __init__(self, listens, loved=(), fail_page_size=None):
        self.listens = sorted(listens, key=lambda listen: -listen[2])
        self.loved = list(loved)
        self.fail_page_size = fail_page_size
        self.calls = []

    def scrobble_page(self, username, page, limit, time_from, time_to):
        self.calls.append((page, limit, time_from))
        if limit == self.fail_page_size:
            raise pylast.WSError(None, "8", "Operation failed")
        window = [
            listen for listen in self.listens
            if (time_from is None or listen[2] >= time_from) and listen[2] <= time_to
        ]
        return window[(page - 1) * limit : page * limit], math.ceil(len(window) / limit)

    def loved_page(self, username, page, limit):
        return self.loved[(page - 1) * limit : page * limit], max(1, math.ceil(len(self.loved) / limit))


def _listen(n, title=None):
    return (title or f"Song {n}", "Artist", 1_700_000_000 + n * 60)


async def _new_user():
    user = User(id=str(uuid.uuid4()), email=_unique_email())
    async with _TestSessionLocal() as db:
        db.add(user)
        await db.commit()
    return user.id


async def _sync(user_id, fake, page_size=None):
    with (
        patch.object(scrobble_sync, "get_scrobble_page", fake.scrobble_page),
        patch.object(scrobble_sync, "get_loved_page", fake.loved_page),
        patch.object(scrobble_sync, "PAGE_SIZE", page_size or scrobble_sync.PAGE_SIZE),
    ):
        async with _TestSessionLocal() as db:
            await scrobble_sync.sync_scrobbles(db, user_id, "someone")


async def _count(user_id):
    async with _TestSessionLocal() as db:
        return (
            await db.execute(select(func.count()).select_from(Scrobble).where(Scrobble.user_id == user_id))
        ).scalar_one()


@pytest.mark.asyncio
async def test_full_then_incremental_sync():
    user_id = await _new_user()
    fake = FakeLastfm([_listen(n) for n in range(5)])
    await _sync(user_id, fake, page_size=2)
    assert await _count(user_id) == 5
    # Oldest page first, so an interruption resumes after the newest stored listen.
    assert [page for page, _, _ in fake.calls] == [1, 3, 2, 1]

    async with _TestSessionLocal() as db:
        user = await db.get(User, user_id)
        assert user.scrobbles_complete_at is not None
        first_complete = user.scrobbles_complete_at

    fake.listens = sorted(fake.listens + [_listen(10), _listen(11)], key=lambda listen: -listen[2])
    fake.calls.clear()
    await _sync(user_id, fake, page_size=2)
    assert await _count(user_id) == 7
    assert fake.calls[0][2] == _listen(4)[2] + 1
    async with _TestSessionLocal() as db:
        user = await db.get(User, user_id)
        assert user.scrobbles_complete_at == first_complete


@pytest.mark.asyncio
async def test_same_track_played_twice_is_two_listens():
    user_id = await _new_user()
    await _sync(user_id, FakeLastfm([_listen(1, "Same"), _listen(2, "Same")]))
    assert await _count(user_id) == 2
    async with _TestSessionLocal() as db:
        tracks = (await db.execute(select(func.count()).select_from(Track).where(Track.title == "Same"))).scalar_one()
    assert tracks == 1


@pytest.mark.asyncio
async def test_large_pages_fall_back_to_documented_size():
    user_id = await _new_user()
    fake = FakeLastfm([_listen(n) for n in range(3)], fail_page_size=scrobble_sync.PAGE_SIZE)
    await _sync(user_id, fake)
    assert await _count(user_id) == 3
    assert fake.calls[-1][1] == scrobble_sync.FALLBACK_PAGE_SIZE


@pytest.mark.asyncio
async def test_loved_flags_follow_the_full_loved_list():
    user_id = await _new_user()
    await _sync(user_id, FakeLastfm([_listen(1), _listen(2)], loved=[("Song 1", "Artist"), ("Never played", "Artist")]))
    await _sync(user_id, FakeLastfm([], loved=[("Song 2", "Artist")]))
    async with _TestSessionLocal() as db:
        rows = await db.execute(
            select(Track.title, UserTrack.userloved)
            .join(Track, Track.id == UserTrack.track_id)
            .where(UserTrack.user_id == user_id)
        )
        loved = dict(rows.all())
    assert loved == {"Song 1": False, "Song 2": True, "Never played": False}


@pytest.mark.asyncio
async def test_sync_superseded_by_relink_writes_nothing():
    user_id = await _new_user()
    scrobble_sync._running[user_id] = "another-account"
    try:
        with pytest.raises(scrobble_sync.SyncSuperseded):
            await _sync(user_id, FakeLastfm([_listen(1)]))
    finally:
        scrobble_sync._running.pop(user_id, None)
    assert await _count(user_id) == 0


@pytest.mark.asyncio
async def test_link_starts_sync_and_relink_drops_history(client: AsyncClient, _no_background_sync):
    await _register_and_login(client, _unique_email())
    info = {"username": "first", "image": None}
    with patch("routers.auth_oauth.get_user_info", return_value=info):
        assert (await client.post("/api/auth/link-lastfm", json={"username": "first"})).status_code == 200
    user_id, username = _no_background_sync.call_args.args
    assert username == "first"
    await _sync(user_id, FakeLastfm([_listen(1)]))
    assert await _count(user_id) == 1

    with patch("routers.auth_oauth.get_user_info", return_value=info):
        assert (await client.post("/api/auth/link-lastfm", json={"username": "second"})).status_code == 200
    assert _no_background_sync.call_args.args == (user_id, "second")
    assert await _count(user_id) == 0
    async with _TestSessionLocal() as db:
        user = await db.get(User, user_id)
        assert user.scrobbles_complete_at is None


@pytest.mark.asyncio
async def test_sync_endpoint_skips_a_fresh_history(client: AsyncClient):
    await _register_and_login(client, _unique_email())
    with patch("routers.auth_oauth.get_user_info", return_value={"username": "me", "image": None}):
        await client.post("/api/auth/link-lastfm", json={"username": "me"})

    with patch("routers.users.start_scrobble_sync") as start:
        resp = await client.post("/api/scrobbles/sync")
        assert resp.status_code == 202
        assert resp.json()["complete"] is False
        assert start.call_count == 1

        async with _TestSessionLocal() as db:
            user = (await db.execute(select(User))).scalars().one()
            user.scrobbles_synced_at = datetime.now(UTC) - timedelta(minutes=1)
            await db.commit()
        await client.post("/api/scrobbles/sync")
        assert start.call_count == 1


def test_scrobble_page_parsing_skips_now_playing():
    from services import lastfm

    payload = {
        "recenttracks": {
            "@attr": {"totalPages": "4"},
            "track": [
                {"name": "Live", "artist": {"#text": "A"}, "@attr": {"nowplaying": "true"}},
                {"name": "Done", "artist": {"#text": "A"}, "date": {"uts": "1700000000"}},
            ],
        }
    }
    with (
        patch.object(lastfm, "LASTFM_MIN_INTERVAL", 0),
        patch.object(lastfm, "_lastfm_json", return_value=payload) as call,
    ):
        listens, pages = lastfm.get_scrobble_page("me", 2, 1000, 5, 10)
    assert listens == [("Done", "A", 1700000000)]
    assert pages == 4
    assert call.call_args.kwargs == {"user": "me", "page": "2", "limit": "1000", "to": "10", "from": "5"}


def test_loved_page_parsing_accepts_a_single_object():
    from services import lastfm

    payload = {"lovedtracks": {"@attr": {"totalPages": "1"}, "track": {"name": "One", "artist": {"name": "B"}}}}
    with (
        patch.object(lastfm, "LASTFM_MIN_INTERVAL", 0),
        patch.object(lastfm, "_lastfm_json", return_value=payload),
    ):
        assert lastfm.get_loved_page("me", 1, 1000) == ([("One", "B")], 1)


@pytest.mark.asyncio
async def test_sync_status_reports_progress(client: AsyncClient):
    await _register_and_login(client, _unique_email())
    resp = await client.get("/api/scrobbles/sync")
    assert resp.status_code == 200
    assert resp.json() == {
        "stage": None, "done": 0, "total": 0, "error": None, "complete": False, "synced_at": None,
    }


async def _run_in_background(user_id, fake):
    with (
        patch.object(scrobble_sync, "get_scrobble_page", fake.scrobble_page),
        patch.object(scrobble_sync, "get_loved_page", fake.loved_page),
        patch.object(scrobble_sync, "async_session", _TestSessionLocal),
    ):
        assert scrobble_sync.start_scrobble_sync(user_id, "someone") is True
        assert scrobble_sync.start_scrobble_sync(user_id, "someone") is False
        await asyncio.gather(*scrobble_sync._background_tasks)
    assert user_id not in scrobble_sync._running
    return scrobble_sync.progress_store.read(scrobble_sync.progress_key(user_id))


@pytest.mark.asyncio
async def test_background_sync_reports_done():
    user_id = await _new_user()
    progress = await _run_in_background(user_id, FakeLastfm([_listen(1), _listen(2)]))
    assert (progress.stage, progress.done, progress.total) == ("done", 1, 1)
    assert await _count(user_id) == 2


@pytest.mark.asyncio
async def test_background_sync_failure_is_generic():
    user_id = await _new_user()
    fake = FakeLastfm([_listen(1)])
    fake.fail_page_size = scrobble_sync.FALLBACK_PAGE_SIZE
    with patch.object(scrobble_sync, "PAGE_SIZE", scrobble_sync.FALLBACK_PAGE_SIZE):
        progress = await _run_in_background(user_id, fake)
    assert progress.stage == "error"
    assert "Operation failed" not in progress.error


@pytest.mark.asyncio
async def test_rate_limited_page_is_retried():
    user_id = await _new_user()
    fake = FakeLastfm([_listen(1)])
    real_page = fake.scrobble_page
    failures = iter([pylast.WSError(None, "29", "Rate limit exceeded")])

    def flaky(*args):
        error = next(failures, None)
        if error:
            raise error
        return real_page(*args)

    fake.scrobble_page = flaky
    with patch("services.lastfm.note_rate_limited") as backoff:
        await _sync(user_id, fake)
    assert backoff.call_count == 1
    assert await _count(user_id) == 1
