from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from backend.app.db.session import get_db
from backend.app.models.models import User, Family, FamilyMember
from backend.app.schemas.schemas import (
    UserCreate,
    UserLogin,
    UserUpdate,
    UserResponse,
    Token,
    QuickJoinRequest,
    QuickJoinResponse
)
from backend.app.core.security import (
    get_password_hash,
    verify_password,
    create_access_token
)
from backend.app.api.deps import get_current_user
import uuid
import random
import string

router = APIRouter()


@router.post("/quick-join", response_model=QuickJoinResponse, status_code=status.HTTP_201_CREATED)
def quick_join(req: QuickJoinRequest, db: Session = Depends(get_db)):
    """
    Direct 1-click onboarding:
    - If action == 'join' & invite_code: Joins the existing family with that specific code.
    - Otherwise: Creates a brand new, 100% isolated family group with a unique invite code.
    Returns long-lived JWT token.
    """
    clean_name = req.full_name.strip()
    if not clean_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Lütfen adınızı girin."
        )

    # 1. Determine Family (Join existing via code OR create fresh isolated family)
    if req.action == "join" and req.invite_code:
        clean_code = req.invite_code.strip().upper()
        family = db.query(Family).filter(Family.invite_code == clean_code).first()
        if not family:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Geçersiz katılım kodu. Lütfen aile bireyinizden aldığınız kodu kontrol edin."
            )
        is_admin = False
    else:
        # Create brand new isolated family
        fam_name = (req.family_name or "Bizim Aile ❤️").strip()
        digits = ''.join(random.choices(string.digits, k=6))
        code = f"AILE-{digits}"
        while db.query(Family).filter(Family.invite_code == code).first():
            digits = ''.join(random.choices(string.digits, k=6))
            code = f"AILE-{digits}"

        family = Family(
            id=str(uuid.uuid4()),
            name=fam_name,
            invite_code=code
        )
        db.add(family)
        db.commit()
        db.refresh(family)
        is_admin = True

    # 2. Create User Profile
    unique_suffix = req.device_id[:12] if req.device_id else uuid.uuid4().hex[:8]
    auto_email = f"user_{unique_suffix}@familyapp.com"

    user = User(
        id=str(uuid.uuid4()),
        full_name=clean_name,
        email=auto_email,
        hashed_password=get_password_hash(uuid.uuid4().hex),
        avatar_url=req.avatar_url,
        role="member"
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # 3. Add as Family Member
    member = FamilyMember(
        id=str(uuid.uuid4()),
        family_id=family.id,
        user_id=user.id,
        nickname=req.nickname.strip() if req.nickname else None,
        role="admin" if is_admin else "member"
    )
    db.add(member)
    db.commit()

    token = create_access_token(user.id, claims={"name": user.full_name, "family_id": family.id})
    return QuickJoinResponse(
        access_token=token,
        token_type="bearer",
        user=UserResponse.model_validate(user),
        family_id=family.id,
        family_name=family.name
    )


@router.post("/register", response_model=Token, status_code=status.HTTP_201_CREATED)
def register(user_in: UserCreate, db: Session = Depends(get_db)):
    """
    Registers a new user profile and returns an access token.
    """
    # Check email duplicate
    if user_in.email:
        existing = db.query(User).filter(User.email == user_in.email).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Bu e-posta adresi zaten kayıtlı."
            )
    
    # Check phone duplicate
    if user_in.phone:
        existing = db.query(User).filter(User.phone == user_in.phone).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Bu telefon numarası zaten kayıtlı."
            )

    user = User(
        id=str(uuid.uuid4()),
        full_name=user_in.full_name,
        email=user_in.email,
        phone=user_in.phone,
        hashed_password=get_password_hash(user_in.password),
        avatar_url=user_in.avatar_url,
        role="admin" if db.query(User).count() == 0 else "member"
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token(user.id, claims={"email": user.email, "name": user.full_name})
    return Token(access_token=token, token_type="bearer", user=UserResponse.model_validate(user))


@router.post("/login", response_model=Token)
def login(login_data: UserLogin, db: Session = Depends(get_db)):
    """
    Logs in with email or phone number and password.
    """
    user = (
        db.query(User)
        .filter((User.email == login_data.email_or_phone) | (User.phone == login_data.email_or_phone))
        .first()
    )
    if not user or not user.hashed_password or not verify_password(login_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="E-posta / telefon veya şifre hatalı."
        )

    token = create_access_token(user.id, claims={"email": user.email, "name": user.full_name})
    return Token(access_token=token, token_type="bearer", user=UserResponse.model_validate(user))


@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    """
    Returns currently logged-in user profile.
    """
    return current_user


@router.patch("/me", response_model=UserResponse)
def update_me(
    user_in: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Updates the current user profile.
    """
    if user_in.full_name is not None:
        current_user.full_name = user_in.full_name
    if user_in.phone is not None:
        current_user.phone = user_in.phone
    if user_in.avatar_url is not None:
        current_user.avatar_url = user_in.avatar_url

    db.commit()
    db.refresh(current_user)
    return current_user


@router.post("/logout")
def logout(current_user: User = Depends(get_current_user)):
    """
    Logs out the current session.
    """
    return {"message": "Başarıyla çıkış yapıldı."}
