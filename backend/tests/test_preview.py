"""Tests for POST /api/automations/preview error semantics.

The preview endpoint must return proper HTTP error statuses instead of
`{"error": ...}` with HTTP 200:
- unknown source type -> 422 with generic detail
- upstream Last.fm failure -> 502 with generic detail (no str(e) leak)
- success -> 200 with {tracks, total}
"""

from unittest.mock import patch

import pytest
from httpx import AsyncClient

from .conftest import _cleanup_user, _unique_email


async def _register_login_link(client: AsyncClient, email: str) -> None:
    """Register, log in, and link a Last.fm account (mocked get_user_info)."""
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
    mock_info = {"username": "preview_user", "image": None}
    with patch("routers.auth_oauth.get_user_info", return_value=mock_info):
        link = await client.post(
            "/api/auth/link-lastfm",
            json={"username": "preview_user"},
        )
    assert link.status_code == 200


def _preview_body(source_type: str) -> dict:
    return {
        "automation": {
            "source": {"type": source_type, "period": "3m"},
            "output": {"maxSize": 5},
        }
    }


@pytest.mark.asyncio
async def test_preview_unknown_source_returns_422(client: AsyncClient):
    """An unsupported source type must return 422, not 200 with an error body."""
    email = _unique_email()
    try:
        await _register_login_link(client, email)
        resp = await client.post(
            "/api/automations/preview",
            json=_preview_body("bogus_source"),
        )
        assert resp.status_code == 422
        assert resp.json()["detail"] == "Unsupported source type"
    finally:
        await _cleanup_user(email=email)


@pytest.mark.asyncio
async def test_preview_upstream_failure_returns_502(client: AsyncClient):
    """An upstream Last.fm failure must return 502 with a generic detail."""
    email = _unique_email()
    try:
        await _register_login_link(client, email)
        with patch(
            "routers.automations.get_top_tracks",
            side_effect=Exception("secret internal traceback"),
        ):
            resp = await client.post(
                "/api/automations/preview",
                json=_preview_body("top_tracks"),
            )
        assert resp.status_code == 502
        detail = resp.json()["detail"]
        assert detail == "Unable to fetch tracks from Last.fm"
        assert "secret internal traceback" not in detail
    finally:
        await _cleanup_user(email=email)


@pytest.mark.asyncio
async def test_preview_success_returns_tracks_and_total(client: AsyncClient):
    """A successful preview returns 200 with {tracks, total}."""
    email = _unique_email()
    try:
        await _register_login_link(client, email)
        tracks = [
            {"artist": "Artist A", "title": "Song A"},
            {"artist": "Artist B", "title": "Song B"},
        ]
        with patch("routers.automations.get_top_tracks", return_value=tracks), patch(
            "routers.automations.enrich_tracks", return_value=tracks
        ):
            resp = await client.post(
                "/api/automations/preview",
                json=_preview_body("top_tracks"),
            )
        assert resp.status_code == 200
        data = resp.json()
        assert data["tracks"] == tracks
        assert data["total"] == 2
    finally:
        await _cleanup_user(email=email)