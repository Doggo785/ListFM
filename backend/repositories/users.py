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
    """Create a new user with email/password."""
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
    await db.commit()
    await db.refresh(user)
    return user


async def create_user_from_lastfm(db: AsyncSession, lastfm_username: str, access_token: str | None = None) -> User:
    """Create a new user from Last.fm OAuth."""
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
    await db.commit()
    await db.refresh(user)
    return user


async def update_user(db: AsyncSession, user_id: str, data: UserUpdate) -> User | None:
    """Update a user. Returns None if not found."""
    user = await get_user_by_id(db, user_id)
    if user is None:
        return None

    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(user, field, value)

    user.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(user)
    return user


async def delete_user(db: AsyncSession, user_id: str) -> bool:
    """Soft delete a user. Returns True if deleted, False if not found."""
    user = await get_user_by_id(db, user_id)
    if user is None:
        return False
    user.deleted_at = datetime.now(timezone.utc)
    await db.commit()
    return True
