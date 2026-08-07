import pytest

from config import Settings


def _settings(**overrides) -> Settings:
    base = {
        "lastfm_api_key": "test-key",
        "lastfm_api_secret": "test-secret",
        "jwt_secret": "x" * 32,
    }
    base.update(overrides)
    return Settings(**base)


def test_localhost_hosts_allowed_with_cookie_secure_false():
    settings = _settings(
        cookie_secure=False,
        frontend_url="http://localhost:5173",
        oauth_redirect_base="http://localhost:8000",
    )
    assert settings.cookie_secure is False


def test_non_localhost_host_raises_with_cookie_secure_false():
    with pytest.raises(ValueError):
        _settings(
            cookie_secure=False,
            frontend_url="http://localhost:5173",
            oauth_redirect_base="https://app.example.com",
        )


def test_non_localhost_host_allowed_with_cookie_secure_true():
    settings = _settings(
        cookie_secure=True,
        frontend_url="https://app.example.com",
        oauth_redirect_base="https://app.example.com",
    )
    assert settings.cookie_secure is True