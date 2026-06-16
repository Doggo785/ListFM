import uuid

import pytest
from httpx import AsyncClient

from .conftest import _cleanup_user, _unique_email


@pytest.mark.asyncio
async def test_register_success(client: AsyncClient):
    email = _unique_email()
    try:
        resp = await client.post(
            "/api/auth/register",
            json={"email": email, "password": "StrongP@ss1!", "display_name": "Test"},
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["token_type"] == "bearer"
        assert "access_token" in data
        assert "refresh_token" in data
        assert "expires_in" in data
        assert "password_hash" not in data
        assert "password" not in data
    finally:
        await _cleanup_user(email=email)


@pytest.mark.asyncio
async def test_register_sets_http_only_cookies(client: AsyncClient):
    email = _unique_email()
    try:
        resp = await client.post(
            "/api/auth/register",
            json={"email": email, "password": "StrongP@ss1!"},
        )
        assert resp.status_code == 201
        set_cookie_headers = resp.headers.get_list("set-cookie")
        auth_cookies = [
            h for h in set_cookie_headers
            if "access_token" in h.lower() or "refresh_token" in h.lower()
        ]
        assert len(auth_cookies) >= 2, "Expected both access_token and refresh_token cookies"
        for header in auth_cookies:
            assert "httponly" in header.lower(), f"Cookie not httponly: {header}"
    finally:
        await _cleanup_user(email=email)


@pytest.mark.asyncio
async def test_register_duplicate_email(client: AsyncClient):
    email = _unique_email()
    try:
        resp1 = await client.post(
            "/api/auth/register",
            json={"email": email, "password": "StrongP@ss1!"},
        )
        assert resp1.status_code == 201

        resp2 = await client.post(
            "/api/auth/register",
            json={"email": email, "password": "StrongP@ss1!"},
        )
        assert resp2.status_code == 409
        assert "already exists" in resp2.json()["detail"]
    finally:
        await _cleanup_user(email=email)


@pytest.mark.asyncio
async def test_register_weak_password(client: AsyncClient):
    resp = await client.post(
        "/api/auth/register",
        json={"email": _unique_email(), "password": "short"},
    )
    assert resp.status_code == 422
    assert "at least 8 characters" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_register_email_normalized(client: AsyncClient):
    raw_email = f"  Test-{uuid.uuid4().hex[:8]}@Example.COM  "
    normalized = raw_email.strip().lower()
    try:
        resp = await client.post(
            "/api/auth/register",
            json={"email": raw_email, "password": "StrongP@ss1!"},
        )
        assert resp.status_code == 201

        resp2 = await client.post(
            "/api/auth/register",
            json={"email": normalized, "password": "StrongP@ss1!"},
        )
        assert resp2.status_code == 409
    finally:
        await _cleanup_user(email=normalized)
