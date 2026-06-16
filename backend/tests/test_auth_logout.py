import hashlib

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from .conftest import (
    _TestSessionLocal,
    _cleanup_user,
    _unique_email,
)
from models.refresh_token import RefreshToken


@pytest.mark.asyncio
async def test_logout_success(client: AsyncClient):
    email = _unique_email()
    try:
        await client.post(
            "/api/auth/register",
            json={"email": email, "password": "StrongP@ss1!"},
        )
        resp = await client.post("/api/auth/logout")
        assert resp.status_code == 200
        assert resp.json()["detail"] == "Logged out"
    finally:
        await _cleanup_user(email=email)


@pytest.mark.asyncio
async def test_logout_clears_cookies(client: AsyncClient):
    email = _unique_email()
    try:
        await client.post(
            "/api/auth/register",
            json={"email": email, "password": "StrongP@ss1!"},
        )
        resp = await client.post("/api/auth/logout")
        assert resp.status_code == 200

        set_cookie_headers = resp.headers.get_list("set-cookie")
        auth_cookies = [
            h for h in set_cookie_headers
            if "access_token" in h.lower() or "refresh_token" in h.lower()
        ]
        assert len(auth_cookies) >= 2
        for header in auth_cookies:
            assert "max-age=0" in header.lower(), f"Cookie not cleared: {header}"
    finally:
        await _cleanup_user(email=email)


@pytest.mark.asyncio
async def test_logout_revokes_refresh_token(client: AsyncClient):
    email = _unique_email()
    try:
        await client.post(
            "/api/auth/register",
            json={"email": email, "password": "StrongP@ss1!"},
        )
        refresh_token = client.cookies.get("refresh_token")
        assert refresh_token is not None

        await client.post("/api/auth/logout")

        token_hash = hashlib.sha256(refresh_token.encode()).hexdigest()
        async with _TestSessionLocal() as db:
            result = await db.execute(
                select(RefreshToken).where(RefreshToken.token_hash == token_hash)
            )
            stored = result.scalar_one_or_none()
            assert stored is not None, "Refresh token not found in DB after logout"
            assert stored.revoked is True, "Refresh token should be revoked after logout"
    finally:
        await _cleanup_user(email=email)


@pytest.mark.asyncio
async def test_logout_then_protected_route_fails(client: AsyncClient):
    email = _unique_email()
    try:
        await client.post(
            "/api/auth/register",
            json={"email": email, "password": "StrongP@ss1!"},
        )
        await client.post("/api/auth/logout")
        client.cookies.clear()

        resp = await client.get("/api/auth/me")
        assert resp.status_code == 401
    finally:
        await _cleanup_user(email=email)
