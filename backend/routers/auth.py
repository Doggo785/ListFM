import hashlib
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response
from jose import JWTError
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_settings
from database import get_db
from models.refresh_token import RefreshToken
from models.user import User
from repositories.users import create_user, get_user_by_email
from schemas import TokenResponse, UserCreate, UserLogin
from services.auth import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from routers.deps import (
    clear_auth_cookies,
    get_current_active_user,
    set_auth_cookies,
)
from services.rate_limit import rate_limit, login_limiter, register_limiter, refresh_limiter

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


async def _store_refresh_token(
    db: AsyncSession,
    user_id: str,
    token: str,
    family: str,
    request: Request,
) -> RefreshToken:
    settings = get_settings()
    now = datetime.now(timezone.utc)
    rt = RefreshToken(
        id=str(uuid.uuid4()),
        user_id=user_id,
        token_hash=_hash_token(token),
        family=family,
        expires_at=now + timedelta(days=settings.refresh_token_expire_days),
        user_agent=request.headers.get("user-agent", "")[:500] or None,
        ip_address=request.client.host if request.client else None,
    )
    db.add(rt)
    await db.flush()
    return rt


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

    existing = await get_user_by_email(db, email)
    if existing is not None:
        raise HTTPException(status_code=409, detail="An account with this email already exists")

    # Create user (also creates auth_provider entry)
    user_data = UserCreate(email=email, password=body.password, display_name=body.display_name)
    password_hash = hash_password(body.password)
    user = await create_user(db, user_data, password_hash)

    access_token = create_access_token(user.id)
    refresh_token = create_refresh_token(user.id)

    family = str(uuid.uuid4())
    await _store_refresh_token(db, user.id, refresh_token, family, request)

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
    await _store_refresh_token(db, user.id, refresh_token, family, request)

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

    token_hash = _hash_token(refresh_token)
    result = await db.execute(
        select(RefreshToken).where(RefreshToken.token_hash == token_hash)
    )
    stored_token = result.scalar_one_or_none()

    if stored_token is None:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    if stored_token.revoked:
        # Token reuse detected — revoke entire family to prevent stolen token usage
        await db.execute(
            update(RefreshToken)
            .where(RefreshToken.family == stored_token.family, RefreshToken.revoked == False)
            .values(revoked=True)
        )
        await db.flush()
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    if stored_token.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    family = stored_token.family

    new_access_token = create_access_token(user_id)
    new_refresh_token = create_refresh_token(user_id)

    new_rt = await _store_refresh_token(db, user_id, new_refresh_token, family, request)

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
        token_hash = _hash_token(refresh_token)
        result = await db.execute(
            select(RefreshToken).where(RefreshToken.token_hash == token_hash)
        )
        stored_token = result.scalar_one_or_none()
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
async def me(current_user: User = Depends(get_current_active_user)):
    return {
        "id": current_user.id,
        "email": current_user.email,
        "display_name": current_user.display_name,
        "role": current_user.role,
    }
