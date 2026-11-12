import logging
import uuid
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

from models.auth_provider import AuthProvider
from models.mail_link import MailLink
from models.refresh_token import RefreshToken
from models.user import User
from schemas import UserCreate, UserUpdate
from services.rate_limit import DUPLICATE_EMAIL_MESSAGE


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
    """Find a user by their linked Last.fm username (case-insensitive).

    Last.fm usernames are case-insensitive, so the lookup normalizes both
    sides to lowercase. Callers should also normalize before storing to keep
    the unique (provider, provider_user_id) constraint meaningful.
    """
    result = await db.execute(
        select(User)
        .join(AuthProvider)
        .where(
            AuthProvider.provider == "lastfm",
            func.lower(AuthProvider.provider_user_id) == lastfm_username.lower(),
            User.deleted_at.is_(None),
        )
    )
    return result.scalar_one_or_none()


async def get_lastfm_provider(db: AsyncSession, user_id: str) -> AuthProvider | None:
    result = await db.execute(
        select(AuthProvider).where(
            AuthProvider.user_id == user_id,
            AuthProvider.provider == "lastfm",
        )
    )
    return result.scalar_one_or_none()


async def create_user(db: AsyncSession, data: UserCreate, password_hash: str) -> User:
    """Caller is responsible for committing the session."""
    now = datetime.now(UTC)
    user = User(
        id=str(uuid.uuid4()),
        email=data.email,
        password_hash=password_hash,
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

    user.updated_at = datetime.now(UTC)
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
    now = datetime.now(UTC)

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
        if email_verified:
            # The provider vouches for the mailbox: an unconfirmed sign-up can't keep the address from its owner.
            await release_unconfirmed_email(db, email)
        result = await db.execute(
            select(User).where(
                func.lower(User.email) == email.lower(),
                User.deleted_at.is_(None),
            )
        )
        user = result.scalar_one_or_none()
        if user is not None:
            # Both sides must own the address: a local account registered
            # with someone else's unverified email must not absorb their login.
            if not (email_verified and user.email_verified):
                raise HTTPException(
                    status_code=409,
                    detail=DUPLICATE_EMAIL_MESSAGE,
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
        "Creating new user for provider=%s provider_user_id=%s — "
        "no existing user found by provider or email. This may indicate a duplicate account.",
        provider, provider_user_id,
    )

    user = User(
        id=str(uuid.uuid4()),
        email=email,
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

    Sign-in links and identity go at once, so the same email or Last.fm account
    can start over. Caller is responsible for committing the session.
    """
    user = await get_user_by_id(db, user_id)
    if user is None:
        return False
    await db.execute(delete(AuthProvider).where(AuthProvider.user_id == user_id))
    await db.execute(delete(RefreshToken).where(RefreshToken.user_id == user_id))
    await db.execute(delete(MailLink).where(MailLink.user_id == user_id))
    user.email = None
    user.password_hash = None
    user.display_name = None
    user.timezone = None
    user.deleted_at = datetime.now(UTC)
    await db.flush()
    return True


# Never confirmed and nothing but a password: no session ever opened, so no data either.
def _unconfirmed_signups():
    other_sign_in = select(AuthProvider.id).where(AuthProvider.user_id == User.id, AuthProvider.provider != "email").exists()
    return select(User.id).where(
        User.email_verified.is_(False),
        User.password_hash.is_not(None),
        User.deleted_at.is_(None),
        ~other_sign_in,
    )


async def _erase_users(db: AsyncSession, ids: list[str]) -> None:
    if not ids:
        return
    for model in (AuthProvider, RefreshToken, MailLink):
        await db.execute(delete(model).where(model.user_id.in_(ids)))
    await db.execute(delete(User).where(User.id.in_(ids)))


async def release_unconfirmed_email(db: AsyncSession, email: str) -> None:
    """Let whoever owns an address take it: an unconfirmed sign-up holding it goes, another account loses it.

    Caller is responsible for committing the session.
    """
    holder = await get_user_by_email(db, email)
    if holder is None or holder.email_verified:
        return
    if (await db.execute(_unconfirmed_signups().where(User.id == holder.id))).first():
        await _erase_users(db, [holder.id])
    else:
        holder.email = None
    await db.flush()


async def purge_unconfirmed_signups(db: AsyncSession, older_than: timedelta) -> int:
    """Erase the sign-ups nobody confirmed in time, which frees their addresses. Returns how many went.

    Caller is responsible for committing the session.
    """
    cutoff = datetime.now(UTC) - older_than
    ids = list((await db.execute(_unconfirmed_signups().where(User.created_at < cutoff))).scalars())
    await _erase_users(db, ids)
    return len(ids)
