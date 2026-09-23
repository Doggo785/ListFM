from fastapi import Cookie, Depends, HTTPException, Response
import jwt
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_settings
from database import get_db
from models.automation import Automation
from models.user import User
from repositories.automations import get_automation
from repositories.users import get_lastfm_provider, get_user_by_id
from services.auth import decode_token


async def get_current_user(
    access_token: str | None = Cookie(None),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Decode JWT from httpOnly cookie and return the user.

    Raises HTTPException(401) if token is missing, invalid, or user not found.
    """
    if access_token is None:
        raise HTTPException(status_code=401, detail="Not authenticated")

    try:
        payload = decode_token(access_token, expected_typ="access")
        user_id: str | None = payload.get("sub")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    if user_id is None:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    user = await get_user_by_id(db, user_id)
    if user is None:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    return user


async def get_current_active_user(
    current_user: User = Depends(get_current_user),
) -> User:
    if current_user.deleted_at is not None:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return current_user


async def get_current_user_lastfm_username(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> str:
    provider = await get_lastfm_provider(db, current_user.id)
    if provider is None:
        raise HTTPException(
            status_code=400,
            detail="No Last.fm account linked. Please link your Last.fm account first.",
        )
    return provider.provider_user_id


async def get_owned_automation(
    automation_id: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> Automation:
    """Fetch an automation scoped to the current user, or 404.

    `automation_id` is resolved from the path by FastAPI. A foreign or
    unknown id yields the same 404 so existence is never leaked.
    """
    automation = await get_automation(db, automation_id, current_user.id)
    if automation is None:
        raise HTTPException(status_code=404, detail="Automation not found")
    return automation


def set_auth_cookies(response: Response, access_token: str, refresh_token: str) -> None:
    settings = get_settings()

    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        samesite="lax",
        secure=settings.cookie_secure,
        path="/",
        max_age=settings.access_token_expire_minutes * 60,
    )
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        samesite="lax",
        secure=settings.cookie_secure,
        path="/",
        max_age=settings.refresh_token_expire_days * 86400,
    )


def clear_auth_cookies(response: Response) -> None:
    # Mirror set_auth_cookies flags exactly, otherwise the browser keeps the
    # cookies (deletion only applies to the same path/secure scope).
    settings = get_settings()
    for key in ("access_token", "refresh_token"):
        response.delete_cookie(
            key=key,
            httponly=True,
            samesite="lax",
            secure=settings.cookie_secure,
            path="/",
        )
