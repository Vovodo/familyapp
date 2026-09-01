import uuid

def test_chat_idempotency_duplicate_prevention(client):
    """
    Test that sending the same client_message_id twice returns the same message
    without creating a duplicate database record.
    """
    unique_email = f"chat_test_{uuid.uuid4().hex[:8]}@aile.com"

    # 1. Register User & Create Family
    reg_res = client.post("/api/v1/auth/register", json={
        "full_name": "Test Chat User",
        "email": unique_email,
        "password": "Password123!"
    })
    assert reg_res.status_code == 201
    token = reg_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 2. Create Family
    fam_res = client.post("/api/v1/families/", json={"name": "Chat Test Family"}, headers=headers)
    assert fam_res.status_code == 201
    family_id = fam_res.json()["id"]
    headers["x-family-id"] = family_id

    # 3. Send Message 1 with client_message_id
    client_msg_id = f"cmsg-test-{uuid.uuid4().hex}"
    msg_payload = {
        "content": "selamm",
        "client_message_id": client_msg_id
    }

    send_1 = client.post("/api/v1/messages/", json=msg_payload, headers=headers)
    assert send_1.status_code == 201
    msg1_data = send_1.json()
    assert msg1_data["content"] == "selamm"
    assert msg1_data["client_message_id"] == client_msg_id
    db_msg_id = msg1_data["id"]

    # 4. Send Message 2 with the EXACT SAME client_message_id
    send_2 = client.post("/api/v1/messages/", json=msg_payload, headers=headers)
    assert send_2.status_code == 201
    msg2_data = send_2.json()
    assert msg2_data["id"] == db_msg_id
    assert msg2_data["content"] == "selamm"

    # 5. Query message list: Must have EXACTLY 1 message
    list_res = client.get("/api/v1/messages/", headers=headers)
    assert list_res.status_code == 200
    all_msgs = [m for m in list_res.json() if m["client_message_id"] == client_msg_id]
    assert len(all_msgs) == 1, f"Expected exactly 1 message, got {len(all_msgs)}"
