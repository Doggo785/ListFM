"""Tests for the /api user-data endpoints (info, recent-tracks, top-tags,
top-tracks, loved-tracks, source-tracks).

Upstream Last.fm failures must return 502 with a generic detail that leaks no
internal exception text; the real error goes to server logs only. The 400
unknown-source branch of /api/source-tracks must be preserved.
"""

from unittest.mock import patch

import pylast
import pytest
from httpx import AsyncClient

from .conftest import _cleanup_user, _register_and_login, _unique_email

GENERIC_DETAIL = "Last.fm service unavailable"
SECRET_MSG = "secret internal lastfm detail"


async def _register_login_link(client: AsyncClient, email: str) -> None:
    """Register, log in, and link a Last.fm account (mocked get_user_info)."""
    await _register_and_login(client, email)
    mock_info = {"username": "users_test_user", "image": None}
    with patch("routers.auth_oauth.get_user_info", return_value=mock_info):
        link = await client.post(
            "/api/auth/link-lastfm",
            json={"username": "users_test_user"},
        )
    assert link.status_code == 200


# (endpoint, service function patched in routers.users)
_ENDPOINTS = [
    ("/api/info", "get_user_info"),
    ("/api/recent-tracks", "get_recent_tracks"),
    ("/api/top-tags", "get_top_tags"),
    ("/api/top-tracks", "get_top_tracks"),
    ("/api/loved-tracks", "get_loved_tracks"),
    ("/api/source-tracks", "get_top_tracks"),
]


@pytest.mark.asyncio
@pytest.mark.parametrize("path,service_fn", _ENDPOINTS)
async def test_lastfm_wserror_masked_as_502(client: AsyncClient, path: str, service_fn: str):
    """A pylast.WSError from any user-data endpoint must return 502 with a
    generic detail and must NOT leak the raw exception message."""
    email = _unique_email()
    try:
        await _register_login_link(client, email)
        with patch(
            f"routers.users.{service_fn}",
            side_effect=pylast.WSError(None, 6, SECRET_MSG),
        ):
            resp = await client.get(path)
        assert resp.status_code == 502
        body = resp.json()
        assert body["detail"] == GENERIC_DETAIL
        assert SECRET_MSG not in str(body)
    finally:
        await _cleanup_user(email=email)


@pytest.mark.asyncio
async def test_source_tracks_unknown_source_still_400(client: AsyncClient):
    """The 400 unknown-source branch must be preserved (not masked as 502)."""
    email = _unique_email()
    try:
        await _register_login_link(client, email)
        resp = await client.get("/api/source-tracks?source=bogus_source")
        assert resp.status_code == 400
        assert resp.json()["detail"] == "Unknown source: bogus_source"
    finally:
        await _cleanup_user(email=email)