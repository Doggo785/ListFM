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
async def test_refresh_reuse_revokes_entire_family(client: AsyncClient):
    """Reuse of a rotated-away refresh token must revoke the WHOLE family in the
    DB — not just the presented token — so a stolen sibling token dies too.
    """
    email = _unique_email()
    try:
        await client.post(
            "/api/auth/register",
            json={"email": email, "password": "StrongP@ss1!"},
        )
        old_refresh = client.cookies.get("refresh_token")
        assert old_refresh is not None

        await client.post("/api/auth/refresh")

        # Replay the original (rotated-away) token on a second client.
        async with AsyncClient(
            transport=ASGITransport(app=client._transport.app), base_url="http://test"
        ) as fresh:
            fresh.cookies.set("refresh_token", old_refresh)
            resp = await fresh.post("/api/auth/refresh")
            assert resp.status_code == 401

        old_hash = hashlib.sha256(old_refresh.encode()).hexdigest()
        async with _TestSessionLocal() as db:
            result = await db.execute(
                select(RefreshToken).where(RefreshToken.token_hash == old_hash)
            )
            stored = result.scalar_one_or_none()
            assert stored is not None, "Old refresh token not found in DB"

            result = await db.execute(
                select(RefreshToken).where(RefreshToken.family == stored.family)
            )
            family_tokens = result.scalars().all()
            assert len(family_tokens) >= 2, (
                f"Expected at least 2 tokens in family, got {len(family_tokens)}"
            )
            revoked_flags = {token.revoked for token in family_tokens}
            assert revoked_flags == {True}, (
                f"Entire family must be revoked after reuse, got revoked flags {revoked_flags}"
            )
    finally:
        await _cleanup_user(email=email)


@pytest.mark.asyncio
async def test_refresh_no_cookie_returns_401(client: AsyncClient):
    resp = await client.post("/api/auth/refresh")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_login_revokes_previous_families(client: AsyncClient):
    """A fresh login must revoke every prior refresh token (one active session)."""
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
        token_a = client.cookies.get("refresh_token")
        assert token_a is not None

        # Second login — token A must be dead afterwards.
        client.cookies.clear()
        resp2 = await client.post(
            "/api/auth/login",
            json={"email": email, "password": "StrongP@ss1!"},
        )
        assert resp2.status_code == 200

        # Token A now returns 401 on /api/auth/refresh.
        async with AsyncClient(
            transport=ASGITransport(app=client._transport.app), base_url="http://test"
        ) as fresh:
            fresh.cookies.set("refresh_token", token_a)
            resp = await fresh.post("/api/auth/refresh")
            assert resp.status_code == 401

        # DB: every row for the user except the newest is revoked.
        user_id = _get_user_id_from_cookies(client)
        current_hash = hashlib.sha256(
            client.cookies.get("refresh_token").encode()
        ).hexdigest()
        async with _TestSessionLocal() as db:
            result = await db.execute(
                select(RefreshToken).where(RefreshToken.user_id == user_id)
            )
            tokens = result.scalars().all()
            assert len(tokens) >= 2, (
                f"Expected at least 2 refresh tokens, got {len(tokens)}"
            )
            newest = next(t for t in tokens if t.token_hash == current_hash)
            assert newest.revoked is False
            for token in tokens:
                if token.id != newest.id:
                    assert token.revoked is True, (
                        f"Prior refresh token {token.id} must be revoked after re-login"
                    )
    finally:
        await _cleanup_user(email=email)


@pytest.mark.asyncio
async def test_register_no_revoke_crash(client: AsyncClient):
    """Register still works and creates exactly one active token family."""
    email = _unique_email()
    try:
        resp = await client.post(
            "/api/auth/register",
            json={"email": email, "password": "StrongP@ss1!"},
        )
        assert resp.status_code == 201

        user_id = _get_user_id_from_cookies(client)
        async with _TestSessionLocal() as db:
            result = await db.execute(
                select(RefreshToken).where(RefreshToken.user_id == user_id)
            )
            tokens = result.scalars().all()
            assert len(tokens) == 1, (
                f"Expected exactly 1 refresh token after register, got {len(tokens)}"
            )
            assert tokens[0].revoked is False
            assert len({t.family for t in tokens}) == 1
    finally:
        await _cleanup_user(email=email)
