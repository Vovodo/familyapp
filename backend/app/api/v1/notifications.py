import uuid
from typing import List, Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from loguru import logger
from backend.app.db.session import get_db
from backend.app.models.models import DeviceToken, Notification, User, FamilyMember
from backend.app.schemas.schemas import (
    DeviceTokenCreate,
    DeviceTokenResponse,
    NotificationResponse
)
from backend.app.api.deps import get_current_user, get_current_family_member

router = APIRouter()


@router.post("/device-token", response_model=DeviceTokenResponse, status_code=status.HTTP_200_OK)
def register_device_token(
    payload: DeviceTokenCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Registers or updates an active FCM push notification device token for the current user.
    Multi-device safe: each device has its own record based on (user_id, device_id).
    """
    clean_token = payload.token.strip()
    clean_device_id = payload.device_id.strip()

    if not clean_token or not clean_device_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Geçersiz device_id veya push token."
        )

    device = db.query(DeviceToken).filter(
        DeviceToken.user_id == current_user.id,
        DeviceToken.device_id == clean_device_id
    ).first()

    now = datetime.now(timezone.utc)
    if device:
        device.token = clean_token
        device.platform = payload.platform or "android"
        device.is_active = True
        device.updated_at = now
    else:
        device = DeviceToken(
            id=str(uuid.uuid4()),
            user_id=current_user.id,
            device_id=clean_device_id,
            platform=payload.platform or "android",
            token=clean_token,
            is_active=True,
            created_at=now,
            updated_at=now
        )
        db.add(device)

    db.commit()
    db.refresh(device)
    logger.info(f"Device token registered/updated for user {current_user.id} ({device.platform})")
    return device


@router.delete("/device-token", status_code=status.HTTP_200_OK)
def deactivate_device_token(
    device_id: str = Query(..., description="Device installation ID to deactivate"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Deactivates the push notification token for a device upon user logout.
    """
    device = db.query(DeviceToken).filter(
        DeviceToken.user_id == current_user.id,
        DeviceToken.device_id == device_id
    ).first()

    if device:
        device.is_active = False
        db.commit()
        logger.info(f"Device token deactivated for user {current_user.id}, device {device_id}")

    return {"status": "success", "message": "Cihaz bildirimi pasifleştirildi."}


@router.get("/", response_model=List[NotificationResponse])
def get_user_notifications(
    limit: int = Query(30, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    member: FamilyMember = Depends(get_current_family_member)
):
    """
    Returns user notifications filtered strictly by recipient and family.
    """
    notifications = db.query(Notification).filter(
        Notification.family_id == member.family_id,
        Notification.recipient_id == current_user.id
    ).order_by(Notification.created_at.desc()).limit(limit).all()

    return notifications
