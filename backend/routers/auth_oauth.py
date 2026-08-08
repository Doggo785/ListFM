import asyncio
import secrets
import uuid
from datetime import datetime, timezone

import httpx
import pylast
from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response
from fastapi.responses import JSONResponse, RedirectResponse
from httpx_oauth.clients.discord import DiscordOAuth2
from httpx_oauth.clients.google import GoogleOAuth2
from httpx_oauth.oauth2 import GetAccessTokenError
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from config import Settings, get_settings
from database import get_db
from models.auth_provider import AuthProvider
from models.user import User
from repositories.refresh_tokens import (
    create_refresh_token as store_refresh_token,
    revoke_all_user_refresh_tokens,
)
from repositories.users import (
    get_lastfm_provider,
    get_or_create_user_from_discord,
    get_or_create_user_from_google,
    get_user_by_email,
    get_user_by_lastfm_username,
)
from routers.deps import get_current_active_user, set_auth_cookies
from schemas import LinkLastfmRequest, LinkLastfmResponse, OAuthCompleteEmailRequest
from services.auth import create_access_token, create_refresh_token
from services.lastfm import get_user_info
from services.rate_limit import (
    DUPLICATE_EMAIL_MESSAGE,
    complete_email_limiter,
    link_lastfm_limiter,
    oauth_login_limiter,
    rate_limit,
)

router = APIRouter(prefix="/api/auth", tags=["auth-oauth"])

OAUTH_STATE_COOKIE = "oauth_state"
OAUTH_STATE_MAX_AGE = 600  # 10 minutes


def _clear_oauth_state_cookie(response: Response) -> None:
    response.delete_cookie(key=OAUTH_STATE_COOKIE, httponly=True, samesite="lax")


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


OAUTH_PROVIDER_CONFIGS = {
    "google": ("google_oauth_client_id", "google_oauth_client_secret"),
    "discord": ("discord_oauth_client_id", "discord_oauth_client_secret"),
}


def check_oauth_configured(provider: str) -> None:
    settings = get_settings()
    config = OAUTH_PROVIDER_CONFIGS.get(provider)
    if config is None:
        raise HTTPException(status_code=400, detail=f"Unknown OAuth provider: {provider}")
    client_id_attr, client_secret_attr = config
    if not getattr(settings, client_id_attr) or not getattr(settings, client_secret_attr):
        raise HTTPException(status_code=400, detail=f"{provider} OAuth is not configured")


def _redirect_uri(provider: str, settings: Settings) -> str:
    base = settings.oauth_redirect_base.rstrip("/")
    return f"{base}/api/auth/{provider}/callback"


async def _extract_oauth_profile(
    client: GoogleOAuth2 | DiscordOAuth2,
    access_token: str,
    provider: str,
) -> tuple[str, str | None, bool, dict]:
    """Fetch OAuth profile once and extract (provider_id, email, email_verified, profile).

    For Google, uses the userinfo endpoint (no People API required).
    For Discord, uses the httpx-oauth client's get_profile().

    email_verified mirrors the provider's email-verification claim
    (Google: verified_email, Discord: verified; absent means False).
    """
    if provider == "google":
        async with httpx.AsyncClient() as http:
            resp = await http.get(
                "https://www.googleapis.com/oauth2/v2/userinfo",
                headers={"Authorization": f"Bearer {access_token}"},
            )
            if resp.status_code >= 400:
                raise HTTPException(
                    status_code=502,
                    detail=f"Failed to fetch Google profile: {resp.status_code}",
                )
            profile = resp.json()
        provider_id = profile.get("id", "")
        email = profile.get("email")
        email_verified = profile.get("verified_email", False) is True
    elif provider == "discord":
        profile = await client.get_profile(access_token)
        provider_id = profile.get("id", "")
        email = profile.get("email")
        email_verified = profile.get("verified", False) is True
    else:
        raise ValueError(f"Unknown provider: {provider}")
    return provider_id, email, email_verified, profile


async def _finalize_oauth_login(
    db: AsyncSession,
    request: Request,
    user: User,
    is_new: bool,
    settings: Settings,
    needs_email: bool = False,
) -> RedirectResponse:
    jwt_access = create_access_token(user.id)
    jwt_refresh = create_refresh_token(user.id)

    family = str(uuid.uuid4())
    await revoke_all_user_refresh_tokens(db, user.id)
    await store_refresh_token(db, user.id, jwt_refresh, family, request)

    try:
        await db.commit()
    except SQLAlchemyError:
        await db.rollback()
        raise HTTPException(status_code=500, detail="Failed to complete OAuth login")

    if needs_email:
        resp = RedirectResponse(url=f"{settings.frontend_url}/auth/callback?needs_email=1", status_code=302)
    else:
        redirect_path = "/link-lastfm" if is_new else "/dashboard"
        resp = RedirectResponse(url=f"{settings.frontend_url}{redirect_path}", status_code=302)

    resp.delete_cookie(key=OAUTH_STATE_COOKIE)
    set_auth_cookies(resp, jwt_access, jwt_refresh)
    return resp


@router.get("/google/login")
async def google_login(request: Request):
    rate_limit(request, oauth_login_limiter)
    check_oauth_configured("google")
    settings = get_settings()
    state = secrets.token_urlsafe(32)

    client = _google_client()
    redirect_uri = _redirect_uri("google", settings)
    authorization_url = await client.get_authorization_url(
        redirect_uri=redirect_uri,
        state=state,
    )

    resp = RedirectResponse(url=authorization_url, status_code=302)
    resp.set_cookie(
        key=OAUTH_STATE_COOKIE,
        value=state,
        httponly=True,
        samesite="lax",
        secure=settings.cookie_secure,
        max_age=OAUTH_STATE_MAX_AGE,
    )
    return resp


@router.get("/google/callback")
async def google_callback(
    request: Request,
    code: str | None = None,
    state: str | None = None,
    oauth_state: str | None = Cookie(None),
    db: AsyncSession = Depends(get_db),
):
    rate_limit(request, oauth_login_limiter)
    if code is None:
        resp = JSONResponse(status_code=400, content={"detail": "Missing authorization code"})
        _clear_oauth_state_cookie(resp)
        return resp

    if not state or state != oauth_state:
        resp = JSONResponse(status_code=403, content={"detail": "Invalid or expired OAuth state"})
        _clear_oauth_state_cookie(resp)
        return resp

    client = _google_client()
    settings = get_settings()
    redirect_uri = _redirect_uri("google", settings)

    try:
        token = await client.get_access_token(code, redirect_uri)
    except GetAccessTokenError:
        resp = JSONResponse(status_code=400, content={"detail": "Failed to exchange authorization code"})
        _clear_oauth_state_cookie(resp)
        return resp

    access_token = token["access_token"]
    provider_id, email, email_verified, profile = await _extract_oauth_profile(client, access_token, "google")

    display_name = profile.get("name") or email

    user, is_new = await get_or_create_user_from_google(
        db, provider_user_id=provider_id, email=email, display_name=display_name, email_verified=email_verified
    )

    return await _finalize_oauth_login(db, request, user, is_new, settings)


@router.get("/discord/login")
async def discord_login(request: Request):
    rate_limit(request, oauth_login_limiter)
    check_oauth_configured("discord")
    settings = get_settings()
    state = secrets.token_urlsafe(32)

    client = _discord_client()
    redirect_uri = _redirect_uri("discord", settings)
    authorization_url = await client.get_authorization_url(
        redirect_uri=redirect_uri,
        state=state,
    )

    resp = RedirectResponse(url=authorization_url, status_code=302)
    resp.set_cookie(
        key=OAUTH_STATE_COOKIE,
        value=state,
        httponly=True,
        samesite="lax",
        secure=settings.cookie_secure,
        max_age=OAUTH_STATE_MAX_AGE,
    )
    return resp


@router.get("/discord/callback")
async def discord_callback(
    request: Request,
    code: str | None = None,
    state: str | None = None,
    oauth_state: str | None = Cookie(None),
    db: AsyncSession = Depends(get_db),
):
    rate_limit(request, oauth_login_limiter)
    if code is None:
        resp = JSONResponse(status_code=400, content={"detail": "Missing authorization code"})
        _clear_oauth_state_cookie(resp)
        return resp

    if not state or state != oauth_state:
        resp = JSONResponse(status_code=403, content={"detail": "Invalid or expired OAuth state"})
        _clear_oauth_state_cookie(resp)
        return resp

    client = _discord_client()
    settings = get_settings()
    redirect_uri = _redirect_uri("discord", settings)

    try:
        token = await client.get_access_token(code, redirect_uri)
    except GetAccessTokenError:
        resp = JSONResponse(status_code=400, content={"detail": "Failed to exchange authorization code"})
        _clear_oauth_state_cookie(resp)
        return resp

    access_token = token["access_token"]
    provider_id, email, email_verified, profile = await _extract_oauth_profile(client, access_token, "discord")

    username = profile.get("username") or email

    if not email:
        user, is_new = await get_or_create_user_from_discord(
            db, provider_user_id=provider_id, email=None, display_name=username, email_verified=False
        )
        if user.email is not None:
            return await _finalize_oauth_login(db, request, user, is_new=False, settings=settings)
        return await _finalize_oauth_login(db, request, user, is_new=is_new, settings=settings, needs_email=True)

    user, is_new = await get_or_create_user_from_discord(
        db, provider_user_id=provider_id, email=email, display_name=username, email_verified=email_verified
    )

    return await _finalize_oauth_login(db, request, user, is_new, settings)


@router.post("/link-lastfm", response_model=LinkLastfmResponse)
async def link_lastfm(
    body: LinkLastfmRequest,
    request: Request,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    rate_limit(request, link_lastfm_limiter)

    # Last.fm usernames are case-insensitive; normalize before validating and
    # storing so the unique (provider, provider_user_id) index is meaningful.
    username = body.username.strip().lower()
    if not username:
        raise HTTPException(status_code=400, detail="Username is required")

    try:
        info = await asyncio.to_thread(get_user_info, username)
    except pylast.WSError:
        # pylast.WSError means the username does not exist on Last.fm.
        raise HTTPException(status_code=400, detail="Invalid Last.fm username")
    except Exception:
        # Anything else is a genuine upstream failure (outage, network) — do
        # not mislead the user into thinking their username is wrong, and do
        # not leak internal exception text.
        raise HTTPException(status_code=502, detail="Unable to reach Last.fm. Please try again later.")

    existing_user = await get_user_by_lastfm_username(db, username)
    if existing_user is not None and existing_user.id != current_user.id:
        raise HTTPException(status_code=409, detail="Last.fm username is already linked to another account")

    existing_provider = await get_lastfm_provider(db, current_user.id)
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
    except IntegrityError:
        # Concurrent link of the same (lowercased) username by two users. The
        # unique (provider, provider_user_id) index is the source of truth.
        await db.rollback()
        raise HTTPException(status_code=409, detail="Last.fm username is already linked to another account")
    except SQLAlchemyError:
        await db.rollback()
        raise HTTPException(status_code=500, detail="Failed to link Last.fm account")

    return LinkLastfmResponse(username=username, image=info.get("image"))


@router.post("/oauth/complete-email")
async def complete_oauth_email(
    body: OAuthCompleteEmailRequest,
    request: Request,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    rate_limit(request, complete_email_limiter)
    if current_user.email is not None:
        raise HTTPException(status_code=400, detail="Email already set")

    existing = await get_user_by_email(db, body.email)
    if existing is not None and existing.id != current_user.id:
        raise HTTPException(
            status_code=409,
            detail=DUPLICATE_EMAIL_MESSAGE,
        )

    current_user.email = body.email
    current_user.email_verified = False
    current_user.updated_at = datetime.now(timezone.utc)
    await db.flush()

    try:
        await db.commit()
    except IntegrityError:
        # Concurrent registration of the same email by two accounts. The unique
        # users.email index is the source of truth.
        await db.rollback()
        raise HTTPException(status_code=409, detail=DUPLICATE_EMAIL_MESSAGE)
    except SQLAlchemyError:
        await db.rollback()
        raise HTTPException(status_code=500, detail="Failed to update email")

    return {"detail": "Email updated"}
