import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response
from jose import JWTError
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_settings
from database import get_db
from models.user import User
from repositories.refresh_tokens import (
    create_refresh_token as store_refresh_token,
    get_refresh_token_by_hash,
    revoke_refresh_token_family,
)
from repositories.users import create_user, get_lastfm_provider, get_user_by_email
from schemas import TokenResponse, UserCreate, UserLogin
from services.auth import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    hash_refresh_token,
    verify_password,
)
from routers.deps import (
    clear_auth_cookies,
    get_current_active_user,
    set_auth_cookies,
)
from services.rate_limit import (
    DUPLICATE_EMAIL_MESSAGE,
    rate_limit,
    rate_limit_by_key,
    rate_limit_email_key,
    login_limiter,
    register_limiter,
    register_email_limiter,
    refresh_limiter,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _build_token_response(
    access_token: str,
    refresh_token: str,
) -> TokenResponse:
    settings = get_settings()
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        expires_in=settings.access_token_expire_minutes * 60,
    )


@router.post("/register", response_model=TokenResponse, status_code=201)
async def register(
    body: UserCreate,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    rate_limit(request, register_limiter)
    email = body.email.strip().lower()

    if len(body.password) < 8:
        raise HTTPException(status_code=422, detail="Password must be at least 8 characters")

    rate_limit_by_key(register_email_limiter, rate_limit_email_key(email))
    existing = await get_user_by_email(db, email)
    if existing is not None:
        raise HTTPException(status_code=409, detail=DUPLICATE_EMAIL_MESSAGE)

    # Create user (also creates auth_provider entry)
    user_data = UserCreate(email=email, password=body.password, display_name=body.display_name)
    password_hash = hash_password(body.password)
    user = await create_user(db, user_data, password_hash)

    access_token = create_access_token(user.id)
    refresh_token = create_refresh_token(user.id)

    family = str(uuid.uuid4())
    await store_refresh_token(db, user.id, refresh_token, family, request)

    try:
        await db.commit()
    except Exception:
        await db.rollback()
        raise HTTPException(status_code=500, detail="Failed to create account")

    set_auth_cookies(response, access_token, refresh_token)

    return _build_token_response(access_token, refresh_token)


@router.post("/login", response_model=TokenResponse)
async def login(
    body: UserLogin,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    rate_limit(request, login_limiter)
    email = body.email.strip().lower()

    user = await get_user_by_email(db, email)
    if user is None or user.password_hash is None:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    access_token = create_access_token(user.id)
    refresh_token = create_refresh_token(user.id)

    family = str(uuid.uuid4())
    await store_refresh_token(db, user.id, refresh_token, family, request)

    try:
        await db.commit()
    except Exception:
        await db.rollback()
        raise HTTPException(status_code=500, detail="Failed to log in")

    set_auth_cookies(response, access_token, refresh_token)

    return _build_token_response(access_token, refresh_token)


@router.post("/refresh", response_model=TokenResponse)
async def refresh(
    request: Request,
    response: Response,
    refresh_token: str | None = Cookie(None),
    db: AsyncSession = Depends(get_db),
):
    rate_limit(request, refresh_limiter)
    if refresh_token is None:
        raise HTTPException(status_code=401, detail="Not authenticated")

    try:
        payload = decode_token(refresh_token)
        user_id: str | None = payload.get("sub")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    if user_id is None:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    token_hash = hash_refresh_token(refresh_token)
    stored_token = await get_refresh_token_by_hash(db, token_hash)

    if stored_token is None:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    if stored_token.revoked:
        # Token reuse detected — revoke entire family to prevent stolen token usage
        await revoke_refresh_token_family(db, stored_token.family)
        try:
            await db.commit()
        except Exception:
            await db.rollback()
            raise HTTPException(status_code=500, detail="Failed to refresh token")
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    if stored_token.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    family = stored_token.family

    new_access_token = create_access_token(user_id)
    new_refresh_token = create_refresh_token(user_id)

    new_rt = await store_refresh_token(db, user_id, new_refresh_token, family, request)

    stored_token.revoked = True
    stored_token.replaced_by = new_rt.id
    await db.flush()

    try:
        await db.commit()
    except Exception:
        await db.rollback()
        raise HTTPException(status_code=500, detail="Failed to refresh token")

    set_auth_cookies(response, new_access_token, new_refresh_token)

    return _build_token_response(new_access_token, new_refresh_token)


@router.post("/logout")
async def logout(
    response: Response,
    refresh_token: str | None = Cookie(None),
    db: AsyncSession = Depends(get_db),
):
    if refresh_token is not None:
        token_hash = hash_refresh_token(refresh_token)
        stored_token = await get_refresh_token_by_hash(db, token_hash)
        if stored_token is not None:
            stored_token.revoked = True
            await db.flush()

        try:
            await db.commit()
        except Exception:
            await db.rollback()
            raise HTTPException(status_code=500, detail="Failed to log out")

    clear_auth_cookies(response)

    return {"detail": "Logged out"}


@router.get("/me")
async def me(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    lastfm_provider = await get_lastfm_provider(db, current_user.id)
    lastfm_username = lastfm_provider.provider_user_id if lastfm_provider else None

    return {
        "id": current_user.id,
        "email": current_user.email,
        "display_name": current_user.display_name,
        "role": current_user.role,
        "lastfm_username": lastfm_username,
        "is_lastfm_linked": lastfm_username is not None,
    }
