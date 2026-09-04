from datetime import datetime, timezone, timedelta

def test_family_creation_and_strict_isolation(client):
    # 1. Register User A (Family 1 Admin)
    res_a = client.post(
        "/api/v1/auth/register",
        json={
            "full_name": "Aile Reisi A",
            "email": "userA@test.com",
            "password": "passwordA123",
        },
    )
    token_a = res_a.json()["access_token"]
    headers_a = {"Authorization": f"Bearer {token_a}"}

    # 2. Register User B (Family 2 Admin)
    res_b = client.post(
        "/api/v1/auth/register",
        json={
            "full_name": "Aile Reisi B",
            "email": "userB@test.com",
            "password": "passwordB123",
        },
    )
    token_b = res_b.json()["access_token"]
    headers_b = {"Authorization": f"Bearer {token_b}"}

    # 3. User A creates Family A
    fam_a_res = client.post("/api/v1/families/", json={"name": "Ailesi A ❤️"}, headers=headers_a)
    assert fam_a_res.status_code == 201
    fam_a = fam_a_res.json()
    invite_code_a = fam_a["invite_code"]

    # 4. User B creates Family B
    fam_b_res = client.post("/api/v1/families/", json={"name": "Ailesi B ❤️"}, headers=headers_b)
    assert fam_b_res.status_code == 201
    fam_b = fam_b_res.json()

    # 5. User A creates a message in Family A
    msg_res = client.post(
        "/api/v1/messages/",
        json={"content": "Gizli Aile A Mesajı"},
        headers=headers_a,
    )
    assert msg_res.status_code == 201

    # 6. User B checks messages -> Must NOT see Family A's message!
    msg_b_res = client.get("/api/v1/messages/", headers=headers_b)
    assert msg_b_res.status_code == 200
    assert len(msg_b_res.json()) == 0

    # 7. User B tries to inject x-family-id header of Family A -> Must receive 403 Forbidden!
    forbidden_res = client.get(
        "/api/v1/messages/",
        headers={"Authorization": f"Bearer {token_b}", "x-family-id": fam_a["id"]},
    )
    assert forbidden_res.status_code == 403

    # 8. User A creates a shopping item
    shop_res = client.post(
        "/api/v1/shopping/",
        json={"title": "Organik Süt", "quantity": "2 şişe", "category": "Market"},
        headers=headers_a,
    )
    assert shop_res.status_code == 201
    shop_id = shop_res.json()["id"]

    # 9. User A creates a reminder
    remind_time = (datetime.now(timezone.utc) + timedelta(days=2)).isoformat()
    rem_res = client.post(
        "/api/v1/reminders/",
        json={"title": "Doktor Kontrolü", "remind_at": remind_time, "notify_before_minutes": 15},
        headers=headers_a,
    )
    assert rem_res.status_code == 201

    # 10. Register User C (Member) and join Family A using invite code
    res_c = client.post(
        "/api/v1/auth/register",
        json={
            "full_name": "Anne C",
            "email": "userC@test.com",
            "password": "passwordC123",
        },
    )
    token_c = res_c.json()["access_token"]
    headers_c = {"Authorization": f"Bearer {token_c}"}

    join_res = client.post(
        "/api/v1/families/join",
        json={"invite_code": invite_code_a, "nickname": "Anne ❤️"},
        headers=headers_c,
    )
    assert join_res.status_code == 200

    # 11. User C now can see Family A messages and complete shopping items!
    messages_c = client.get("/api/v1/messages/", headers=headers_c).json()
    assert len(messages_c) == 1
    assert messages_c[0]["content"] == "Gizli Aile A Mesajı"

    # User C marks shopping item as completed
    toggle_res = client.patch(
        f"/api/v1/shopping/{shop_id}",
        json={"is_completed": True},
        headers=headers_c,
    )
    assert toggle_res.status_code == 200
    assert toggle_res.json()["is_completed"] is True
    assert toggle_res.json()["completed_by_name"] == "Anne C"


def test_family_permanent_deletion_and_isolation(client):
    # 1. Register User X and create Family X
    res_x = client.post(
        "/api/v1/auth/register",
        json={"full_name": "Reis X", "email": "userX@test.com", "password": "passwordX123"},
    )
    token_x = res_x.json()["access_token"]
    headers_x = {"Authorization": f"Bearer {token_x}"}

    fam_x_res = client.post("/api/v1/families/", json={"name": "X Ailesi"}, headers=headers_x)
    fam_x_id = fam_x_res.json()["id"]

    # 2. Register User Y and create Family Y
    res_y = client.post(
        "/api/v1/auth/register",
        json={"full_name": "Reis Y", "email": "userY@test.com", "password": "passwordY123"},
    )
    token_y = res_y.json()["access_token"]
    headers_y = {"Authorization": f"Bearer {token_y}"}

    fam_y_res = client.post("/api/v1/families/", json={"name": "Y Ailesi"}, headers=headers_y)
    fam_y_id = fam_y_res.json()["id"]

    # 3. Create items in Family X
    client.post("/api/v1/messages/", json={"content": "X Grubu Özel Mesajı"}, headers=headers_x)
    client.post("/api/v1/notes/", json={"title": "X Notu", "content": "X şifresi 123"}, headers=headers_x)
    client.post("/api/v1/shopping/", json={"title": "X Ekmeği", "quantity": "1 adet"}, headers=headers_x)

    # 4. Create items in Family Y
    client.post("/api/v1/messages/", json={"content": "Y Grubu Özel Mesajı"}, headers=headers_y)
    client.post("/api/v1/notes/", json={"title": "Y Notu", "content": "Y şifresi 456"}, headers=headers_y)
    client.post("/api/v1/shopping/", json={"title": "Y Sütü", "quantity": "2 adet"}, headers=headers_y)

    # 5. Delete Family X
    del_res = client.delete(f"/api/v1/families/{fam_x_id}", headers=headers_x)
    assert del_res.status_code == 200

    # 6. Verify Family X is gone
    my_fams_x = client.get("/api/v1/families/my-families", headers=headers_x).json()
    assert len(my_fams_x) == 0

    # 7. Verify Family Y and all its messages, notes, and shopping items are 100% UNTOUCHED!
    my_fams_y = client.get("/api/v1/families/my-families", headers=headers_y).json()
    assert len(my_fams_y) == 1
    assert my_fams_y[0]["id"] == fam_y_id

    msgs_y = client.get("/api/v1/messages/", headers=headers_y).json()
    assert len(msgs_y) == 1
    assert msgs_y[0]["content"] == "Y Grubu Özel Mesajı"

    notes_y = client.get("/api/v1/notes/", headers=headers_y).json()
    assert len(notes_y) == 1
    assert notes_y[0]["title"] == "Y Notu"

    shop_y = client.get("/api/v1/shopping/", headers=headers_y).json()
    assert len(shop_y) == 1
    assert shop_y[0]["title"] == "Y Sütü"


def test_existing_member_cannot_create_a_second_family(client):
    """A stale onboarding screen must not be able to strand a member in a new,
    empty family that hides their real one."""
    res = client.post(
        "/api/v1/auth/register",
        json={"full_name": "Reis Z", "email": "userZ@test.com", "password": "passwordZ123"},
    )
    headers = {"Authorization": f"Bearer {res.json()['access_token']}"}

    first = client.post("/api/v1/families/", json={"name": "Z Ailesi"}, headers=headers)
    assert first.status_code == 201
    first_id = first.json()["id"]

    # 1. Creating a second family is refused with a clear Turkish message
    second = client.post("/api/v1/families/", json={"name": "Kazara Kurulan Aile"}, headers=headers)
    assert second.status_code == 409
    assert "zaten bir aile" in second.json()["detail"].lower()

    # 2. The original family is still the one and only membership
    my_fams = client.get("/api/v1/families/my-families", headers=headers).json()
    assert len(my_fams) == 1
    assert my_fams[0]["id"] == first_id
    assert my_fams[0]["name"] == "Z Ailesi"

    # 3. Once the family is gone, creating a new one is allowed again
    assert client.delete(f"/api/v1/families/{first_id}", headers=headers).status_code == 200
    again = client.post("/api/v1/families/", json={"name": "Yeni Z Ailesi"}, headers=headers)
    assert again.status_code == 201
    assert again.json()["id"] != first_id


def test_join_refuses_second_family_membership(client):
    host = client.post(
        "/api/v1/auth/register",
        json={"full_name": "Kurucu", "email": "host_join@test.com", "password": "passwordA123"},
    )
    host_h = {"Authorization": f"Bearer {host.json()['access_token']}"}
    fam = client.post("/api/v1/families/", json={"name": "Birinci Aile"}, headers=host_h).json()

    other = client.post(
        "/api/v1/auth/register",
        json={"full_name": "Diger", "email": "other_join@test.com", "password": "passwordB123"},
    )
    other_h = {"Authorization": f"Bearer {other.json()['access_token']}"}
    client.post("/api/v1/families/", json={"name": "Ikinci Aile"}, headers=other_h)

    blocked = client.post(
        "/api/v1/families/join",
        json={"invite_code": fam["invite_code"]},
        headers=other_h,
    )
    assert blocked.status_code == 409
    assert "zaten bir aile" in blocked.json()["detail"].lower()


def test_creator_can_transfer_ownership_then_leave_and_create_again(client):
    creator = client.post(
        "/api/v1/auth/register",
        json={"full_name": "Eski Reis", "email": "old_owner@test.com", "password": "passwordA123"},
    )
    creator_h = {"Authorization": f"Bearer {creator.json()['access_token']}"}
    fam = client.post("/api/v1/families/", json={"name": "Devredilen Aile"}, headers=creator_h).json()

    member = client.post(
        "/api/v1/auth/register",
        json={"full_name": "Yeni Reis", "email": "new_owner@test.com", "password": "passwordB123"},
    )
    member_h = {"Authorization": f"Bearer {member.json()['access_token']}"}
    assert client.post(
        "/api/v1/families/join",
        json={"invite_code": fam["invite_code"], "nickname": "Yeni Reis"},
        headers=member_h,
    ).status_code == 200

    me = client.get("/api/v1/families/me", headers=creator_h).json()
    target = next(m for m in me["members"] if m["user_id"] != creator.json()["user"]["id"])

    # Üye aktaramaz
    denied = client.post(
        "/api/v1/families/transfer-ownership",
        json={"member_id": target["id"]},
        headers=member_h,
    )
    assert denied.status_code == 403

    transferred = client.post(
        "/api/v1/families/transfer-ownership",
        json={"member_id": target["id"]},
        headers=creator_h,
    )
    assert transferred.status_code == 200, transferred.text
    assert transferred.json()["created_by"] == target["user_id"]
    roles = {m["user_id"]: m["role"] for m in transferred.json()["members"]}
    assert roles[target["user_id"]] == "admin"
    assert roles[creator.json()["user"]["id"]] == "member"

    # Eski kurucu ayrılıp yeni grup kurabilir
    assert client.post("/api/v1/families/leave", headers=creator_h).status_code == 200
    new_fam = client.post("/api/v1/families/", json={"name": "Yeni Grubum"}, headers=creator_h)
    assert new_fam.status_code == 201
    assert new_fam.json()["id"] != fam["id"]

    still = client.get("/api/v1/families/my-families", headers=member_h).json()
    assert len(still) == 1
    assert still[0]["id"] == fam["id"]
    assert still[0]["created_by"] == target["user_id"]


def test_transfer_ownership_rejects_spoofed_family(client):
    owner = client.post(
        "/api/v1/auth/register",
        json={"full_name": "Sahip", "email": "owner_x@test.com", "password": "passwordA123"},
    )
    owner_h = {"Authorization": f"Bearer {owner.json()['access_token']}"}
    fam = client.post("/api/v1/families/", json={"name": "X"}, headers=owner_h).json()
    guest = client.post(
        "/api/v1/auth/register",
        json={"full_name": "Uye", "email": "guest_x@test.com", "password": "passwordB123"},
    )
    guest_h = {"Authorization": f"Bearer {guest.json()['access_token']}"}
    client.post(
        "/api/v1/families/join",
        json={"invite_code": fam["invite_code"]},
        headers=guest_h,
    )
    target_id = next(
        m["id"]
        for m in client.get("/api/v1/families/me", headers=owner_h).json()["members"]
        if m["user_id"] != owner.json()["user"]["id"]
    )

    outsider = client.post(
        "/api/v1/auth/register",
        json={"full_name": "Yabanci", "email": "out_x@test.com", "password": "passwordC123"},
    )
    outsider_fam = client.post(
        "/api/v1/families/",
        json={"name": "Yabanci Aile"},
        headers={"Authorization": f"Bearer {outsider.json()['access_token']}"},
    ).json()
    spoofed = {
        "Authorization": f"Bearer {outsider.json()['access_token']}",
        "x-family-id": fam["id"],
    }
    res = client.post(
        "/api/v1/families/transfer-ownership",
        json={"member_id": target_id},
        headers=spoofed,
    )
    assert res.status_code == 403
    # Asıl aileye dokunulmadı
    assert client.get("/api/v1/families/me", headers=owner_h).json()["created_by"] == owner.json()["user"]["id"]
    assert outsider_fam["id"] != fam["id"]


def test_close_family_purges_related_rows_and_leaves_other_family(client, db):
    from backend.app.models.models import (
        BudgetItem,
        DrawingGame,
        Family,
        FamilyMember,
        Poll,
        ShoppingItem,
        TaskItem,
        WatchRoom,
        WatchRoomParticipant,
        VoiceChannelParticipant,
        WordWarGame,
    )

    host = client.post(
        "/api/v1/auth/register",
        json={"full_name": "Kapatan", "email": "close_host@test.com", "password": "passwordA123"},
    )
    host_h = {"Authorization": f"Bearer {host.json()['access_token']}"}
    fam = client.post("/api/v1/families/", json={"name": "Kapanacak Aile"}, headers=host_h).json()
    fam_id = fam["id"]
    host_h["x-family-id"] = fam_id

    guest = client.post(
        "/api/v1/auth/register",
        json={"full_name": "Uye", "email": "close_guest@test.com", "password": "passwordB123"},
    )
    guest_h = {"Authorization": f"Bearer {guest.json()['access_token']}"}
    assert client.post(
        "/api/v1/families/join",
        json={"invite_code": fam["invite_code"], "nickname": "Uye"},
        headers=guest_h,
    ).status_code == 200
    guest_h["x-family-id"] = fam_id

    other = client.post(
        "/api/v1/auth/register",
        json={"full_name": "Baska", "email": "close_other@test.com", "password": "passwordC123"},
    )
    other_h = {"Authorization": f"Bearer {other.json()['access_token']}"}
    other_fam = client.post("/api/v1/families/", json={"name": "Dokunulmayan"}, headers=other_h).json()
    other_h["x-family-id"] = other_fam["id"]

    assert client.post("/api/v1/shopping/", json={"title": "Ekmek", "quantity": "1"}, headers=host_h).status_code == 201
    assert client.post("/api/v1/tasks/", json={"title": "Cam sil"}, headers=host_h).status_code == 201
    assert client.post(
        "/api/v1/budget/",
        json={"type": "expense", "amount": 12.5, "category": "Market", "title": "Süt"},
        headers=host_h,
    ).status_code == 201
    assert client.post(
        "/api/v1/messages/poll",
        json={"question": "Ne yiyelim?", "options": ["Çorba", "Makarna"], "duration_hours": 12},
        headers=host_h,
    ).status_code == 200
    assert client.post("/api/v1/games/drawing/start", headers=host_h).status_code == 201
    assert client.post("/api/v1/games/drawing/join", headers=guest_h).status_code == 200
    assert client.post("/api/v1/games/word-war/start", headers=host_h).status_code == 201
    assert client.post("/api/v1/games/word-war/join", headers=guest_h).status_code == 200
    assert client.post("/api/v1/watch-party/rooms", json={"title": "Film"}, headers=host_h).status_code == 201
    assert client.post("/api/v1/voice/join", headers=host_h).status_code == 200
    assert client.post("/api/v1/shopping/", json={"title": "Kalacak", "quantity": "1"}, headers=other_h).status_code == 201

    denied = client.post("/api/v1/families/close", json={"family_id": fam_id}, headers=guest_h)
    assert denied.status_code == 403

    spoofed = {**host_h, "x-family-id": other_fam["id"]}
    spoof = client.post("/api/v1/families/close", json={"family_id": other_fam["id"]}, headers=spoofed)
    assert spoof.status_code == 403
    assert client.get("/api/v1/families/my-families", headers=other_h).json()[0]["id"] == other_fam["id"]

    closed = client.post("/api/v1/families/close", json={"family_id": fam_id}, headers=host_h)
    assert closed.status_code == 200, closed.text

    db.expire_all()
    assert db.query(Family).filter(Family.id == fam_id).first() is None
    assert db.query(FamilyMember).filter(FamilyMember.family_id == fam_id).count() == 0
    assert db.query(ShoppingItem).filter(ShoppingItem.family_id == fam_id).count() == 0
    assert db.query(TaskItem).filter(TaskItem.family_id == fam_id).count() == 0
    assert db.query(BudgetItem).filter(BudgetItem.family_id == fam_id).count() == 0
    assert db.query(Poll).filter(Poll.family_id == fam_id).count() == 0
    assert db.query(WatchRoom).filter(WatchRoom.family_id == fam_id).count() == 0
    assert db.query(WatchRoomParticipant).filter(WatchRoomParticipant.family_id == fam_id).count() == 0
    assert db.query(VoiceChannelParticipant).filter(VoiceChannelParticipant.family_id == fam_id).count() == 0
    assert db.query(WordWarGame).filter(WordWarGame.family_id == fam_id).count() == 0

    leftover = client.get("/api/v1/families/my-families", headers=other_h).json()
    assert len(leftover) == 1
    assert leftover[0]["id"] == other_fam["id"]
    assert client.get("/api/v1/shopping/", headers=other_h).json()[0]["title"] == "Kalacak"
    assert client.get("/api/v1/families/my-families", headers=host_h).json() == []

