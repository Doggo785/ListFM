"""P1-8 (8d): dashboard recents served from cache with TTL gating.

The live Last.fm layer is mocked (patch routers.users.get_recent_tracks);
DB rows use the throwaway listfm_test database (autouse truncate).
"""

import time
import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import pytest
from httpx import AsyncClient
from sqlalchemy import select, update

from models.user import User
from models.user_track import UserTrack
from repositories.user_tracks import get_user_track, upsert_user_track
from repositories.tracks import get_track_by_artist_title

from .conftest import _TestSessionLocal, _cleanup_user, _unique_email


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
async def test_recents_live_then_served_from_db(client: AsyncClient):
    """First load fetches live and stores; second load serves from DB."""
    email = _unique_email()
    try:
        await _register_login_link(client, email)
        suffix = uuid.uuid4().hex[:8]
        now = int(time.time())
        with patch(
            "routers.users.get_recent_tracks", return_value=_live_tracks(suffix, now)
        ) as mock_live:
            first = await client.get("/api/recent-tracks?limit=50")
            assert first.status_code == 200
            assert [(t["title"], t["artist"]) for t in first.json()["tracks"]] == [
                (f"Recent Song {suffix} A", f"Recent Artist {suffix}"),
                (f"Recent Song {suffix} B", f"Recent Artist {suffix}"),
            ]
            mock_live.side_effect = Exception("must not be called")
            second = await client.get("/api/recent-tracks?limit=50")
            assert second.status_code == 200
            assert second.json() == first.json()
    finally:
        await _cleanup_user(email=email)


@pytest.mark.asyncio
async def test_recents_stale_refetches_live(client: AsyncClient):
    """Stored plays older than the TTL trigger a live refetch."""
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
            await db.execute(
                update(UserTrack).values(
                    last_played_at=datetime.now(timezone.utc) - timedelta(hours=25)
                )
            )
            await db.commit()
        fresh_suffix = uuid.uuid4().hex[:8]
        with patch(
            "routers.users.get_recent_tracks",
            return_value=_live_tracks(fresh_suffix, now),
        ) as mock_live:
            resp = await client.get("/api/recent-tracks?limit=50")
            assert resp.status_code == 200
            assert mock_live.call_count == 1
            assert resp.json()["tracks"][0]["title"] == f"Recent Song {fresh_suffix} A"
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
                    last_played_at=datetime.now(timezone.utc) - timedelta(hours=25)
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
