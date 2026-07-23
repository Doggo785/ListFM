import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

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
        select(User).where(User.email == email, User.deleted_at.is_(None))
    )
    return result.scalar_one_or_none()


async def get_user_by_lastfm_username(db: AsyncSession, lastfm_username: str) -> User | None:
    """Get a user by Last.fm username via auth_providers."""
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
    """Create a new user with email/password.

    Caller is responsible for committing the session.
    """
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
    """Create a new user from Last.fm OAuth.

    Caller is responsible for committing the session.
    """
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
) -> tuple[User, bool]:
    """Shared logic for looking up/creating a user from an OAuth provider.

    Returns (User, is_new) where is_new=True when a new user is created.
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
            select(User).where(User.email == email, User.deleted_at.is_(None))
        )
        user = result.scalar_one_or_none()
        if user is not None:
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

    user = User(
        id=str(uuid.uuid4()),
        email=email,
        role="user",
        email_verified=False,
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
    return user, True


async def get_or_create_user_from_google(
    db: AsyncSession,
    provider_user_id: str,
    email: str | None = None,
    display_name: str | None = None,
) -> tuple[User, bool]:
    """Look up user by Google provider_user_id, or create a new one.

    Returns (User, is_new) where is_new=True when a new user is created.
    Caller is responsible for committing the session.
    """
    return await _get_or_create_user_from_provider(db, "google", provider_user_id, email, display_name)


async def get_or_create_user_from_discord(
    db: AsyncSession,
    provider_user_id: str,
    email: str | None = None,
    display_name: str | None = None,
) -> tuple[User, bool]:
    """Look up user by Discord provider_user_id, or create a new one.

    Returns (User, is_new) where is_new=True when a new user is created.
    Caller is responsible for committing the session.
    """
    return await _get_or_create_user_from_provider(db, "discord", provider_user_id, email, display_name)


async def delete_user(db: AsyncSession, user_id: str) -> bool:
    """Soft delete a user. Returns True if deleted, False if not found.

    Caller is responsible for committing the session.
    """
    user = await get_user_by_id(db, user_id)
    if user is None:
        return False
    user.deleted_at = datetime.now(timezone.utc)
    await db.flush()
    return True
