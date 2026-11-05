"""Tests for the /api/info user-data endpoint.

Upstream Last.fm failures must return 502 with a generic detail that leaks no
internal exception text; the real error goes to server logs only.
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


@pytest.mark.asyncio
async def test_lastfm_wserror_masked_as_502(client: AsyncClient):
    """A pylast.WSError must return 502 with a generic detail and must NOT
    leak the raw exception message."""
    email = _unique_email()
    try:
        await _register_login_link(client, email)
        with patch(
            "routers.users.get_user_info",
            side_effect=pylast.WSError(None, 6, SECRET_MSG),
        ):
            resp = await client.get("/api/info")
        assert resp.status_code == 502
        body = resp.json()
        assert body["detail"] == GENERIC_DETAIL
        assert SECRET_MSG not in str(body)
    finally:
        await _cleanup_user(email=email)

