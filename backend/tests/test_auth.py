"""Tests for the auth system: register, login, refresh, logout, protected routes."""

import hashlib
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from jose import jwt
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from config import get_settings
from database import get_db
from main import app
from models.auth_provider import AuthProvider
from models.refresh_token import RefreshToken
from models.user import User

TEST_DB_URL = "postgresql+asyncpg://listfm:listfm@localhost:5432/listfm"
_test_engine = create_async_engine(TEST_DB_URL, echo=False, poolclass=NullPool)
_TestSessionLocal = async_sessionmaker(_test_engine, class_=AsyncSession, expire_on_commit=False)


@pytest_asyncio.fixture(autouse=True)
async def _override_get_db():
    async def _test_get_db():
        async with _TestSessionLocal() as session:
            yield session

    app.dependency_overrides[get_db] = _test_get_db
    yield
    app.dependency_overrides.clear()


async def _cleanup_user(email: str | None = None, user_id: str | None = None) -> None:
    async with _TestSessionLocal() as db:
        uid = user_id
        if uid is None and email is not None:
            result = await db.execute(select(User).where(User.email == email))
            user = result.scalar_one_or_none()
            if user is None:
                return
            uid = user.id
        if uid is None:
            return
        await db.execute(delete(RefreshToken).where(RefreshToken.user_id == uid))
        await db.execute(delete(AuthProvider).where(AuthProvider.user_id == uid))
        await db.execute(delete(User).where(User.id == uid))
        await db.commit()


def _unique_email() -> str:
    return f"test-{uuid.uuid4().hex[:12]}@test.example.com"


def _get_user_id_from_cookies(client: AsyncClient) -> str:
    settings = get_settings()
    token = client.cookies.get("access_token")
    assert token is not None, "No access_token cookie found"
    payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    return payload["sub"]


def _make_expired_token(user_id: str) -> str:
    settings = get_settings()
    return jwt.encode(
        {"sub": user_id, "exp": datetime.now(timezone.utc) - timedelta(hours=1)},
        settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
    )


# ---------------------------------------------------------------------------
# Register Tests (Task 18)
# ---------------------------------------------------------------------------


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


# ---------------------------------------------------------------------------
# Login Tests (Task 19)
# ---------------------------------------------------------------------------


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


# ---------------------------------------------------------------------------
# Refresh Tests (Task 20)
# ---------------------------------------------------------------------------


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


# ---------------------------------------------------------------------------
# Logout Tests (Task 20 continued)
# ---------------------------------------------------------------------------


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


# ---------------------------------------------------------------------------
# Protected Route Tests (Task 21)
# ---------------------------------------------------------------------------


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
        if user_id is not None:
            async with _TestSessionLocal() as db:
                await db.execute(delete(RefreshToken).where(RefreshToken.user_id == user_id))
                await db.execute(delete(AuthProvider).where(AuthProvider.user_id == user_id))
                await db.execute(delete(User).where(User.id == user_id))
                await db.commit()


# ---------------------------------------------------------------------------
# End-to-End Integration Test (Task 22)
# ---------------------------------------------------------------------------


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
