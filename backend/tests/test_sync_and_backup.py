import os
import sys
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

import uuid
from datetime import datetime, timezone
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient

from backend.app.db.session import Base
from backend.app.models.models import (
    User,
    Family,
    FamilyMember,
    Message,
    Media,
    Note,
    TaskItem,
    BudgetItem,
    ShoppingItem,
    Reminder
)
from backend.app.schemas.schemas import BackupItemPayload
from backend.app.services.backup_service import backup_service
from backend.app.main import app
from backend.app.db.session import get_db
from backend.app.core.security import create_access_token

# In-memory SQLite database with StaticPool for testing
SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def override_get_db():
    try:
        db = TestingSessionLocal()
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db
client = TestClient(app)


@pytest.fixture(autouse=True)
def setup_database():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


def test_backup_sync_service_unit():
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    try:
        # Create Admin User
        admin_user = User(
            id=str(uuid.uuid4()),
            full_name="Ege Pak",
            email="ege@example.com",
            role="admin"
        )
        db.add(admin_user)

        # Create Family
        family = Family(
            id=str(uuid.uuid4()),
            name="Pak Ailesi",
            invite_code="PAK-1234",
            created_by=admin_user.id,
            cloud_chat_backup_enabled=False
        )
        db.add(family)

        # Create Admin Member
        admin_member = FamilyMember(
            id=str(uuid.uuid4()),
            family_id=family.id,
            user_id=admin_user.id,
            role="admin",
            nickname="Kaptan"
        )
        db.add(admin_member)

        # Add mandatory data
        note = Note(
            id=str(uuid.uuid4()),
            family_id=family.id,
            author_id=admin_user.id,
            title="Market Notu",
            content="Süt ve ekmek alınacak",
            is_private=False
        )
        task = TaskItem(
            id=str(uuid.uuid4()),
            family_id=family.id,
            created_by=admin_user.id,
            title="Faturaları öde"
        )
        budget = BudgetItem(
            id=str(uuid.uuid4()),
            family_id=family.id,
            created_by=admin_user.id,
            type="expense",
            amount=450.0,
            title="Elektrik faturası"
        )
        shopping = ShoppingItem(
            id=str(uuid.uuid4()),
            family_id=family.id,
            created_by=admin_user.id,
            title="Zeytin",
            quantity="500g"
        )
        reminder = Reminder(
            id=str(uuid.uuid4()),
            family_id=family.id,
            creator_id=admin_user.id,
            title="Doktor randevusu",
            remind_at=datetime.now(timezone.utc)
        )
        db.add_all([note, task, budget, shopping, reminder])
        db.commit()

        # 1. Test Mandatory Data Sync
        mandatory_data = backup_service.get_mandatory_sync_data(db, family.id, admin_user.id)
        assert len(mandatory_data.notes) == 1
        assert mandatory_data.notes[0]["title"] == "Market Notu"
        assert len(mandatory_data.tasks) == 1
        assert len(mandatory_data.budget) == 1
        assert len(mandatory_data.shopping) == 1
        assert len(mandatory_data.reminders) == 1
        print("[PASS] Mandatory data sync returned all non-chat structured records")

        # 2. Test Backup Toggle
        status_before = backup_service.get_family_backup_status(db, family.id)
        assert status_before["cloud_chat_backup_enabled"] is False

        toggled_family = backup_service.toggle_family_backup(db, family.id, True)
        assert toggled_family.cloud_chat_backup_enabled is True
        print("[PASS] Admin successfully toggled cloud chat backup to True")

        # 3. Test Ingest Incremental Chat Backup
        msg_payload_1 = BackupItemPayload(
            id=str(uuid.uuid4()),
            client_message_id="client-msg-101",
            sender_id=admin_user.id,
            content="Eve geldim!",
            media_url=None,
            media_type="text",
            created_at=datetime.now(timezone.utc)
        )
        msg_payload_2 = BackupItemPayload(
            id=str(uuid.uuid4()),
            client_message_id="client-msg-102",
            sender_id=admin_user.id,
            content="Fotograf",
            media_url="https://example.com/photo.jpg",
            media_type="image",
            created_at=datetime.now(timezone.utc)
        )

        res = backup_service.ingest_incremental_chat_backup(
            db=db,
            family_id=family.id,
            member=admin_member,
            messages_payload=[msg_payload_1, msg_payload_2]
        )
        assert res.status == "success"
        assert res.saved_count == 2
        assert res.total_backup_messages == 2
        print(f"[PASS] Incremental chat backup ingested {res.saved_count} messages")

        # 4. Test Deduplication
        res_duplicate = backup_service.ingest_incremental_chat_backup(
            db=db,
            family_id=family.id,
            member=admin_member,
            messages_payload=[msg_payload_1]
        )
        assert res_duplicate.saved_count == 0  # Deduplicated!
        assert res_duplicate.total_backup_messages == 2
        print("[PASS] Deduplication verified: Re-sent message was safely skipped")

        # 5. Test Chat Restore Data
        restore_data = backup_service.get_chat_restore_data(db, family.id, limit=50, offset=0)
        assert restore_data.total_messages == 2
        assert len(restore_data.messages) == 2
        assert restore_data.messages[0].sender_name == "Ege Pak"
        assert restore_data.messages[0].sender_nickname == "Kaptan"
        assert restore_data.has_more is False
        print("[PASS] Chat restore successfully returned reconstructed messages with author profiles")

    finally:
        db.close()


def test_api_sync_endpoints():
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    try:
        user = User(
            id=str(uuid.uuid4()),
            full_name="Admin Test",
            email="admin_test@example.com",
            role="admin"
        )
        db.add(user)

        family = Family(
            id=str(uuid.uuid4()),
            name="Test Family",
            invite_code="TEST-9999",
            created_by=user.id,
            cloud_chat_backup_enabled=False
        )
        db.add(family)

        member = FamilyMember(
            id=str(uuid.uuid4()),
            family_id=family.id,
            user_id=user.id,
            role="admin",
            nickname="Test Admin"
        )
        db.add(member)
        db.commit()

        token = create_access_token(subject=user.id)
        headers = {"Authorization": f"Bearer {token}"}

        # 1. GET /api/v1/sync/status
        resp = client.get("/api/v1/sync/status", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["family_id"] == family.id
        assert data["cloud_chat_backup_enabled"] is False

        # 2. POST /api/v1/sync/family-backup-toggle
        resp = client.post("/api/v1/sync/family-backup-toggle", json={"enabled": True}, headers=headers)
        assert resp.status_code == 200
        assert resp.json()["cloud_chat_backup_enabled"] is True

        # 3. GET /api/v1/sync/mandatory-data
        resp = client.get("/api/v1/sync/mandatory-data", headers=headers)
        assert resp.status_code == 200
        assert "notes" in resp.json()
        assert "tasks" in resp.json()

        # 4. GET /api/v1/sync/chat-restore
        resp = client.get("/api/v1/sync/chat-restore", headers=headers)
        assert resp.status_code == 200
        assert resp.json()["total_messages"] == 0

        print("[PASS] All Sync & Backup REST API endpoints verified successfully with JWT authentication")

    finally:
        db.close()


if __name__ == "__main__":
    test_backup_sync_service_unit()
    test_api_sync_endpoints()
    print("\nALL BACKUP & SYNC TESTS PASSED SUCCESSFULLY!")
