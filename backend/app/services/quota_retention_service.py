import os
import hashlib
import threading
import uuid
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List, Optional, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import func
from loguru import logger

from backend.app.core.config import settings
from backend.app.models.models import (
    Family,
    Message,
    Media,
    StorageObject,
    StorageCleanupJob,
)
from backend.app.services.storage_service import storage_service
from backend.app.schemas.schemas import (
    StorageQuotaBreakdown,
    CategoryQuotaMetric,
    StorageReconciliationResponse,
)


class QuotaExceededException(Exception):
    """Raised when an incoming backup/upload cannot fit and insufficient space can be freed."""
    pass


class QuotaRetentionService:
    def __init__(self):
        self._lock = threading.Lock()
        self._family_locks: Dict[str, threading.Lock] = {}

    def _get_family_lock(self, family_id: str) -> threading.Lock:
        with self._lock:
            if family_id not in self._family_locks:
                self._family_locks[family_id] = threading.Lock()
            return self._family_locks[family_id]

    def _storage_bytes(self, db: Session, category: str, family_id: Optional[str] = None) -> int:
        query = db.query(func.sum(StorageObject.file_size)).filter(
            StorageObject.status != "deleted",
            StorageObject.category == category,
        )
        if family_id:
            query = query.filter(StorageObject.family_id == family_id)
        return int(query.scalar() or 0)

    def _active_storage_paths(self, db: Session, family_id: str, category: str) -> set:
        rows = (
            db.query(StorageObject.storage_path)
            .filter(
                StorageObject.family_id == family_id,
                StorageObject.category == category,
                StorageObject.status != "deleted",
            )
            .all()
        )
        return {row[0] for row in rows if row[0]}

    def _legacy_media_not_in_storage_objects(self, db: Session, family_id: str) -> List[Media]:
        so_paths = self._active_storage_paths(db, family_id, "IMAGE")
        media_rows = (
            db.query(Media)
            .filter(Media.family_id == family_id)
            .order_by(Media.created_at.asc())
            .all()
        )
        return [row for row in media_rows if row.storage_path and row.storage_path not in so_paths]

    def _thumbnail_sibling(self, storage_path: Optional[str]) -> Optional[str]:
        if not storage_path or "_thumb." in storage_path:
            return None
        root, ext = os.path.splitext(storage_path)
        if not ext:
            return None
        return f"{root}_thumb{ext}"

    def _is_thumbnail_path(self, storage_path: Optional[str]) -> bool:
        name = (storage_path or "").split("/")[-1]
        return "_thumb." in name

    def _delete_stored_file_and_thumb(self, storage_path: Optional[str]) -> None:
        if not storage_path:
            return
        try:
            storage_service.delete_file(storage_path)
        except Exception as err:
            logger.warning(f"[RETENTION] File removal warning for {storage_path}: {err}")
        thumb = self._thumbnail_sibling(storage_path)
        if thumb:
            try:
                storage_service.delete_file(thumb)
            except Exception as err:
                logger.warning(f"[RETENTION] Thumbnail removal warning for {thumb}: {err}")

    def _delete_media_row(self, db: Session, family_id: str, storage_path: Optional[str]) -> None:
        if not storage_path:
            return
        media = (
            db.query(Media)
            .filter(Media.family_id == family_id, Media.storage_path == storage_path)
            .first()
        )
        if media:
            db.delete(media)

    def compute_sha256(self, file_bytes: bytes) -> str:
        """Computes SHA256 hash for deduplication."""
        return hashlib.sha256(file_bytes).hexdigest()

    def get_occupancy_level(self, percent: float) -> str:
        """Determines visual alert status for storage level."""
        if percent < 70.0:
            return "NORMAL"
        elif percent < 85.0:
            return "WARNING"
        elif percent < 95.0:
            return "HIGH"
        else:
            return "CRITICAL"

    def get_storage_usage_breakdown(self, db: Session, family_id: Optional[str] = None) -> StorageQuotaBreakdown:
        """
        Calculates authoritative real-time storage usage across logical partitions:
        - CHAT (50% quota = 1 GB)
        - IMAGE (40% quota = 800 MB)
        - AUDIO (10% quota = 200 MB)
        Supports both Global and Group-level calculations.
        """
        msg_query = db.query(Message)
        if family_id:
            msg_query = msg_query.filter(Message.family_id == family_id)

        # 2. Category: CHAT (family-scoped; text estimate + CHAT storage objects)
        chat_msg_count = msg_query.count()
        chat_obj_bytes = self._storage_bytes(db, "CHAT", family_id)
        chat_used_bytes = (chat_msg_count * 200) + chat_obj_bytes
        chat_quota_bytes = settings.chat_quota_bytes
        chat_avail_bytes = max(0, chat_quota_bytes - chat_used_bytes)
        chat_percent = (chat_used_bytes / chat_quota_bytes * 100.0) if chat_quota_bytes > 0 else 0.0

        chat_metric = CategoryQuotaMetric(
            category="CHAT",
            percent_quota=settings.CHAT_QUOTA_PERCENT,
            quota_bytes=chat_quota_bytes,
            used_bytes=chat_used_bytes,
            available_bytes=chat_avail_bytes,
            usage_percent=round(chat_percent, 2),
            item_count=chat_msg_count
        )

        # 3. Category: IMAGE (StorageObject + gallery Media not yet registered)
        img_objs = db.query(StorageObject).filter(
            StorageObject.status != "deleted", StorageObject.category == "IMAGE"
        )
        if family_id:
            img_objs = img_objs.filter(StorageObject.family_id == family_id)

        img_used_bytes = self._storage_bytes(db, "IMAGE", family_id)
        img_count = img_objs.count()
        if family_id:
            legacy_media = self._legacy_media_not_in_storage_objects(db, family_id)
            img_used_bytes += sum(int(row.file_size or 0) for row in legacy_media)
            img_count += len(legacy_media)

        img_quota_bytes = settings.image_quota_bytes
        img_avail_bytes = max(0, img_quota_bytes - img_used_bytes)
        img_percent = (img_used_bytes / img_quota_bytes * 100.0) if img_quota_bytes > 0 else 0.0

        img_metric = CategoryQuotaMetric(
            category="IMAGE",
            percent_quota=settings.IMAGE_QUOTA_PERCENT,
            quota_bytes=img_quota_bytes,
            used_bytes=img_used_bytes,
            available_bytes=img_avail_bytes,
            usage_percent=round(img_percent, 2),
            item_count=img_count
        )

        # 4. Category: AUDIO
        audio_objs = (
            db.query(StorageObject)
            .filter(StorageObject.status != "deleted", StorageObject.category == "AUDIO")
        )
        if family_id:
            audio_objs = audio_objs.filter(StorageObject.family_id == family_id)

        audio_used_bytes = self._storage_bytes(db, "AUDIO", family_id)

        audio_quota_bytes = settings.audio_quota_bytes
        audio_avail_bytes = max(0, audio_quota_bytes - audio_used_bytes)
        audio_percent = (audio_used_bytes / audio_quota_bytes * 100.0) if audio_quota_bytes > 0 else 0.0
        audio_count = audio_objs.count()

        audio_metric = CategoryQuotaMetric(
            category="AUDIO",
            percent_quota=settings.AUDIO_QUOTA_PERCENT,
            quota_bytes=audio_quota_bytes,
            used_bytes=audio_used_bytes,
            available_bytes=audio_avail_bytes,
            usage_percent=round(audio_percent, 2),
            item_count=audio_count
        )

        # 5. Global Totals
        total_capacity = settings.TOTAL_STORAGE_CAPACITY_BYTES
        total_used = chat_used_bytes + img_used_bytes + audio_used_bytes
        total_avail = max(0, total_capacity - total_used)
        total_percent = (total_used / total_capacity * 100.0) if total_capacity > 0 else 0.0
        occupancy_level = self.get_occupancy_level(total_percent)

        return StorageQuotaBreakdown(
            family_id=family_id,
            total_capacity_bytes=total_capacity,
            total_used_bytes=total_used,
            total_available_bytes=total_avail,
            total_usage_percent=round(total_percent, 2),
            occupancy_level=occupancy_level,
            chat=chat_metric,
            image=img_metric,
            audio=audio_metric
        )

    def register_storage_object(
        self,
        db: Session,
        family_id: str,
        user_id: str,
        storage_path: str,
        public_url: str,
        category: str,
        file_size: int,
        mime_type: Optional[str] = None,
        checksum: Optional[str] = None,
        message_id: Optional[str] = None,
        is_protected: bool = False
    ) -> StorageObject:
        """
        Registers an uploaded or backed up object in storage_objects table with deduplication check.
        """
        now = datetime.now(timezone.utc)
        normalized_cat = category.upper()

        # Check existing active object by checksum (Deduplication)
        if checksum:
            existing = db.query(StorageObject).filter(
                StorageObject.family_id == family_id,
                StorageObject.checksum == checksum,
                StorageObject.status != "deleted"
            ).first()
            if existing:
                logger.info(f"[RETENTION] Deduplication match for checksum {checksum[:8]} -> reusing {existing.storage_path}")
                return existing

        obj = StorageObject(
            id=str(uuid.uuid4()),
            family_id=family_id,
            message_id=message_id,
            user_id=user_id,
            storage_path=storage_path,
            public_url=public_url,
            category=normalized_cat,
            file_size=file_size,
            mime_type=mime_type,
            checksum=checksum,
            status="backed_up",
            is_protected=is_protected,
            created_at=now,
            backed_up_at=now,
        )
        db.add(obj)
        db.commit()
        db.refresh(obj)
        return obj

    def preflight_and_prepare_space(
        self,
        db: Session,
        family_id: str,
        incoming_bytes_by_category: Dict[str, int],
        trigger_reason: str = "preflight_incoming_backup"
    ) -> List[StorageCleanupJob]:
        """
        ATOMIC PRE-FLIGHT AND RETENTION EXECUTION:
        1. Evaluates each category's incoming bytes against its logical quota.
        2. If quota is exceeded, checks if enough space can be safely freed from backed-up objects (oldest first).
        3. If NOT enough space can be freed: Aborts immediately with QuotaExceededException. ZERO data is lost!
        4. If space CAN be freed: Deletes only the minimal required items and logs cleanup jobs.
        """
        lock = self._get_family_lock(family_id)
        with lock:
            breakdown = self.get_storage_usage_breakdown(db, family_id)
            cleanup_jobs: List[StorageCleanupJob] = []

            # Step 1: Pre-flight Planning Phase (Determine required cleanup per category)
            cleanup_plans: Dict[str, Dict[str, Any]] = {}

            for cat, incoming_bytes in incoming_bytes_by_category.items():
                if incoming_bytes <= 0:
                    continue

                cat_upper = cat.upper()
                metric: CategoryQuotaMetric = getattr(breakdown, cat_upper.lower(), None)
                if not metric:
                    continue

                projected_used = metric.used_bytes + incoming_bytes
                if incoming_bytes > metric.quota_bytes:
                    raise QuotaExceededException(
                        f"Bu {cat_upper} dosyası ayrılan kotadan büyük. "
                        f"Dosya: {incoming_bytes} bytes, kota: {metric.quota_bytes} bytes."
                    )

                if projected_used > metric.quota_bytes:
                    required_cleanup = projected_used - metric.quota_bytes
                    logger.warning(
                        f"[RETENTION] Quota overflow for {cat_upper} in family {family_id}. "
                        f"Current: {metric.used_bytes}, Incoming: {incoming_bytes}, Quota: {metric.quota_bytes}. "
                        f"Required cleanup: {required_cleanup} bytes."
                    )

                    # Query candidate objects that are safely backed up and not protected
                    candidates = (
                        db.query(StorageObject)
                        .filter(
                            StorageObject.family_id == family_id,
                            StorageObject.category == cat_upper,
                            StorageObject.status == "backed_up",
                            StorageObject.is_protected == False
                        )
                        .order_by(StorageObject.backed_up_at.asc())
                        .all()
                    )

                    legacy_media: List[Media] = []
                    if cat_upper == "IMAGE":
                        legacy_media = self._legacy_media_not_in_storage_objects(db, family_id)

                    text_msg_count = 0
                    if cat_upper == "CHAT":
                        text_msg_count = (
                            db.query(func.count(Message.id))
                            .filter(Message.family_id == family_id)
                            .scalar() or 0
                        )

                    total_reclaimable = sum(c.file_size for c in candidates)
                    total_reclaimable += sum(int(m.file_size or 0) for m in legacy_media)
                    if cat_upper == "CHAT":
                        total_reclaimable += text_msg_count * 200

                    if total_reclaimable < required_cleanup:
                        err_msg = (
                            f"Depolama kotası yetersiz ({cat_upper}). "
                            f"Gerekli: {required_cleanup} bytes, silinebilir eski veri: {total_reclaimable} bytes."
                        )
                        logger.error(f"[RETENTION] Preflight failed: {err_msg}")
                        raise QuotaExceededException(err_msg)

                    cleanup_plans[cat_upper] = {
                        "required_bytes": required_cleanup,
                        "candidates": candidates,
                        "legacy_media": legacy_media,
                    }

            # Step 2: Execution Phase (Perform exact cleanup for approved plans)
            for cat_upper, plan in cleanup_plans.items():
                req_bytes = plan["required_bytes"]
                freed_bytes = 0
                deleted_objs_count = 0
                deleted_msgs_count = 0
                started_at = datetime.now(timezone.utc)

                job = StorageCleanupJob(
                    id=str(uuid.uuid4()),
                    family_id=family_id,
                    category=cat_upper,
                    trigger_reason=trigger_reason,
                    required_bytes=req_bytes,
                    freed_bytes=0,
                    status="in_progress",
                    started_at=started_at
                )
                db.add(job)
                db.flush()

                # A. Delete Storage Objects (Oldest backed-up first)
                for obj in plan["candidates"]:
                    if freed_bytes >= req_bytes:
                        break

                    self._delete_stored_file_and_thumb(obj.storage_path)
                    self._delete_media_row(db, family_id, obj.storage_path)

                    freed_bytes += obj.file_size
                    obj.status = "deleted"
                    obj.deleted_at = datetime.now(timezone.utc)
                    deleted_objs_count += 1

                    if obj.message_id:
                        msg = db.query(Message).filter(
                            Message.id == obj.message_id,
                            Message.family_id == family_id,
                        ).first()
                        if msg:
                            msg.media_url = None
                            msg.media_thumbnail_url = None
                            if not msg.content:
                                msg.content = "📸 [Fotoğraf/Ses kaydı depolama kotası nedeniyle arşivlendi]"

                # A2. Legacy gallery photos that were never registered in storage_objects
                for media in plan.get("legacy_media") or []:
                    if freed_bytes >= req_bytes:
                        break
                    self._delete_stored_file_and_thumb(media.storage_path)
                    freed_bytes += int(media.file_size or 0)
                    db.delete(media)
                    deleted_objs_count += 1

                # B. If CHAT category and still need space, delete oldest text messages
                if cat_upper == "CHAT" and freed_bytes < req_bytes:
                    remaining = req_bytes - freed_bytes
                    needed_msgs = max(1, (remaining + 199) // 200)
                    chat_candidates = (
                        db.query(Message)
                        .filter(Message.family_id == family_id)
                        .order_by(Message.created_at.asc())
                        .limit(needed_msgs)
                        .all()
                    )
                    for msg in chat_candidates:
                        if freed_bytes >= req_bytes:
                            break
                        db.delete(msg)
                        freed_bytes += 200
                        deleted_msgs_count += 1

                job.freed_bytes = freed_bytes
                job.deleted_storage_objects_count = deleted_objs_count
                job.deleted_messages_count = deleted_msgs_count
                job.status = "completed"
                job.completed_at = datetime.now(timezone.utc)

                db.commit()
                db.refresh(job)
                cleanup_jobs.append(job)

                logger.info(
                    f"[RETENTION] Cleanup job completed for {cat_upper}: "
                    f"Freed {freed_bytes} bytes (required: {req_bytes}). "
                    f"Deleted {deleted_objs_count} objects, {deleted_msgs_count} messages."
                )

            return cleanup_jobs

    def reconcile_storage(self, db: Session, family_id: Optional[str] = None) -> StorageReconciliationResponse:
        """
        STORAGE RECONCILIATION & ORPHAN FILE DETECTION:
        1. Compares DB StorageObject records against physical files.
        2. Detects orphan files in storage with grace period (> ORPHAN_GRACE_PERIOD_HOURS).
        3. Cleans orphaned files safely and reports discrepancy.
        """
        now = datetime.now(timezone.utc)
        grace_cutoff = now - timedelta(hours=settings.ORPHAN_GRACE_PERIOD_HOURS)

        # 1. DB calculated total
        so_query = db.query(StorageObject).filter(StorageObject.status != "deleted")
        if family_id:
            so_query = so_query.filter(StorageObject.family_id == family_id)

        db_total_bytes = db.query(func.sum(StorageObject.file_size)).filter(StorageObject.status != "deleted")
        if family_id:
            db_total_bytes = db_total_bytes.filter(StorageObject.family_id == family_id)
        db_total_bytes = db_total_bytes.scalar() or 0

        # 2. Storage physical scan
        prefix = f"{family_id}/" if family_id else ""
        physical_files = storage_service.list_all_files(prefix=prefix)
        storage_actual_bytes = sum(f.get("size", 0) for f in physical_files)

        # Known DB paths
        active_db_paths = set(
            p[0] for p in db.query(StorageObject.storage_path)
            .filter(StorageObject.status != "deleted")
            .all()
        )

        orphan_detected = 0
        orphan_purged = 0
        purged_bytes = 0
        details = []

        for pf in physical_files:
            rel_path = pf.get("path") or pf.get("name")
            size = pf.get("size", 0)
            if not rel_path:
                continue
            if self._is_thumbnail_path(rel_path):
                continue
            if rel_path not in active_db_paths:
                orphan_detected += 1
                details.append(f"Orphan file detected: {rel_path} ({size} bytes)")
                
                # Check grace period
                created_ts = pf.get("created_at")
                should_purge = True
                if isinstance(created_ts, (int, float)):
                    if datetime.fromtimestamp(created_ts, tz=timezone.utc) > grace_cutoff:
                        should_purge = False  # Within grace period

                if should_purge:
                    storage_service.delete_file(rel_path)
                    orphan_purged += 1
                    purged_bytes += size

        discrepancy = abs(storage_actual_bytes - db_total_bytes)

        return StorageReconciliationResponse(
            status="success",
            reconciled_at=now,
            db_total_bytes=db_total_bytes,
            storage_actual_bytes=storage_actual_bytes,
            discrepancy_bytes=discrepancy,
            orphan_files_detected=orphan_detected,
            orphan_files_purged=orphan_purged,
            purged_bytes=purged_bytes,
            details=details
        )


quota_retention_service = QuotaRetentionService()
