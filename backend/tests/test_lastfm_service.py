"""Unit tests for services.lastfm.get_user_info with a mocked network.

These tests never touch the real Last.fm API: `services.lastfm.get_network`
is patched with fake pylast objects. A non-existent username must make
`get_user_info` propagate `pylast.WSError` (so the link-lastfm flow can
reject it) instead of silently returning a partial result.
"""

from unittest.mock import patch

import pylast
import pytest

from services.lastfm import get_user_info

# Sentinel: get_playcount() raises WSError (simulates a non-existent account).
_MISSING_USER = object()
# Sentinel: get_image() raises (simulates an image fetch failure).
_FAIL_IMAGE_FETCH = object()


class _FakeUser:
    """Minimal pylast.User stand-in exposing only what get_user_info calls."""

    def __init__(self, playcount=_MISSING_USER, image_url=None):
        self._playcount = playcount
        self._image_url = image_url

    def get_playcount(self):
        if self._playcount is _MISSING_USER:
            raise pylast.WSError(None, 6, "User not found")
        return self._playcount

    def get_image(self, size=None):
        if self._image_url is _FAIL_IMAGE_FETCH:
            raise RuntimeError("image fetch failed")
        return self._image_url


class _FakeNetwork:
    def __init__(self, user):
        self._user = user

    def get_user(self, username):
        return self._user


def test_get_user_info_propagates_wserror_for_nonexistent_user():
    """Given a user whose get_playcount() raises WSError, get_user_info must propagate it."""
    network = _FakeNetwork(_FakeUser(playcount=_MISSING_USER))
    with patch("services.lastfm.get_network", return_value=network):
        with pytest.raises(pylast.WSError):
            get_user_info("ghost_user_999")


def test_get_user_info_returns_populated_dict_for_existing_user():
    """Given an existing user, get_user_info returns the populated dict."""
    network = _FakeNetwork(
        _FakeUser(playcount="1234", image_url="https://last.fm/avatar.png")
    )
    with patch("services.lastfm.get_network", return_value=network):
        info = get_user_info("real_user")
    assert info == {"username": "real_user", "image": "https://last.fm/avatar.png"}


def test_get_user_info_returns_none_image_when_image_fetch_fails():
    """Given an image fetch failure, get_user_info still returns the dict with image=None."""
    network = _FakeNetwork(_FakeUser(playcount="42", image_url=_FAIL_IMAGE_FETCH))
    with patch("services.lastfm.get_network", return_value=network):
        info = get_user_info("no_avatar_user")
    assert info == {"username": "no_avatar_user", "image": None}