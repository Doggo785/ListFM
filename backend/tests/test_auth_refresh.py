import hashlib

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from .conftest import (
    _TestSessionLocal,
    _cleanup_user,
    _get_user_id_from_cookies,
    _unique_email,
)
from models.refresh_token import RefreshToken


@pytest.mark.asyncio
async def test_refresh_success(client: AsyncClient):
    email = _unique_email()
    try:
        reg = await client.post(
            "/api/auth/register",
            json={"email": email, "password": "StrongP@ss1!"},
        )
        assert reg.status_code == 201

        resp = await client.post("/api/auth/refresh")
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["token_type"] == "bearer"
    finally:
        await _cleanup_user(email=email)


@pytest.mark.asyncio
async def test_refresh_sets_new_cookies(client: AsyncClient):
    email = _unique_email()
    try:
        await client.post(
            "/api/auth/register",
            json={"email": email, "password": "StrongP@ss1!"},
        )
        old_access = client.cookies.get("access_token")
        old_refresh = client.cookies.get("refresh_token")

        resp = await client.post("/api/auth/refresh")
        assert resp.status_code == 200

        new_access = client.cookies.get("access_token")
        new_refresh = client.cookies.get("refresh_token")
        assert new_access != old_access
        assert new_refresh != old_refresh
    finally:
        await _cleanup_user(email=email)


@pytest.mark.asyncio
async def test_refresh_token_rotation_revokes_old(client: AsyncClient):
    email = _unique_email()
    try:
        await client.post(
            "/api/auth/register",
            json={"email": email, "password": "StrongP@ss1!"},
        )
        old_refresh = client.cookies.get("refresh_token")
        assert old_refresh is not None

        resp = await client.post("/api/auth/refresh")
        assert resp.status_code == 200
        new_refresh = resp.json()["refresh_token"]
        assert old_refresh != new_refresh

        old_hash = hashlib.sha256(old_refresh.encode()).hexdigest()
        async with _TestSessionLocal() as db:
            result = await db.execute(
                select(RefreshToken).where(RefreshToken.token_hash == old_hash)
            )
            stored = result.scalar_one_or_none()
            assert stored is not None, "Old refresh token not found in DB"
            assert stored.revoked is True, "Old refresh token should be revoked"
    finally:
        await _cleanup_user(email=email)


@pytest.mark.asyncio
async def test_refresh_revoked_token_returns_401(client: AsyncClient):
    email = _unique_email()
    try:
        await client.post(
            "/api/auth/register",
            json={"email": email, "password": "StrongP@ss1!"},
        )
        old_refresh = client.cookies.get("refresh_token")

        await client.post("/api/auth/refresh")

        async with AsyncClient(
            transport=ASGITransport(app=client._transport.app), base_url="http://test"
        ) as fresh:
            fresh.cookies.set("refresh_token", old_refresh)
            resp = await fresh.post("/api/auth/refresh")
            assert resp.status_code == 401
    finally:
        await _cleanup_user(email=email)


@pytest.mark.asyncio
async def test_refresh_no_cookie_returns_401(client: AsyncClient):
    resp = await client.post("/api/auth/refresh")
    assert resp.status_code == 401
