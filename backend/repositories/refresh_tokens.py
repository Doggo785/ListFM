import uuid
from datetime import datetime, timedelta, timezone

from fastapi import Request
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_settings
from models.refresh_token import RefreshToken
from services.auth import hash_refresh_token


async def create_refresh_token(
    db: AsyncSession,
    user_id: str,
    token: str,
    family: str,
    request: Request,
) -> RefreshToken:
    """Construct and persist a RefreshToken row. Caller commits the session."""
    settings = get_settings()
    now = datetime.now(timezone.utc)
    rt = RefreshToken(
        id=str(uuid.uuid4()),
        user_id=user_id,
        token_hash=hash_refresh_token(token),
        family=family,
        expires_at=now + timedelta(days=settings.refresh_token_expire_days),
        user_agent=request.headers.get("user-agent", "")[:500] or None,
        ip_address=request.client.host if request.client else None,
    )
    db.add(rt)
    await db.flush()
    return rt


async def get_refresh_token_by_hash(db: AsyncSession, token_hash: str) -> RefreshToken | None:
    result = await db.execute(
        select(RefreshToken).where(RefreshToken.token_hash == token_hash)
    )
    return result.scalar_one_or_none()


async def revoke_refresh_token_family(db: AsyncSession, family: str) -> int:
    """Revoke every non-revoked token in a family. Returns affected row count."""
    result = await db.execute(
        update(RefreshToken)
        .where(RefreshToken.family == family, RefreshToken.revoked == False)
        .values(revoked=True)
    )
    await db.flush()
    return result.rowcount