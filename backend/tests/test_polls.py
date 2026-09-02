import uuid


def _auth_family(client, name="Poll Family"):
    email = f"poll_{uuid.uuid4().hex[:8]}@aile.com"
    reg = client.post("/api/v1/auth/register", json={
        "full_name": "Poll User",
        "email": email,
        "password": "Password123!",
    })
    assert reg.status_code == 201
    headers = {"Authorization": f"Bearer {reg.json()['access_token']}"}
    fam = client.post("/api/v1/families/", json={"name": name}, headers=headers)
    assert fam.status_code == 201
    headers["x-family-id"] = fam.json()["id"]
    return headers, fam.json()


def test_poll_vote_persists_and_survives_refetch(client):
    headers, _family = _auth_family(client)

    created = client.post("/api/v1/messages/poll", json={
        "question": "Bu aksam ne yemek yapalim",
        "options": ["Buryan", "Fasulye", "Pizza"],
        "duration_hours": 6,
        "client_message_id": f"poll-{uuid.uuid4().hex}",
    }, headers=headers)
    assert created.status_code == 200
    poll = created.json()["poll"]
    poll_id = poll["poll_id"]
    message_id = created.json()["id"]
    assert poll["total_votes"] == 0
    assert poll["tallies"]["2"] == 0

    vote = client.post(
        f"/api/v1/messages/poll/{poll_id}/vote",
        json={"option_index": 2},
        headers=headers,
    )
    assert vote.status_code == 200, vote.text
    body = vote.json()
    assert body["my_vote"] == 2
    assert body["total_votes"] == 1
    assert body["tallies"]["2"] == 1
    assert len(body["voters"]["2"]) == 1

    details = client.get(f"/api/v1/messages/poll/{poll_id}", headers=headers)
    assert details.status_code == 200
    assert details.json()["total_votes"] == 1
    assert details.json()["my_vote"] == 2
    assert details.json()["tallies"]["2"] == 1

    listed = client.get("/api/v1/messages/", headers=headers)
    assert listed.status_code == 200
    poll_msg = next(m for m in listed.json() if m["id"] == message_id)
    assert poll_msg["poll"]["total_votes"] == 1
    assert poll_msg["poll"]["my_vote"] == 2
    assert poll_msg["poll"]["tallies"]["2"] == 1

    again = client.post(
        f"/api/v1/messages/poll/{poll_id}/vote",
        json={"option_index": 1},
        headers=headers,
    )
    assert again.status_code == 200
    assert again.json()["my_vote"] == 1
    assert again.json()["total_votes"] == 1
    assert again.json()["tallies"]["1"] == 1
    assert again.json()["tallies"]["2"] == 0


def test_poll_vote_rejects_spoofed_family(client):
    headers_a, _fam_a = _auth_family(client, "Aile A")
    created = client.post("/api/v1/messages/poll", json={
        "question": "Hangisi",
        "options": ["A", "B"],
        "duration_hours": 2,
    }, headers=headers_a).json()
    poll_id = created["poll"]["poll_id"]

    headers_b, fam_b = _auth_family(client, "Aile B")
    spoof = dict(headers_b)
    spoof["x-family-id"] = headers_a["x-family-id"]

    forbidden = client.post(
        f"/api/v1/messages/poll/{poll_id}/vote",
        json={"option_index": 0},
        headers=spoof,
    )
    assert forbidden.status_code == 403

    other_family = client.post(
        f"/api/v1/messages/poll/{poll_id}/vote",
        json={"option_index": 0},
        headers=headers_b,
    )
    assert other_family.status_code in (403, 404)
    assert fam_b["id"] != headers_a["x-family-id"]
