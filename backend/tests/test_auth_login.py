import uuid

import pytest
from httpx import AsyncClient

from .conftest import _cleanup_user, _unique_email


@pytest.mark.asyncio
async def test_login_success(client: AsyncClient):
    email = _unique_email()
    password = "StrongP@ss1!"
    try:
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
        data = resp.json()
        assert data["token_type"] == "bearer"
        assert "access_token" in data
        assert "refresh_token" in data
        assert "expires_in" in data
    finally:
        await _cleanup_user(email=email)


@pytest.mark.asyncio
async def test_login_sets_http_only_cookies(client: AsyncClient):
    email = _unique_email()
    try:
        await client.post(
            "/api/auth/register",
            json={"email": email, "password": "StrongP@ss1!"},
        )
        client.cookies.clear()

        resp = await client.post(
            "/api/auth/login",
            json={"email": email, "password": "StrongP@ss1!"},
        )
        assert resp.status_code == 200
        set_cookie_headers = resp.headers.get_list("set-cookie")
        auth_cookies = [
            h for h in set_cookie_headers
            if "access_token" in h.lower() or "refresh_token" in h.lower()
        ]
        for header in auth_cookies:
            assert "httponly" in header.lower(), f"Cookie not httponly: {header}"
    finally:
        await _cleanup_user(email=email)


@pytest.mark.asyncio
async def test_login_wrong_password(client: AsyncClient):
    email = _unique_email()
    try:
        await client.post(
            "/api/auth/register",
            json={"email": email, "password": "StrongP@ss1!"},
        )
        client.cookies.clear()

        resp = await client.post(
            "/api/auth/login",
            json={"email": email, "password": "WrongPassword1!"},
        )
        assert resp.status_code == 401
        assert resp.json()["detail"] == "Invalid email or password"
    finally:
        await _cleanup_user(email=email)


@pytest.mark.asyncio
async def test_login_password_over_72_bytes_422(client: AsyncClient):
    """A >72-byte password is rejected at validation (422), not bcrypt-truncated
    into a 401. Documented behavior change: pre-existing users with such
    passwords are un-loginable (422) until they reset."""
    email = _unique_email()
    try:
        await client.post(
            "/api/auth/register",
            json={"email": email, "password": "StrongP@ss1!"},
        )
        client.cookies.clear()

        resp = await client.post(
            "/api/auth/login",
            json={"email": email, "password": "a" * 73},
        )
        assert resp.status_code == 422
    finally:
        await _cleanup_user(email=email)


@pytest.mark.asyncio
async def test_login_nonexistent_email(client: AsyncClient):
    resp = await client.post(
        "/api/auth/login",
        json={
            "email": f"nobody-{uuid.uuid4().hex[:8]}@test.com",
            "password": "StrongP@ss1!",
        },
    )
    assert resp.status_code == 401
    assert resp.json()["detail"] == "Invalid email or password"


@pytest.mark.asyncio
async def test_login_same_error_for_wrong_password_and_missing_email(client: AsyncClient):
    email = _unique_email()
    try:
        await client.post(
            "/api/auth/register",
            json={"email": email, "password": "StrongP@ss1!"},
        )
        client.cookies.clear()

        resp_wrong_pw = await client.post(
            "/api/auth/login",
            json={"email": email, "password": "WrongPassword1!"},
        )
        resp_no_user = await client.post(
            "/api/auth/login",
            json={
                "email": f"ghost-{uuid.uuid4().hex[:8]}@test.com",
                "password": "StrongP@ss1!",
            },
        )
        assert resp_wrong_pw.json()["detail"] == resp_no_user.json()["detail"]
    finally:
        await _cleanup_user(email=email)
