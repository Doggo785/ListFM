import asyncio
import secrets
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from httpx_oauth.clients.discord import DiscordOAuth2
from httpx_oauth.clients.google import GoogleOAuth2
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import Settings, get_settings
from database import get_db
from models.auth_provider import AuthProvider
from models.user import User
from repositories.users import (
    get_or_create_user_from_discord,
    get_or_create_user_from_google,
    get_user_by_email,
    get_user_by_lastfm_username,
)
from routers.auth import _store_refresh_token
from routers.deps import get_current_active_user, set_auth_cookies
from schemas import LinkLastfmRequest, LinkLastfmResponse, OAuthCompleteEmailRequest
from services.auth import create_access_token, create_refresh_token
from services.lastfm import get_user_info

router = APIRouter(prefix="/api/auth", tags=["auth-oauth"])

OAUTH_STATE_COOKIE = "oauth_state"
OAUTH_STATE_MAX_AGE = 600  # 10 minutes


def _google_client() -> GoogleOAuth2:
    settings = get_settings()
    return GoogleOAuth2(
        client_id=settings.google_oauth_client_id,
        client_secret=settings.google_oauth_client_secret,
    )


def _discord_client() -> DiscordOAuth2:
    settings = get_settings()
    return DiscordOAuth2(
        client_id=settings.discord_oauth_client_id,
        client_secret=settings.discord_oauth_client_secret,
    )


def check_oauth_configured(provider: str) -> None:
    settings = get_settings()
    if provider == "google":
        if not settings.google_oauth_client_id or not settings.google_oauth_client_secret:
            raise HTTPException(status_code=400, detail="google OAuth is not configured")
    elif provider == "discord":
        if not settings.discord_oauth_client_id or not settings.discord_oauth_client_secret:
            raise HTTPException(status_code=400, detail="discord OAuth is not configured")


def _redirect_uri(provider: str, settings: Settings) -> str:
    base = settings.oauth_redirect_base.rstrip("/")
    return f"{base}/api/auth/{provider}/callback"


@router.get("/google/login")
async def google_login(request: Request, response: Response):
    check_oauth_configured("google")
    settings = get_settings()
    state = secrets.token_urlsafe(32)

    response.set_cookie(
        key=OAUTH_STATE_COOKIE,
        value=state,
        httponly=True,
        samesite="lax",
        secure=settings.cookie_secure,
        max_age=OAUTH_STATE_MAX_AGE,
    )

    client = _google_client()
    redirect_uri = _redirect_uri("google", settings)
    authorization_url = await client.get_authorization_url(
        redirect_uri=redirect_uri,
        state=state,
    )

    return RedirectResponse(url=authorization_url, status_code=302)


@router.get("/google/callback")
async def google_callback(
    request: Request,
    response: Response,
    code: str | None = None,
    state: str | None = None,
    oauth_state: str | None = Cookie(None),
    db: AsyncSession = Depends(get_db),
):
    if code is None:
        raise HTTPException(status_code=400, detail="Missing authorization code")

    if not state or state != oauth_state:
        raise HTTPException(status_code=403, detail="Invalid or expired OAuth state")

    response.delete_cookie(key=OAUTH_STATE_COOKIE)

    client = _google_client()
    settings = get_settings()
    redirect_uri = _redirect_uri("google", settings)

    try:
        token = await client.get_access_token(code, redirect_uri)
    except Exception:
        raise HTTPException(status_code=400, detail="Failed to exchange authorization code")

    access_token = token["access_token"]
    provider_id, email = await client.get_id_email(access_token)
    profile = await client.get_profile(access_token)

    display_name = profile.get("name") or email

    user, is_new = await get_or_create_user_from_google(
        db, provider_user_id=provider_id, email=email, display_name=display_name
    )

    jwt_access = create_access_token(user.id)
    jwt_refresh = create_refresh_token(user.id)

    family = str(uuid.uuid4())
    await _store_refresh_token(db, user.id, jwt_refresh, family, request)

    try:
        await db.commit()
    except Exception:
        await db.rollback()
        raise HTTPException(status_code=500, detail="Failed to complete OAuth login")

    set_auth_cookies(response, jwt_access, jwt_refresh)

    redirect_path = "/link-lastfm" if is_new else "/dashboard"
    return RedirectResponse(url=f"{settings.frontend_url}{redirect_path}", status_code=302)


@router.get("/discord/login")
async def discord_login(request: Request, response: Response):
    check_oauth_configured("discord")
    settings = get_settings()
    state = secrets.token_urlsafe(32)

    response.set_cookie(
        key=OAUTH_STATE_COOKIE,
        value=state,
        httponly=True,
        samesite="lax",
        secure=settings.cookie_secure,
        max_age=OAUTH_STATE_MAX_AGE,
    )

    client = _discord_client()
    redirect_uri = _redirect_uri("discord", settings)
    authorization_url = await client.get_authorization_url(
        redirect_uri=redirect_uri,
        state=state,
    )

    return RedirectResponse(url=authorization_url, status_code=302)


@router.get("/discord/callback")
async def discord_callback(
    request: Request,
    response: Response,
    code: str | None = None,
    state: str | None = None,
    oauth_state: str | None = Cookie(None),
    db: AsyncSession = Depends(get_db),
):
    if code is None:
        raise HTTPException(status_code=400, detail="Missing authorization code")

    if not state or state != oauth_state:
        raise HTTPException(status_code=403, detail="Invalid or expired OAuth state")

    response.delete_cookie(key=OAUTH_STATE_COOKIE)

    client = _discord_client()
    settings = get_settings()
    redirect_uri = _redirect_uri("discord", settings)

    try:
        token = await client.get_access_token(code, redirect_uri)
    except Exception:
        raise HTTPException(status_code=400, detail="Failed to exchange authorization code")

    access_token = token["access_token"]
    provider_id, email = await client.get_id_email(access_token)
    profile = await client.get_profile(access_token)

    username = profile.get("username") or email

    # If Discord didn't provide an email, redirect to email prompt
    if not email:
        user, _ = await get_or_create_user_from_discord(
            db, provider_user_id=provider_id, email=None, display_name=username
        )

        jwt_access = create_access_token(user.id)
        jwt_refresh = create_refresh_token(user.id)

        family = str(uuid.uuid4())
        await _store_refresh_token(db, user.id, jwt_refresh, family, request)

        try:
            await db.commit()
        except Exception:
            await db.rollback()
            raise HTTPException(status_code=500, detail="Failed to complete OAuth login")

        set_auth_cookies(response, jwt_access, jwt_refresh)

        return RedirectResponse(url=f"{settings.frontend_url}/auth/callback?needs_email=1", status_code=302)

    user, is_new = await get_or_create_user_from_discord(
        db, provider_user_id=provider_id, email=email, display_name=username
    )

    jwt_access = create_access_token(user.id)
    jwt_refresh = create_refresh_token(user.id)

    family = str(uuid.uuid4())
    await _store_refresh_token(db, user.id, jwt_refresh, family, request)

    try:
        await db.commit()
    except Exception:
        await db.rollback()
        raise HTTPException(status_code=500, detail="Failed to complete OAuth login")

    set_auth_cookies(response, jwt_access, jwt_refresh)

    redirect_path = "/link-lastfm" if is_new else "/dashboard"
    return RedirectResponse(url=f"{settings.frontend_url}{redirect_path}", status_code=302)


@router.post("/link-lastfm", response_model=LinkLastfmResponse)
async def link_lastfm(
    body: LinkLastfmRequest,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Validate a Last.fm username and link it to the authenticated user."""
    username = body.username.strip()
    if not username:
        raise HTTPException(status_code=400, detail="Username is required")

    # Validate username exists on Last.fm (sync call in thread)
    try:
        info = await asyncio.to_thread(get_user_info, username)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid Last.fm username")

    existing_user = await get_user_by_lastfm_username(db, username)
    if existing_user is not None and existing_user.id != current_user.id:
        raise HTTPException(status_code=409, detail="Last.fm username is already linked to another account")

    result = await db.execute(
        select(AuthProvider).where(
            AuthProvider.user_id == current_user.id,
            AuthProvider.provider == "lastfm",
        )
    )
    existing_provider = result.scalar_one_or_none()
    if existing_provider is not None:
        await db.delete(existing_provider)
        await db.flush()

    now = datetime.now(timezone.utc)
    auth_provider = AuthProvider(
        id=str(uuid.uuid4()),
        user_id=current_user.id,
        provider="lastfm",
        provider_user_id=username,
        linked_at=now,
    )
    db.add(auth_provider)
    await db.flush()

    try:
        await db.commit()
    except Exception:
        await db.rollback()
        raise HTTPException(status_code=500, detail="Failed to link Last.fm account")

    return LinkLastfmResponse(username=username, image=info.get("image"))


@router.post("/oauth/complete-email")
async def complete_oauth_email(
    body: OAuthCompleteEmailRequest,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Set email for users who signed up via Discord without an email."""
    existing = await get_user_by_email(db, body.email)
    if existing is not None and existing.id != current_user.id:
        raise HTTPException(
            status_code=409,
            detail="An account with this email already exists",
        )

    current_user.email = body.email
    current_user.updated_at = datetime.now(timezone.utc)
    await db.flush()

    try:
        await db.commit()
    except Exception:
        await db.rollback()
        raise HTTPException(status_code=500, detail="Failed to update email")

    return {"detail": "Email updated"}
