"""Dashboard recents: always live, stored plays as the Last.fm-down fallback.

The live Last.fm layer is mocked (patch routers.users.get_recent_tracks);
DB rows use the throwaway listfm_test database (autouse truncate).
"""

import time
import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import patch

import pytest
from httpx import AsyncClient
from models.user import User
from models.user_track import UserTrack
from repositories.tracks import get_track_by_artist_title
from repositories.user_tracks import get_user_track, upsert_user_track
from sqlalchemy import select, update

from .conftest import _cleanup_user, _TestSessionLocal, _unique_email


async def _register_login_link(client: AsyncClient, email: str) -> None:
    reg = await client.post(
        "/api/auth/register",
        json={"email": email, "password": "StrongP@ss1!"},
    )
    assert reg.status_code == 201
    client.cookies.clear()
    login = await client.post(
        "/api/auth/login",
        json={"email": email, "password": "StrongP@ss1!"},
    )
    assert login.status_code == 200
    mock_info = {"username": "recents_user", "image": None}
    with patch("routers.auth_oauth.get_user_info", return_value=mock_info):
        link = await client.post(
            "/api/auth/link-lastfm",
            json={"username": "recents_user"},
        )
    assert link.status_code == 200


def _live_tracks(suffix: str, base_epoch: int) -> list[dict]:
    return [
        {"title": f"Recent Song {suffix} A", "artist": f"Recent Artist {suffix}", "timestamp": base_epoch},
        {"title": f"Recent Song {suffix} B", "artist": f"Recent Artist {suffix}", "timestamp": base_epoch - 300},
    ]


@pytest.mark.asyncio
async def test_recents_always_live(client: AsyncClient):
    """Every load asks Last.fm: plays made since the last load show up."""
    email = _unique_email()
    try:
        await _register_login_link(client, email)
        now = int(time.time())
        first_suffix, next_suffix = uuid.uuid4().hex[:8], uuid.uuid4().hex[:8]
        with patch(
            "routers.users.get_recent_tracks", return_value=_live_tracks(first_suffix, now)
        ):
            first = await client.get("/api/recent-tracks?limit=50")
        assert first.status_code == 200
        with patch(
            "routers.users.get_recent_tracks",
            return_value=_live_tracks(next_suffix, now + 60),
        ):
            second = await client.get("/api/recent-tracks?limit=50")
        assert second.status_code == 200
        assert second.json()["tracks"][0]["title"] == f"Recent Song {next_suffix} A"
    finally:
        await _cleanup_user(email=email)


@pytest.mark.asyncio
async def test_recents_fall_back_to_stored_plays_when_lastfm_fails(client: AsyncClient):
    """Last.fm down: serve the stored plays instead of an error."""
    email = _unique_email()
    try:
        await _register_login_link(client, email)
        suffix = uuid.uuid4().hex[:8]
        with patch(
            "routers.users.get_recent_tracks",
            return_value=_live_tracks(suffix, int(time.time())),
        ):
            first = await client.get("/api/recent-tracks?limit=50")
        assert first.status_code == 200
        with patch("routers.users.get_recent_tracks", side_effect=Exception("down")):
            fallback = await client.get("/api/recent-tracks?limit=50")
        assert fallback.status_code == 200
        assert [t["title"] for t in fallback.json()["tracks"]] == [
            f"Recent Song {suffix} A",
            f"Recent Song {suffix} B",
        ]
    finally:
        await _cleanup_user(email=email)


@pytest.mark.asyncio
async def test_recents_store_never_clobbers_user_stats(client: AsyncClient):
    """Recording recent plays leaves playcount/loved/sync state untouched."""
    email = _unique_email()
    try:
        await _register_login_link(client, email)
        suffix = uuid.uuid4().hex[:8]
        now = int(time.time())
        with patch(
            "routers.users.get_recent_tracks", return_value=_live_tracks(suffix, now)
        ):
            resp = await client.get("/api/recent-tracks?limit=50")
            assert resp.status_code == 200
        async with _TestSessionLocal() as db:
            user_id = (
                await db.execute(select(User.id).where(User.email == email))
            ).scalar_one()
            track = await get_track_by_artist_title(
                db, f"Recent Artist {suffix}", f"Recent Song {suffix} A"
            )
            assert track is not None
            # Unstamped core: recents must not mark the track fetched.
            assert track.last_fetched_at is None
            await upsert_user_track(
                db, user_id, track.id, user_playcount=500, userloved=True
            )
            await db.commit()
        async with _TestSessionLocal() as db:
            await db.execute(
                update(UserTrack).values(
                    last_played_at=datetime.now(UTC) - timedelta(hours=25)
                )
            )
            await db.commit()
        with patch(
            "routers.users.get_recent_tracks", return_value=_live_tracks(suffix, now)
        ):
            resp = await client.get("/api/recent-tracks?limit=50")
            assert resp.status_code == 200
        async with _TestSessionLocal() as db:
            row = await get_user_track(db, user_id, track.id)
            assert row.user_playcount == 500
            assert row.userloved is True
    finally:
        await _cleanup_user(email=email)
