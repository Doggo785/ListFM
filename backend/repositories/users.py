import logging
import uuid
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

from models.user import User
from models.auth_provider import AuthProvider
from schemas import UserCreate, UserUpdate


async def get_user_by_id(db: AsyncSession, user_id: str) -> User | None:
    result = await db.execute(
        select(User).where(User.id == user_id, User.deleted_at.is_(None))
    )
    return result.scalar_one_or_none()


async def get_user_by_email(db: AsyncSession, email: str) -> User | None:
    result = await db.execute(
        select(User).where(
            func.lower(User.email) == email.lower(),
            User.deleted_at.is_(None),
        )
    )
    return result.scalar_one_or_none()


async def get_user_by_lastfm_username(db: AsyncSession, lastfm_username: str) -> User | None:
    result = await db.execute(
        select(User)
        .join(AuthProvider)
        .where(
            AuthProvider.provider == "lastfm",
            AuthProvider.provider_user_id == lastfm_username,
            User.deleted_at.is_(None),
        )
    )
    return result.scalar_one_or_none()


async def create_user(db: AsyncSession, data: UserCreate, password_hash: str) -> User:
    """Caller is responsible for committing the session."""
    now = datetime.now(timezone.utc)
    user = User(
        id=str(uuid.uuid4()),
        email=data.email,
        password_hash=password_hash,
        role="user",
        email_verified=False,
        display_name=data.display_name,
        created_at=now,
        updated_at=now,
    )
    db.add(user)
    await db.flush()

    auth_provider = AuthProvider(
        id=str(uuid.uuid4()),
        user_id=user.id,
        provider="email",
        provider_user_id=data.email,
        linked_at=now,
    )
    db.add(auth_provider)
    await db.flush()
    await db.refresh(user)
    return user


async def create_user_from_lastfm(db: AsyncSession, lastfm_username: str, access_token: str | None = None) -> User:
    """Caller is responsible for committing the session."""
    now = datetime.now(timezone.utc)
    user = User(
        id=str(uuid.uuid4()),
        role="user",
        email_verified=False,
        display_name=lastfm_username,
        created_at=now,
        updated_at=now,
    )
    db.add(user)
    await db.flush()

    auth_provider = AuthProvider(
        id=str(uuid.uuid4()),
        user_id=user.id,
        provider="lastfm",
        provider_user_id=lastfm_username,
        access_token=access_token,
        linked_at=now,
    )
    db.add(auth_provider)
    await db.flush()
    await db.refresh(user)
    return user


async def update_user(db: AsyncSession, user_id: str, data: UserUpdate) -> User | None:
    """Update a user. Returns None if not found.

    Caller is responsible for committing the session.
    """
    user = await get_user_by_id(db, user_id)
    if user is None:
        return None

    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(user, field, value)

    user.updated_at = datetime.now(timezone.utc)
    await db.flush()
    await db.refresh(user)
    return user


async def _get_or_create_user_from_provider(
    db: AsyncSession,
    provider: str,
    provider_user_id: str,
    email: str | None = None,
    display_name: str | None = None,
    email_verified: bool = False,
) -> tuple[User, bool]:
    """Returns (User, is_new) where is_new=True when created.

    Caller is responsible for committing the session.
    """
    now = datetime.now(timezone.utc)

    result = await db.execute(
        select(User)
        .join(AuthProvider)
        .where(
            AuthProvider.provider == provider,
            AuthProvider.provider_user_id == provider_user_id,
            User.deleted_at.is_(None),
        )
    )
    existing = result.scalar_one_or_none()
    if existing is not None:
        return existing, False

    if email:
        result = await db.execute(
            select(User).where(
                func.lower(User.email) == email.lower(),
                User.deleted_at.is_(None),
            )
        )
        user = result.scalar_one_or_none()
        if user is not None:
            if not email_verified:
                raise HTTPException(
                    status_code=409,
                    detail="An account with this email already exists",
                )
            auth_provider = AuthProvider(
                id=str(uuid.uuid4()),
                user_id=user.id,
                provider=provider,
                provider_user_id=provider_user_id,
                linked_at=now,
            )
            db.add(auth_provider)
            await db.flush()
            return user, False

    logger.warning(
        "Creating new user for provider=%s provider_user_id=%s email=%s display_name=%s — "
        "no existing user found by provider or email. This may indicate a duplicate account.",
        provider, provider_user_id, email, display_name,
    )

    user = User(
        id=str(uuid.uuid4()),
        email=email,
        role="user",
        email_verified=email_verified,
        display_name=display_name,
        created_at=now,
        updated_at=now,
    )
    db.add(user)
    await db.flush()

    auth_provider = AuthProvider(
        id=str(uuid.uuid4()),
        user_id=user.id,
        provider=provider,
        provider_user_id=provider_user_id,
        linked_at=now,
    )
    db.add(auth_provider)
    await db.flush()
    await db.refresh(user)

    logger.info(
        "Created new user id=%s via provider=%s provider_user_id=%s",
        user.id, provider, provider_user_id,
    )
    return user, True


async def get_or_create_user_from_google(
    db: AsyncSession,
    provider_user_id: str,
    email: str | None = None,
    display_name: str | None = None,
    email_verified: bool = False,
) -> tuple[User, bool]:
    """Caller is responsible for committing the session."""
    return await _get_or_create_user_from_provider(
        db, "google", provider_user_id, email, display_name, email_verified
    )


async def get_or_create_user_from_discord(
    db: AsyncSession,
    provider_user_id: str,
    email: str | None = None,
    display_name: str | None = None,
    email_verified: bool = False,
) -> tuple[User, bool]:
    """Caller is responsible for committing the session."""
    return await _get_or_create_user_from_provider(
        db, "discord", provider_user_id, email, display_name, email_verified
    )


async def delete_user(db: AsyncSession, user_id: str) -> bool:
    """Returns True if deleted, False if not found.

    Caller is responsible for committing the session.
    """
    user = await get_user_by_id(db, user_id)
    if user is None:
        return False
    user.deleted_at = datetime.now(timezone.utc)
    await db.flush()
    return True
