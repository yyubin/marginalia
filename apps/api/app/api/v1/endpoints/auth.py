import asyncio
import secrets
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, BackgroundTasks, Cookie, Depends, HTTPException, Request, Response, status
from fastapi.responses import RedirectResponse
from slowapi.util import get_remote_address
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.email import (
    send_password_reset_email,
    send_verification_email,
    send_welcome_email,
)
from app.core.rate_limit import limiter
from app.core.redis_client import redis_delete, redis_exists, redis_get, redis_set
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    get_token_remaining_ttl,
    hash_password,
    hash_token,
    verify_password,
)
from app.models.document import Document
from app.models.user import User
from app.schemas.auth import (
    ChangePasswordRequest,
    ForgotPasswordRequest,
    LoginRequest,
    LogoutRequest,
    RefreshRequest,
    ResendVerificationRequest,
    ResetPasswordRequest,
    SignupRequest,
    TokenResponse,
    UserResponse,
)
from app.services.r2_service import delete_files
from app.services.user_service import get_user_by_email, get_user_by_id

router = APIRouter(prefix="/auth", tags=["auth"])


def _cookie_kwargs() -> dict:
    return dict(
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite=settings.COOKIE_SAMESITE,
        domain=settings.COOKIE_DOMAIN or None,
    )


def _set_auth_cookies(response: Response, access_token: str, refresh_token: str) -> None:
    kw = _cookie_kwargs()
    response.set_cookie(
        key="access_token",
        value=access_token,
        max_age=settings.JWT_EXPIRE_MINUTES * 60,
        path="/",
        **kw,
    )
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        max_age=settings.JWT_REFRESH_EXPIRE_DAYS * 86400,
        path="/api/v1/auth",
        **kw,
    )


def _clear_auth_cookies(response: Response) -> None:
    kw = _cookie_kwargs()
    response.delete_cookie(key="access_token", path="/", **kw)
    response.delete_cookie(key="refresh_token", path="/api/v1/auth", **kw)

_GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
_GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
_GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo"


@router.post("/signup", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("5/hour", key_func=get_remote_address)
async def signup(
    request: Request,
    response: Response,
    body: SignupRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    existing = await get_user_by_email(db, body.email)
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    user = User(
        email=body.email,
        name=body.name,
        password_hash=hash_password(body.password),
        provider="email",
        is_verified=False,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    token = secrets.token_urlsafe(32)
    await redis_set(f"email_verify:{token}", str(user.id), ttl_seconds=86400)
    background_tasks.add_task(send_verification_email, user.email, token, user.name)

    access_token = create_access_token(str(user.id))
    refresh_token = create_refresh_token(str(user.id))
    _set_auth_cookies(response, access_token, refresh_token)
    return TokenResponse(access_token=access_token, refresh_token=refresh_token)


@router.post("/login", response_model=TokenResponse)
@limiter.limit("10/minute", key_func=get_remote_address)
async def login(request: Request, response: Response, body: LoginRequest, db: AsyncSession = Depends(get_db)):
    user = await get_user_by_email(db, body.email)
    if not user or user.is_suspended or not user.password_hash or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    access_token = create_access_token(str(user.id))
    refresh_token = create_refresh_token(str(user.id))
    _set_auth_cookies(response, access_token, refresh_token)
    return TokenResponse(access_token=access_token, refresh_token=refresh_token)


@router.post("/refresh", response_model=TokenResponse)
@limiter.limit("30/minute", key_func=get_remote_address)
async def refresh(
    request: Request,
    response: Response,
    body: RefreshRequest | None = None,
    refresh_token: str | None = Cookie(default=None),
    db: AsyncSession = Depends(get_db),
):
    token = (body.refresh_token if body else None) or refresh_token
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No refresh token provided")

    if await redis_exists(f"token_blacklist:{hash_token(token)}"):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token has been revoked")

    user_id = decode_token(token, expected_type="refresh")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    user = await get_user_by_id(db, user_id)
    if not user or user.is_suspended:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    ttl = get_token_remaining_ttl(token)
    if ttl > 0:
        await redis_set(f"token_blacklist:{hash_token(token)}", "1", ttl_seconds=ttl)

    new_access = create_access_token(user_id)
    new_refresh = create_refresh_token(user_id)
    _set_auth_cookies(response, new_access, new_refresh)
    return TokenResponse(access_token=new_access, refresh_token=new_refresh)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    response: Response,
    body: LogoutRequest | None = None,
    refresh_token: str | None = Cookie(default=None),
):
    token = (body.refresh_token if body else None) or refresh_token
    if token:
        ttl = get_token_remaining_ttl(token)
        if ttl > 0:
            await redis_set(f"token_blacklist:{hash_token(token)}", "1", ttl_seconds=ttl)
    _clear_auth_cookies(response)
    return None


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    return current_user


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
async def delete_account(
    response: Response,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    refresh_token: str | None = Cookie(default=None),
):
    # Collect R2 file keys before the user record is gone
    result = await db.execute(
        select(Document.file_key).where(Document.user_id == current_user.id)
    )
    file_keys = list(result.scalars().all())

    # Blacklist refresh token so it can't be reused
    if refresh_token:
        ttl = get_token_remaining_ttl(refresh_token)
        if ttl > 0:
            await redis_set(f"token_blacklist:{hash_token(refresh_token)}", "1", ttl_seconds=ttl)

    # Delete user — cascades to all related DB rows
    await db.delete(current_user)
    await db.commit()

    # Delete R2 objects in a thread (boto3 is synchronous)
    if file_keys:
        await asyncio.to_thread(delete_files, file_keys)

    _clear_auth_cookies(response)
    return None


@router.get("/google")
@limiter.limit("20/hour", key_func=get_remote_address)
async def google_oauth_start(request: Request):
    state = secrets.token_urlsafe(32)
    params = urlencode({
        "client_id": settings.GOOGLE_CLIENT_ID,
        "redirect_uri": settings.GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "access_type": "offline",
        "prompt": "select_account",
    })
    response = RedirectResponse(url=f"{_GOOGLE_AUTH_URL}?{params}")
    response.set_cookie(
        key="oauth_state",
        value=state,
        max_age=600,
        httponly=True,
        samesite="lax",
    )
    return response


@router.get("/google/callback")
@limiter.limit("20/hour", key_func=get_remote_address)
async def google_oauth_callback(
    request: Request,
    db: AsyncSession = Depends(get_db),
    background_tasks: BackgroundTasks = None,
    code: str = "",
    state: str = "",
    error: str = "",
):
    frontend = settings.FRONTEND_URL

    if error:
        return RedirectResponse(f"{frontend}/login?error=oauth_cancelled")

    saved_state = request.cookies.get("oauth_state")
    if not saved_state or saved_state != state:
        return RedirectResponse(f"{frontend}/login?error=invalid_state")

    async with httpx.AsyncClient(timeout=10) as client:
        token_resp = await client.post(_GOOGLE_TOKEN_URL, data={
            "client_id": settings.GOOGLE_CLIENT_ID,
            "client_secret": settings.GOOGLE_CLIENT_SECRET,
            "code": code,
            "grant_type": "authorization_code",
            "redirect_uri": settings.GOOGLE_REDIRECT_URI,
        })
        if token_resp.status_code != 200:
            return RedirectResponse(f"{frontend}/login?error=token_exchange_failed")

        google_access_token = token_resp.json().get("access_token")
        userinfo_resp = await client.get(
            _GOOGLE_USERINFO_URL,
            headers={"Authorization": f"Bearer {google_access_token}"},
        )
        userinfo = userinfo_resp.json()

    email: str | None = userinfo.get("email")
    if not email:
        return RedirectResponse(f"{frontend}/login?error=no_email")

    existing = await get_user_by_email(db, email)
    if existing and existing.provider != "google":
        return RedirectResponse(f"{frontend}/login?error=email_exists")

    is_new_user = False
    if existing:
        if existing.is_suspended:
            return RedirectResponse(f"{frontend}/login?error=account_suspended")
        user = existing
    else:
        is_new_user = True
        user = User(
            email=email,
            name=userinfo.get("name"),
            avatar_url=userinfo.get("picture"),
            provider="google",
            is_verified=True,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)

    if is_new_user and background_tasks is not None:
        background_tasks.add_task(send_welcome_email, user.email, user.name)

    access_token = create_access_token(str(user.id))
    refresh_token = create_refresh_token(str(user.id))

    redirect = RedirectResponse(f"{frontend}/callback")
    redirect.delete_cookie("oauth_state")
    _set_auth_cookies(redirect, access_token, refresh_token)
    return redirect


# ── Email verification ────────────────────────────────────────────────────────

@router.get("/verify-email")
@limiter.limit("10/hour", key_func=get_remote_address)
async def verify_email(
    request: Request,
    token: str,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    frontend = settings.FRONTEND_URL
    user_id = await redis_get(f"email_verify:{token}")
    if not user_id:
        return RedirectResponse(f"{frontend}/login?error=invalid_token")

    user = await get_user_by_id(db, user_id)
    if not user:
        return RedirectResponse(f"{frontend}/login?error=invalid_token")

    user.is_verified = True
    await redis_delete(f"email_verify:{token}")
    await db.commit()

    background_tasks.add_task(send_welcome_email, user.email, user.name)

    return RedirectResponse(f"{frontend}/login?verified=true")


@router.post("/resend-verification", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("3/hour", key_func=get_remote_address)
async def resend_verification(
    request: Request,
    body: ResendVerificationRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    user = await get_user_by_email(db, body.email)
    # Always return 204 — don't reveal if the email exists or is already verified
    if not user or user.provider != "email" or user.is_verified:
        return None

    cooldown_key = f"email_resend_cooldown:{user.id}"
    if await redis_exists(cooldown_key):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="재발송은 5분에 1회만 요청할 수 있습니다",
        )

    token = secrets.token_urlsafe(32)
    await redis_set(f"email_verify:{token}", str(user.id), ttl_seconds=86400)
    await redis_set(cooldown_key, "1", ttl_seconds=300)
    background_tasks.add_task(send_verification_email, user.email, token, user.name)
    return None


# ── Password reset ────────────────────────────────────────────────────────────

@router.post("/forgot-password", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("5/hour", key_func=get_remote_address)
async def forgot_password(
    request: Request,
    body: ForgotPasswordRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    user = await get_user_by_email(db, body.email)
    # Silently succeed for unknown emails — don't leak account existence
    if user and user.provider == "email":
        token = secrets.token_urlsafe(32)
        await redis_set(f"password_reset:{token}", str(user.id), ttl_seconds=3600)
        background_tasks.add_task(send_password_reset_email, user.email, token)
    return None


@router.post("/reset-password", status_code=status.HTTP_200_OK)
@limiter.limit("5/hour", key_func=get_remote_address)
async def reset_password(
    request: Request,
    body: ResetPasswordRequest,
    db: AsyncSession = Depends(get_db),
):
    user_id = await redis_get(f"password_reset:{body.token}")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="유효하지 않거나 만료된 토큰입니다",
        )

    user = await get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="유효하지 않거나 만료된 토큰입니다",
        )

    user.password_hash = hash_password(body.new_password)
    await redis_delete(f"password_reset:{body.token}")
    await db.commit()

    return {"message": "비밀번호가 성공적으로 변경되었습니다"}


# ── Change password (authenticated) ──────────────────────────────────────────

@router.post("/change-password", status_code=status.HTTP_200_OK)
async def change_password(
    body: ChangePasswordRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.provider != "email":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Google 계정은 비밀번호를 변경할 수 없습니다",
        )
    if not current_user.password_hash or not verify_password(body.current_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="현재 비밀번호가 올바르지 않습니다",
        )
    current_user.password_hash = hash_password(body.new_password)
    await db.commit()
    return {"message": "비밀번호가 성공적으로 변경되었습니다"}
