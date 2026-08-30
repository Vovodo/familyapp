from typing import Generator, Optional
from fastapi import Depends, HTTPException, status, Header
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from backend.app.core.config import settings
from backend.app.core.security import decode_token
from backend.app.db.session import get_db
from backend.app.models.models import User, Family, FamilyMember
from loguru import logger

reusable_oauth2 = OAuth2PasswordBearer(
    tokenUrl=f"{settings.API_V1_STR}/auth/login",
    auto_error=False
)


def get_current_user(
    db: Session = Depends(get_db),
    token: Optional[str] = Depends(reusable_oauth2),
    authorization: Optional[str] = Header(None)
) -> User:
    """
    Extracts and verifies JWT token from Authorization header or OAuth2 scheme,
    returns the User model from DB.
    """
    auth_token = token
    if not auth_token and authorization and authorization.startswith("Bearer "):
        auth_token = authorization.split(" ")[1]

    if not auth_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Giriş yapmanız gerekiyor.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = decode_token(auth_token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Oturum süreniz dolmuş veya geçersiz.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id: str = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Kullanıcı kimliği doğrulanamadı.",
        )

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        # If user exists in Supabase Auth but not yet in profiles, create on the fly if needed
        email = payload.get("email")
        user_metadata = payload.get("user_metadata", {})
        full_name = user_metadata.get("full_name") or email or "Aile Üyesi"
        
        user = User(
            id=user_id,
            email=email,
            full_name=full_name,
            role="member"
        )
        db.add(user)
        db.commit()
        db.refresh(user)

    return user


def get_current_family_member(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    x_family_id: Optional[str] = Header(None)
) -> FamilyMember:
    """
    Enforces strict Family Authorization.
    If x_family_id header is provided, checks if user is a member of that family.
    Otherwise, picks the user's default/first family membership.
    """
    query = db.query(FamilyMember).filter(FamilyMember.user_id == current_user.id)
    if x_family_id:
        query = query.filter(FamilyMember.family_id == x_family_id)

    member = query.first()
    if not member:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bu aile verilerine erişim yetkiniz bulunmuyor.",
        )

    return member


def get_current_admin_member(
    member: FamilyMember = Depends(get_current_family_member)
) -> FamilyMember:
    """
    Verifies that the user is an admin of the family.
    """
    if member.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bu işlemi yalnızca aile yöneticisi (admin) gerçekleştirebilir.",
        )
    return member
