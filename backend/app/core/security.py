from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional, Union
import bcrypt
from jose import jwt, JWTError
from backend.app.core.config import settings
from loguru import logger


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(
            plain_password.encode('utf-8')[:72],
            hashed_password.encode('utf-8')
        )
    except Exception as e:
        logger.warning(f"Password verification error: {e}")
        return False


def get_password_hash(password: str) -> str:
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode('utf-8')[:72], salt)
    return hashed.decode('utf-8')


def create_access_token(
    subject: Union[str, Any], expires_delta: Optional[timedelta] = None, claims: Optional[Dict[str, Any]] = None
) -> str:
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode = {"exp": expire, "sub": str(subject)}
    if claims:
        to_encode.update(claims)
    
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt


def decode_token(token: str) -> Optional[Dict[str, Any]]:
    """
    Decodes and verifies a JWT token.
    First tries Supabase JWT secret if configured, then falls back to local SECRET_KEY.
    """
    # 1. Try Supabase JWT secret if provided
    if settings.SUPABASE_JWT_SECRET:
        try:
            payload = jwt.decode(
                token,
                settings.SUPABASE_JWT_SECRET,
                algorithms=["HS256"],
                options={"verify_aud": False}
            )
            return payload
        except JWTError:
            pass

    # 2. Try Local SECRET_KEY
    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
            options={"verify_aud": False}
        )
        return payload
    except JWTError as e:
        logger.warning(f"JWT verification failed: {e}")
        return None
