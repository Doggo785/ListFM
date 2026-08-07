"""Tests for OAuth redirect endpoints and /api/auth/link-lastfm."""

import uuid
from datetime import datetime, timezone
from unittest.mock import patch

import pylast
import pytest
from httpx import AsyncClient
from httpx_oauth.clients.discord import DiscordOAuth2
from httpx_oauth.clients.google import GoogleOAuth2

from sqlalchemy import select

from models.auth_provider import AuthProvider
from models.user import User

from config import Settings
from .conftest import _TestSessionLocal, _cleanup_user, _get_user_id_from_cookies, _unique_email


# ---------------------------------------------------------------------------
# Helper: register + login to get cookies
# ---------------------------------------------------------------------------
async def _register_and_login(client: AsyncClient, email: str, password: str = "StrongP@ss1!"):
    """Register a new user and log in. Returns the login response."""
    reg = await client.post(
        "/api/auth/register",
        json={"email": email, "password": password},
    )
    assert reg.status_code == 201
    client.cookies.clear()
    resp = await client.post(
        "/api/auth/login",
        json={"email": email, "password": password},
    )
    assert resp.status_code == 200
    return resp


# ===========================================================================
# OAuth key validation tests
# ===========================================================================


@pytest.mark.asyncio
async def test_google_login_no_keys(client: AsyncClient):
    """GET /api/auth/google/login without configured keys returns 400."""
    with patch("routers.auth_oauth.get_settings") as mock_get_settings:
        mock_get_settings.return_value = Settings(
            lastfm_api_key="test",
            lastfm_api_secret="test",
            jwt_secret="a" * 32,
            google_oauth_client_id="",
            google_oauth_client_secret="",
        )
        resp = await client.get("/api/auth/google/login")
    assert resp.status_code == 400
    assert resp.json()["detail"] == "google OAuth is not configured"


@pytest.mark.asyncio
async def test_discord_login_no_keys(client: AsyncClient):
    """GET /api/auth/discord/login without configured keys returns 400."""
    with patch("routers.auth_oauth.get_settings") as mock_get_settings:
        mock_get_settings.return_value = Settings(
            lastfm_api_key="test",
            lastfm_api_secret="test",
            jwt_secret="a" * 32,
            discord_oauth_client_id="",
            discord_oauth_client_secret="",
        )
        resp = await client.get("/api/auth/discord/login")
    assert resp.status_code == 400
    assert resp.json()["detail"] == "discord OAuth is not configured"


# ===========================================================================
# OAuth callback tests (mocked httpx-oauth)
# ===========================================================================


class _MockGoogleResponse:
    def __init__(self, status_code: int, json_data: dict):
        self.status_code = status_code
        self._json_data = json_data

    def json(self):
        return self._json_data


@pytest.mark.asyncio
async def test_google_callback_new_user(client: AsyncClient):
    """Google callback for a new user redirects to /link-lastfm."""
    email = _unique_email()
    try:
        with (
            patch.object(
                GoogleOAuth2,
                "get_access_token",
                return_value={"access_token": "fake_token"},
            ),
            patch("routers.auth_oauth.httpx.AsyncClient") as mock_httpx,
        ):
            mock_resp = _MockGoogleResponse(200, {
                "id": "google_12345",
                "email": email,
                "name": "Test User",
            })
            mock_httpx.return_value.__aenter__.return_value.get.return_value = mock_resp
            resp = await client.get(
                "/api/auth/google/callback?code=fakecode&state=fakestate",
                cookies={"oauth_state": "fakestate"},
            )
        assert resp.status_code == 302
        assert "/link-lastfm" in resp.headers["location"]
    finally:
        await _cleanup_user(email=email)


@pytest.mark.asyncio
async def test_google_callback_returning_user(client: AsyncClient):
    """Google callback for an existing user redirects to /dashboard."""
    email = _unique_email()
    try:
        await _register_and_login(client, email)

        with (
            patch.object(
                GoogleOAuth2,
                "get_access_token",
                return_value={"access_token": "fake_token"},
            ),
            patch("routers.auth_oauth.httpx.AsyncClient") as mock_httpx,
        ):
            mock_resp = _MockGoogleResponse(200, {
                "id": "google_12345",
                "email": email,
                "name": "Test User",
                "verified_email": True,
            })
            mock_httpx.return_value.__aenter__.return_value.get.return_value = mock_resp
            resp = await client.get(
                "/api/auth/google/callback?code=fakecode&state=fakestate",
                cookies={"oauth_state": "fakestate"},
            )
        assert resp.status_code == 302
        assert "/dashboard" in resp.headers["location"]
    finally:
        await _cleanup_user(email=email)


@pytest.mark.asyncio
async def test_discord_callback_no_email(client: AsyncClient):
    """Discord callback without email redirects to needs_email=1."""
    with (
        patch.object(
            DiscordOAuth2,
            "get_access_token",
            return_value={"access_token": "fake_token"},
        ),
        patch.object(
            DiscordOAuth2,
            "get_profile",
            return_value={
                "id": "discord_12345",
                "username": "discord_user",
                "email": None,
            },
        ),
    ):
        resp = await client.get(
            "/api/auth/discord/callback?code=fakecode&state=fakestate",
            cookies={"oauth_state": "fakestate"},
        )
    assert resp.status_code == 302
    assert "needs_email=1" in resp.headers["location"]


@pytest.mark.asyncio
async def test_discord_callback_new_user(client: AsyncClient):
    """Discord callback with email for a new user redirects to /link-lastfm."""
    email = _unique_email()
    try:
        with (
            patch.object(
                DiscordOAuth2,
                "get_access_token",
                return_value={"access_token": "fake_token"},
            ),
            patch.object(
                DiscordOAuth2,
                "get_profile",
                return_value={
                    "id": "discord_12345",
                    "username": "discord_user",
                    "email": email,
                },
            ),
        ):
            resp = await client.get(
                "/api/auth/discord/callback?code=fakecode&state=fakestate",
                cookies={"oauth_state": "fakestate"},
            )
        assert resp.status_code == 302
        assert "/link-lastfm" in resp.headers["location"]
    finally:
        await _cleanup_user(email=email)


@pytest.mark.asyncio
async def test_discord_callback_returning_user(client: AsyncClient):
    """Discord callback with email for an existing user redirects to /dashboard."""
    email = _unique_email()
    try:
        await _register_and_login(client, email)

        with (
            patch.object(
                DiscordOAuth2,
                "get_access_token",
                return_value={"access_token": "fake_token"},
            ),
            patch.object(
                DiscordOAuth2,
                "get_profile",
                return_value={
                    "id": "discord_12345",
                    "username": "discord_user",
                    "email": email,
                    "verified": True,
                },
            ),
        ):
            resp = await client.get(
                "/api/auth/discord/callback?code=fakecode&state=fakestate",
                cookies={"oauth_state": "fakestate"},
            )
        assert resp.status_code == 302
        assert "/dashboard" in resp.headers["location"]
    finally:
        await _cleanup_user(email=email)


@pytest.mark.asyncio
async def test_discord_callback_returning_user_no_email_from_discord(client: AsyncClient):
    """Discord returning user with no email from Discord redirects to /dashboard (not needs_email)."""
    email = _unique_email()
    try:
        await _register_and_login(client, email)
        user_id = _get_user_id_from_cookies(client)

        # Pre-link a Discord AuthProvider to simulate a returning user who already has an email in DB
        async with _TestSessionLocal() as db:
            provider = AuthProvider(
                id=str(uuid.uuid4()),
                user_id=user_id,
                provider="discord",
                provider_user_id="discord_returning_123",
                linked_at=datetime.now(timezone.utc),
            )
            db.add(provider)
            await db.commit()

        with (
            patch.object(
                DiscordOAuth2,
                "get_access_token",
                return_value={"access_token": "fake_token"},
            ),
            patch.object(
                DiscordOAuth2,
                "get_profile",
                return_value={
                    "id": "discord_returning_123",
                    "username": "returning_user",
                    "email": None,
                },
            ),
        ):
            resp = await client.get(
                "/api/auth/discord/callback?code=fakecode&state=fakestate",
                cookies={"oauth_state": "fakestate"},
            )
        assert resp.status_code == 302
        assert "/dashboard" in resp.headers["location"]
    finally:
        await _cleanup_user(email=email)


# ===========================================================================
# email_verified propagation (account-takeover protection)
# ===========================================================================


@pytest.mark.asyncio
async def test_google_callback_existing_user_unverified_email_blocked(client: AsyncClient):
    """Google callback claiming an existing user's email with verified_email=False returns 409 and does not bind."""
    email = _unique_email()
    try:
        await _register_and_login(client, email)

        with (
            patch.object(
                GoogleOAuth2,
                "get_access_token",
                return_value={"access_token": "fake_token"},
            ),
            patch("routers.auth_oauth.httpx.AsyncClient") as mock_httpx,
        ):
            mock_resp = _MockGoogleResponse(200, {
                "id": "google_attacker_123",
                "email": email,
                "name": "Attacker",
                "verified_email": False,
            })
            mock_httpx.return_value.__aenter__.return_value.get.return_value = mock_resp
            resp = await client.get(
                "/api/auth/google/callback?code=fakecode&state=fakestate",
                cookies={"oauth_state": "fakestate"},
            )

        assert resp.status_code == 409
        assert resp.json()["detail"] == "An account with this email already exists"
        assert "access_token" not in resp.cookies

        # No takeover: the attacker's provider id must NOT be bound to the victim's account.
        async with _TestSessionLocal() as db:
            result = await db.execute(
                select(AuthProvider).where(
                    AuthProvider.provider == "google",
                    AuthProvider.provider_user_id == "google_attacker_123",
                )
            )
            assert result.scalar_one_or_none() is None
    finally:
        await _cleanup_user(email=email)


@pytest.mark.asyncio
async def test_discord_callback_existing_user_unverified_email_blocked(client: AsyncClient):
    """Discord callback claiming an existing user's email with verified=False returns 409 and does not bind."""
    email = _unique_email()
    try:
        await _register_and_login(client, email)

        with (
            patch.object(
                DiscordOAuth2,
                "get_access_token",
                return_value={"access_token": "fake_token"},
            ),
            patch.object(
                DiscordOAuth2,
                "get_profile",
                return_value={
                    "id": "discord_attacker_123",
                    "username": "attacker",
                    "email": email,
                    "verified": False,
                },
            ),
        ):
            resp = await client.get(
                "/api/auth/discord/callback?code=fakecode&state=fakestate",
                cookies={"oauth_state": "fakestate"},
            )

        assert resp.status_code == 409
        assert resp.json()["detail"] == "An account with this email already exists"
        assert "access_token" not in resp.cookies

        # No takeover: the attacker's provider id must NOT be bound to the victim's account.
        async with _TestSessionLocal() as db:
            result = await db.execute(
                select(AuthProvider).where(
                    AuthProvider.provider == "discord",
                    AuthProvider.provider_user_id == "discord_attacker_123",
                )
            )
            assert result.scalar_one_or_none() is None
    finally:
        await _cleanup_user(email=email)


@pytest.mark.asyncio
async def test_google_callback_new_user_verified_email_persisted(client: AsyncClient):
    """Google callback with verified_email=True persists email_verified=True on the new user."""
    email = _unique_email()
    try:
        with (
            patch.object(
                GoogleOAuth2,
                "get_access_token",
                return_value={"access_token": "fake_token"},
            ),
            patch("routers.auth_oauth.httpx.AsyncClient") as mock_httpx,
        ):
            mock_resp = _MockGoogleResponse(200, {
                "id": "google_12345",
                "email": email,
                "name": "Test User",
                "verified_email": True,
            })
            mock_httpx.return_value.__aenter__.return_value.get.return_value = mock_resp
            resp = await client.get(
                "/api/auth/google/callback?code=fakecode&state=fakestate",
                cookies={"oauth_state": "fakestate"},
            )
        assert resp.status_code == 302
        assert "/link-lastfm" in resp.headers["location"]

        async with _TestSessionLocal() as db:
            result = await db.execute(select(User).where(User.email == email))
            user = result.scalar_one_or_none()
            assert user is not None
            assert user.email_verified is True
    finally:
        await _cleanup_user(email=email)


# ===========================================================================
# OAuth callback error cases
# ===========================================================================


@pytest.mark.asyncio
async def test_google_callback_missing_code(client: AsyncClient):
    """Google callback without code returns 400."""
    resp = await client.get("/api/auth/google/callback")
    assert resp.status_code == 400
    assert resp.json()["detail"] == "Missing authorization code"


@pytest.mark.asyncio
async def test_google_callback_invalid_state(client: AsyncClient):
    """Google callback with wrong state returns 403."""
    resp = await client.get(
        "/api/auth/google/callback?code=xxx&state=wrong",
        cookies={"oauth_state": "expected_state"},
    )
    assert resp.status_code == 403
    assert "Invalid or expired OAuth state" in resp.json()["detail"]


# ===========================================================================
# /api/auth/oauth/complete-email tests
# ===========================================================================


@pytest.mark.asyncio
async def test_complete_email_success(client: AsyncClient):
    """POST /api/auth/oauth/complete-email updates user email."""
    email = _unique_email()
    try:
        await _register_and_login(client, email)

        user_id = _get_user_id_from_cookies(client)
        async with _TestSessionLocal() as db:
            result = await db.execute(select(User).where(User.id == user_id))
            user = result.scalar_one()
            user.email = None
            await db.commit()

        new_email = _unique_email()
        resp = await client.post(
            "/api/auth/oauth/complete-email",
            json={"email": new_email},
        )
        assert resp.status_code == 200
        assert resp.json()["detail"] == "Email updated"

        me_resp = await client.get("/api/auth/me")
        assert me_resp.status_code == 200
        assert me_resp.json()["email"] == new_email
    finally:
        await _cleanup_user(email=email)
        await _cleanup_user(email=new_email)


@pytest.mark.asyncio
async def test_complete_email_duplicate(client: AsyncClient):
    """POST /api/auth/oauth/complete-email with taken email returns 409."""
    email1 = _unique_email()
    email2 = _unique_email()
    try:
        await _register_and_login(client, email1)
        user1_id = _get_user_id_from_cookies(client)

        await _register_and_login(client, email2)
        user2_id = _get_user_id_from_cookies(client)

        # Clear user2's email in DB (simulate Discord user without email)
        async with _TestSessionLocal() as db:
            result = await db.execute(select(User).where(User.id == user2_id))
            user2 = result.scalar_one()
            user2.email = None
            await db.commit()

        resp = await client.post(
            "/api/auth/oauth/complete-email",
            json={"email": email1},
        )
        assert resp.status_code == 409
        assert "already exists" in resp.json()["detail"]
    finally:
        await _cleanup_user(email=email1)


@pytest.mark.asyncio
async def test_complete_email_no_auth(client: AsyncClient):
    """POST /api/auth/oauth/complete-email without auth returns 401."""
    resp = await client.post(
        "/api/auth/oauth/complete-email",
        json={"email": "test@example.com"},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_complete_email_invalid_format(client: AsyncClient):
    """POST /api/auth/oauth/complete-email with invalid email returns 422."""
    email = _unique_email()
    try:
        await _register_and_login(client, email)

        user_id = _get_user_id_from_cookies(client)
        async with _TestSessionLocal() as db:
            result = await db.execute(select(User).where(User.id == user_id))
            user = result.scalar_one()
            user.email = None
            await db.commit()

        resp = await client.post(
            "/api/auth/oauth/complete-email",
            json={"email": "not-an-email"},
        )
        assert resp.status_code == 422
    finally:
        await _cleanup_user(email=email)


# ===========================================================================
# link-lastfm tests
# ===========================================================================


@pytest.mark.asyncio
async def test_link_lastfm_valid(client: AsyncClient):
    """POST /api/auth/link-lastfm with a valid (mocked) username succeeds."""
    email = _unique_email()
    try:
        await _register_and_login(client, email)

        mock_info = {"username": "testuser123", "image": "https://example.com/img.jpg"}
        with patch("routers.auth_oauth.get_user_info", return_value=mock_info):
            resp = await client.post(
                "/api/auth/link-lastfm",
                json={"username": "testuser123"},
            )
        assert resp.status_code == 200
        data = resp.json()
        assert data["username"] == "testuser123"
        assert data["image"] == "https://example.com/img.jpg"
    finally:
        await _cleanup_user(email=email)


@pytest.mark.asyncio
async def test_link_lastfm_invalid_username(client: AsyncClient):
    """POST /api/auth/link-lastfm with a nonexistent username returns 400."""
    email = _unique_email()
    try:
        await _register_and_login(client, email)

        with patch("routers.auth_oauth.get_user_info", side_effect=pylast.WSError(None, 6, "User not found")):
            resp = await client.post(
                "/api/auth/link-lastfm",
                json={"username": "nonexistent_user_xyz"},
            )
        assert resp.status_code == 400
        assert resp.json()["detail"] == "Invalid Last.fm username"
    finally:
        await _cleanup_user(email=email)


@pytest.mark.asyncio
async def test_link_lastfm_conflict(client: AsyncClient):
    """POST /api/auth/link-lastfm with a username already linked to another account returns 409."""
    email1 = _unique_email()
    email2 = _unique_email()
    try:
        await _register_and_login(client, email1)
        mock_info = {"username": "shareduser", "image": None}
        with patch("routers.auth_oauth.get_user_info", return_value=mock_info):
            resp1 = await client.post(
                "/api/auth/link-lastfm",
                json={"username": "shareduser"},
            )
        assert resp1.status_code == 200

        await _register_and_login(client, email2)
        with patch("routers.auth_oauth.get_user_info", return_value=mock_info):
            resp2 = await client.post(
                "/api/auth/link-lastfm",
                json={"username": "shareduser"},
            )
        assert resp2.status_code == 409
        assert "already linked" in resp2.json()["detail"]
    finally:
        await _cleanup_user(email=email1)
        await _cleanup_user(email=email2)


@pytest.mark.asyncio
async def test_link_lastfm_no_auth(client: AsyncClient):
    """POST /api/auth/link-lastfm without auth cookie returns 401."""
    resp = await client.post(
        "/api/auth/link-lastfm",
        json={"username": "someuser"},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_me_returns_lastfm(client: AsyncClient):
    """GET /api/auth/me returns lastfm_username after linking."""
    email = _unique_email()
    try:
        await _register_and_login(client, email)

        mock_info = {"username": "mylastfmuser", "image": None}
        with patch("routers.auth_oauth.get_user_info", return_value=mock_info):
            link_resp = await client.post(
                "/api/auth/link-lastfm",
                json={"username": "mylastfmuser"},
            )
        assert link_resp.status_code == 200

        me_resp = await client.get("/api/auth/me")
        assert me_resp.status_code == 200
        data = me_resp.json()
        assert data["lastfm_username"] == "mylastfmuser"
        assert data["is_lastfm_linked"] is True
    finally:
        await _cleanup_user(email=email)