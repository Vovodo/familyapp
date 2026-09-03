"""
Aile seyir odası API'si.

Oynatma kaynağı sunucudur: play/pause/seek REST ile kilitlenir, konum
anchor + geçen süre ile hesaplanır. Canlı yayını istemciler Supabase
broadcast ile duyar; kopan istemci GET ile toparlanır. Video dosyası
indirilmez.
"""
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.app.api.deps import get_current_family_member, get_current_user
from backend.app.db.session import get_db
from backend.app.models.models import FamilyMember, User, WatchRoom, WatchRoomMessage, WatchRoomParticipant
from backend.app.services.video_provider import parse_video_url, supported_providers

router = APIRouter()

PRESENCE_TTL_SECONDS = 45
MAX_OPEN_ROOMS = 8
MAX_MESSAGE_LEN = 500
MAX_TITLE_LEN = 120
MESSAGE_PAGE = 50

SUPPORTED_PROVIDERS = supported_providers()


# ---------------------------------------------------------------- şemalar


class WatchParticipantOut(BaseModel):
    user_id: str
    name: str
    avatar_url: Optional[str] = None
    is_host: bool = False
    is_online: bool = True


class WatchRoomStateOut(BaseModel):
    room_id: str
    title: str
    status: str
    provider: Optional[str] = None
    video_id: Optional[str] = None
    video_url: Optional[str] = None
    video_title: Optional[str] = None
    duration_ms: Optional[int] = None
    playback_state: str
    position_ms: int
    playback_rate: float = 1.0
    control_seq: int
    host_user_id: Optional[str] = None
    host_name: Optional[str] = None
    created_by: Optional[str] = None
    is_host: bool = False
    can_control: bool = False
    is_participant: bool = False
    participants: List[WatchParticipantOut] = []
    online_count: int = 0
    server_now: datetime
    created_at: datetime
    updated_at: Optional[datetime] = None


class WatchRoomListItemOut(BaseModel):
    room_id: str
    title: str
    status: str
    video_title: Optional[str] = None
    video_id: Optional[str] = None
    provider: Optional[str] = None
    playback_state: str
    host_name: Optional[str] = None
    online_count: int = 0
    created_at: datetime


class WatchMessageOut(BaseModel):
    id: str
    room_id: str
    user_id: str
    name: str
    body: str
    video_position_ms: Optional[int] = None
    client_message_id: Optional[str] = None
    created_at: datetime


class WatchRoomCreate(BaseModel):
    title: Optional[str] = Field(default=None, max_length=MAX_TITLE_LEN)
    video_url: Optional[str] = Field(default=None, max_length=500)


class WatchVideoIn(BaseModel):
    video_url: str = Field(min_length=4, max_length=500)
    provider: str = Field(default="youtube", max_length=30)
    video_title: Optional[str] = Field(default=None, max_length=200)


class WatchControlIn(BaseModel):
    action: str = Field(min_length=2, max_length=20)
    position_ms: Optional[int] = Field(default=None, ge=0, le=24 * 60 * 60 * 1000)
    duration_ms: Optional[int] = Field(default=None, ge=0, le=24 * 60 * 60 * 1000)
    base_control_seq: Optional[int] = Field(default=None, ge=0)


class WatchHeartbeatIn(BaseModel):
    duration_ms: Optional[int] = Field(default=None, ge=0, le=24 * 60 * 60 * 1000)
    video_title: Optional[str] = Field(default=None, max_length=200)


class WatchMessageIn(BaseModel):
    body: str = Field(min_length=1, max_length=MAX_MESSAGE_LEN)
    video_position_ms: Optional[int] = Field(default=None, ge=0, le=24 * 60 * 60 * 1000)
    client_message_id: Optional[str] = Field(default=None, max_length=100)


class WatchHostIn(BaseModel):
    user_id: str = Field(min_length=1, max_length=36)


# ---------------------------------------------------------------- yardımcılar


def _aware(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _is_online(participant: WatchRoomParticipant, now: Optional[datetime] = None) -> bool:
    if not participant.is_present:
        return False
    seen = _aware(participant.last_seen_at)
    if not seen:
        return False
    now = now or _now()
    return (now - seen).total_seconds() <= PRESENCE_TTL_SECONDS


def _touch(participant: WatchRoomParticipant) -> None:
    participant.is_present = True
    participant.last_seen_at = _now()


def _lock_room(db: Session, room_id: str, family_id: str) -> Optional[WatchRoom]:
    return (
        db.query(WatchRoom)
        .filter(WatchRoom.id == room_id, WatchRoom.family_id == family_id)
        .with_for_update()
        .first()
    )


def _get_room(db: Session, room_id: str, family_id: str) -> WatchRoom:
    room = (
        db.query(WatchRoom)
        .filter(WatchRoom.id == room_id, WatchRoom.family_id == family_id)
        .first()
    )
    if not room:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Seyir odası bulunamadı.")
    return room


def _require_open(room: WatchRoom) -> None:
    if room.status != "open":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Bu seyir odası kapatılmış.")


def _compute_position_ms(room: WatchRoom, now: Optional[datetime] = None) -> int:
    now = now or _now()
    base = max(0, int(room.position_ms or 0))
    if room.playback_state != "playing":
        return base
    started = _aware(room.position_updated_at) or now
    elapsed = (now - started).total_seconds() * 1000.0 * float(room.playback_rate or 1.0)
    position = int(base + max(0, elapsed))
    if room.duration_ms and room.duration_ms > 0:
        return min(position, int(room.duration_ms))
    return position


def _freeze_position(room: WatchRoom, now: Optional[datetime] = None) -> int:
    now = now or _now()
    position = _compute_position_ms(room, now)
    room.position_ms = position
    room.position_updated_at = now
    return position


def _prune_participants(db: Session, room: WatchRoom) -> None:
    now = _now()
    cutoff = now - timedelta(seconds=PRESENCE_TTL_SECONDS)
    stale = (
        db.query(WatchRoomParticipant)
        .filter(
            WatchRoomParticipant.room_id == room.id,
            WatchRoomParticipant.is_present.is_(True),
        )
        .all()
    )
    changed = False
    for participant in stale:
        seen = _aware(participant.last_seen_at)
        if not seen or seen < cutoff:
            participant.is_present = False
            changed = True
    if changed:
        _maybe_reassign_host(db, room)
        room.updated_at = now


def _online_participants(db: Session, room_id: str) -> List[WatchRoomParticipant]:
    now = _now()
    rows = (
        db.query(WatchRoomParticipant)
        .filter(WatchRoomParticipant.room_id == room_id)
        .order_by(WatchRoomParticipant.joined_at.asc())
        .all()
    )
    return [p for p in rows if _is_online(p, now)]


def _maybe_reassign_host(db: Session, room: WatchRoom) -> bool:
    online = _online_participants(db, room.id)
    if not online:
        return False
    if room.host_user_id and any(p.user_id == room.host_user_id for p in online):
        return False
    room.host_user_id = online[0].user_id
    return True


def _display_name(user: Optional[User], fallback: str = "Aile üyesi") -> str:
    if user and user.full_name:
        return user.full_name.split(" ")[0]
    return fallback


def _member_name(db: Session, family_id: str, user_id: str, user: Optional[User]) -> str:
    member = (
        db.query(FamilyMember)
        .filter(FamilyMember.family_id == family_id, FamilyMember.user_id == user_id)
        .first()
    )
    if member and member.nickname:
        return member.nickname
    return _display_name(user)


def _apply_video(room: WatchRoom, video_url: str, provider: str, video_title: Optional[str]) -> None:
    provider_key = (provider or "youtube").strip().lower()
    if provider_key not in SUPPORTED_PROVIDERS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Bu video kaynağı henüz desteklenmiyor. YouTube bağlantısı kullanın.",
        )
    try:
        parsed = parse_video_url(video_url, provider_key)
    except ValueError as exc:
        if str(exc).startswith("unsupported_provider"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Bu video kaynağı henüz desteklenmiyor. YouTube bağlantısı kullanın.",
            ) from exc
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Geçerli bir YouTube bağlantısı girin. Örnek: https://www.youtube.com/watch?v=...",
        ) from exc

    now = _now()
    room.video_provider = parsed.provider
    room.video_id = parsed.video_id
    room.video_url = parsed.canonical_url
    if video_title:
        room.video_title = video_title.strip()[:200]
    elif not room.video_title:
        room.video_title = None
    room.duration_ms = None
    room.playback_state = "paused"
    room.position_ms = parsed.start_ms
    room.position_updated_at = now
    room.control_seq = int(room.control_seq or 0) + 1
    room.updated_at = now


def _serialize_room(
    db: Session,
    room: WatchRoom,
    current_user_id: str,
) -> WatchRoomStateOut:
    now = _now()
    participants = (
        db.query(WatchRoomParticipant)
        .filter(WatchRoomParticipant.room_id == room.id)
        .order_by(WatchRoomParticipant.joined_at.asc())
        .all()
    )
    out_participants: List[WatchParticipantOut] = []
    me = None
    for participant in participants:
        online = _is_online(participant, now)
        if not online and not participant.is_present:
            continue
        if not online:
            continue
        user = participant.user
        out_participants.append(
            WatchParticipantOut(
                user_id=participant.user_id,
                name=_member_name(db, room.family_id, participant.user_id, user),
                avatar_url=user.avatar_url if user else None,
                is_host=participant.user_id == room.host_user_id,
                is_online=True,
            )
        )
        if participant.user_id == current_user_id:
            me = participant

    host = next((p for p in participants if p.user_id == room.host_user_id), None)
    is_participant = bool(me and _is_online(me, now))
    return WatchRoomStateOut(
        room_id=room.id,
        title=room.title,
        status=room.status,
        provider=room.video_provider,
        video_id=room.video_id,
        video_url=room.video_url,
        video_title=room.video_title,
        duration_ms=room.duration_ms,
        playback_state=room.playback_state,
        position_ms=_compute_position_ms(room, now),
        playback_rate=float(room.playback_rate or 1.0),
        control_seq=int(room.control_seq or 0),
        host_user_id=room.host_user_id,
        host_name=_member_name(db, room.family_id, host.user_id, host.user) if host else None,
        created_by=room.created_by,
        is_host=room.host_user_id == current_user_id,
        can_control=is_participant and room.status == "open",
        is_participant=is_participant,
        participants=out_participants,
        online_count=len(out_participants),
        server_now=now,
        created_at=room.created_at,
        updated_at=room.updated_at,
    )


def _serialize_message(db: Session, msg: WatchRoomMessage) -> WatchMessageOut:
    return WatchMessageOut(
        id=msg.id,
        room_id=msg.room_id,
        user_id=msg.user_id,
        name=_member_name(db, msg.family_id, msg.user_id, msg.user),
        body=msg.body,
        video_position_ms=msg.video_position_ms,
        client_message_id=msg.client_message_id,
        created_at=msg.created_at,
    )


def _require_participant(db: Session, room: WatchRoom, user_id: str) -> WatchRoomParticipant:
    participant = (
        db.query(WatchRoomParticipant)
        .filter(
            WatchRoomParticipant.room_id == room.id,
            WatchRoomParticipant.user_id == user_id,
            WatchRoomParticipant.is_present.is_(True),
        )
        .first()
    )
    if not participant or not _is_online(participant):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bu işlem için önce seyir odasına katılmalısınız.",
        )
    _touch(participant)
    return participant


def _ensure_not_in_other_room(db: Session, family_id: str, user_id: str, keep_room_id: Optional[str] = None) -> None:
    others = (
        db.query(WatchRoomParticipant)
        .filter(
            WatchRoomParticipant.family_id == family_id,
            WatchRoomParticipant.user_id == user_id,
            WatchRoomParticipant.is_present.is_(True),
        )
        .all()
    )
    now = _now()
    for participant in others:
        if keep_room_id and participant.room_id == keep_room_id:
            continue
        if _is_online(participant, now):
            participant.is_present = False
            room = db.query(WatchRoom).filter(WatchRoom.id == participant.room_id).first()
            if room and room.status == "open":
                _maybe_reassign_host(db, room)


# ---------------------------------------------------------------- uçlar


@router.get("/rooms", response_model=List[WatchRoomListItemOut])
def list_watch_rooms(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    member: FamilyMember = Depends(get_current_family_member),
):
    rooms = (
        db.query(WatchRoom)
        .filter(WatchRoom.family_id == member.family_id, WatchRoom.status == "open")
        .order_by(WatchRoom.created_at.desc())
        .all()
    )
    items: List[WatchRoomListItemOut] = []
    for room in rooms:
        _prune_participants(db, room)
        online = _online_participants(db, room.id)
        host = next((p for p in online if p.user_id == room.host_user_id), None)
        if not host:
            host_row = (
                db.query(WatchRoomParticipant)
                .filter(
                    WatchRoomParticipant.room_id == room.id,
                    WatchRoomParticipant.user_id == room.host_user_id,
                )
                .first()
            )
            host = host_row
        items.append(
            WatchRoomListItemOut(
                room_id=room.id,
                title=room.title,
                status=room.status,
                video_title=room.video_title,
                video_id=room.video_id,
                provider=room.video_provider,
                playback_state=room.playback_state,
                host_name=_member_name(db, room.family_id, host.user_id, host.user) if host else None,
                online_count=len(online),
                created_at=room.created_at,
            )
        )
    db.commit()
    return items


@router.post("/rooms", response_model=WatchRoomStateOut, status_code=status.HTTP_201_CREATED)
def create_watch_room(
    payload: WatchRoomCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    member: FamilyMember = Depends(get_current_family_member),
):
    open_count = (
        db.query(WatchRoom)
        .filter(WatchRoom.family_id == member.family_id, WatchRoom.status == "open")
        .count()
    )
    if open_count >= MAX_OPEN_ROOMS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Aynı anda en fazla 8 açık seyir odası olabilir. Birini kapatın.",
        )

    title = (payload.title or "").strip() or "Seyir Odası"
    room = WatchRoom(
        family_id=member.family_id,
        created_by=current_user.id,
        host_user_id=current_user.id,
        title=title[:MAX_TITLE_LEN],
        status="open",
        playback_state="idle",
        position_ms=0,
        position_updated_at=_now(),
        control_seq=0,
    )
    if payload.video_url:
        _apply_video(room, payload.video_url, "youtube", None)

    db.add(room)
    db.flush()

    _ensure_not_in_other_room(db, member.family_id, current_user.id, keep_room_id=room.id)
    db.add(
        WatchRoomParticipant(
            room_id=room.id,
            family_id=member.family_id,
            user_id=current_user.id,
            is_present=True,
            last_seen_at=_now(),
        )
    )
    db.commit()
    db.refresh(room)
    return _serialize_room(db, room, current_user.id)


@router.get("/rooms/{room_id}", response_model=WatchRoomStateOut)
def get_watch_room(
    room_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    member: FamilyMember = Depends(get_current_family_member),
):
    room = _get_room(db, room_id, member.family_id)
    _prune_participants(db, room)
    db.commit()
    db.refresh(room)
    return _serialize_room(db, room, current_user.id)


@router.post("/rooms/{room_id}/join", response_model=WatchRoomStateOut)
def join_watch_room(
    room_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    member: FamilyMember = Depends(get_current_family_member),
):
    room = _lock_room(db, room_id, member.family_id)
    if not room:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Seyir odası bulunamadı.")
    _require_open(room)
    _prune_participants(db, room)
    _ensure_not_in_other_room(db, member.family_id, current_user.id, keep_room_id=room.id)

    participant = (
        db.query(WatchRoomParticipant)
        .filter(
            WatchRoomParticipant.room_id == room.id,
            WatchRoomParticipant.user_id == current_user.id,
        )
        .first()
    )
    if participant:
        _touch(participant)
    else:
        db.add(
            WatchRoomParticipant(
                room_id=room.id,
                family_id=member.family_id,
                user_id=current_user.id,
                is_present=True,
                last_seen_at=_now(),
            )
        )
    _maybe_reassign_host(db, room)
    db.commit()
    db.refresh(room)
    return _serialize_room(db, room, current_user.id)


@router.post("/rooms/{room_id}/leave", response_model=WatchRoomStateOut)
def leave_watch_room(
    room_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    member: FamilyMember = Depends(get_current_family_member),
):
    room = _lock_room(db, room_id, member.family_id)
    if not room:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Seyir odası bulunamadı.")
    participant = (
        db.query(WatchRoomParticipant)
        .filter(
            WatchRoomParticipant.room_id == room.id,
            WatchRoomParticipant.user_id == current_user.id,
        )
        .first()
    )
    if participant:
        participant.is_present = False
        participant.last_seen_at = _now()
    _maybe_reassign_host(db, room)
    db.commit()
    db.refresh(room)
    return _serialize_room(db, room, current_user.id)


@router.post("/rooms/{room_id}/heartbeat", response_model=WatchRoomStateOut)
def watch_heartbeat(
    room_id: str,
    payload: WatchHeartbeatIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    member: FamilyMember = Depends(get_current_family_member),
):
    room = _get_room(db, room_id, member.family_id)
    _require_open(room)
    _prune_participants(db, room)
    participant = (
        db.query(WatchRoomParticipant)
        .filter(
            WatchRoomParticipant.room_id == room.id,
            WatchRoomParticipant.user_id == current_user.id,
        )
        .first()
    )
    if not participant:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Bu seyir odasına katılmadınız.")
    _touch(participant)
    if payload.duration_ms and (not room.duration_ms or payload.duration_ms > 0):
        room.duration_ms = payload.duration_ms
    if payload.video_title and not room.video_title:
        room.video_title = payload.video_title.strip()[:200]
    _maybe_reassign_host(db, room)
    db.commit()
    db.refresh(room)
    return _serialize_room(db, room, current_user.id)


@router.post("/rooms/{room_id}/video", response_model=WatchRoomStateOut)
def set_watch_video(
    room_id: str,
    payload: WatchVideoIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    member: FamilyMember = Depends(get_current_family_member),
):
    room = _lock_room(db, room_id, member.family_id)
    if not room:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Seyir odası bulunamadı.")
    _require_open(room)
    _require_participant(db, room, current_user.id)
    _apply_video(room, payload.video_url, payload.provider, payload.video_title)
    room.last_control_user_id = current_user.id
    db.commit()
    db.refresh(room)
    return _serialize_room(db, room, current_user.id)


@router.post("/rooms/{room_id}/control", response_model=WatchRoomStateOut)
def control_watch_room(
    room_id: str,
    payload: WatchControlIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    member: FamilyMember = Depends(get_current_family_member),
):
    room = _lock_room(db, room_id, member.family_id)
    if not room:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Seyir odası bulunamadı.")
    _require_open(room)
    _require_participant(db, room, current_user.id)
    if not room.video_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Önce odaya bir video ekleyin.")

    if payload.base_control_seq is not None and payload.base_control_seq != int(room.control_seq or 0):
        db.commit()
        db.refresh(room)
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Oynatma durumu güncellendi. Lütfen tekrar deneyin.",
        )

    now = _now()
    action = payload.action.strip().lower()
    if payload.duration_ms:
        room.duration_ms = payload.duration_ms

    if action in ("play", "resume"):
        if payload.position_ms is not None:
            room.position_ms = payload.position_ms
        else:
            _freeze_position(room, now)
        room.playback_state = "playing"
        room.position_updated_at = now
    elif action == "pause":
        if payload.position_ms is not None:
            room.position_ms = payload.position_ms
            room.position_updated_at = now
        else:
            _freeze_position(room, now)
        room.playback_state = "paused"
    elif action == "seek":
        if payload.position_ms is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Seek için konum gerekli.")
        room.position_ms = payload.position_ms
        room.position_updated_at = now
        if room.playback_state == "ended":
            room.playback_state = "paused"
        elif room.playback_state == "idle":
            room.playback_state = "paused"
    elif action == "ended":
        _freeze_position(room, now)
        if payload.position_ms is not None:
            room.position_ms = payload.position_ms
        room.playback_state = "ended"
        room.position_updated_at = now
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Geçersiz kontrol. play, pause, seek veya ended kullanın.",
        )

    room.control_seq = int(room.control_seq or 0) + 1
    room.last_control_user_id = current_user.id
    room.updated_at = now
    db.commit()
    db.refresh(room)
    return _serialize_room(db, room, current_user.id)


@router.post("/rooms/{room_id}/host", response_model=WatchRoomStateOut)
def transfer_watch_host(
    room_id: str,
    payload: WatchHostIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    member: FamilyMember = Depends(get_current_family_member),
):
    room = _lock_room(db, room_id, member.family_id)
    if not room:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Seyir odası bulunamadı.")
    _require_open(room)
    if room.host_user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Oda sahibini yalnızca mevcut ev sahibi değiştirebilir.")
    target = (
        db.query(WatchRoomParticipant)
        .filter(
            WatchRoomParticipant.room_id == room.id,
            WatchRoomParticipant.user_id == payload.user_id,
        )
        .first()
    )
    if not target or not _is_online(target):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bu üye odada çevrimiçi değil.")
    room.host_user_id = target.user_id
    room.updated_at = _now()
    db.commit()
    db.refresh(room)
    return _serialize_room(db, room, current_user.id)


@router.post("/rooms/{room_id}/end", response_model=WatchRoomStateOut)
def end_watch_room(
    room_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    member: FamilyMember = Depends(get_current_family_member),
):
    room = _lock_room(db, room_id, member.family_id)
    if not room:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Seyir odası bulunamadı.")
    if room.host_user_id != current_user.id and room.created_by != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Odayı yalnızca ev sahibi kapatabilir.")
    _freeze_position(room)
    room.status = "ended"
    room.playback_state = "ended"
    room.updated_at = _now()
    db.query(WatchRoomParticipant).filter(WatchRoomParticipant.room_id == room.id).update(
        {WatchRoomParticipant.is_present: False},
        synchronize_session=False,
    )
    db.commit()
    db.refresh(room)
    return _serialize_room(db, room, current_user.id)


@router.get("/rooms/{room_id}/messages", response_model=List[WatchMessageOut])
def list_watch_messages(
    room_id: str,
    before: Optional[str] = Query(None),
    limit: int = Query(MESSAGE_PAGE, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    member: FamilyMember = Depends(get_current_family_member),
):
    room = _get_room(db, room_id, member.family_id)
    query = db.query(WatchRoomMessage).filter(
        WatchRoomMessage.room_id == room.id,
        WatchRoomMessage.family_id == member.family_id,
    )
    if before:
        cursor = (
            db.query(WatchRoomMessage)
            .filter(WatchRoomMessage.id == before, WatchRoomMessage.room_id == room.id)
            .first()
        )
        if cursor:
            query = query.filter(WatchRoomMessage.created_at < cursor.created_at)
    rows = query.order_by(WatchRoomMessage.created_at.desc()).limit(limit).all()
    rows.reverse()
    return [_serialize_message(db, m) for m in rows]


@router.post("/rooms/{room_id}/messages", response_model=WatchMessageOut, status_code=status.HTTP_201_CREATED)
def post_watch_message(
    room_id: str,
    payload: WatchMessageIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    member: FamilyMember = Depends(get_current_family_member),
):
    room = _get_room(db, room_id, member.family_id)
    _require_open(room)
    _require_participant(db, room, current_user.id)
    body = payload.body.strip()
    if not body:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Mesaj boş olamaz.")

    if payload.client_message_id:
        existing = (
            db.query(WatchRoomMessage)
            .filter(
                WatchRoomMessage.room_id == room.id,
                WatchRoomMessage.client_message_id == payload.client_message_id,
            )
            .first()
        )
        if existing:
            return _serialize_message(db, existing)

    msg = WatchRoomMessage(
        room_id=room.id,
        family_id=member.family_id,
        user_id=current_user.id,
        body=body[:MAX_MESSAGE_LEN],
        video_position_ms=payload.video_position_ms,
        client_message_id=payload.client_message_id,
    )
    db.add(msg)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        existing = (
            db.query(WatchRoomMessage)
            .filter(
                WatchRoomMessage.room_id == room.id,
                WatchRoomMessage.client_message_id == payload.client_message_id,
            )
            .first()
        )
        if existing:
            return _serialize_message(db, existing)
        raise
    db.refresh(msg)
    return _serialize_message(db, msg)
