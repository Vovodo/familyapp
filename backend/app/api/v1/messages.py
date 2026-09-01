import re
import json
import httpx
import asyncio
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from loguru import logger
from backend.app.db.session import get_db
from backend.app.models.models import Message, FamilyMember, User, DeviceToken, Poll, PollVote
from backend.app.schemas.schemas import (
    MessageCreate,
    MessageUpdate,
    MessageResponse
)
from backend.app.api.deps import get_current_user, get_current_family_member
from backend.app.services.push_service import push_service

router = APIRouter()


class PollCreateRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=300)
    options: List[str] = Field(..., min_items=2, max_items=8)
    duration_hours: int = Field(default=12, ge=1, le=72)
    client_message_id: Optional[str] = None


class PollVoteRequest(BaseModel):
    option_index: int = Field(..., ge=0, le=10)


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

    # Batch load polls and voter profiles for all poll messages
    poll_msg_ids = [m.id for m in messages if m.media_type == "poll"]
    poll_map = {}
    if poll_msg_ids:
        polls = db.query(Poll).filter(Poll.message_id.in_(poll_msg_ids)).all()
        poll_ids = [p.id for p in polls]
        votes = (
            db.query(PollVote, User)
            .outerjoin(User, PollVote.user_id == User.id)
            .filter(PollVote.poll_id.in_(poll_ids))
            .all()
        )
        votes_by_poll: Dict[str, list] = {}
        for pv, u in votes:
            if pv.poll_id not in votes_by_poll:
                votes_by_poll[pv.poll_id] = []
            votes_by_poll[pv.poll_id].append({
                "user_id": pv.user_id,
                "option_index": pv.option_index,
                "name": u.full_name if u else "Aile Üyesi",
                "avatar": u.avatar_url if u else None,
            })

        now = datetime.now(timezone.utc)
        for p in polls:
            try:
                options_list = json.loads(p.options) if isinstance(p.options, str) else p.options
            except Exception:
                options_list = []
            pv_list = votes_by_poll.get(p.id, [])
            tallies = {i: 0 for i in range(len(options_list))}
            voters = {i: [] for i in range(len(options_list))}
            my_vote = None

            for v in pv_list:
                opt_idx = v["option_index"]
                if opt_idx in tallies:
                    tallies[opt_idx] += 1
                if opt_idx in voters:
                    voters[opt_idx].append({
                        "user_id": v["user_id"],
                        "name": v["name"],
                        "avatar": v["avatar"],
                    })
                if v["user_id"] == member.user_id:
                    my_vote = opt_idx

            exp = p.expires_at
            if exp.tzinfo is None:
                exp = exp.replace(tzinfo=timezone.utc)
            is_expired = p.is_closed or now > exp

            poll_map[p.message_id] = {
                "poll_id": p.id,
                "message_id": p.message_id,
                "question": p.question,
                "options": options_list,
                "duration_hours": p.duration_hours,
                "expires_at": p.expires_at.isoformat(),
                "is_closed": is_expired,
                "total_votes": len(pv_list),
                "tallies": tallies,
                "voters": voters,
                "my_vote": my_vote
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
                sender_nickname=sender_info["nickname"],
                poll=poll_map.get(msg.id)
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
                        media_type=msg.media_type,
                        sender_avatar=current_user.avatar_url
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
    Deletes a single message. Users can ONLY delete their OWN messages within 15 minutes of sending.
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

    # 15-minute deletion window rule (WhatsApp style)
    if msg.created_at and member.role != "admin":
        msg_time = msg.created_at
        if msg_time.tzinfo is None:
            msg_time = msg_time.replace(tzinfo=timezone.utc)
        age = datetime.now(timezone.utc) - msg_time
        if age > timedelta(minutes=15):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Mesajlar yalnızca gönderildikten sonraki ilk 15 dakika içinde silinebilir."
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


@router.post("/poll")
async def create_poll(
    payload: PollCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    member: FamilyMember = Depends(get_current_family_member)
):
    """
    Creates a new poll in the family chat with specified duration.
    """
    import uuid as _uuid
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(hours=payload.duration_hours)
    poll_id = str(_uuid.uuid4())
    message_id = str(_uuid.uuid4())

    options_cleaned = [opt.strip() for opt in payload.options if opt.strip()]
    if len(options_cleaned) < 2:
        raise HTTPException(status_code=400, detail="Ankette en az 2 seçenek olmalıdır.")

    # 1. Create chat message
    msg = Message(
        id=message_id,
        client_message_id=payload.client_message_id,
        family_id=member.family_id,
        sender_id=current_user.id,
        content=payload.question.strip(),
        media_type="poll",
        media_url=None,
        is_edited=False
    )
    db.add(msg)

    # 2. Create poll record
    poll = Poll(
        id=poll_id,
        message_id=message_id,
        family_id=member.family_id,
        creator_id=current_user.id,
        question=payload.question.strip(),
        options=json.dumps(options_cleaned, ensure_ascii=False),
        duration_hours=payload.duration_hours,
        expires_at=expires_at,
        is_closed=False
    )
    db.add(poll)
    db.commit()
    db.refresh(msg)
    db.refresh(poll)

    poll_data = {
        "poll_id": poll.id,
        "question": poll.question,
        "options": options_cleaned,
        "duration_hours": poll.duration_hours,
        "expires_at": poll.expires_at.isoformat(),
        "is_closed": False,
        "votes": {},
        "total_votes": 0,
        "my_vote": None
    }

    resp = {
        "id": msg.id,
        "family_id": msg.family_id,
        "sender_id": msg.sender_id,
        "content": msg.content,
        "media_type": "poll",
        "media_url": None,
        "media_thumbnail_url": None,
        "is_edited": False,
        "client_message_id": msg.client_message_id,
        "created_at": msg.created_at.isoformat(),
        "sender_name": current_user.full_name,
        "sender_avatar": current_user.avatar_url,
        "sender_nickname": member.nickname,
        "poll": poll_data
    }

    return resp


@router.post("/poll/{poll_id}/vote")
async def vote_poll(
    poll_id: str,
    payload: PollVoteRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    member: FamilyMember = Depends(get_current_family_member)
):
    """
    Casts or updates a user's vote on an active poll.
    """
    poll = (
        db.query(Poll)
        .filter(
            (Poll.id == poll_id) | (Poll.message_id == poll_id),
            Poll.family_id == member.family_id
        )
        .first()
    )
    if not poll:
        raise HTTPException(status_code=404, detail="Anket bulunamadı.")

    now = datetime.now(timezone.utc)
    exp = poll.expires_at
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)

    if poll.is_closed or now > exp:
        raise HTTPException(status_code=400, detail="Bu anketin süresi dolmuştur.")

    try:
        options_list = json.loads(poll.options) if isinstance(poll.options, str) else poll.options
    except Exception:
        options_list = []

    if payload.option_index >= len(options_list):
        raise HTTPException(status_code=400, detail="Geçersiz seçenek.")

    # Upsert user's vote
    existing_vote = db.query(PollVote).filter(
        PollVote.poll_id == poll.id,
        PollVote.user_id == current_user.id
    ).first()

    if existing_vote:
        existing_vote.option_index = payload.option_index
    else:
        new_vote = PollVote(
            poll_id=poll.id,
            user_id=current_user.id,
            option_index=payload.option_index
        )
        db.add(new_vote)

    db.commit()

    # Calculate tallies and voter details
    votes_data = (
        db.query(PollVote, User)
        .outerjoin(User, PollVote.user_id == User.id)
        .filter(PollVote.poll_id == poll.id)
        .all()
    )

    tallies: Dict[int, int] = {i: 0 for i in range(len(options_list))}
    voters: Dict[int, list] = {i: [] for i in range(len(options_list))}

    for v, u in votes_data:
        if v.option_index in tallies:
            tallies[v.option_index] += 1
        if v.option_index in voters:
            voters[v.option_index].append({
                "user_id": v.user_id,
                "name": u.full_name if u else "Aile Üyesi",
                "avatar": u.avatar_url if u else None,
            })

    return {
        "status": "success",
        "poll_id": poll.id,
        "message_id": poll.message_id,
        "my_vote": payload.option_index,
        "total_votes": len(votes_data),
        "tallies": tallies,
        "voters": voters,
        "is_closed": False
    }


@router.get("/poll/{poll_id}")
def get_poll_details(
    poll_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    member: FamilyMember = Depends(get_current_family_member)
):
    """
    Returns live tallies and status for a poll.
    """
    poll = (
        db.query(Poll)
        .filter(
            (Poll.id == poll_id) | (Poll.message_id == poll_id),
            Poll.family_id == member.family_id
        )
        .first()
    )
    if not poll:
        raise HTTPException(status_code=404, detail="Anket bulunamadı.")

    now = datetime.now(timezone.utc)
    exp = poll.expires_at
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    is_expired = poll.is_closed or now > exp

    try:
        options_list = json.loads(poll.options) if isinstance(poll.options, str) else poll.options
    except Exception:
        options_list = []

    votes_data = (
        db.query(PollVote, User)
        .outerjoin(User, PollVote.user_id == User.id)
        .filter(PollVote.poll_id == poll.id)
        .all()
    )

    tallies: Dict[int, int] = {i: 0 for i in range(len(options_list))}
    voters: Dict[int, list] = {i: [] for i in range(len(options_list))}
    my_vote = None

    for v, u in votes_data:
        if v.option_index in tallies:
            tallies[v.option_index] += 1
        if v.option_index in voters:
            voters[v.option_index].append({
                "user_id": v.user_id,
                "name": u.full_name if u else "Aile Üyesi",
                "avatar": u.avatar_url if u else None,
            })
        if v.user_id == current_user.id:
            my_vote = v.option_index

    return {
        "poll_id": poll.id,
        "message_id": poll.message_id,
        "question": poll.question,
        "options": options_list,
        "duration_hours": poll.duration_hours,
        "expires_at": poll.expires_at.isoformat(),
        "is_closed": is_expired,
        "total_votes": len(votes_data),
        "tallies": tallies,
        "voters": voters,
        "my_vote": my_vote
    }


@router.post("/cleanup-old")
def cleanup_old_messages(
    days: int = Query(14, ge=1, le=365, description="Kaç günden eski mesajların temizleneceği"),
    db: Session = Depends(get_db),
    member: FamilyMember = Depends(get_current_family_member)
):
    """
    Purges text, audio notes, and GIF messages older than specified days (default: 14 days / 2 weeks).
    Preserves all photos and shared family media intact.
    """
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)

    old_messages = (
        db.query(Message)
        .filter(
            Message.family_id == member.family_id,
            Message.created_at < cutoff,
            Message.media_type != "image"
        )
        .all()
    )

    deleted_count = len(old_messages)
    for msg in old_messages:
        db.delete(msg)

    db.commit()
    logger.info(f"Purged {deleted_count} old messages (> {days} days) for family {member.family_id}")
    return {
        "status": "success",
        "deleted_count": deleted_count,
        "message": f"{days} günden eski {deleted_count} adet sohbet ve ses kaydı temizlendi. Fotoğraflarınız korundu."
    }

