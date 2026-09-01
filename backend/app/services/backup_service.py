import uuid
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import func
from loguru import logger

from backend.app.models.models import (
    Family,
    FamilyMember,
    Message,
    Media,
    Note,
    TaskItem,
    BudgetItem,
    ShoppingItem,
    Reminder,
    User,
)
from backend.app.schemas.schemas import (
    BackupItemPayload,
    BatchChatBackupResponse,
    ChatRestoreItem,
    ChatRestoreResponse,
    MandatoryDataSyncResponse,
)


class BackupSyncService:
    def get_family_backup_status(self, db: Session, family_id: str) -> Dict[str, Any]:
        """
        Returns real-time backup metrics for a family.
        """
        family = db.query(Family).filter(Family.id == family_id).first()
        if not family:
            return {}

        total_msgs = db.query(func.count(Message.id)).filter(Message.family_id == family_id).scalar() or 0
        total_media = db.query(func.count(Media.id)).filter(Media.family_id == family_id).scalar() or 0
        total_media_bytes = db.query(func.sum(Media.file_size)).filter(Media.family_id == family_id).scalar() or 0

        # Estimate text messages size (roughly 200 bytes per message metadata + content)
        estimated_msg_bytes = total_msgs * 200
        total_size = total_media_bytes + estimated_msg_bytes

        return {
            "family_id": family.id,
            "cloud_chat_backup_enabled": bool(family.cloud_chat_backup_enabled),
            "last_chat_backup_at": family.last_chat_backup_at,
            "chat_backup_size_bytes": total_size,
            "chat_backup_message_count": total_msgs,
            "chat_backup_media_count": total_media,
            "mandatory_sync_health": "ok"
        }

    def toggle_family_backup(self, db: Session, family_id: str, enabled: bool) -> Family:
        """
        Admin toggle for cloud chat & media backup.
        """
        family = db.query(Family).filter(Family.id == family_id).first()
        if not family:
            raise ValueError("Aile grubu bulunamadı.")

        family.cloud_chat_backup_enabled = enabled
        if enabled:
            family.last_chat_backup_at = datetime.now(timezone.utc)

        db.commit()
        db.refresh(family)
        logger.info(f"[BACKUP] Family {family_id} cloud chat backup toggled: {enabled}")
        return family

    def ingest_incremental_chat_backup(
        self,
        db: Session,
        family_id: str,
        member: FamilyMember,
        messages_payload: List[BackupItemPayload]
    ) -> BatchChatBackupResponse:
        """
        Batch/incremental ingestion of chat messages sent from client dirty-queue.
        Deduplicates by client_message_id and message ID.
        """
        family = db.query(Family).filter(Family.id == family_id).first()
        if not family:
            raise ValueError("Aile grubu bulunamadı.")

        if not family.cloud_chat_backup_enabled:
            logger.info(f"[BACKUP] Ingestion skipped: Cloud backup is disabled for family {family_id}")
            return BatchChatBackupResponse(
                status="backup_disabled",
                saved_count=0,
                total_backup_messages=family.chat_backup_message_count or 0,
                total_backup_size_bytes=family.chat_backup_size_bytes or 0,
                backup_timestamp=datetime.now(timezone.utc)
            )

        saved_count = 0
        now = datetime.now(timezone.utc)

        for item in messages_payload:
            # 1. Check duplicate by client_message_id
            existing = None
            if item.client_message_id:
                existing = db.query(Message).filter(
                    Message.family_id == family_id,
                    Message.client_message_id == item.client_message_id
                ).first()

            # 2. Check duplicate by id
            if not existing and item.id and not item.id.startswith("temp-"):
                existing = db.query(Message).filter(
                    Message.family_id == family_id,
                    Message.id == item.id
                ).first()

            if not existing:
                msg_id = item.id if item.id and not item.id.startswith("temp-") else str(uuid.uuid4())
                new_msg = Message(
                    id=msg_id,
                    client_message_id=item.client_message_id,
                    family_id=family_id,
                    sender_id=item.sender_id or member.user_id,
                    content=item.content,
                    media_url=item.media_url,
                    media_type=item.media_type,
                    created_at=item.created_at or now,
                )
                db.add(new_msg)
                saved_count += 1

        db.flush()

        # Update family backup stats
        stats = self.get_family_backup_status(db, family_id)
        family.last_chat_backup_at = now
        family.chat_backup_message_count = stats["chat_backup_message_count"]
        family.chat_backup_media_count = stats["chat_backup_media_count"]
        family.chat_backup_size_bytes = stats["chat_backup_size_bytes"]

        db.commit()
        db.refresh(family)

        logger.info(f"[BACKUP] Ingested {saved_count} messages for family {family_id}. Total: {stats['chat_backup_message_count']}")

        return BatchChatBackupResponse(
            status="success",
            saved_count=saved_count,
            total_backup_messages=stats["chat_backup_message_count"],
            total_backup_size_bytes=stats["chat_backup_size_bytes"],
            backup_timestamp=now
        )

    def get_chat_restore_data(
        self,
        db: Session,
        family_id: str,
        limit: int = 500,
        offset: int = 0
    ) -> ChatRestoreResponse:
        """
        Retrieves paginated chat history and media for new device restoration.
        """
        family = db.query(Family).filter(Family.id == family_id).first()
        if not family:
            raise ValueError("Aile grubu bulunamadı.")

        total_msgs = db.query(func.count(Message.id)).filter(Message.family_id == family_id).scalar() or 0
        total_media = db.query(func.count(Media.id)).filter(Media.family_id == family_id).scalar() or 0

        # Fetch messages with sender profiles
        messages = (
            db.query(Message, User.full_name, User.avatar_url, FamilyMember.nickname)
            .join(User, Message.sender_id == User.id)
            .outerjoin(FamilyMember, (FamilyMember.family_id == Message.family_id) & (FamilyMember.user_id == User.id))
            .filter(Message.family_id == family_id)
            .order_by(Message.created_at.asc())
            .offset(offset)
            .limit(limit)
            .all()
        )

        restore_items: List[ChatRestoreItem] = []
        for msg, full_name, avatar_url, nickname in messages:
            restore_items.append(
                ChatRestoreItem(
                    id=msg.id,
                    client_message_id=msg.client_message_id,
                    sender_id=msg.sender_id,
                    sender_name=full_name,
                    sender_avatar=avatar_url,
                    sender_nickname=nickname,
                    content=msg.content,
                    media_url=msg.media_url,
                    media_thumbnail_url=msg.media_thumbnail_url,
                    media_type=msg.media_type,
                    created_at=msg.created_at
                )
            )

        has_more = (offset + limit) < total_msgs

        stats = self.get_family_backup_status(db, family_id)

        return ChatRestoreResponse(
            family_id=family.id,
            family_name=family.name,
            total_messages=total_msgs,
            total_media_files=total_media,
            total_size_bytes=stats["chat_backup_size_bytes"],
            messages=restore_items,
            has_more=has_more
        )

    def get_mandatory_sync_data(
        self,
        db: Session,
        family_id: str,
        current_user_id: str
    ) -> MandatoryDataSyncResponse:
        """
        ZORUNLU BULUT SENKRONİZASYONU (Mandatory Cloud Sync):
        Delivers all non-chat structured application data in a single rapid package for instant offline hydration.
        """
        now = datetime.now(timezone.utc)

        # 1. Notes (public notes + current user's private notes)
        notes_query = db.query(Note).filter(
            Note.family_id == family_id,
            ((Note.is_private == False) | (Note.author_id == current_user_id))
        ).all()
        notes_data = [
            {
                "id": n.id,
                "title": n.title,
                "content": n.content,
                "is_private": n.is_private,
                "color": n.color,
                "author_id": n.author_id,
                "created_at": n.created_at.isoformat() if n.created_at else None,
                "updated_at": n.updated_at.isoformat() if n.updated_at else None,
            }
            for n in notes_query
        ]

        # 2. Tasks / To-do items
        tasks_query = db.query(TaskItem).filter(TaskItem.family_id == family_id).all()
        tasks_data = [
            {
                "id": t.id,
                "title": t.title,
                "description": t.description,
                "priority": t.priority,
                "is_completed": t.is_completed,
                "completed_at": t.completed_at.isoformat() if t.completed_at else None,
                "due_date": t.due_date.isoformat() if t.due_date else None,
                "created_by": t.created_by,
                "assigned_to": t.assigned_to,
                "created_at": t.created_at.isoformat() if t.created_at else None,
            }
            for t in tasks_query
        ]

        # 3. Budget Items
        budget_query = db.query(BudgetItem).filter(BudgetItem.family_id == family_id).all()
        budget_data = [
            {
                "id": b.id,
                "type": b.type,
                "amount": b.amount,
                "category": b.category,
                "title": b.title,
                "description": b.description,
                "transaction_date": b.transaction_date.isoformat() if b.transaction_date else None,
                "created_by": b.created_by,
                "created_at": b.created_at.isoformat() if b.created_at else None,
            }
            for b in budget_query
        ]

        # 4. Shopping Items
        shopping_query = db.query(ShoppingItem).filter(ShoppingItem.family_id == family_id).all()
        shopping_data = [
            {
                "id": s.id,
                "title": s.title,
                "quantity": s.quantity,
                "category": s.category,
                "is_completed": s.is_completed,
                "completed_at": s.completed_at.isoformat() if s.completed_at else None,
                "created_by": s.created_by,
                "created_at": s.created_at.isoformat() if s.created_at else None,
            }
            for s in shopping_query
        ]

        # 5. Reminders
        reminders_query = db.query(Reminder).filter(Reminder.family_id == family_id).all()
        reminders_data = [
            {
                "id": r.id,
                "title": r.title,
                "description": r.description,
                "remind_at": r.remind_at.isoformat() if r.remind_at else None,
                "repeat_interval": r.repeat_interval,
                "notify_before_minutes": r.notify_before_minutes,
                "is_completed": r.is_completed,
                "creator_id": r.creator_id,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in reminders_query
        ]

        # 6. Family Members
        members_query = db.query(FamilyMember, User.full_name, User.avatar_url).join(User, FamilyMember.user_id == User.id).filter(FamilyMember.family_id == family_id).all()
        members_data = [
            {
                "id": m.id,
                "user_id": m.user_id,
                "nickname": m.nickname,
                "role": m.role,
                "full_name": full_name,
                "avatar_url": avatar_url,
                "joined_at": m.joined_at.isoformat() if m.joined_at else None,
            }
            for m, full_name, avatar_url in members_query
        ]

        return MandatoryDataSyncResponse(
            family_id=family_id,
            synced_at=now,
            notes=notes_data,
            tasks=tasks_data,
            budget=budget_data,
            shopping=shopping_data,
            reminders=reminders_data,
            members=members_data,
        )


backup_service = BackupSyncService()
