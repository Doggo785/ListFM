import uuid
from datetime import datetime, timedelta, timezone

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from jose import jwt
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from config import get_settings
from database import get_db
from backend.main import app
from services.rate_limit import login_limiter, register_limiter, refresh_limiter
from models.auth_provider import AuthProvider
from models.automation import Automation
from models.automation_history import AutomationHistory
from models.generated_playlist import GeneratedPlaylist
from models.playlist_track import PlaylistTrack
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


@pytest_asyncio.fixture(autouse=True)
async def _cleanup_db():
    """Clean all test data and rate limiter state before and after each test."""
    login_limiter.reset()
    register_limiter.reset()
    refresh_limiter.reset()
    async with _TestSessionLocal() as db:
        await db.execute(delete(PlaylistTrack))
        await db.execute(delete(AutomationHistory))
        await db.execute(delete(GeneratedPlaylist))
        await db.execute(delete(Automation))
        await db.execute(delete(RefreshToken))
        await db.execute(delete(AuthProvider))
        await db.execute(delete(User))
        await db.commit()
    yield
    async with _TestSessionLocal() as db:
        await db.execute(delete(PlaylistTrack))
        await db.execute(delete(AutomationHistory))
        await db.execute(delete(GeneratedPlaylist))
        await db.execute(delete(Automation))
        await db.execute(delete(RefreshToken))
        await db.execute(delete(AuthProvider))
        await db.execute(delete(User))
        await db.commit()


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
