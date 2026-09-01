from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.app.db.session import get_db
from backend.app.models.models import User, FamilyMember
from backend.app.schemas.schemas import (
    SyncStatusResponse,
    BatchChatBackupRequest,
    BatchChatBackupResponse,
    ChatRestoreResponse,
    MandatoryDataSyncResponse,
)
from backend.app.api.deps import (
    get_current_user,
    get_current_family_member,
    get_current_admin_member,
)
from backend.app.services.backup_service import backup_service
from loguru import logger

router = APIRouter()


class BackupToggleRequest(BaseModel):
    enabled: bool


@router.get("/status", response_model=SyncStatusResponse)
def get_sync_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    member: FamilyMember = Depends(get_current_family_member),
):
    """
    Returns real-time synchronization and backup metrics for current family.
    """
    stats = backup_service.get_family_backup_status(db, member.family_id)
    if not stats:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Aile bilgisi bulunamadı."
        )
    return stats


@router.post("/family-backup-toggle", response_model=SyncStatusResponse)
def toggle_family_cloud_backup(
    payload: BackupToggleRequest,
    db: Session = Depends(get_db),
    admin_member: FamilyMember = Depends(get_current_admin_member),
):
    """
    [ADMIN ONLY] Toggles optional cloud chat & media backup for the family group.
    """
    try:
        backup_service.toggle_family_backup(db, admin_member.family_id, payload.enabled)
        stats = backup_service.get_family_backup_status(db, admin_member.family_id)
        return stats
    except Exception as e:
        logger.error(f"Error toggling backup: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Yedekleme ayarı güncellenemedi."
        )


@router.post("/chat-backup", response_model=BatchChatBackupResponse)
def batch_incremental_chat_backup(
    payload: BatchChatBackupRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    member: FamilyMember = Depends(get_current_family_member),
):
    """
    Batch & incremental ingestion of client's pending dirty chat messages into cloud storage/DB.
    """
    try:
        res = backup_service.ingest_incremental_chat_backup(
            db=db,
            family_id=member.family_id,
            member=member,
            messages_payload=payload.messages
        )
        return res
    except Exception as e:
        logger.error(f"Error in batch chat backup: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Yedekleme işlemi tamamlanamadı."
        )


@router.get("/chat-restore", response_model=ChatRestoreResponse)
def get_chat_restore(
    limit: int = Query(default=300, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    member: FamilyMember = Depends(get_current_family_member),
):
    """
    Retrieves chunked chat history and media links for fresh device restoration.
    """
    try:
        return backup_service.get_chat_restore_data(
            db=db,
            family_id=member.family_id,
            limit=limit,
            offset=offset
        )
    except Exception as e:
        logger.error(f"Error restoring chat: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Sohbet geçmişi geri yüklenemedi."
        )


@router.get("/mandatory-data", response_model=MandatoryDataSyncResponse)
def get_mandatory_cloud_data(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    member: FamilyMember = Depends(get_current_family_member),
):
    """
    ZORUNLU BULUT SENKRONİZASYONU:
    Returns full structural cloud data (Notes, Tasks, Budget, Shopping, Reminders, Members) for instant device hydration.
    """
    try:
        return backup_service.get_mandatory_sync_data(
            db=db,
            family_id=member.family_id,
            current_user_id=current_user.id
        )
    except Exception as e:
        logger.error(f"Error fetching mandatory sync data: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Zorunlu bulut verileri alınamadı."
        )


@router.get("/storage-breakdown")
def get_storage_breakdown(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    member: FamilyMember = Depends(get_current_family_member),
):
    """
    Returns granular storage quota breakdown across CHAT (50%), IMAGE (40%), AUDIO (10%) partitions and occupancy level.
    """
    from backend.app.services.quota_retention_service import quota_retention_service
    return quota_retention_service.get_storage_usage_breakdown(db, member.family_id)


@router.post("/storage-reconcile")
def run_storage_reconciliation(
    db: Session = Depends(get_db),
    admin_member: FamilyMember = Depends(get_current_admin_member),
):
    """
    [ADMIN ONLY] Compares database records with physical storage bucket and cleans orphaned files.
    """
    from backend.app.services.quota_retention_service import quota_retention_service
    try:
        report = quota_retention_service.reconcile_storage(db, admin_member.family_id)
        return report
    except Exception as e:
        logger.error(f"Error during storage reconciliation: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Storage mutabakatı çalıştırılamadı."
        )


@router.get("/cleanup-history")
def get_cleanup_history(
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    admin_member: FamilyMember = Depends(get_current_admin_member),
):
    """
    [ADMIN ONLY] Returns historical audit logs of storage retention and cleanup operations.
    """
    from backend.app.models.models import StorageCleanupJob
    jobs = (
        db.query(StorageCleanupJob)
        .filter(StorageCleanupJob.family_id == admin_member.family_id)
        .order_by(StorageCleanupJob.started_at.desc())
        .limit(limit)
        .all()
    )
    return jobs

