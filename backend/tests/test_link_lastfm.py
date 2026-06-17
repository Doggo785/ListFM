"""Tests for the link-lastfm flow: validation, duplicates, and /me status."""

from unittest.mock import patch

import pytest
from httpx import AsyncClient

from .conftest import _cleanup_user, _unique_email


# ---------------------------------------------------------------------------
# Helper
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


@pytest.mark.asyncio
async def test_valid_lastfm_username(client: AsyncClient):
    """Linking a valid Last.fm username returns username + image."""
    email = _unique_email()
    try:
        await _register_and_login(client, email)

        mock_info = {"username": "valid_user", "image": "https://last.fm/img.png"}
        with patch("routers.auth_oauth.get_user_info", return_value=mock_info):
            resp = await client.post(
                "/api/auth/link-lastfm",
                json={"username": "valid_user"},
            )
        assert resp.status_code == 200
        data = resp.json()
        assert data["username"] == "valid_user"
        assert data["image"] == "https://last.fm/img.png"
    finally:
        await _cleanup_user(email=email)


@pytest.mark.asyncio
async def test_invalid_lastfm_username(client: AsyncClient):
    """Linking a nonexistent Last.fm username returns 400."""
    email = _unique_email()
    try:
        await _register_and_login(client, email)

        with patch("routers.auth_oauth.get_user_info", side_effect=Exception("not found")):
            resp = await client.post(
                "/api/auth/link-lastfm",
                json={"username": "zzz_no_such_user_999"},
            )
        assert resp.status_code == 400
        assert resp.json()["detail"] == "Invalid Last.fm username"
    finally:
        await _cleanup_user(email=email)


@pytest.mark.asyncio
async def test_duplicate_lastfm_username(client: AsyncClient):
    """Linking the same username twice re-links (updates) without error."""
    email = _unique_email()
    try:
        await _register_and_login(client, email)

        mock_info = {"username": "dupe_user", "image": None}
        with patch("routers.auth_oauth.get_user_info", return_value=mock_info):
            resp1 = await client.post(
                "/api/auth/link-lastfm",
                json={"username": "dupe_user"},
            )
            assert resp1.status_code == 200

            # Link again — should re-link, not fail
            resp2 = await client.post(
                "/api/auth/link-lastfm",
                json={"username": "dupe_user"},
            )
            assert resp2.status_code == 200
            assert resp2.json()["username"] == "dupe_user"
    finally:
        await _cleanup_user(email=email)


@pytest.mark.asyncio
async def test_me_before_linking(client: AsyncClient):
    """/api/auth/me returns is_lastfm_linked: false before linking."""
    email = _unique_email()
    try:
        await _register_and_login(client, email)

        resp = await client.get("/api/auth/me")
        assert resp.status_code == 200
        data = resp.json()
        assert data["is_lastfm_linked"] is False
        assert data["lastfm_username"] is None
    finally:
        await _cleanup_user(email=email)


@pytest.mark.asyncio
async def test_me_after_linking(client: AsyncClient):
    """/api/auth/me returns is_lastfm_linked: true and lastfm_username after linking."""
    email = _unique_email()
    try:
        await _register_and_login(client, email)

        mock_info = {"username": "linked_user", "image": "https://last.fm/a.jpg"}
        with patch("routers.auth_oauth.get_user_info", return_value=mock_info):
            link_resp = await client.post(
                "/api/auth/link-lastfm",
                json={"username": "linked_user"},
            )
        assert link_resp.status_code == 200

        me_resp = await client.get("/api/auth/me")
        assert me_resp.status_code == 200
        data = me_resp.json()
        assert data["is_lastfm_linked"] is True
        assert data["lastfm_username"] == "linked_user"
    finally:
        await _cleanup_user(email=email)
