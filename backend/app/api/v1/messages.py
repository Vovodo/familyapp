import re
import httpx
import asyncio
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from loguru import logger
from backend.app.db.session import get_db
from backend.app.models.models import Message, FamilyMember, User, DeviceToken
from backend.app.schemas.schemas import (
    MessageCreate,
    MessageUpdate,
    MessageResponse
)
from backend.app.api.deps import get_current_user, get_current_family_member
from backend.app.services.push_service import push_service

router = APIRouter()


class BatchDeleteRequest(BaseModel):
    message_ids: List[str]
    for_everyone: bool = True


class LinkPreviewResponse(BaseModel):
    url: str
    title: Optional[str] = None
    description: Optional[str] = None
    image: Optional[str] = None
    site_name: Optional[str] = None
    favicon: Optional[str] = None


@router.get("/link-preview", response_model=LinkPreviewResponse)
async def get_link_preview(
    url: str = Query(..., description="Target URL to fetch OpenGraph metadata")
):
    """
    Fetches OpenGraph title, image and description for TikTok, Instagram, YouTube or web links.
    """
    clean_url = url.strip()
    if not clean_url.startswith(("http://", "https://")):
        clean_url = "https://" + clean_url

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7",
    }

    try:
        async with httpx.AsyncClient(timeout=4.0, follow_redirects=True, verify=False) as client:
            resp = await client.get(clean_url, headers=headers)
            if resp.status_code != 200:
                return LinkPreviewResponse(url=clean_url)

            html = resp.text[:50000]

            def get_meta(property_name: str) -> Optional[str]:
                m = re.search(rf'<meta\s+[^>]*property=["\']og:{property_name}["\'][^>]*content=["\']([^"\']+)["\']', html, re.I)
                if not m:
                    m = re.search(rf'<meta\s+[^>]*content=["\']([^"\']+)["\'][^>]*property=["\']og:{property_name}["\']', html, re.I)
                if not m:
                    m = re.search(rf'<meta\s+[^>]*name=["\'](?:twitter:)?{property_name}["\'][^>]*content=["\']([^"\']+)["\']', html, re.I)
                return m.group(1) if m else None

            title = get_meta("title")
            if not title:
                title_match = re.search(r'<title[^>]*>([^<]+)</title>', html, re.I)
                title = title_match.group(1).strip() if title_match else None

            description = get_meta("description")
            image = get_meta("image")
            site_name = get_meta("site_name")

            if not site_name:
                try:
                    site_name = clean_url.split("//")[1].split("/")[0].replace("www.", "")
                except Exception:
                    site_name = None

            return LinkPreviewResponse(
                url=clean_url,
                title=title[:120] if title else None,
                description=description[:200] if description else None,
                image=image,
                site_name=site_name
            )
    except Exception as e:
        logger.debug(f"Link preview fetch failed for {clean_url}: {e}")
        return LinkPreviewResponse(url=clean_url)


@router.get("/", response_model=List[MessageResponse])
def get_messages(
    limit: int = Query(50, ge=1, le=100),
    before: Optional[str] = Query(None, description="Cursor for pagination (message_id)"),
    db: Session = Depends(get_db),
    member: FamilyMember = Depends(get_current_family_member)
):
    """
    Returns messages for the family with cursor pagination.
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
    messages.reverse()

    if not messages:
        return []

    # Batch load all family members & user profiles for this family
    members_data = (
        db.query(FamilyMember, User)
        .outerjoin(User, FamilyMember.user_id == User.id)
        .filter(FamilyMember.family_id == member.family_id)
        .all()
    )

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
async def send_message(
    msg_in: MessageCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    member: FamilyMember = Depends(get_current_family_member)
):
    """
    Sends a new text or media message to the family group with ultra-fast async FCM push notification.
    """
    if not msg_in.content and not msg_in.media_url:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Mesaj metni veya medya içeriği gereklidir."
        )

    # Idempotency Guard
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

    # Non-blocking async background dispatch for Push Notifications
    try:
        other_members = db.query(FamilyMember).filter(
            FamilyMember.family_id == member.family_id,
            FamilyMember.user_id != current_user.id
        ).all()
        recipient_user_ids = [m.user_id for m in other_members]

        if recipient_user_ids:
            active_tokens = db.query(DeviceToken).filter(
                DeviceToken.user_id.in_(recipient_user_ids),
                DeviceToken.is_active == True
            ).all()

            if active_tokens:
                sender_display = member.nickname or current_user.full_name or "Aile Üyesi"
                asyncio.create_task(
                    push_service.send_chat_push(
                        db=db,
                        device_tokens=active_tokens,
                        sender_name=sender_display,
                        sender_id=current_user.id,
                        family_id=member.family_id,
                        message_id=msg.id,
                        content=msg.content,
                        media_type=msg.media_type
                    )
                )
    except Exception as e:
        logger.warning(f"Failed to schedule chat push notification: {e}")

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


@router.post("/batch-delete")
def batch_delete_messages(
    payload: BatchDeleteRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    member: FamilyMember = Depends(get_current_family_member)
):
    """
    Deletes multiple selected messages. Users can ONLY delete their OWN messages.
    """
    if not payload.message_ids:
        return {"deleted_count": 0}

    messages = (
        db.query(Message)
        .filter(
            Message.id.in_(payload.message_ids),
            Message.family_id == member.family_id
        )
        .all()
    )

    deleted_count = 0
    for msg in messages:
        # Strict Rule: Users can ONLY delete their OWN messages
        if msg.sender_id == current_user.id or member.role == "admin":
            if payload.for_everyone:
                msg.content = "🚫 Bu mesaj silindi"
                msg.media_url = None
                msg.media_thumbnail_url = None
                msg.is_edited = True
            else:
                db.delete(msg)
            deleted_count += 1

    db.commit()
    return {"status": "success", "deleted_count": deleted_count}


@router.delete("/{message_id}")
def delete_message(
    message_id: str,
    for_everyone: bool = Query(True, description="Replace with 'This message was deleted' banner"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    member: FamilyMember = Depends(get_current_family_member)
):
    """
    Deletes a single message. Users can ONLY delete their OWN messages.
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
            detail="Yalnızca kendi gönderdiğiniz mesajları silebilirsiniz."
        )

    if for_everyone:
        msg.content = "🚫 Bu mesaj silindi"
        msg.media_url = None
        msg.media_thumbnail_url = None
        msg.is_edited = True
        db.commit()
        return {"status": "success", "message": "Mesaj silindi olarak işaretlendi."}
    else:
        db.delete(msg)
        db.commit()
        return {"status": "success", "message": "Mesaj tamamen silindi."}
