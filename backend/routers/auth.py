import uuid
from datetime import UTC, datetime, timedelta

import jwt
from config import get_settings
from database import get_db
from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response
from models.refresh_token import RefreshToken
from models.user import User
from repositories.automations import delete_user_automations
from repositories.generated_playlists import delete_user_playlists
from repositories.refresh_tokens import (
    create_refresh_token as store_refresh_token,
    get_refresh_token_by_hash,
    revoke_all_user_refresh_tokens,
    revoke_refresh_token_family,
)
from repositories.scrobbles import delete_scrobbles
from repositories.user_tracks import delete_user_tracks
from repositories.users import (
    create_user,
    delete_user,
    get_lastfm_provider,
    get_user_by_email,
)
from routers.deps import (
    clear_auth_cookies,
    get_current_active_user,
    set_auth_cookies,
)
from schemas import (
    AccountDelete,
    GuideUpdate,
    PasswordChange,
    TimezoneUpdate,
    TokenResponse,
    UserCreate,
    UserLogin,
)
from services.auth import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    hash_refresh_token,
    verify_password,
)
from services.rate_limit import (
    DUPLICATE_EMAIL_MESSAGE,
    login_limiter,
    rate_limit,
    rate_limit_by_key,
    rate_limit_email_key,
    refresh_limiter,
    register_email_limiter,
    register_limiter,
)
from services.scrobble_sync import stop_scrobble_sync
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _build_token_response() -> TokenResponse:
    settings = get_settings()
    return TokenResponse(
        token_type="bearer",
        expires_in=settings.access_token_expire_minutes * 60,
    )


async def _establish_session(
    db: AsyncSession,
    user: User,
    request: Request,
    response: Response,
    *,
    error_detail: str,
) -> None:
    """Create tokens, revoke stale refresh tokens, persist the new one, and set cookies.

    Shared by register() and login(). Commits the session; on failure rolls back
    and raises a 500 with the caller-provided detail. Both tokens live in their
    httpOnly cookies only — nothing token-related goes in the response body.
    """
    access_token = create_access_token(user.id)
    refresh_token = create_refresh_token(user.id)

    family = str(uuid.uuid4())
    await revoke_all_user_refresh_tokens(db, user.id)
    await store_refresh_token(db, user.id, refresh_token, family, request)

    try:
        await db.commit()
    except SQLAlchemyError:
        await db.rollback()
        raise HTTPException(status_code=500, detail=error_detail)

    set_auth_cookies(response, access_token, refresh_token)


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

    await _establish_session(
        db, user, request, response, error_detail="Failed to create account"
    )

    return _build_token_response()


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

    await _establish_session(
        db, user, request, response, error_detail="Failed to log in"
    )

    return _build_token_response()


# Two tabs refreshing at once send the same token; the loser of the race
# arrives just after rotation. Within this window it gets a sibling token
# instead of being treated as theft (which would log both tabs out).
REFRESH_REUSE_GRACE = timedelta(seconds=30)


async def _in_rotation_grace(db: AsyncSession, token: RefreshToken) -> bool:
    """True when the token was rotated away moments ago and its replacement is live.

    Logout and family revocation never set ``replaced_by``, so they get no grace.
    """
    if token.replaced_by is None:
        return False
    replacement = await db.get(RefreshToken, token.replaced_by)
    return (
        replacement is not None
        and not replacement.revoked
        and replacement.created_at >= datetime.now(UTC) - REFRESH_REUSE_GRACE
    )


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
        payload = decode_token(refresh_token, expected_typ="refresh")
        user_id: str | None = payload.get("sub")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    if user_id is None:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    token_hash = hash_refresh_token(refresh_token)
    stored_token = await get_refresh_token_by_hash(db, token_hash)

    if stored_token is None:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    if stored_token.revoked and not await _in_rotation_grace(db, stored_token):
        # Token reuse detected — revoke entire family to prevent stolen token usage
        await revoke_refresh_token_family(db, stored_token.family)
        try:
            await db.commit()
        except SQLAlchemyError:
            await db.rollback()
            raise HTTPException(status_code=500, detail="Failed to refresh token")
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    if stored_token.expires_at < datetime.now(UTC):
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
    except SQLAlchemyError:
        await db.rollback()
        raise HTTPException(status_code=500, detail="Failed to refresh token")

    set_auth_cookies(response, new_access_token, new_refresh_token)

    return _build_token_response()


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
        except SQLAlchemyError:
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
        "timezone": current_user.timezone,
        "has_password": current_user.password_hash is not None,
        "guide_done_at": current_user.guide_done_at,
    }


@router.put("/me/guide")
async def set_guide(
    body: GuideUpdate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Remember the newcomer's guide as done, so it never starts by itself again on any device."""
    current_user.guide_done_at = datetime.now(UTC) if body.done else None
    try:
        await db.commit()
    except SQLAlchemyError:
        await db.rollback()
        raise HTTPException(status_code=500, detail="Failed to save the guide")
    return {"guide_done_at": current_user.guide_done_at}


@router.put("/me/timezone")
async def set_timezone(
    body: TimezoneUpdate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Store the zone the user's cron schedules are read in."""
    current_user.timezone = body.timezone
    try:
        await db.commit()
    except SQLAlchemyError:
        await db.rollback()
        raise HTTPException(status_code=500, detail="Failed to save timezone")
    return {"timezone": body.timezone}


@router.put("/me/password")
async def change_password(
    body: PasswordChange,
    request: Request,
    response: Response,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Every other device is signed out; this one gets a fresh session."""
    rate_limit(request, login_limiter)
    if current_user.password_hash is None:
        raise HTTPException(status_code=400, detail="This account signs in with Google or Discord")
    if not verify_password(body.current_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Your current password is wrong")
    current_user.password_hash = hash_password(body.password)
    await _establish_session(db, current_user, request, response, error_detail="Failed to change password")
    return {"detail": "Password changed"}


@router.post("/me/delete")
async def delete_account(
    body: AccountDelete,
    response: Response,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Listens and play counts are erased; the rest follows the soft-delete rule and stops running."""
    # A Discord account can have no email to type back.
    if body.confirm.strip().lower() != (current_user.email or "delete").lower():
        raise HTTPException(status_code=400, detail="That does not match")
    stop_scrobble_sync(current_user.id)
    await delete_scrobbles(db, current_user.id)
    await delete_user_tracks(db, current_user.id)
    await delete_user_automations(db, current_user.id)
    await delete_user_playlists(db, current_user.id)
    await revoke_all_user_refresh_tokens(db, current_user.id)
    await delete_user(db, current_user.id)
    try:
        await db.commit()
    except SQLAlchemyError:
        await db.rollback()
        raise HTTPException(status_code=500, detail="Failed to delete the account")
    clear_auth_cookies(response)
    return {"detail": "Account deleted"}
