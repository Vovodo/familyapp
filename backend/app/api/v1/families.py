import random
import string
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from backend.app.db.session import get_db
from backend.app.models.models import (
    User,
    Family,
    FamilyMember,
    Message,
    Note,
    Reminder,
    ShoppingItem,
    Media
)
from backend.app.schemas.schemas import (
    FamilyCreate,
    FamilyJoin,
    FamilyResponse,
    FamilyMemberResponse
)
from backend.app.api.deps import get_current_user, get_current_family_member, get_current_admin_member
from loguru import logger

router = APIRouter()


def generate_invite_code(length: int = 6) -> str:
    digits = ''.join(random.choices(string.digits, k=length))
    return f"AILE-{digits}"


@router.post("/", response_model=FamilyResponse, status_code=status.HTTP_201_CREATED)
def create_family(
    family_in: FamilyCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Creates a new family group and sets the current user as the admin.
    """
    invite_code = generate_invite_code()
    # Ensure code uniqueness
    while db.query(Family).filter(Family.invite_code == invite_code).first():
        invite_code = generate_invite_code()

    family = Family(
        name=family_in.name,
        invite_code=invite_code,
        created_by=current_user.id
    )
    db.add(family)
    db.flush()

    member = FamilyMember(
        family_id=family.id,
        user_id=current_user.id,
        nickname="Yönetici",
        role="admin"
    )
    db.add(member)
    db.commit()
    db.refresh(family)

    return family


@router.post("/join", response_model=FamilyResponse)
def join_family(
    join_data: FamilyJoin,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Joins an existing family using the invite code.
    """
    clean_code = join_data.invite_code.strip().upper()
    family = db.query(Family).filter(Family.invite_code == clean_code).first()
    if not family:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Bu katılım koduna sahip bir aile bulunamadı."
        )

    # Check if already a member
    existing = (
        db.query(FamilyMember)
        .filter(FamilyMember.family_id == family.id, FamilyMember.user_id == current_user.id)
        .first()
    )
    if existing:
        return family

    member = FamilyMember(
        family_id=family.id,
        user_id=current_user.id,
        nickname=join_data.nickname or current_user.full_name,
        role="member"
    )
    db.add(member)
    db.commit()
    db.refresh(family)

    return family


@router.get("/me", response_model=FamilyResponse)
def get_current_family(
    db: Session = Depends(get_db),
    member: FamilyMember = Depends(get_current_family_member)
):
    """
    Gets details of the active family and its members.
    """
    family = db.query(Family).filter(Family.id == member.family_id).first()
    if not family:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Aile bulunamadı."
        )
    return family


@router.get("/my-families", response_model=List[FamilyResponse])
def get_my_families(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Lists all families that the current user belongs to.
    """
    memberships = db.query(FamilyMember).filter(FamilyMember.user_id == current_user.id).all()
    family_ids = [m.family_id for m in memberships]
    families = db.query(Family).filter(Family.id.in_(family_ids)).all()
    return families


@router.delete("/{family_id}", status_code=status.HTTP_200_OK)
def delete_family(
    family_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Permanently closes/deletes a family group and all associated cloud data
    (messages, notes, reminders, shopping items, media, and memberships).
    Guarantees strict multi-tenant isolation; other family groups remain untouched.
    """
    family = db.query(Family).filter(Family.id == family_id).first()
    if not family:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Aile grubu bulunamadı."
        )

    # Check permission: User must be a member of this family
    membership = (
        db.query(FamilyMember)
        .filter(FamilyMember.family_id == family_id, FamilyMember.user_id == current_user.id)
        .first()
    )
    if not membership:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bu aile grubunu silme yetkiniz yok."
        )

    # Explicitly cascade delete all data belonging to this specific family_id
    db.query(Message).filter(Message.family_id == family_id).delete(synchronize_session=False)
    db.query(Note).filter(Note.family_id == family_id).delete(synchronize_session=False)
    db.query(Reminder).filter(Reminder.family_id == family_id).delete(synchronize_session=False)
    db.query(ShoppingItem).filter(ShoppingItem.family_id == family_id).delete(synchronize_session=False)
    db.query(Media).filter(Media.family_id == family_id).delete(synchronize_session=False)
    db.query(FamilyMember).filter(FamilyMember.family_id == family_id).delete(synchronize_session=False)

    # Delete the family itself
    db.delete(family)
    db.commit()

    logger.info(f"Family {family_id} and all related cloud records deleted by user {current_user.id}")
    return {"message": "Aile grubu ve tüm verileri kalıcı olarak silindi."}

