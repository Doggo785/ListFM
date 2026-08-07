import os
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from jose import jwt
from sqlalchemy import delete, select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from config import get_settings
from database import get_db
from backend.main import app
from services.rate_limit import (
    login_limiter,
    register_limiter,
    register_email_limiter,
    refresh_limiter,
    link_lastfm_limiter,
    oauth_login_limiter,
    complete_email_limiter,
)
from models.auth_provider import AuthProvider
from models.refresh_token import RefreshToken
from models.user import User

# Dedicated throwaway database — NEVER point tests at the production/dev "listfm"
# database: the _cleanup_db fixture deletes every row before/after each test.
# Override with TEST_DATABASE_URL when the default is not available.
TEST_DB_URL = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql+asyncpg://listfm:listfm@localhost:5433/listfm_test",
)
# Pooled engine: the test suite opens a session per request and per cleanup, so
# a pooled engine (instead of a fresh connection per session) avoids repeated
# connection handshakes and keeps the suite fast.
_test_engine = create_async_engine(
    TEST_DB_URL,
    echo=False,
    pool_size=5,
    max_overflow=5,
    pool_pre_ping=True,
)
_TestSessionLocal = async_sessionmaker(_test_engine, class_=AsyncSession, expire_on_commit=False)

# Tables the suite writes to. CASCADE pulls in FK-referencing tables (e.g.
# user_tracks) without needing them listed or ordered.
_TEST_TABLES = (
    "users",
    "auth_providers",
    "refresh_tokens",
    "automations",
    "automation_history",
    "generated_playlists",
    "playlist_tracks",
)


@pytest_asyncio.fixture(autouse=True)
async def _override_get_db():
    async def _test_get_db():
        async with _TestSessionLocal() as session:
            yield session

    app.dependency_overrides[get_db] = _test_get_db
    yield
    app.dependency_overrides.clear()


@pytest_asyncio.fixture(autouse=True)
async def _cleanup_db():
    """Clean all test data and rate limiter state before each test.

    Truncate runs once before the test (single round-trip instead of 7 DELETEs
    per pass). The next test's pre-test truncate wipes the same tables, so no
    post-test pass is needed.
    """
    for limiter in (
        login_limiter,
        register_limiter,
        register_email_limiter,
        refresh_limiter,
        link_lastfm_limiter,
        oauth_login_limiter,
        complete_email_limiter,
    ):
        limiter.reset()
    async with _TestSessionLocal() as db:
        await db.execute(text(f"TRUNCATE {', '.join(_TEST_TABLES)} RESTART IDENTITY CASCADE"))
        await db.commit()
    yield
    # pytest-asyncio runs each test on a fresh event loop; pooled connections
    # held open across tests are bound to the previous (closed) loop. Disposing
    # between tests keeps the pool working while still reusing connections
    # within a single test's many sessions.
    await _test_engine.dispose()


@pytest.fixture(autouse=True)
def _fast_bcrypt():
    """Speed up password hashing in tests.

    passlib defaults to bcrypt rounds=12 (~0.25s per hash). Rounds=4 is far
    faster while keeping the bcrypt format, so register/login flows in tests
    drop from ~0.45s to a few ms. The app itself keeps the production default.
    """
    from services.auth import pwd_context

    pwd_context.update(bcrypt__rounds=4)
    yield
    pwd_context.update(bcrypt__rounds=12)


@pytest_asyncio.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


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


async def _register_and_login(
    client: AsyncClient, email: str, password: str = "StrongP@ss1!"
):
    """Register a new user and log in. Returns the login response."""
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
    return resp


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
