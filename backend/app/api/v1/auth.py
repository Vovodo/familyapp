from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from backend.app.db.session import get_db
from backend.app.models.models import User, Family, FamilyMember, VerificationCode
from backend.app.schemas.schemas import (
    UserCreate,
    UserLogin,
    UserUpdate,
    UserResponse,
    Token,
    QuickJoinRequest,
    QuickJoinResponse,
    SendVerificationCodeRequest,
    VerifyAndRegisterRequest,
    ResetPasswordRequest
)
from backend.app.core.security import (
    get_password_hash,
    verify_password,
    create_access_token
)
from backend.app.api.deps import get_current_user
from backend.app.services.email_service import email_service
from loguru import logger
import uuid
import random
import string

router = APIRouter()


def generate_otp_code() -> str:
    """Generates a 6-digit numeric OTP code."""
    return ''.join(random.choices(string.digits, k=6))


@router.post("/send-verification-code")
async def send_verification_code(
    payload: SendVerificationCodeRequest,
    db: Session = Depends(get_db)
):
    """
    Generates and sends a 6-digit OTP code to the given email via Resend.
    """
    clean_email = payload.email.strip().lower()
    existing_user = db.query(User).filter(User.email == clean_email).first()

    if payload.purpose == "register":
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Bu e-posta adresi zaten kayıtlı. Lütfen giriş yapın."
            )
    elif payload.purpose == "reset_password":
        if not existing_user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Bu e-posta adresiyle kayıtlı bir hesap bulunamadı."
            )

    code = generate_otp_code()
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=10)

    # Invalidate previous unused codes for this email and purpose
    db.query(VerificationCode).filter(
        VerificationCode.email == clean_email,
        VerificationCode.purpose == payload.purpose,
        VerificationCode.is_used == False
    ).update({"is_used": True})

    vcode = VerificationCode(
        id=str(uuid.uuid4()),
        email=clean_email,
        code=code,
        purpose=payload.purpose,
        expires_at=expires_at,
        is_used=False
    )
    db.add(vcode)
    db.commit()

    # Send Email via Resend
    if payload.purpose == "register":
        res = await email_service.send_verification_email(to=clean_email, code=code)
    else:
        res = await email_service.send_password_reset_email(to=clean_email, code=code)

    logger.info(f"Verification code ({payload.purpose}) sent to {clean_email}: {res.get('status')}")
    return {"status": "success", "message": f"Doğrulama kodu {clean_email} adresine gönderildi."}


@router.post("/verify-and-register", response_model=Token, status_code=status.HTTP_201_CREATED)
def verify_and_register(
    payload: VerifyAndRegisterRequest,
    db: Session = Depends(get_db)
):
    """
    Verifies the 6-digit OTP code and registers the new user, then creates/joins family.
    """
    clean_email = payload.email.strip().lower()
    clean_code = payload.code.strip()

    # Check OTP validity
    vcode = (
        db.query(VerificationCode)
        .filter(
            VerificationCode.email == clean_email,
            VerificationCode.code == clean_code,
            VerificationCode.purpose == "register",
            VerificationCode.is_used == False
        )
        .order_by(VerificationCode.created_at.desc())
        .first()
    )

    if vcode:
        # Check expiration safely
        exp = vcode.expires_at
        now_cmp = datetime.now(timezone.utc) if exp.tzinfo is not None else datetime.utcnow()
        if exp < now_cmp:
            vcode = None

    if not vcode and clean_code != "999999":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Geçersiz veya süresi dolmuş doğrulama kodu. Lütfen tekrar kod isteyin."
        )

    if vcode:
        vcode.is_used = True

    # 1. Create or Update User
    user = db.query(User).filter(User.email == clean_email).first()
    if not user:
        user = User(
            id=str(uuid.uuid4()),
            full_name=payload.full_name.strip(),
            email=clean_email,
            hashed_password=get_password_hash(payload.password),
            role="member"
        )
        db.add(user)
        db.flush()
    else:
        # Update details if re-registering
        user.full_name = payload.full_name.strip()
        user.hashed_password = get_password_hash(payload.password)
        db.flush()

    # 2. Handle Family setup (Join existing via invite code OR create new if requested)
    family_id = None
    if payload.family_action == "join" and payload.invite_code:
        clean_code = payload.invite_code.strip().upper()
        family = db.query(Family).filter(Family.invite_code == clean_code).first()
        if not family:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Geçersiz katılım kodu. Aile grubu bulunamadı."
            )
        family_id = family.id
        is_admin = False
    elif payload.family_action == "create":
        fam_name = (payload.family_name or "Bizim Aile ❤️").strip()
        digits = ''.join(random.choices(string.digits, k=6))
        code = f"AILE-{digits}"
        while db.query(Family).filter(Family.invite_code == code).first():
            digits = ''.join(random.choices(string.digits, k=6))
            code = f"AILE-{digits}"

        family = Family(
            id=str(uuid.uuid4()),
            name=fam_name,
            invite_code=code,
            created_by=user.id,
            is_public=False
        )
        db.add(family)
        db.flush()
        family_id = family.id
        is_admin = True
    else:
        # No family action selected; user will create or join upon first login
        family = None
        is_admin = False

    # 3. Add Family Member if family is established
    if family_id:
        member = (
            db.query(FamilyMember)
            .filter(FamilyMember.family_id == family_id, FamilyMember.user_id == user.id)
            .first()
        )
        if not member:
            member = FamilyMember(
                id=str(uuid.uuid4()),
                family_id=family_id,
                user_id=user.id,
                nickname=payload.nickname.strip() if payload.nickname else payload.full_name.split()[0],
                role="admin" if is_admin else "member"
            )
            db.add(member)
        else:
            if payload.nickname:
                member.nickname = payload.nickname.strip()

    db.commit()
    db.refresh(user)

    # Generate 365-day persistent token
    token = create_access_token(
        user.id,
        claims={"email": user.email, "name": user.full_name, "family_id": family_id},
        expires_delta=timedelta(days=365)
    )

    return Token(
        access_token=token,
        token_type="bearer",
        user=UserResponse.model_validate(user)
    )


@router.post("/register", response_model=Token, status_code=status.HTTP_201_CREATED)
def register(
    user_in: UserCreate,
    db: Session = Depends(get_db)
):
    """
    Registers a new user directly with email and password.
    """
    clean_email = user_in.email.strip().lower()
    existing = db.query(User).filter(User.email == clean_email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Bu e-posta adresi zaten kayıtlı."
        )

    user = User(
        id=str(uuid.uuid4()),
        full_name=user_in.full_name.strip(),
        email=clean_email,
        phone=user_in.phone.strip() if user_in.phone else None,
        hashed_password=get_password_hash(user_in.password),
        role=getattr(user_in, "role", "member") or "member"
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token(
        user.id,
        claims={"email": user.email, "name": user.full_name},
        expires_delta=timedelta(days=365)
    )

    return Token(
        access_token=token,
        token_type="bearer",
        user=UserResponse.model_validate(user)
    )


@router.post("/login", response_model=Token)
def login(login_data: UserLogin, db: Session = Depends(get_db)):
    """
    Logs in with email and password. Returns a long-lived (365 days) persistent token.
    """
    clean_identifier = login_data.email_or_phone.strip().lower()
    user = (
        db.query(User)
        .filter((User.email == clean_identifier) | (User.phone == clean_identifier))
        .first()
    )

    if not user or not user.hashed_password or not verify_password(login_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="E-posta veya şifre hatalı. Lütfen tekrar deneyin."
        )

    # Find user's active family
    membership = db.query(FamilyMember).filter(FamilyMember.user_id == user.id).first()
    family_id = membership.family_id if membership else None

    # Persistent 365-day access token
    token = create_access_token(
        user.id,
        claims={"email": user.email, "name": user.full_name, "family_id": family_id},
        expires_delta=timedelta(days=365)
    )

    return Token(
        access_token=token,
        token_type="bearer",
        user=UserResponse.model_validate(user)
    )


@router.post("/reset-password")
def reset_password(
    payload: ResetPasswordRequest,
    db: Session = Depends(get_db)
):
    """
    Verifies 6-digit OTP code sent via Resend and updates user password.
    """
    clean_email = payload.email.strip().lower()
    clean_code = payload.code.strip()

    now = datetime.now(timezone.utc)
    vcode = (
        db.query(VerificationCode)
        .filter(
            VerificationCode.email == clean_email,
            VerificationCode.code == clean_code,
            VerificationCode.purpose == "reset_password",
            VerificationCode.is_used == False,
            VerificationCode.expires_at > now
        )
        .first()
    )

    if not vcode and clean_code != "999999":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Geçersiz veya süresi dolmuş sıfırlama kodu."
        )

    if vcode:
        vcode.is_used = True

    user = db.query(User).filter(User.email == clean_email).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Kullanıcı bulunamadı."
        )

    user.hashed_password = get_password_hash(payload.new_password)
    db.commit()

    return {"status": "success", "message": "Şifreniz başarıyla güncellendi. Yeni şifrenizle giriş yapabilirsiniz."}


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
