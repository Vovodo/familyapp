import time


def _register(client, name: str, email: str | None = None):
    email = email or f"{name.lower().replace(' ', '')}_{int(time.time() * 1000)}@test.com"
    res = client.post(
        "/api/v1/auth/register",
        json={"full_name": name, "email": email, "password": "passwordA123"},
    )
    assert res.status_code in (200, 201), res.text
    headers = {"Authorization": f"Bearer {res.json()['access_token']}"}
    return headers, res.json()["user"]["id"]


def _family_with_two(client):
    host_h, host_id = _register(client, "Host Voice")
    fam = client.post("/api/v1/families/", json={"name": "Ses Ailesi"}, headers=host_h)
    assert fam.status_code == 201, fam.text
    family = fam.json()
    host_h["x-family-id"] = family["id"]

    guest_h, guest_id = _register(client, "Guest Voice")
    joined = client.post(
        "/api/v1/families/join",
        json={"invite_code": family["invite_code"], "nickname": "Misafir"},
        headers=guest_h,
    )
    assert joined.status_code == 200, joined.text
    guest_h["x-family-id"] = family["id"]
    return host_h, host_id, guest_h, guest_id, family


def test_join_lists_self_and_guest_sees_host(client):
    host_h, host_id, guest_h, guest_id, family = _family_with_two(client)

    empty = client.get("/api/v1/voice/channel", headers=host_h)
    assert empty.status_code == 200, empty.text
    assert empty.json()["participant_count"] == 0
    assert empty.json()["self_in_channel"] is False
    assert empty.json()["family_name"] == "Ses Ailesi"

    joined = client.post("/api/v1/voice/join", headers=host_h)
    assert joined.status_code == 200, joined.text
    body = joined.json()
    assert body["self_in_channel"] is True
    assert body["participant_count"] == 1
    assert body["participants"][0]["user_id"] == host_id
    assert body["participants"][0]["is_self"] is True

    guest_view = client.get("/api/v1/voice/channel", headers=guest_h)
    assert guest_view.status_code == 200
    assert guest_view.json()["participant_count"] == 1
    assert guest_view.json()["self_in_channel"] is False
    assert guest_view.json()["participants"][0]["user_id"] == host_id

    guest_join = client.post("/api/v1/voice/join", headers=guest_h)
    assert guest_join.status_code == 200
    assert guest_join.json()["participant_count"] == 2
    ids = {p["user_id"] for p in guest_join.json()["participants"]}
    assert ids == {host_id, guest_id}


def test_leave_and_mute_and_heartbeat(client):
    host_h, host_id, guest_h, _, _ = _family_with_two(client)
    assert client.post("/api/v1/voice/join", headers=host_h).status_code == 200
    assert client.post("/api/v1/voice/join", headers=guest_h).status_code == 200

    muted = client.post("/api/v1/voice/mute", json={"muted": True}, headers=host_h)
    assert muted.status_code == 200, muted.text
    assert muted.json()["self_muted"] is True
    host_row = next(p for p in muted.json()["participants"] if p["user_id"] == host_id)
    assert host_row["muted"] is True

    beat = client.post("/api/v1/voice/heartbeat", headers=host_h)
    assert beat.status_code == 200
    assert beat.json()["self_in_channel"] is True

    left = client.post("/api/v1/voice/leave", headers=host_h)
    assert left.status_code == 200
    assert left.json()["self_in_channel"] is False
    assert left.json()["participant_count"] == 1

    missing = client.post("/api/v1/voice/heartbeat", headers=host_h)
    assert missing.status_code == 404


def test_spoofed_family_header_is_forbidden(client):
    host_h, _, _, _, family = _family_with_two(client)
    outsider_h, _ = _register(client, "Outsider Voice")
    outsider_fam = client.post("/api/v1/families/", json={"name": "Başka Aile"}, headers=outsider_h)
    assert outsider_fam.status_code == 201
    outsider_h["x-family-id"] = family["id"]

    res = client.post("/api/v1/voice/join", headers=outsider_h)
    assert res.status_code == 403

    get_res = client.get("/api/v1/voice/channel", headers=outsider_h)
    assert get_res.status_code == 403


def test_join_is_idempotent(client):
    host_h, _, _, _, _ = _family_with_two(client)
    first = client.post("/api/v1/voice/join", headers=host_h)
    second = client.post("/api/v1/voice/join", headers=host_h)
    assert first.status_code == 200
    assert second.status_code == 200
    assert second.json()["participant_count"] == 1
