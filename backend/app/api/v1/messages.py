from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from backend.app.db.session import get_db
from backend.app.models.models import Message, FamilyMember, User
from backend.app.schemas.schemas import (
    MessageCreate,
    MessageUpdate,
    MessageResponse
)
from backend.app.api.deps import get_current_user, get_current_family_member

router = APIRouter()


@router.get("/", response_model=List[MessageResponse])
def get_messages(
    limit: int = Query(50, ge=1, le=100),
    before: Optional[str] = Query(None, description="Cursor for pagination (message_id)"),
    db: Session = Depends(get_db),
    member: FamilyMember = Depends(get_current_family_member)
):
    """
    Returns messages for the family with pagination (chronological order).
    """
    query = (
        db.query(Message)
        .filter(Message.family_id == member.family_id)
        .order_by(Message.created_at.desc())
    )

    if before:
        cursor_msg = db.query(Message).filter(Message.id == before).first()
        if cursor_msg:
            query = query.filter(Message.created_at < cursor_msg.created_at)

    messages = query.limit(limit).all()
    # Reverse so they appear chronologically in chat UI
    messages.reverse()

    results = []
    for msg in messages:
        sender_member = (
            db.query(FamilyMember)
            .filter(FamilyMember.family_id == member.family_id, FamilyMember.user_id == msg.sender_id)
            .first()
        )
        sender_user = db.query(User).filter(User.id == msg.sender_id).first()

        results.append(
            MessageResponse(
                id=msg.id,
                family_id=msg.family_id,
                sender_id=msg.sender_id,
                content=msg.content,
                media_url=msg.media_url,
                media_thumbnail_url=msg.media_thumbnail_url,
                media_type=msg.media_type,
                is_edited=msg.is_edited,
                created_at=msg.created_at,
                sender_name=sender_user.full_name if sender_user else "Bilinmeyen",
                sender_avatar=sender_user.avatar_url if sender_user else None,
                sender_nickname=sender_member.nickname if sender_member else None
            )
        )
    return results


@router.post("/", response_model=MessageResponse, status_code=status.HTTP_201_CREATED)
def send_message(
    msg_in: MessageCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    member: FamilyMember = Depends(get_current_family_member)
):
    """
    Sends a new text or media message to the family group.
    """
    if not msg_in.content and not msg_in.media_url:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Mesaj metni veya medya içeriği gereklidir."
        )

    msg = Message(
        family_id=member.family_id,
        sender_id=current_user.id,
        content=msg_in.content,
        media_url=msg_in.media_url,
        media_thumbnail_url=msg_in.media_thumbnail_url,
        media_type=msg_in.media_type
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)

    return MessageResponse(
        id=msg.id,
        family_id=msg.family_id,
        sender_id=msg.sender_id,
        content=msg.content,
        media_url=msg.media_url,
        media_thumbnail_url=msg.media_thumbnail_url,
        media_type=msg.media_type,
        is_edited=msg.is_edited,
        created_at=msg.created_at,
        sender_name=current_user.full_name,
        sender_avatar=current_user.avatar_url,
        sender_nickname=member.nickname
    )


@router.delete("/{message_id}")
def delete_message(
    message_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    member: FamilyMember = Depends(get_current_family_member)
):
    """
    Deletes a message if the current user is sender or family admin.
    """
    msg = (
        db.query(Message)
        .filter(Message.id == message_id, Message.family_id == member.family_id)
        .first()
    )
    if not msg:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Mesaj bulunamadı.")

    if msg.sender_id != current_user.id and member.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bu mesajı silme yetkiniz yok."
        )

    db.delete(msg)
    db.commit()
    return {"message": "Mesaj silindi."}
