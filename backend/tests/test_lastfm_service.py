"""Unit tests for services.lastfm.get_user_info with a mocked HTTP layer.

These tests never touch the real Last.fm API: `services.lastfm.httpx.get` is
patched. A non-existent username must make `get_user_info` propagate
`pylast.WSError` (so the link-lastfm flow can reject it) instead of
silently returning a partial result.
"""

from unittest.mock import patch

import pylast
import pytest
from services.lastfm import get_user_info


class _Response:
    def __init__(self, payload, status_code=200):
        self._payload = payload
        self.status_code = status_code

    def json(self):
        return self._payload

    def raise_for_status(self):
        pass


def test_get_user_info_propagates_wserror_for_nonexistent_user():
    missing = _Response({"error": 6, "message": "User not found"}, status_code=404)
    with (
        patch("services.lastfm.httpx.get", return_value=missing),
        pytest.raises(pylast.WSError) as exc_info,
    ):
        get_user_info("ghost_user_999")
    assert exc_info.value.status == "6"


def test_get_user_info_returns_profile_in_one_call():
    payload = {
        "user": {
            "name": "real_user",
            "image": [
                {"size": "small", "#text": "https://last.fm/s.png"},
                {"size": "large", "#text": "https://last.fm/avatar.png"},
            ],
        }
    }
    with patch("services.lastfm.httpx.get", return_value=_Response(payload)) as get:
        info = get_user_info("real_user")
    assert info == {"username": "real_user", "image": "https://last.fm/avatar.png"}
    assert get.call_count == 1
    assert get.call_args.kwargs["params"]["method"] == "user.getInfo"


def test_get_user_info_returns_none_image_when_profile_has_none():
    payload = {"user": {"name": "no_avatar_user", "image": [{"size": "large", "#text": ""}]}}
    with patch("services.lastfm.httpx.get", return_value=_Response(payload)):
        info = get_user_info("no_avatar_user")
    assert info == {"username": "no_avatar_user", "image": None}
