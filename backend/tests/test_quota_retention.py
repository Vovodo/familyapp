import os
import uuid
import threading
from datetime import datetime, timezone, timedelta
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient

from backend.app.models.models import (
    Base,
    User,
    Family,
    FamilyMember,
    Message,
    StorageObject,
    StorageCleanupJob,
)
from backend.app.services.quota_retention_service import (
    quota_retention_service,
    QuotaExceededException,
)
from backend.app.services.backup_service import backup_service
from backend.app.core.config import settings
from backend.app.schemas.schemas import BackupItemPayload


# Setup SQLite in-memory DB for tests
TEST_DB_URL = "sqlite:///:memory:"
engine = create_engine(
    TEST_DB_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(scope="function")
def db_session():
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture(scope="function")
def test_setup(db_session):
    # Create test user
    user = User(
        id=str(uuid.uuid4()),
        email="quota_tester@aile.com",
        full_name="Quota Tester",
        hashed_password="hash",
        role="admin"
    )
    db_session.add(user)

    # Create test family
    family = Family(
        id=str(uuid.uuid4()),
        name="Retention Test Family",
        invite_code="AILE-QUOTA1",
        cloud_chat_backup_enabled=True,
        chat_backup_size_bytes=0,
        chat_backup_message_count=0,
        chat_backup_media_count=0
    )
    db_session.add(family)
    db_session.flush()

    # Add user as family admin member
    member = FamilyMember(
        id=str(uuid.uuid4()),
        family_id=family.id,
        user_id=user.id,
        role="admin"
    )
    db_session.add(member)
    db_session.commit()
    db_session.refresh(family)
    db_session.refresh(user)

    return {"user": user, "family": family, "member": member}


# ---------------------------------------------------------
# TEST 1: Normal Backup (Quota within limits, No cleanup needed)
# ---------------------------------------------------------
def test_1_normal_backup_under_quota(db_session, test_setup):
    fam = test_setup["family"]
    
    # 100 MB incoming (well under 1 GB chat quota)
    incoming_bytes = {"CHAT": 100 * 1024 * 1024}
    cleanup_jobs = quota_retention_service.preflight_and_prepare_space(
        db=db_session,
        family_id=fam.id,
        incoming_bytes_by_category=incoming_bytes
    )
    # No cleanup required
    assert len(cleanup_jobs) == 0


# ---------------------------------------------------------
# TEST 2: Quota Overflow With Sufficient Backed-up Data (Minimal Oldest-First Retention)
# ---------------------------------------------------------
def test_2_retention_cleans_exact_required_oldest_data(db_session, test_setup):
    fam = test_setup["family"]
    usr = test_setup["user"]
    now = datetime.now(timezone.utc)

    # Seed 950 MB into IMAGE category via backed-up StorageObjects
    # Let's create 10 images of 95 MB each, staggered by time
    created_objs = []
    for i in range(10):
        obj = StorageObject(
            id=str(uuid.uuid4()),
            family_id=fam.id,
            user_id=usr.id,
            storage_path=f"{fam.id}/img_{i}.jpg",
            public_url=f"https://storage.mock/{fam.id}/img_{i}.jpg",
            category="IMAGE",
            file_size=95 * 1024 * 1024, # 95 MB
            status="backed_up",
            is_protected=False,
            created_at=now - timedelta(days=10 - i),
            backed_up_at=now - timedelta(days=10 - i)
        )
        db_session.add(obj)
        created_objs.append(obj)
    db_session.commit()

    # Image quota is 800 MB (40% of 2 GB). Current usage is 950 MB (exceeded by 150 MB).
    # Incoming image is 100 MB.
    # Total projected: 1050 MB.
    # Required cleanup: 1050 - 800 = 250 MB.
    # With 95 MB files, deleting 3 files gives 285 MB >= 250 MB and stops immediately.
    incoming = {"IMAGE": 100 * 1024 * 1024}
    cleanup_jobs = quota_retention_service.preflight_and_prepare_space(
        db=db_session,
        family_id=fam.id,
        incoming_bytes_by_category=incoming
    )

    assert len(cleanup_jobs) == 1
    job = cleanup_jobs[0]
    assert job.category == "IMAGE"
    assert job.freed_bytes >= 250 * 1024 * 1024
    assert job.deleted_storage_objects_count == 3  # exactly 3 * 95 MB = 285 MB, not all 10!

    # Verify oldest 3 were marked deleted
    db_session.refresh(created_objs[0])
    db_session.refresh(created_objs[1])
    db_session.refresh(created_objs[2])
    db_session.refresh(created_objs[3])

    assert created_objs[0].status == "deleted"
    assert created_objs[1].status == "deleted"
    assert created_objs[2].status == "deleted"
    assert created_objs[3].status == "backed_up"  # 4th was preserved!


# ---------------------------------------------------------
# TEST 3: Fail-Safe: Quota Overflow But Insufficient Reclaimable Data (Zero Data Loss)
# ---------------------------------------------------------
def test_3_failsafe_insufficient_space_aborts_without_data_loss(db_session, test_setup):
    fam = test_setup["family"]
    usr = test_setup["user"]
    now = datetime.now(timezone.utc)

    # Seed 1 audio of 190 MB (quota is 200 MB)
    obj = StorageObject(
        id=str(uuid.uuid4()),
        family_id=fam.id,
        user_id=usr.id,
        storage_path=f"{fam.id}/audio/test.webm",
        public_url="https://mock/test.webm",
        category="AUDIO",
        file_size=190 * 1024 * 1024, # 190 MB
        status="backed_up",
        is_protected=False,
        created_at=now - timedelta(days=1),
        backed_up_at=now - timedelta(days=1)
    )
    db_session.add(obj)
    db_session.commit()

    # Incoming audio is 300 MB.
    # Total projected: 490 MB. Quota: 200 MB. Required cleanup: 290 MB.
    # But only 190 MB exists to reclaim!
    # Pre-flight MUST throw QuotaExceededException and NOT delete the existing 190 MB file!
    with pytest.raises(QuotaExceededException):
        quota_retention_service.preflight_and_prepare_space(
            db=db_session,
            family_id=fam.id,
            incoming_bytes_by_category={"AUDIO": 300 * 1024 * 1024}
        )

    db_session.refresh(obj)
    assert obj.status == "backed_up"  # File was NOT deleted! (Fail-safe verified)


# ---------------------------------------------------------
# TEST 4: Image Quota Retention
# ---------------------------------------------------------
def test_4_image_quota_retention_isolation(db_session, test_setup):
    fam = test_setup["family"]
    usr = test_setup["user"]
    now = datetime.now(timezone.utc)

    # Add 1 Audio (should not be touched)
    audio_obj = StorageObject(
        id=str(uuid.uuid4()),
        family_id=fam.id,
        user_id=usr.id,
        storage_path="audio/keep.webm",
        public_url="https://mock/keep.webm",
        category="AUDIO",
        file_size=50 * 1024 * 1024,
        status="backed_up",
        created_at=now - timedelta(days=5),
        backed_up_at=now - timedelta(days=5)
    )
    # Add Image exceeding quota
    img_obj = StorageObject(
        id=str(uuid.uuid4()),
        family_id=fam.id,
        user_id=usr.id,
        storage_path="img/old.jpg",
        public_url="https://mock/old.jpg",
        category="IMAGE",
        file_size=850 * 1024 * 1024,
        status="backed_up",
        created_at=now - timedelta(days=5),
        backed_up_at=now - timedelta(days=5)
    )
    db_session.add_all([audio_obj, img_obj])
    db_session.commit()

    # Incoming 50 MB image triggers IMAGE cleanup
    quota_retention_service.preflight_and_prepare_space(
        db=db_session,
        family_id=fam.id,
        incoming_bytes_by_category={"IMAGE": 50 * 1024 * 1024}
    )

    db_session.refresh(audio_obj)
    db_session.refresh(img_obj)
    assert img_obj.status == "deleted"
    assert audio_obj.status == "backed_up"  # Untouched


# ---------------------------------------------------------
# TEST 5: Audio Quota Retention
# ---------------------------------------------------------
def test_5_audio_quota_retention(db_session, test_setup):
    fam = test_setup["family"]
    usr = test_setup["user"]
    now = datetime.now(timezone.utc)

    audio_obj1 = StorageObject(
        id=str(uuid.uuid4()),
        family_id=fam.id,
        user_id=usr.id,
        storage_path="audio/1.webm",
        public_url="https://mock/1.webm",
        category="AUDIO",
        file_size=150 * 1024 * 1024,
        status="backed_up",
        created_at=now - timedelta(days=3),
        backed_up_at=now - timedelta(days=3)
    )
    audio_obj2 = StorageObject(
        id=str(uuid.uuid4()),
        family_id=fam.id,
        user_id=usr.id,
        storage_path="audio/2.webm",
        public_url="https://mock/2.webm",
        category="AUDIO",
        file_size=60 * 1024 * 1024,
        status="backed_up",
        created_at=now - timedelta(days=1),
        backed_up_at=now - timedelta(days=1)
    )
    db_session.add_all([audio_obj1, audio_obj2])
    db_session.commit()

    # Quota is 200 MB. Current is 210 MB. Incoming is 50 MB. Total projected: 260 MB. Required: 60 MB.
    # audio_obj1 (150 MB) is oldest, deleting it frees 150 MB >= 60 MB and stops.
    quota_retention_service.preflight_and_prepare_space(
        db=db_session,
        family_id=fam.id,
        incoming_bytes_by_category={"AUDIO": 50 * 1024 * 1024}
    )

    db_session.refresh(audio_obj1)
    db_session.refresh(audio_obj2)
    assert audio_obj1.status == "deleted"
    assert audio_obj2.status == "backed_up"


# ---------------------------------------------------------
# TEST 6: Chat Quota Retention
# ---------------------------------------------------------
def test_6_chat_quota_retention(db_session, test_setup):
    fam = test_setup["family"]
    usr = test_setup["user"]
    now = datetime.now(timezone.utc)

    # Create 5 text messages
    msgs = []
    for i in range(5):
        m = Message(
            id=str(uuid.uuid4()),
            family_id=fam.id,
            sender_id=usr.id,
            content=f"Message {i}",
            created_at=now - timedelta(days=5 - i)
        )
        db_session.add(m)
        msgs.append(m)
    db_session.commit()

    # Emulate chat quota reached (by creating a large chat storage object)
    large_chat = StorageObject(
        id=str(uuid.uuid4()),
        family_id=fam.id,
        user_id=usr.id,
        storage_path="chat/archive.json",
        public_url="https://mock/archive.json",
        category="CHAT",
        file_size=1050 * 1024 * 1024, # > 1 GB
        status="backed_up",
        created_at=now - timedelta(days=10),
        backed_up_at=now - timedelta(days=10)
    )
    db_session.add(large_chat)
    db_session.commit()

    # Preflight for new chat
    quota_retention_service.preflight_and_prepare_space(
        db=db_session,
        family_id=fam.id,
        incoming_bytes_by_category={"CHAT": 200}
    )

    db_session.refresh(large_chat)
    assert large_chat.status == "deleted"


# ---------------------------------------------------------
# TEST 7: Invariant: Unbacked Local Data NEVER Deleted by Retention
# ---------------------------------------------------------
def test_7_unbacked_data_never_deleted(db_session, test_setup):
    fam = test_setup["family"]
    usr = test_setup["user"]
    now = datetime.now(timezone.utc)

    # Object with status = 'pending' (not yet safely backed up)
    unbacked_obj = StorageObject(
        id=str(uuid.uuid4()),
        family_id=fam.id,
        user_id=usr.id,
        storage_path="img/pending.jpg",
        public_url="https://mock/pending.jpg",
        category="IMAGE",
        file_size=850 * 1024 * 1024,
        status="pending", # NOT backed_up!
        created_at=now - timedelta(days=20),
        backed_up_at=now - timedelta(days=20)
    )
    db_session.add(unbacked_obj)
    db_session.commit()

    # Preflight image requiring cleanup should NOT touch pending file and should fail due to no backed-up candidates
    with pytest.raises(QuotaExceededException):
        quota_retention_service.preflight_and_prepare_space(
            db=db_session,
            family_id=fam.id,
            incoming_bytes_by_category={"IMAGE": 50 * 1024 * 1024}
        )

    db_session.refresh(unbacked_obj)
    assert unbacked_obj.status == "pending" # Completely untouched!


# ---------------------------------------------------------
# TEST 8: SHA256 Deduplication (Identical binary reused)
# ---------------------------------------------------------
def test_8_checksum_deduplication(db_session, test_setup):
    fam = test_setup["family"]
    usr = test_setup["user"]

    content_bytes = b"identical_binary_photo_content_12345"
    checksum = quota_retention_service.compute_sha256(content_bytes)

    # First registration
    obj1 = quota_retention_service.register_storage_object(
        db=db_session,
        family_id=fam.id,
        user_id=usr.id,
        storage_path=f"{fam.id}/photo1.jpg",
        public_url=f"https://storage.mock/{fam.id}/photo1.jpg",
        category="IMAGE",
        file_size=len(content_bytes),
        checksum=checksum
    )

    # Second registration with identical checksum
    obj2 = quota_retention_service.register_storage_object(
        db=db_session,
        family_id=fam.id,
        user_id=usr.id,
        storage_path=f"{fam.id}/photo2.jpg",
        public_url=f"https://storage.mock/{fam.id}/photo2.jpg",
        category="IMAGE",
        file_size=len(content_bytes),
        checksum=checksum
    )

    assert obj1.id == obj2.id
    assert obj2.storage_path == f"{fam.id}/photo1.jpg"


# ---------------------------------------------------------
# TEST 9: Batch Backup Integration & Status Handling
# ---------------------------------------------------------
def test_9_batch_backup_quota_integration(db_session, test_setup):
    fam = test_setup["family"]
    mem = test_setup["member"]
    usr = test_setup["user"]

    payload = [
        BackupItemPayload(
            id="msg-test-1",
            client_message_id="client-test-1",
            sender_id=usr.id,
            content="Hello world backup test",
            created_at=datetime.now(timezone.utc)
        )
    ]

    res = backup_service.ingest_incremental_chat_backup(
        db=db_session,
        family_id=fam.id,
        member=mem,
        messages_payload=payload
    )

    assert res.status == "success"
    assert res.saved_count == 1


# ---------------------------------------------------------
# TEST 10: Concurrency Lock Safety (No race condition)
# ---------------------------------------------------------
def test_10_concurrency_lock_safety(db_session, test_setup):
    fam = test_setup["family"]
    errors = []

    def run_preflight():
        try:
            quota_retention_service.preflight_and_prepare_space(
                db=db_session,
                family_id=fam.id,
                incoming_bytes_by_category={"CHAT": 500}
            )
        except Exception as e:
            errors.append(e)

    threads = [threading.Thread(target=run_preflight) for _ in range(5)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert len(errors) == 0


# ---------------------------------------------------------
# TEST 11 & 12: Storage Reconciliation & Discrepancy Reporting
# ---------------------------------------------------------
def test_11_12_storage_reconciliation_and_orphan_detection(db_session, test_setup):
    fam = test_setup["family"]
    usr = test_setup["user"]

    # Register an active object in DB
    obj = StorageObject(
        id=str(uuid.uuid4()),
        family_id=fam.id,
        user_id=usr.id,
        storage_path=f"{fam.id}/active.jpg",
        public_url="https://mock/active.jpg",
        category="IMAGE",
        file_size=1024,
        status="backed_up",
        created_at=datetime.now(timezone.utc)
    )
    db_session.add(obj)
    db_session.commit()

    report = quota_retention_service.reconcile_storage(
        db=db_session,
        family_id=fam.id
    )

    assert report.status == "success"
    assert report.db_total_bytes == 1024
    assert isinstance(report.discrepancy_bytes, int)
