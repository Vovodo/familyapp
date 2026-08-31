import pytest
from datetime import datetime, timezone
from backend.app.models.models import User, Family, FamilyMember, Notification, DeviceToken
from backend.app.core.security import get_password_hash, create_access_token


def test_send_heart_and_self_exclusion(client, db):
    """
    Test 1: Ali and Ayşe in Family 1.
    Ali sends a heart -> Ayşe receives notification, Ali does NOT receive self-notification.
    """
    # 1. Create Family 1
    fam1 = Family(id="fam-1", name="Yılmaz Ailesi", invite_code="AILE-111111")
    db.add(fam1)

    # 2. Create Ali and Ayşe
    ali = User(id="user-ali", full_name="Ali Yılmaz", email="ali@fam1.com", hashed_password=get_password_hash("pass"), role="member")
    ayse = User(id="user-ayse", full_name="Ayşe Yılmaz", email="ayse@fam1.com", hashed_password=get_password_hash("pass"), role="member")
    db.add_all([ali, ayse])

    mem_ali = FamilyMember(id="mem-ali", family_id="fam-1", user_id="user-ali", nickname="Baba", role="admin")
    mem_ayse = FamilyMember(id="mem-ayse", family_id="fam-1", user_id="user-ayse", nickname="Anne", role="member")
    db.add_all([mem_ali, mem_ayse])

    # 3. Add Device Token for Ayşe
    token_ayse = DeviceToken(
        id="dt-ayse",
        user_id="user-ayse",
        device_id="dev-ayse-phone",
        platform="android",
        token="fcm_token_ayse_123",
        is_active=True
    )
    db.add(token_ayse)
    db.commit()

    # 4. Ali sends a heart
    token_ali = create_access_token("user-ali")
    headers = {"Authorization": f"Bearer {token_ali}"}

    res = client.post("/api/v1/families/heart", json={"message": None}, headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "success"
    assert data["sender_id"] == "user-ali"
    assert data["sender_name"] == "Baba"
    assert data["recipients_count"] == 1

    # 5. Verify notifications in DB
    # Ayşe should have 1 notification
    ayse_notifs = db.query(Notification).filter(Notification.recipient_id == "user-ayse").all()
    assert len(ayse_notifs) == 1
    assert "Baba size bir kalp gönderdi" in ayse_notifs[0].body
    assert ayse_notifs[0].type == "heart"

    # Ali should have 0 notifications (No self-notification!)
    ali_notifs = db.query(Notification).filter(Notification.recipient_id == "user-ali").all()
    assert len(ali_notifs) == 0


def test_heart_strict_family_isolation(client, db):
    """
    Test 2: Ali in Family A, Mehmet in Family B.
    Ali sends a heart -> Mehmet in Family B must NEVER receive it.
    """
    # 1. Create Family A and Family B
    fam_a = Family(id="fam-a", name="A Ailesi", invite_code="AILE-AAAAAA")
    fam_b = Family(id="fam-b", name="B Ailesi", invite_code="AILE-BBBBBB")
    db.add_all([fam_a, fam_b])

    # 2. Create Users
    user_a = User(id="user-a", full_name="Ali A", email="ali@a.com", hashed_password=get_password_hash("pass"), role="member")
    user_b = User(id="user-b", full_name="Mehmet B", email="mehmet@b.com", hashed_password=get_password_hash("pass"), role="member")
    db.add_all([user_a, user_b])

    mem_a = FamilyMember(id="mem-a", family_id="fam-a", user_id="user-a", nickname="Baba A", role="admin")
    mem_b = FamilyMember(id="mem-b", family_id="fam-b", user_id="user-b", nickname="Baba B", role="admin")
    db.add_all([mem_a, mem_b])
    db.commit()

    # 3. User A sends heart
    token_a = create_access_token("user-a")
    headers = {"Authorization": f"Bearer {token_a}"}

    res = client.post("/api/v1/families/heart", json={}, headers=headers)
    assert res.status_code == 200
    assert res.json()["recipients_count"] == 0  # No other members in Family A

    # 4. Verify User B in Family B received NOTHING
    b_notifs = db.query(Notification).filter(Notification.recipient_id == "user-b").all()
    assert len(b_notifs) == 0


def test_heart_spam_rate_limiting(client, db):
    """
    Test 3: Rapid clicking rate-limiting (Spam prevention).
    Sending hearts repeatedly in < 3 seconds returns 429.
    """
    fam = Family(id="fam-rate", name="Hızlı Aile", invite_code="AILE-RATE99")
    u1 = User(id="user-r1", full_name="Hızlı Gönderici", email="r1@fam.com", hashed_password=get_password_hash("pass"), role="member")
    u2 = User(id="user-r2", full_name="Alıcı", email="r2@fam.com", hashed_password=get_password_hash("pass"), role="member")
    db.add_all([fam, u1, u2])

    m1 = FamilyMember(id="mem-r1", family_id="fam-rate", user_id="user-r1", nickname="Baba", role="admin")
    m2 = FamilyMember(id="mem-r2", family_id="fam-rate", user_id="user-r2", nickname="Anne", role="member")
    db.add_all([m1, m2])
    db.commit()

    token1 = create_access_token("user-r1")
    headers = {"Authorization": f"Bearer {token1}"}

    # 1. First send succeeds
    res1 = client.post("/api/v1/families/heart", json={}, headers=headers)
    assert res1.status_code == 200

    # 2. Immediate second send within 3s is throttled (429 Too Many Requests)
    res2 = client.post("/api/v1/families/heart", json={}, headers=headers)
    assert res2.status_code == 429
    assert "Lütfen biraz bekleyin" in res2.json()["detail"]


def test_device_token_registration_and_deactivation(client, db):
    """
    Test 4: Register device token and deactivate on logout.
    """
    user = User(id="user-dt-test", full_name="Cihaz Kullanıcısı", email="dt@test.com", hashed_password=get_password_hash("pass"), role="member")
    db.add(user)
    db.commit()

    token = create_access_token("user-dt-test")
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Register Token
    res_reg = client.post(
        "/api/v1/notifications/device-token",
        json={
            "device_id": "phone-galaxy-s24",
            "token": "fcm_token_sample_abc123",
            "platform": "android"
        },
        headers=headers
    )
    assert res_reg.status_code == 200
    data = res_reg.json()
    assert data["is_active"] is True
    assert data["device_id"] == "phone-galaxy-s24"

    # 2. Deactivate on Logout
    res_del = client.delete(
        "/api/v1/notifications/device-token?device_id=phone-galaxy-s24",
        headers=headers
    )
    assert res_del.status_code == 200

    # Verify DB
    dt = db.query(DeviceToken).filter(DeviceToken.device_id == "phone-galaxy-s24").first()
    assert dt is not None
    assert dt.is_active is False

