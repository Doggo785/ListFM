"""The Settings page's account routes: Last.fm authorization, password, deletion."""

from datetime import UTC, datetime
from hashlib import md5
from unittest.mock import patch
from urllib.parse import parse_qs, urlparse

import pytest
from config import get_settings
from httpx import AsyncClient
from models.auth_provider import AuthProvider
from models.automation import Automation
from models.automation_history import AutomationHistory
from models.generated_playlist import GeneratedPlaylist
from models.playlist_track import PlaylistTrack
from models.refresh_token import RefreshToken
from models.scrobble import Scrobble
from models.track import Track
from models.user import User
from models.user_track import UserTrack
from repositories.scrobbles import store_scrobbles
from services import scrobble_sync
from services.lastfm import get_session_username
from sqlalchemy import func, select

from .conftest import (
    _register_and_login,
    _TestSessionLocal,
    _unique_email,
    link_lastfm,
    mailed_token,
)

PASSWORD = "StrongP@ss1!"  # What _register_and_login uses.


@pytest.mark.asyncio
async def test_authorize_sends_the_browser_to_last_fm_and_back_with_a_state(client: AsyncClient):
    await _register_and_login(client, _unique_email())
    url = urlparse((await client.get("/api/auth/lastfm/authorize")).json()["url"])
    query = parse_qs(url.query)
    assert url.netloc == "www.last.fm"
    assert query["api_key"] == [get_settings().lastfm_api_key]
    back = urlparse(query["cb"][0])
    assert back.path == "/auth/lastfm"
    assert parse_qs(back.query)["state"][0] == client.cookies["oauth_state"]


@pytest.mark.asyncio
async def test_a_link_nobody_asked_for_changes_nothing(client: AsyncClient):
    await _register_and_login(client, _unique_email())
    await link_lastfm(client, "mine")
    await client.get("/api/auth/lastfm/authorize")
    with patch("routers.auth_oauth.get_session_username", return_value="attacker") as exchange:
        resp = await client.post("/api/auth/lastfm/link", json={"token": "t", "state": "forged"})
    assert resp.status_code == 400
    exchange.assert_not_called()
    assert (await client.get("/api/auth/me")).json()["lastfm_username"] == "mine"


def test_session_exchange_is_signed_and_keeps_only_the_name():
    settings = get_settings()
    with patch("services.lastfm._lastfm_json", return_value={"session": {"name": "Me", "key": "secret"}}) as call:
        assert get_session_username("tok") == "Me"
    payload = f"api_key{settings.lastfm_api_key}methodauth.getSessiontokentok{settings.lastfm_api_secret}"
    call.assert_called_once_with("auth.getSession", token="tok", api_sig=md5(payload.encode()).hexdigest())


@pytest.mark.asyncio
async def test_changing_password_signs_out_other_devices_only(client: AsyncClient):
    email = _unique_email()
    await _register_and_login(client, email)
    stale_refresh = client.cookies["refresh_token"]
    assert (await client.get("/api/auth/me")).json()["has_password"] is True

    wrong = await client.put("/api/auth/me/password", json={"current_password": "nope", "password": "AnotherP@ss2"})
    assert wrong.status_code == 400
    short = await client.put("/api/auth/me/password", json={"current_password": PASSWORD, "password": "short"})
    assert short.status_code == 422

    done = await client.put("/api/auth/me/password", json={"current_password": PASSWORD, "password": "AnotherP@ss2"})
    assert done.status_code == 200
    assert client.cookies["refresh_token"] != stale_refresh
    assert (await client.get("/api/auth/me")).status_code == 200

    other_device = await client.post("/api/auth/refresh", cookies={"refresh_token": stale_refresh})
    assert other_device.status_code == 401
    client.cookies.clear()
    assert (await client.post("/api/auth/login", json={"email": email, "password": PASSWORD})).status_code == 401
    assert (await client.post("/api/auth/login", json={"email": email, "password": "AnotherP@ss2"})).status_code == 200


@pytest.mark.asyncio
async def test_an_account_with_no_password_cannot_change_one(client: AsyncClient):
    await _register_and_login(client, _unique_email())
    async with _TestSessionLocal() as db:
        user = (await db.execute(select(User))).scalars().one()
        user.password_hash = None
        await db.commit()
    assert (await client.get("/api/auth/me")).json()["has_password"] is False
    resp = await client.put("/api/auth/me/password", json={"current_password": "x", "password": "AnotherP@ss2"})
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_deleting_needs_the_email_typed_back(client: AsyncClient):
    await _register_and_login(client, _unique_email())
    resp = await client.post("/api/auth/me/delete", json={"confirm": "someone@else.com"})
    assert resp.status_code == 400
    assert (await client.get("/api/auth/me")).status_code == 200


@pytest.mark.asyncio
async def test_deleting_erases_listens_frees_the_email_and_stops_runs(client: AsyncClient):
    email = _unique_email()
    await _register_and_login(client, email)
    await link_lastfm(client, "leaving")
    async with _TestSessionLocal() as db:
        user_id = (await db.execute(select(User.id))).scalars().one()
        await store_scrobbles(db, user_id, [("A", "X", datetime(2026, 1, 1, tzinfo=UTC))])
        db.add(Automation(id="a1", user_id=user_id, lastfm_username="leaving", name="One", window={"length": {"amount": 3, "unit": "month"}}, sort="random"))
        await db.flush()
        now = datetime.now(UTC)
        db.add(GeneratedPlaylist(id="p1", user_id=user_id, automation_id="a1", lastfm_username="leaving", name="One", track_count=1, generated_at=now))
        await db.flush()
        track_id = await db.scalar(select(Track.id))
        db.add(PlaylistTrack(playlist_id="p1", track_id=track_id, position=1))
        db.add(AutomationHistory(id="h1", automation_id="a1", generated_playlist_id="p1", status="completed", scheduled_for=now, started_at=now))
        await db.commit()

    scrobble_sync._running[user_id] = "leaving"
    try:
        resp = await client.post("/api/auth/me/delete", json={"confirm": email.upper()})
        assert resp.status_code == 200
        with pytest.raises(scrobble_sync.SyncSuperseded):
            scrobble_sync._check_current(user_id, "leaving")
    finally:
        scrobble_sync._running.pop(user_id, None)

    async with _TestSessionLocal() as db:
        for model in (Scrobble, UserTrack):
            assert await db.scalar(select(func.count()).select_from(model).where(model.user_id == user_id)) == 0
        assert await db.scalar(select(func.count()).select_from(AuthProvider).where(AuthProvider.user_id == user_id)) == 0
        for model in (Automation, GeneratedPlaylist, RefreshToken):
            assert await db.scalar(select(func.count()).select_from(model).where(model.user_id == user_id)) == 0
        assert await db.get(AutomationHistory, "h1") is None
        assert await db.scalar(select(func.count()).select_from(PlaylistTrack).where(PlaylistTrack.playlist_id == "p1")) == 0
        user = await db.get(User, user_id)
        assert user.deleted_at is not None
        assert (user.email, user.password_hash, user.display_name, user.timezone) == (None, None, None, None)

    assert (await client.get("/api/auth/me")).status_code == 401
    client.cookies.clear()
    again = await client.post("/api/auth/register", json={"email": email, "password": PASSWORD})
    assert again.status_code == 201
    assert (await client.post("/api/auth/confirm", json={"token": mailed_token(email)})).status_code == 200
    assert (await link_lastfm(client, "leaving")).status_code == 200


@pytest.mark.asyncio
async def test_an_account_with_no_email_confirms_with_a_word(client: AsyncClient):
    await _register_and_login(client, _unique_email())
    async with _TestSessionLocal() as db:
        user = (await db.execute(select(User))).scalars().one()
        user.email = None
        await db.commit()
    assert (await client.post("/api/auth/me/delete", json={"confirm": "delete"})).status_code == 200


@pytest.mark.asyncio
async def test_the_guide_is_remembered_on_the_account(client: AsyncClient):
    await _register_and_login(client, _unique_email())
    assert (await client.get("/api/auth/me")).json()["guide_done_at"] is None
    done = await client.put("/api/auth/me/guide", json={"done": True})
    assert done.status_code == 200
    assert (await client.get("/api/auth/me")).json()["guide_done_at"] == done.json()["guide_done_at"] is not None
    # Asked for again from the settings: it may start by itself once more.
    await client.put("/api/auth/me/guide", json={"done": False})
    assert (await client.get("/api/auth/me")).json()["guide_done_at"] is None
