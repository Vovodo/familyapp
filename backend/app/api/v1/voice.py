"""
Aile ses kanalı.

Kimlerin içeride olduğu REST ile kilitlenir (aile izolasyonu).
WebRTC medya P2P akar; SDP/ICE sinyali Firebase Realtime Database üzerinden gider.
Kopan istemci GET / heartbeat ile toparlanır.
"""
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.app.api.deps import get_current_family_member, get_current_user
from backend.app.db.session import get_db
from backend.app.models.models import Family, FamilyMember, User, VoiceChannelParticipant
from backend.app.services.firebase_app import (
    create_voice_custom_token,
    firebase_web_config,
    ice_servers_payload,
)

router = APIRouter()

PRESENCE_TTL_SECONDS = 25
MAX_VOICE_PARTICIPANTS = 8


class VoiceParticipantOut(BaseModel):
    user_id: str
    name: str
    avatar_url: Optional[str] = None
    muted: bool = False
    is_self: bool = False
    joined_at: datetime


class VoiceChannelOut(BaseModel):
    family_id: str
    family_name: str
    participants: List[VoiceParticipantOut] = []
    participant_count: int = 0
    self_in_channel: bool = False
    self_muted: bool = False
    server_now: datetime
    firebase_token: Optional[str] = None
    firebase_config: Optional[Dict[str, str]] = None
    ice_servers: List[Dict[str, Any]] = []


class VoiceMuteIn(BaseModel):
    muted: bool


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _aware(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def _display_name(member: Optional[FamilyMember], user: Optional[User]) -> str:
    if member and member.nickname:
        return member.nickname
    if user and user.full_name:
        return user.full_name.split(" ")[0]
    return "Aile Üyesi"


def _prune_stale(db: Session, family_id: str, now: Optional[datetime] = None) -> None:
    cutoff = (now or _utcnow()) - timedelta(seconds=PRESENCE_TTL_SECONDS)
    stale = (
        db.query(VoiceChannelParticipant)
        .filter(
            VoiceChannelParticipant.family_id == family_id,
            VoiceChannelParticipant.last_heartbeat_at < cutoff,
        )
        .all()
    )
    for row in stale:
        db.delete(row)
    if stale:
        db.flush()


def _serialize_channel(
    db: Session,
    family: Family,
    current_user_id: str,
    include_signaling: bool = False,
    include_listen: bool = False,
) -> VoiceChannelOut:
    now = _utcnow()
    _prune_stale(db, family.id, now)

    rows = (
        db.query(VoiceChannelParticipant)
        .filter(VoiceChannelParticipant.family_id == family.id)
        .order_by(VoiceChannelParticipant.joined_at.asc())
        .all()
    )
    user_ids = [row.user_id for row in rows]
    users = {u.id: u for u in db.query(User).filter(User.id.in_(user_ids)).all()} if user_ids else {}
    members = {
        m.user_id: m
        for m in db.query(FamilyMember).filter(
            FamilyMember.family_id == family.id,
            FamilyMember.user_id.in_(user_ids),
        ).all()
    } if user_ids else {}

    self_row = next((row for row in rows if row.user_id == current_user_id), None)
    participants = [
        VoiceParticipantOut(
            user_id=row.user_id,
            name=_display_name(members.get(row.user_id), users.get(row.user_id)),
            avatar_url=(users.get(row.user_id).avatar_url if users.get(row.user_id) else None),
            muted=bool(row.muted),
            is_self=row.user_id == current_user_id,
            joined_at=_aware(row.joined_at) or now,
        )
        for row in rows
    ]
    signaling: Dict[str, Any] = {}
    if include_signaling or include_listen:
        token = create_voice_custom_token(current_user_id, family.id)
        if token:
            signaling = {
                "firebase_token": token,
                "firebase_config": firebase_web_config(),
            }
            if include_signaling:
                signaling["ice_servers"] = ice_servers_payload()
        elif include_signaling:
            signaling = {"ice_servers": ice_servers_payload()}
    return VoiceChannelOut(
        family_id=family.id,
        family_name=family.name,
        participants=participants,
        participant_count=len(participants),
        self_in_channel=self_row is not None,
        self_muted=bool(self_row.muted) if self_row else False,
        server_now=now,
        **signaling,
    )


def _family(db: Session, family_id: str) -> Family:
    family = db.query(Family).filter(Family.id == family_id).first()
    if not family:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Aile bulunamadı.")
    return family


@router.get("/channel", response_model=VoiceChannelOut)
def get_voice_channel(
    db: Session = Depends(get_db),
    member: FamilyMember = Depends(get_current_family_member),
    current_user: User = Depends(get_current_user),
):
    family = _family(db, member.family_id)
    return _serialize_channel(db, family, current_user.id, include_listen=True)


@router.post("/join", response_model=VoiceChannelOut)
def join_voice_channel(
    db: Session = Depends(get_db),
    member: FamilyMember = Depends(get_current_family_member),
    current_user: User = Depends(get_current_user),
):
    family = _family(db, member.family_id)
    now = _utcnow()
    _prune_stale(db, family.id, now)

    existing = (
        db.query(VoiceChannelParticipant)
        .filter(
            VoiceChannelParticipant.family_id == family.id,
            VoiceChannelParticipant.user_id == current_user.id,
        )
        .first()
    )
    if existing:
        existing.last_heartbeat_at = now
        existing.muted = False
        db.commit()
        db.refresh(existing)
        return _serialize_channel(db, family, current_user.id, include_signaling=True)

    live_count = (
        db.query(VoiceChannelParticipant)
        .filter(VoiceChannelParticipant.family_id == family.id)
        .count()
    )
    if live_count >= MAX_VOICE_PARTICIPANTS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Ses kanalı dolu (en fazla {MAX_VOICE_PARTICIPANTS} kişi).",
        )

    row = VoiceChannelParticipant(
        family_id=family.id,
        user_id=current_user.id,
        muted=False,
        last_heartbeat_at=now,
        joined_at=now,
    )
    db.add(row)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        existing = (
            db.query(VoiceChannelParticipant)
            .filter(
                VoiceChannelParticipant.family_id == family.id,
                VoiceChannelParticipant.user_id == current_user.id,
            )
            .first()
        )
        if existing:
            existing.last_heartbeat_at = now
            db.commit()
    return _serialize_channel(db, family, current_user.id, include_signaling=True)


@router.post("/leave", response_model=VoiceChannelOut)
def leave_voice_channel(
    db: Session = Depends(get_db),
    member: FamilyMember = Depends(get_current_family_member),
    current_user: User = Depends(get_current_user),
):
    family = _family(db, member.family_id)
    db.query(VoiceChannelParticipant).filter(
        VoiceChannelParticipant.family_id == family.id,
        VoiceChannelParticipant.user_id == current_user.id,
    ).delete(synchronize_session=False)
    db.commit()
    return _serialize_channel(db, family, current_user.id)


@router.post("/heartbeat", response_model=VoiceChannelOut)
def heartbeat_voice_channel(
    db: Session = Depends(get_db),
    member: FamilyMember = Depends(get_current_family_member),
    current_user: User = Depends(get_current_user),
):
    family = _family(db, member.family_id)
    now = _utcnow()
    row = (
        db.query(VoiceChannelParticipant)
        .filter(
            VoiceChannelParticipant.family_id == family.id,
            VoiceChannelParticipant.user_id == current_user.id,
        )
        .first()
    )
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Ses kanalında değilsiniz.",
        )
    row.last_heartbeat_at = now
    db.commit()
    return _serialize_channel(db, family, current_user.id)


@router.post("/mute", response_model=VoiceChannelOut)
def mute_voice_channel(
    payload: VoiceMuteIn,
    db: Session = Depends(get_db),
    member: FamilyMember = Depends(get_current_family_member),
    current_user: User = Depends(get_current_user),
):
    family = _family(db, member.family_id)
    row = (
        db.query(VoiceChannelParticipant)
        .filter(
            VoiceChannelParticipant.family_id == family.id,
            VoiceChannelParticipant.user_id == current_user.id,
        )
        .first()
    )
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Ses kanalında değilsiniz.",
        )
    row.muted = bool(payload.muted)
    row.last_heartbeat_at = _utcnow()
    db.commit()
    return _serialize_channel(db, family, current_user.id)
