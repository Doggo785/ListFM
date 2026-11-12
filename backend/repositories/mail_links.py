import hashlib
import secrets
import uuid
from datetime import UTC, datetime, timedelta

from models.mail_link import MailLink
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

# How long a link works: an address can wait for a day, a password reset for an hour.
LIFETIME = {"verify": timedelta(hours=24), "reset": timedelta(hours=1)}


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


async def create_mail_link(db: AsyncSession, user_id: str, purpose: str) -> str:
    """A fresh link, which replaces the user's older one for the same purpose. Returns the token for the email.

    Caller is responsible for committing the session.
    """
    await db.execute(delete(MailLink).where(MailLink.user_id == user_id, MailLink.purpose == purpose))
    token = secrets.token_urlsafe(32)
    db.add(
        MailLink(
            id=str(uuid.uuid4()),
            user_id=user_id,
            purpose=purpose,
            token_hash=_hash(token),
            expires_at=datetime.now(UTC) + LIFETIME[purpose],
        )
    )
    await db.flush()
    return token


async def use_mail_link(db: AsyncSession, token: str, purpose: str) -> str | None:
    """The user a link was sent to, and the link stops working; None if unknown, expired or for something else.

    Caller is responsible for committing the session.
    """
    link = (await db.execute(select(MailLink).where(MailLink.token_hash == _hash(token)))).scalar_one_or_none()
    if link is None or link.purpose != purpose:
        return None
    await db.delete(link)
    await db.flush()
    return link.user_id if link.expires_at > datetime.now(UTC) else None


async def delete_expired_mail_links(db: AsyncSession) -> None:
    await db.execute(delete(MailLink).where(MailLink.expires_at <= datetime.now(UTC)))
