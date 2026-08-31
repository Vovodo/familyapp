import random
import string
import time
import threading
import uuid
from datetime import datetime, timezone
from typing import List, Optional, Dict
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
    Media,
    Notification,
    DeviceToken
)
from backend.app.schemas.schemas import (
    FamilyCreate,
    FamilyJoin,
    FamilyResponse,
    FamilyMemberResponse,
    HeartEventRequest,
    HeartEventResponse
)
from backend.app.api.deps import get_current_user, get_current_family_member, get_current_admin_member
from backend.app.services.push_service import push_service
from loguru import logger

router = APIRouter()

# Rate limiting for heart sending: Max 1 heart per 3 seconds per sender
_user_heart_timestamps: Dict[str, float] = {}
_heart_lock = threading.Lock()



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


@router.post("/heart", response_model=HeartEventResponse, status_code=status.HTTP_200_OK)
async def send_family_heart(
    body: Optional[HeartEventRequest] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    member: FamilyMember = Depends(get_current_family_member)
):
    """
    Sends an instant love Heart notification and vibration to all other members in the sender's family.
    1. Authenticated user and family_id are strictly verified server-side.
    2. Rate limit: 1 heart per 3 seconds per sender.
    3. Self-exclusion: Sender never receives their own heart notification.
    4. Isolation: Only members belonging to the exact same family_id receive it.
    5. Dispatches FCM push notifications to active device tokens + persists event.
    """
    sender_id = current_user.id
    family_id = member.family_id
    now_ts = time.time()

    # 1. Anti-Spam / Rate-limiting check (3 seconds debounce)
    with _heart_lock:
        last_ts = _user_heart_timestamps.get(sender_id, 0)
        if now_ts - last_ts < 3.0:
            retry_after = round(3.0 - (now_ts - last_ts), 1)
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Lütfen biraz bekleyin ({retry_after} sn sonra tekrar kalp gönderebilirsiniz)."
            )
        _user_heart_timestamps[sender_id] = now_ts

    logger.info(f"HEART_SEND_REQUEST: User {sender_id} in Family {family_id}")

    # 2. Resolve display name
    sender_display_name = member.nickname or current_user.full_name or "Aile Üyesi"
    event_id = f"heart-{uuid.uuid4()}"
    now_dt = datetime.now(timezone.utc)
    custom_msg = body.message.strip() if body and body.message else None

    # 3. Find other family members (Excluding sender for self-notification prevention)
    family_members = db.query(FamilyMember).filter(
        FamilyMember.family_id == family_id,
        FamilyMember.user_id != sender_id
    ).all()

    recipient_user_ids = [m.user_id for m in family_members]
    logger.info(f"FAMILY_MEMBERS_RESOLVED: Found {len(recipient_user_ids)} recipients for Family {family_id}")

    # 4. Create Notification rows in DB for recipients
    notifications_to_add = []
    for r_id in recipient_user_ids:
        n = Notification(
            id=str(uuid.uuid4()),
            family_id=family_id,
            recipient_id=r_id,
            title="❤️ Aileden bir kalp",
            body=custom_msg or f"{sender_display_name} size bir kalp gönderdi ❤️",
            type="heart",
            is_read=False,
            data=f'{{"event_id":"{event_id}","sender_id":"{sender_id}","sender_name":"{sender_display_name}"}}',
            created_at=now_dt
        )
        notifications_to_add.append(n)

    if notifications_to_add:
        db.add_all(notifications_to_add)
        db.commit()
        logger.info(f"HEART_EVENT_CREATED: Persisted {len(notifications_to_add)} notification rows.")

    # 5. Resolve active device tokens for recipients
    active_tokens = []
    if recipient_user_ids:
        active_tokens = db.query(DeviceToken).filter(
            DeviceToken.user_id.in_(recipient_user_ids),
            DeviceToken.is_active == True
        ).all()

    logger.info(f"DEVICE_TOKENS_RESOLVED: {len(active_tokens)} active tokens found.")

    # 6. Dispatch Push Notifications (FCM-free - SSE is primary)
    push_sent_count = await push_service.send_heart_push(
        db=db,
        device_tokens=active_tokens,
        sender_name=sender_display_name,
        sender_id=sender_id,
        family_id=family_id,
        event_id=event_id,
        custom_message=custom_msg
    )

    # 7. Publish to SSE streams for native Foreground Service listeners
    try:
        from backend.app.api.v1.events import publish_to_family
        sse_event = {
            "type": "heart",
            "sender_id": sender_id,
            "sender_name": sender_display_name,
            "heart_id": event_id,
            "family_id": family_id,
            "message": custom_msg or f"{sender_display_name} size bir kalp gönderdi ❤️",
        }
        asyncio.create_task(publish_to_family(family_id, sse_event))
        logger.info(f"SSE_HEART_DISPATCHED: event {event_id} sent to SSE for family {family_id}")
    except Exception as e:
        logger.warning(f"SSE_HEART_DISPATCH_ERROR: {e}")

    return HeartEventResponse(
        status="success",
        event_id=event_id,
        sender_id=sender_id,
        sender_name=sender_display_name,
        family_id=family_id,
        recipients_count=len(recipient_user_ids),
        push_sent_count=push_sent_count,
        created_at=now_dt
    )


