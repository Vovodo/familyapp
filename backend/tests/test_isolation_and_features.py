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
