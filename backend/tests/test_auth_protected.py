from datetime import datetime, timezone

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from .conftest import (
    _TestSessionLocal,
    _cleanup_user,
    _get_user_id_from_cookies,
    _make_expired_token,
    _unique_email,
)
from models.user import User


@pytest.mark.asyncio
async def test_protected_no_token(client: AsyncClient):
    resp = await client.get("/api/auth/me")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_protected_valid_token(client: AsyncClient):
    email = _unique_email()
    try:
        reg = await client.post(
            "/api/auth/register",
            json={"email": email, "password": "StrongP@ss1!", "display_name": "Tester"},
        )
        assert reg.status_code == 201

        resp = await client.get("/api/auth/me")
        assert resp.status_code == 200
        data = resp.json()
        assert data["email"] == email
        assert data["display_name"] == "Tester"
        assert data["role"] == "user"
    finally:
        await _cleanup_user(email=email)


@pytest.mark.asyncio
async def test_protected_expired_token(client: AsyncClient):
    email = _unique_email()
    try:
        reg = await client.post(
            "/api/auth/register",
            json={"email": email, "password": "StrongP@ss1!"},
        )
        assert reg.status_code == 201
        user_id = _get_user_id_from_cookies(client)

        expired_token = _make_expired_token(user_id)

        async with AsyncClient(
            transport=ASGITransport(app=client._transport.app), base_url="http://test"
        ) as fresh:
            fresh.cookies.set("access_token", expired_token)
            resp = await fresh.get("/api/auth/me")
            assert resp.status_code == 401
    finally:
        await _cleanup_user(email=email)


@pytest.mark.asyncio
async def test_protected_garbage_token(client: AsyncClient):
    async with AsyncClient(
        transport=ASGITransport(app=client._transport.app), base_url="http://test"
    ) as fresh:
        fresh.cookies.set("access_token", "not-a-real-jwt")
        resp = await fresh.get("/api/auth/me")
        assert resp.status_code == 401


@pytest.mark.asyncio
async def test_protected_deleted_user(client: AsyncClient):
    email = _unique_email()
    user_id = None
    try:
        reg = await client.post(
            "/api/auth/register",
            json={"email": email, "password": "StrongP@ss1!"},
        )
        assert reg.status_code == 201
        user_id = _get_user_id_from_cookies(client)

        async with _TestSessionLocal() as db:
            result = await db.execute(select(User).where(User.id == user_id))
            user = result.scalar_one_or_none()
            assert user is not None
            user.deleted_at = datetime.now(timezone.utc)
            await db.commit()

        resp = await client.get("/api/auth/me")
        assert resp.status_code == 401
    finally:
        await _cleanup_user(user_id=user_id)


@pytest.mark.asyncio
async def test_e2e_register_login_protected_refresh_logout(client: AsyncClient):
    email = _unique_email()
    password = "StrongP@ss1!"
    try:
        reg = await client.post(
            "/api/auth/register",
            json={"email": email, "password": password, "display_name": "E2E"},
        )
        assert reg.status_code == 201

        me1 = await client.get("/api/auth/me")
        assert me1.status_code == 200
        assert me1.json()["email"] == email

        ref = await client.post("/api/auth/refresh")
        assert ref.status_code == 200

        me2 = await client.get("/api/auth/me")
        assert me2.status_code == 200
        assert me2.json()["email"] == email

        lo = await client.post("/api/auth/logout")
        assert lo.status_code == 200
        assert lo.json()["detail"] == "Logged out"

        client.cookies.clear()
        me3 = await client.get("/api/auth/me")
        assert me3.status_code == 401
    finally:
        await _cleanup_user(email=email)
