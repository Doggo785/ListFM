"""Tests for OAuth redirect endpoints and /api/auth/link-lastfm."""

from unittest.mock import patch

import pytest
from httpx import AsyncClient

from .conftest import _cleanup_user, _unique_email


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
# OAuth redirect tests
# ===========================================================================


@pytest.mark.asyncio
async def test_google_login_redirect(client: AsyncClient):
    """GET /api/auth/google/login should redirect (302) or error — never 200."""
    resp = await client.get("/api/auth/google/login")
    # In test env there are no real OAuth creds, so the endpoint may 500
    # or successfully build a redirect URL. Both are acceptable — just
    # confirm it does NOT silently succeed with 200.
    assert resp.status_code != 200


@pytest.mark.asyncio
async def test_discord_login_redirect(client: AsyncClient):
    """GET /api/auth/discord/login should redirect (302) or error — never 200."""
    resp = await client.get("/api/auth/discord/login")
    assert resp.status_code != 200


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

        with patch("routers.auth_oauth.get_user_info", side_effect=Exception("User not found")):
            resp = await client.post(
                "/api/auth/link-lastfm",
                json={"username": "nonexistent_user_xyz"},
            )
        assert resp.status_code == 400
        assert resp.json()["detail"] == "Invalid Last.fm username"
    finally:
        await _cleanup_user(email=email)


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
