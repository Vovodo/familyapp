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
    limit: int = Query(40, ge=1, le=100),
    before: Optional[str] = Query(None, description="Cursor for pagination (message_id)"),
    db: Session = Depends(get_db),
    member: FamilyMember = Depends(get_current_family_member)
):
    """
    Returns messages for the family with cursor pagination.
    Optimized: Eliminates N+1 queries with single batch lookup for family members and users.
    """
    query = (
        db.query(Message)
        .filter(Message.family_id == member.family_id)
        .order_by(Message.created_at.desc(), Message.id.desc())
    )

    if before:
        cursor_msg = db.query(Message.created_at).filter(
            Message.id == before,
            Message.family_id == member.family_id
        ).first()
        if cursor_msg:
            query = query.filter(Message.created_at < cursor_msg[0])

    messages = query.limit(limit).all()
    # Reverse so they appear chronologically in chat UI (oldest to newest)
    messages.reverse()

    if not messages:
        return []

    # Batch load all family members & user profiles for this family (1 query instead of N*2)
    members_data = (
        db.query(FamilyMember, User)
        .outerjoin(User, FamilyMember.user_id == User.id)
        .filter(FamilyMember.family_id == member.family_id)
        .all()
    )

    # O(1) hash map lookup
    member_map = {}
    for fm, u in members_data:
        member_map[fm.user_id] = {
            "name": u.full_name if u else "Aile Üyesi",
            "avatar": u.avatar_url if u else None,
            "nickname": fm.nickname
        }

    results = []
    for msg in messages:
        sender_info = member_map.get(msg.sender_id, {
            "name": "Aile Üyesi",
            "avatar": None,
            "nickname": None
        })

        results.append(
            MessageResponse(
                id=msg.id,
                client_message_id=msg.client_message_id,
                family_id=msg.family_id,
                sender_id=msg.sender_id,
                content=msg.content,
                media_url=msg.media_url,
                media_thumbnail_url=msg.media_thumbnail_url,
                media_type=msg.media_type,
                is_edited=msg.is_edited,
                created_at=msg.created_at,
                sender_name=sender_info["name"],
                sender_avatar=sender_info["avatar"],
                sender_nickname=sender_info["nickname"]
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
    Sends a new text or media message to the family group with idempotent client_message_id deduplication.
    """
    if not msg_in.content and not msg_in.media_url:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Mesaj metni veya medya içeriği gereklidir."
        )

    # Idempotency Guard: If client_message_id already exists for this family, return existing record
    if msg_in.client_message_id:
        existing = (
            db.query(Message)
            .filter(
                Message.family_id == member.family_id,
                Message.client_message_id == msg_in.client_message_id
            )
            .first()
        )
        if existing:
            return MessageResponse(
                id=existing.id,
                client_message_id=existing.client_message_id,
                family_id=existing.family_id,
                sender_id=existing.sender_id,
                content=existing.content,
                media_url=existing.media_url,
                media_thumbnail_url=existing.media_thumbnail_url,
                media_type=existing.media_type,
                is_edited=existing.is_edited,
                created_at=existing.created_at,
                sender_name=current_user.full_name,
                sender_avatar=current_user.avatar_url,
                sender_nickname=member.nickname
            )

    msg = Message(
        family_id=member.family_id,
        sender_id=current_user.id,
        client_message_id=msg_in.client_message_id,
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
        client_message_id=msg.client_message_id,
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
