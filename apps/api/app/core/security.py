import hashlib
from datetime import UTC, datetime, timedelta

import bcrypt
from jose import JWTError, jwt

from app.core.config import settings


def validate_password(v: str) -> str:
    if len(v) < settings.PASSWORD_MIN_LENGTH:
        raise ValueError(f"비밀번호는 {settings.PASSWORD_MIN_LENGTH}자 이상이어야 합니다")
    if settings.PASSWORD_REQUIRE_LETTER and not any(c.isalpha() for c in v):
        raise ValueError("비밀번호에 영문자가 포함되어야 합니다")
    if settings.PASSWORD_REQUIRE_DIGIT and not any(c.isdigit() for c in v):
        raise ValueError("비밀번호에 숫자가 포함되어야 합니다")
    return v


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


def create_access_token(subject: str) -> str:
    expire = datetime.now(UTC) + timedelta(minutes=settings.JWT_EXPIRE_MINUTES)
    return jwt.encode(
        {"sub": subject, "exp": expire},
        settings.JWT_SECRET,
        algorithm=settings.JWT_ALGORITHM,
    )


def create_refresh_token(subject: str) -> str:
    expire = datetime.now(UTC) + timedelta(days=settings.JWT_REFRESH_EXPIRE_DAYS)
    return jwt.encode(
        {"sub": subject, "exp": expire, "type": "refresh"},
        settings.JWT_SECRET,
        algorithm=settings.JWT_ALGORITHM,
    )


def decode_token(token: str, expected_type: str = "access") -> str | None:
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        token_type = payload.get("type", "access")
        if token_type != expected_type:
            return None
        return payload.get("sub")
    except JWTError:
        return None


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def get_token_remaining_ttl(token: str) -> int:
    """Returns remaining lifetime in seconds; 0 if expired or invalid."""
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        exp = payload.get("exp")
        if exp is None:
            return 0
        return max(0, int(exp - datetime.now(UTC).timestamp()))
    except JWTError:
        return 0
