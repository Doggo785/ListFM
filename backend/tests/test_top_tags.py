"""Tests for the /api/top-tags endpoint.

The endpoint must not accept (or forward) a `period` query param — it is dead
code: `get_top_tags` never used it. These tests assert the endpoint returns
200 without `period` and that the service is called with only the username.
"""

from unittest.mock import patch

import pytest
from httpx import AsyncClient

from .conftest import _cleanup_user, _register_and_login, _unique_email


@pytest.mark.asyncio
async def test_top_tags_returns_200_without_period(client: AsyncClient):
    """GET /api/top-tags returns 200 and calls get_top_tags with only username."""
    email = _unique_email()
    try:
        await _register_and_login(client, email)

        mock_info = {"username": "tag_user", "image": None}
        with patch("routers.auth_oauth.get_user_info", return_value=mock_info):
            link_resp = await client.post(
                "/api/auth/link-lastfm",
                json={"username": "tag_user"},
            )
        assert link_resp.status_code == 200

        mock_tags = [{"name": "rock", "count": 42}]
        with patch("routers.users.get_top_tags", return_value=mock_tags) as mock_get_top_tags:
            resp = await client.get("/api/top-tags")
        assert resp.status_code == 200
        assert resp.json() == {"tags": mock_tags}
        # get_top_tags must be called with only the username — no period.
        mock_get_top_tags.assert_called_once_with("tag_user")
    finally:
        await _cleanup_user(email=email)