import secrets
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession

from slowapi.util import get_remote_address

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.rate_limit import limiter
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.models.user import User
from app.schemas.auth import LoginRequest, RefreshRequest, SignupRequest, TokenResponse, UserResponse
from app.services.user_service import get_user_by_email, get_user_by_id

router = APIRouter(prefix="/auth", tags=["auth"])

_GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
_GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
_GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo"


@router.post("/signup", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("5/hour", key_func=get_remote_address)
async def signup(request: Request, body: SignupRequest, db: AsyncSession = Depends(get_db)):
    existing = await get_user_by_email(db, body.email)
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    user = User(
        email=body.email,
        name=body.name,
        password_hash=hash_password(body.password),
        provider="email",
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    return TokenResponse(
        access_token=create_access_token(str(user.id)),
        refresh_token=create_refresh_token(str(user.id)),
    )


@router.post("/login", response_model=TokenResponse)
@limiter.limit("10/minute", key_func=get_remote_address)
async def login(request: Request, body: LoginRequest, db: AsyncSession = Depends(get_db)):
    user = await get_user_by_email(db, body.email)
    if not user or not user.password_hash or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    return TokenResponse(
        access_token=create_access_token(str(user.id)),
        refresh_token=create_refresh_token(str(user.id)),
    )


@router.post("/refresh", response_model=TokenResponse)
@limiter.limit("30/minute", key_func=get_remote_address)
async def refresh(request: Request, body: RefreshRequest, db: AsyncSession = Depends(get_db)):
    user_id = decode_token(body.refresh_token, expected_type="refresh")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    user = await get_user_by_id(db, user_id)
    if not user or user.is_suspended:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    return TokenResponse(
        access_token=create_access_token(user_id),
        refresh_token=create_refresh_token(user_id),
    )


@router.delete("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout():
    # JWT는 stateless — 클라이언트에서 토큰 삭제로 처리
    return None


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    return current_user


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

    if existing:
        if existing.is_suspended:
            return RedirectResponse(f"{frontend}/login?error=account_suspended")
        user = existing
    else:
        user = User(
            email=email,
            name=userinfo.get("name"),
            avatar_url=userinfo.get("picture"),
            provider="google",
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)

    access_token = create_access_token(str(user.id))
    refresh_token = create_refresh_token(str(user.id))

    redirect = RedirectResponse(
        f"{frontend}/callback?access_token={access_token}&refresh_token={refresh_token}"
    )
    redirect.delete_cookie("oauth_state")
    return redirect
