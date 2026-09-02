import random
import string
import time
import threading
import uuid
import asyncio
from datetime import datetime, timezone
from typing import List, Optional, Dict
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
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
    FamilySettingsUpdate,
    FamilyTransferOwnership,
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
    Creates a new family group and sets current user as creator and admin.
    """
    # The client has no family switcher, so a second family would silently become
    # the active one and hide the real family's data. Refuse instead of letting a
    # stale onboarding screen strand the user in an empty group.
    existing_membership = (
        db.query(FamilyMember)
        .filter(FamilyMember.user_id == current_user.id)
        .first()
    )
    if existing_membership:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Zaten bir aile grubuna üyesiniz. Yeni aile kurmak için önce mevcut ailenizden ayrılmalısınız."
        )

    invite_code = generate_invite_code()
    while db.query(Family).filter(Family.invite_code == invite_code).first():
        invite_code = generate_invite_code()

    family = Family(
        name=family_in.name,
        invite_code=invite_code,
        created_by=current_user.id,
        is_public=False
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

    existing = (
        db.query(FamilyMember)
        .filter(FamilyMember.user_id == current_user.id)
        .first()
    )
    if existing:
        if existing.family_id == family.id:
            return family
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Zaten bir aile grubuna üyesiniz. Başka bir gruba katılmak için önce mevcut ailenizden ayrılmalısınız.",
        )

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


@router.get("/my-families", response_model=List[FamilyResponse])
@router.get("/", response_model=List[FamilyResponse])
def get_my_families(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Returns all families that the current user is a member of.
    """
    memberships = db.query(FamilyMember).filter(FamilyMember.user_id == current_user.id).all()
    family_ids = [m.family_id for m in memberships]

    if not family_ids:
        return []

    return db.query(Family).filter(Family.id.in_(family_ids)).all()


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


@router.patch("/settings", response_model=FamilyResponse)
def update_family_settings(
    settings_in: FamilySettingsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    member: FamilyMember = Depends(get_current_family_member)
):
    """
    Updates family group settings (Name, Public/Private visibility). Only Admin can update.
    """
    if member.role != "admin" and member.family.created_by != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Aile ayarlarını yalnızca grup yöneticisi değiştirebilir."
        )

    family = member.family
    if settings_in.name is not None:
        clean_name = settings_in.name.strip()
        if clean_name:
            family.name = clean_name
    if settings_in.is_public is not None:
        family.is_public = settings_in.is_public

    db.commit()
    db.refresh(family)
    return family


@router.delete("/members/{member_id}", status_code=status.HTTP_200_OK)
def remove_family_member(
    member_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    admin_member: FamilyMember = Depends(get_current_admin_member)
):
    """
    Allows the group admin to kick a member from the family group.
    """
    target_member = db.query(FamilyMember).filter(
        FamilyMember.id == member_id,
        FamilyMember.family_id == admin_member.family_id
    ).first()

    if not target_member:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Üye bulunamadı."
        )

    if target_member.user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Kendinizi gruptan atamazsınız. 'Aileden Ayrıl' seçeneğini kullanın."
        )

    # If target is creator, cannot be removed
    if admin_member.family.created_by == target_member.user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Grup kurucusu gruptan çıkarılamaz."
        )

    db.delete(target_member)
    db.commit()
    return {"status": "success", "message": "Üye başarıyla gruptan çıkarıldı."}


@router.post("/leave", status_code=status.HTTP_200_OK)
def leave_family(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    member: FamilyMember = Depends(get_current_family_member)
):
    """
    Allows a regular member to leave the family.
    """
    family = member.family
    if family.created_by == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Grup kurucusu gruptan ayrılamaz. Grubu tamamen kapatabilir veya devredebilirsiniz."
        )

    db.delete(member)
    db.commit()
    return {"status": "success", "message": "Aile grubundan ayrıldınız."}


@router.post("/transfer-ownership", response_model=FamilyResponse)
def transfer_family_ownership(
    payload: FamilyTransferOwnership,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    member: FamilyMember = Depends(get_current_family_member),
):
    """
    Grup kurucusu sahipliği başka bir üyeye aktarır. Aktarımdan sonra
    eski kurucu üye olarak kalır ve gruptan ayrılıp yeni aile kurabilir.
    """
    family = (
        db.query(Family)
        .filter(Family.id == member.family_id)
        .with_for_update()
        .first()
    )
    if not family:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Aile bulunamadı.")

    if family.created_by != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Sahipliği yalnızca grup kurucusu aktarabilir.",
        )

    target = (
        db.query(FamilyMember)
        .filter(
            FamilyMember.id == payload.member_id,
            FamilyMember.family_id == family.id,
        )
        .first()
    )
    if not target:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Sahiplik aktarılacak üye bu grupta bulunamadı.",
        )
    if target.user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Sahipliği kendinize aktaramazsınız. Başka bir üye seçin.",
        )

    family.created_by = target.user_id
    target.role = "admin"
    member.role = "member"

    db.commit()
    db.refresh(family)
    logger.info(
        f"Aile sahipliği aktarıldı: aile {family.id}, {current_user.id} -> {target.user_id}"
    )
    return family


@router.delete("/{family_id}", status_code=status.HTTP_200_OK)
def delete_family(
    family_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Permanently closes/deletes a family group.
    STRICT RULE: ONLY the original creator of the group can close/delete it.
    """
    family = db.query(Family).filter(Family.id == family_id).first()
    if not family:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Aile grubu bulunamadı."
        )

    # Strict Permission Check: Only the creator of the family (or admin if created_by is None) can delete the group
    is_creator = (family.created_by == current_user.id) or (family.created_by is None and current_user.role == "admin") or current_user.role == "admin"
    if not is_creator:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bu aile grubunu yalnızca grubu kuran kurucu üye kapatabilir."
        )

    # Cascade delete data for this specific family
    db.query(Message).filter(Message.family_id == family_id).delete(synchronize_session=False)
    db.query(Note).filter(Note.family_id == family_id).delete(synchronize_session=False)
    db.query(Reminder).filter(Reminder.family_id == family_id).delete(synchronize_session=False)
    db.query(ShoppingItem).filter(ShoppingItem.family_id == family_id).delete(synchronize_session=False)
    db.query(Media).filter(Media.family_id == family_id).delete(synchronize_session=False)
    db.query(FamilyMember).filter(FamilyMember.family_id == family_id).delete(synchronize_session=False)

    db.delete(family)
    db.commit()

    logger.info(f"Family {family_id} deleted by creator {current_user.id}")
    return {"message": "Aile grubu ve tüm verileri kalıcı olarak silindi."}


@router.post("/heart", response_model=HeartEventResponse, status_code=status.HTTP_200_OK)
async def send_family_heart(
    body: Optional[HeartEventRequest] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    member: FamilyMember = Depends(get_current_family_member)
):
    """
    Sends an instant love Heart notification and vibration to all other members in the family.
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

    sender_display_name = member.nickname or current_user.full_name or "Aile Üyesi"
    event_id = f"heart-{uuid.uuid4()}"
    now_dt = datetime.now(timezone.utc)
    custom_msg = body.message.strip() if body and body.message else None

    family_members = db.query(FamilyMember).filter(
        FamilyMember.family_id == family_id,
        FamilyMember.user_id != sender_id
    ).all()

    recipient_user_ids = [m.user_id for m in family_members]

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

    active_tokens = []
    if recipient_user_ids:
        active_tokens = db.query(DeviceToken).filter(
            DeviceToken.user_id.in_(recipient_user_ids),
            DeviceToken.is_active == True
        ).all()

    push_sent_count = await push_service.send_heart_push(
        db=db,
        device_tokens=active_tokens,
        sender_name=sender_display_name,
        sender_id=sender_id,
        family_id=family_id,
        event_id=event_id,
        custom_message=custom_msg
    )

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


@router.post("/poke")
async def send_poke(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_member: FamilyMember = Depends(get_current_family_member)
):
    """
    Sends a 'poke' notification to all other family members.
    Triggers a visually distinct push notification with rapid vibration pattern.
    """
    import uuid as _uuid
    poke_id = str(_uuid.uuid4())
    family_id = str(current_member.family_id)
    sender_id = str(current_user.id)
    sender_display_name = current_member.nickname or current_user.full_name.split()[0]

    # Get all other family members' user IDs
    other_members = db.query(FamilyMember).filter(
        FamilyMember.family_id == current_member.family_id,
        FamilyMember.user_id != current_user.id
    ).all()

    if not other_members:
        return {"status": "no_recipients", "poke_id": poke_id}

    other_user_ids = [str(m.user_id) for m in other_members]

    # Collect device tokens
    device_tokens = db.query(DeviceToken).filter(
        DeviceToken.user_id.in_(other_user_ids),
        DeviceToken.is_active == True
    ).all()

    push_sent = 0
    if device_tokens:
        push_sent = await push_service.send_poke_push(
            db=db,
            device_tokens=device_tokens,
            sender_name=sender_display_name,
            sender_id=sender_id,
            family_id=family_id,
            poke_id=poke_id,
            sender_avatar=current_user.avatar_url
        )
        logger.info(f"POKE: {sender_display_name} → {len(other_members)} recipients, push_sent={push_sent}")

    # Broadcast via SSE/Realtime so in-app banner shows
    try:
        from backend.app.api.v1.events import publish_to_family
        sse_event = {
            "type": "poke",
            "poke_id": poke_id,
            "sender_id": sender_id,
            "sender_name": sender_display_name,
            "sender_avatar": current_user.avatar_url,
            "family_id": family_id,
            "message": f"{sender_display_name} sizi dürtüyor! 👉",
        }
        asyncio.create_task(publish_to_family(family_id, sse_event))
    except Exception as e:
        logger.warning(f"SSE_POKE_DISPATCH_ERROR: {e}")

    return {
        "status": "success",
        "poke_id": poke_id,
        "sender_name": sender_display_name,
        "recipients_count": len(other_members),
        "push_sent_count": push_sent
    }


class QuickActionRequest(BaseModel):
    action_type: str = Field(..., pattern="^(heart|tea|coming_home|meal)$")
    custom_message: Optional[str] = None


@router.post("/quick-action")
async def send_quick_action(
    payload: QuickActionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_member: FamilyMember = Depends(get_current_family_member)
):
    """
    Sends a rich family status action (tea, coming_home, meal, heart) with custom sounds and visual styles.
    Rate limited with 2.5s cooldown per user.
    """
    now = time.time()
    user_key = f"quick_{current_user.id}"
    with _heart_lock:
        last_time = _user_heart_timestamps.get(user_key, 0)
        if now - last_time < 2.5:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Lütfen birkaç saniye bekleyin."
            )
        _user_heart_timestamps[user_key] = now

    import uuid as _uuid
    action_id = str(_uuid.uuid4())
    family_id = str(current_member.family_id)
    sender_id = str(current_user.id)
    sender_name = current_member.nickname or current_user.full_name.split()[0]

    action_configs = {
        "tea": {
            "title": "☕ Çay Koydum!",
            "body": f"{sender_name} çay koydu, sizi bekliyor! ☕",
            "sound": "tea"
        },
        "coming_home": {
            "title": "🚗 Eve Geliyorum!",
            "body": f"{sender_name} eve geliyor, yola çıktı! 🚗",
            "sound": "car_horn"
        },
        "meal": {
            "title": "🍲 Yemek Hazır!",
            "body": f"{sender_name} sofrayı kurdu, yemek hazır! 🍲",
            "sound": "meal"
        },
        "heart": {
            "title": "❤️ Aileden Bir Kalp",
            "body": f"{sender_name} size sevgi dolu bir kalp gönderdi! ❤️",
            "sound": "heart"
        }
    }

    cfg = action_configs.get(payload.action_type, action_configs["heart"])
    title = cfg["title"]
    body = payload.custom_message if payload.custom_message else cfg["body"]

    # Get other family members
    other_members = db.query(FamilyMember).filter(
        FamilyMember.family_id == current_member.family_id,
        FamilyMember.user_id != current_user.id
    ).all()

    recipient_ids = [str(m.user_id) for m in other_members]
    push_sent = 0

    if recipient_ids:
        device_tokens = db.query(DeviceToken).filter(
            DeviceToken.user_id.in_(recipient_ids),
            DeviceToken.is_active == True
        ).all()

        if device_tokens:
            push_sent = await push_service.send_status_action_push(
                db=db,
                device_tokens=device_tokens,
                action_type=payload.action_type,
                title=title,
                body=body,
                sender_name=sender_name,
                sender_id=sender_id,
                family_id=family_id,
                action_id=action_id,
                sender_avatar=current_user.avatar_url
            )

    # SSE Event
    try:
        from backend.app.api.v1.events import publish_to_family
        sse_event = {
            "type": payload.action_type,
            "action_id": action_id,
            "sender_id": sender_id,
            "sender_name": sender_name,
            "sender_avatar": current_user.avatar_url,
            "family_id": family_id,
            "title": title,
            "message": body,
            "sound": cfg["sound"]
        }
        asyncio.create_task(publish_to_family(family_id, sse_event))
    except Exception as e:
        logger.warning(f"SSE_ACTION_DISPATCH_ERROR: {e}")

    return {
        "status": "success",
        "action_id": action_id,
        "action_type": payload.action_type,
        "sender_name": sender_name,
        "title": title,
        "message": body,
        "recipients_count": len(recipient_ids),
        "push_sent_count": push_sent
    }

