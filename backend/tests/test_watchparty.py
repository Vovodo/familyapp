import time

from backend.app.services.youtube_url import extract_youtube_video_id, parse_start_ms


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
    host_h, host_id = _register(client, "Host WP")
    fam = client.post("/api/v1/families/", json={"name": "Seyir Ailesi"}, headers=host_h)
    assert fam.status_code == 201, fam.text
    family = fam.json()
    host_h["x-family-id"] = family["id"]

    guest_h, guest_id = _register(client, "Guest WP")
    joined = client.post(
        "/api/v1/families/join",
        json={"invite_code": family["invite_code"], "nickname": "Misafir"},
        headers=guest_h,
    )
    assert joined.status_code == 200, joined.text
    guest_h["x-family-id"] = family["id"]
    return host_h, host_id, guest_h, guest_id, family


def _create_room(client, headers, title="Film Gecesi", video_url=None):
    body = {"title": title}
    if video_url:
        body["video_url"] = video_url
    res = client.post("/api/v1/watch-party/rooms", json=body, headers=headers)
    assert res.status_code == 201, res.text
    return res.json()


VIDEO = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"


def test_youtube_url_parser_accepts_common_formats():
    expected = "dQw4w9WgXcQ"
    urls = [
        "dQw4w9WgXcQ",
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=90",
        "https://youtu.be/dQw4w9WgXcQ",
        "https://youtu.be/dQw4w9WgXcQ?t=12",
        "https://www.youtube.com/embed/dQw4w9WgXcQ",
        "https://www.youtube.com/shorts/dQw4w9WgXcQ",
        "https://m.youtube.com/watch?v=dQw4w9WgXcQ",
        "https://www.youtube.com/live/dQw4w9WgXcQ",
        "youtube.com/watch?v=dQw4w9WgXcQ",
    ]
    for url in urls:
        assert extract_youtube_video_id(url) == expected, url
    assert parse_start_ms("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=90") == 90_000
    assert parse_start_ms("https://youtu.be/dQw4w9WgXcQ?t=1h2m3s") == ((1 * 3600) + (2 * 60) + 3) * 1000
    assert extract_youtube_video_id("https://example.com/watch?v=dQw4w9WgXcQ") is None
    assert extract_youtube_video_id("https://www.youtube.com/watch?v=short") is None
    assert extract_youtube_video_id("") is None


def test_create_room_set_video_and_reject_bad_urls(client):
    host_h, _, _, _, _ = _family_with_two(client)
    room = _create_room(client, host_h)
    assert room["status"] == "open"
    assert room["is_host"] is True
    assert room["playback_state"] == "idle"
    assert room["is_participant"] is True

    bad = client.post(
        f"/api/v1/watch-party/rooms/{room['room_id']}/video",
        json={"video_url": "https://example.com/not-youtube"},
        headers=host_h,
    )
    assert bad.status_code == 400
    assert "youtube" in bad.json()["detail"].lower()

    ok = client.post(
        f"/api/v1/watch-party/rooms/{room['room_id']}/video",
        json={"video_url": "https://youtu.be/dQw4w9WgXcQ?t=15"},
        headers=host_h,
    )
    assert ok.status_code == 200, ok.text
    body = ok.json()
    assert body["video_id"] == "dQw4w9WgXcQ"
    assert body["provider"] == "youtube"
    assert body["playback_state"] == "paused"
    assert body["position_ms"] == 15_000
    assert body["control_seq"] >= 1


def test_join_sees_live_position_and_controls_sync(client):
    host_h, host_id, guest_h, guest_id, _ = _family_with_two(client)
    room = _create_room(client, host_h, video_url=VIDEO)
    room_id = room["room_id"]

    played = client.post(
        f"/api/v1/watch-party/rooms/{room_id}/control",
        json={"action": "play", "position_ms": 10_000},
        headers=host_h,
    )
    assert played.status_code == 200, played.text
    assert played.json()["playback_state"] == "playing"
    seq1 = played.json()["control_seq"]

    paused = client.post(
        f"/api/v1/watch-party/rooms/{room_id}/control",
        json={"action": "pause", "position_ms": 42_000},
        headers=host_h,
    )
    assert paused.status_code == 200
    assert paused.json()["playback_state"] == "paused"
    assert paused.json()["position_ms"] == 42_000
    assert paused.json()["control_seq"] > seq1

    seek = client.post(
        f"/api/v1/watch-party/rooms/{room_id}/control",
        json={"action": "seek", "position_ms": 90_000},
        headers=host_h,
    )
    assert seek.json()["position_ms"] == 90_000

    client.post(
        f"/api/v1/watch-party/rooms/{room_id}/control",
        json={"action": "play", "position_ms": 5_000},
        headers=host_h,
    )
    time.sleep(0.35)
    joined = client.post(f"/api/v1/watch-party/rooms/{room_id}/join", headers=guest_h)
    assert joined.status_code == 200, joined.text
    assert joined.json()["playback_state"] == "playing"
    assert joined.json()["position_ms"] >= 5_000
    assert joined.json()["is_host"] is False
    assert {p["user_id"] for p in joined.json()["participants"]} >= {host_id, guest_id}

    guest_pause = client.post(
        f"/api/v1/watch-party/rooms/{room_id}/control",
        json={"action": "pause", "position_ms": 8_000},
        headers=guest_h,
    )
    assert guest_pause.status_code == 200
    host_view = client.get(f"/api/v1/watch-party/rooms/{room_id}", headers=host_h).json()
    assert host_view["playback_state"] == "paused"
    assert host_view["position_ms"] == 8_000


def test_concurrent_controls_increment_seq_last_write_wins(client):
    host_h, _, guest_h, _, _ = _family_with_two(client)
    room = _create_room(client, host_h, video_url=VIDEO)
    room_id = room["room_id"]
    client.post(f"/api/v1/watch-party/rooms/{room_id}/join", headers=guest_h)

    a = client.post(
        f"/api/v1/watch-party/rooms/{room_id}/control",
        json={"action": "seek", "position_ms": 1000},
        headers=host_h,
    )
    b = client.post(
        f"/api/v1/watch-party/rooms/{room_id}/control",
        json={"action": "seek", "position_ms": 2000},
        headers=guest_h,
    )
    assert a.status_code == 200 and b.status_code == 200
    final = client.get(f"/api/v1/watch-party/rooms/{room_id}", headers=host_h).json()
    assert final["position_ms"] == 2000
    assert final["control_seq"] >= 2


def test_chat_persists_in_order_and_is_idempotent(client):
    host_h, _, guest_h, _, _ = _family_with_two(client)
    room = _create_room(client, host_h, video_url=VIDEO)
    room_id = room["room_id"]
    client.post(f"/api/v1/watch-party/rooms/{room_id}/join", headers=guest_h)

    first = client.post(
        f"/api/v1/watch-party/rooms/{room_id}/messages",
        json={"body": "Bu sahne efsane", "video_position_ms": 12345, "client_message_id": "c1"},
        headers=host_h,
    )
    assert first.status_code == 201, first.text
    dup = client.post(
        f"/api/v1/watch-party/rooms/{room_id}/messages",
        json={"body": "Bu sahne efsane", "client_message_id": "c1"},
        headers=host_h,
    )
    assert dup.status_code == 201
    assert dup.json()["id"] == first.json()["id"]

    client.post(
        f"/api/v1/watch-party/rooms/{room_id}/messages",
        json={"body": "Dur dur burası", "client_message_id": "c2"},
        headers=guest_h,
    )
    listing = client.get(f"/api/v1/watch-party/rooms/{room_id}/messages", headers=guest_h)
    assert listing.status_code == 200
    bodies = [m["body"] for m in listing.json()]
    assert bodies == ["Bu sahne efsane", "Dur dur burası"]
    assert listing.json()[0]["video_position_ms"] == 12345


def test_host_leave_transfers_to_remaining_member(client):
    host_h, host_id, guest_h, guest_id, _ = _family_with_two(client)
    room = _create_room(client, host_h, video_url=VIDEO)
    room_id = room["room_id"]
    client.post(f"/api/v1/watch-party/rooms/{room_id}/join", headers=guest_h)

    left = client.post(f"/api/v1/watch-party/rooms/{room_id}/leave", headers=host_h)
    assert left.status_code == 200
    guest_view = client.get(f"/api/v1/watch-party/rooms/{room_id}", headers=guest_h).json()
    assert guest_view["host_user_id"] == guest_id
    assert guest_view["is_host"] is True
    assert host_id not in {p["user_id"] for p in guest_view["participants"]}


def test_watch_party_family_isolation(client):
    host_h, _, guest_h, _, family = _family_with_two(client)
    room = _create_room(client, host_h, video_url=VIDEO)
    room_id = room["room_id"]
    client.post(f"/api/v1/watch-party/rooms/{room_id}/join", headers=guest_h)

    outsider_h, _ = _register(client, "Yabanci WP")
    other = client.post("/api/v1/families/", json={"name": "Baska Aile"}, headers=outsider_h)
    outsider_h["x-family-id"] = other.json()["id"]

    assert client.get("/api/v1/watch-party/rooms", headers=outsider_h).json() == []
    assert client.get(f"/api/v1/watch-party/rooms/{room_id}", headers=outsider_h).status_code == 404
    assert client.post(f"/api/v1/watch-party/rooms/{room_id}/join", headers=outsider_h).status_code == 404
    assert (
        client.post(
            f"/api/v1/watch-party/rooms/{room_id}/control",
            json={"action": "play"},
            headers=outsider_h,
        ).status_code
        == 404
    )
    assert (
        client.post(
            f"/api/v1/watch-party/rooms/{room_id}/messages",
            json={"body": "sızma"},
            headers=outsider_h,
        ).status_code
        == 404
    )
    assert client.get(f"/api/v1/watch-party/rooms/{room_id}/messages", headers=outsider_h).status_code == 404

    spoofed = dict(outsider_h)
    spoofed["x-family-id"] = family["id"]
    assert client.get("/api/v1/watch-party/rooms", headers=spoofed).status_code == 403
    assert client.get(f"/api/v1/watch-party/rooms/{room_id}", headers=spoofed).status_code == 403
    assert client.post(f"/api/v1/watch-party/rooms/{room_id}/join", headers=spoofed).status_code == 403
    assert (
        client.post(
            f"/api/v1/watch-party/rooms/{room_id}/control",
            json={"action": "pause"},
            headers=spoofed,
        ).status_code
        == 403
    )
    assert (
        client.post(
            f"/api/v1/watch-party/rooms/{room_id}/heartbeat",
            json={},
            headers=spoofed,
        ).status_code
        == 403
    )


def test_non_member_cannot_control_until_join(client):
    host_h, _, guest_h, _, _ = _family_with_two(client)
    room = _create_room(client, host_h, video_url=VIDEO)
    blocked = client.post(
        f"/api/v1/watch-party/rooms/{room['room_id']}/control",
        json={"action": "play"},
        headers=guest_h,
    )
    assert blocked.status_code == 403
    client.post(f"/api/v1/watch-party/rooms/{room['room_id']}/join", headers=guest_h)
    ok = client.post(
        f"/api/v1/watch-party/rooms/{room['room_id']}/control",
        json={"action": "play", "position_ms": 0},
        headers=guest_h,
    )
    assert ok.status_code == 200


def test_only_host_can_end_room(client):
    host_h, _, guest_h, _, _ = _family_with_two(client)
    room = _create_room(client, host_h, video_url=VIDEO)
    room_id = room["room_id"]
    client.post(f"/api/v1/watch-party/rooms/{room_id}/join", headers=guest_h)
    denied = client.post(f"/api/v1/watch-party/rooms/{room_id}/end", headers=guest_h)
    assert denied.status_code == 403
    ended = client.post(f"/api/v1/watch-party/rooms/{room_id}/end", headers=host_h)
    assert ended.status_code == 200
    assert ended.json()["status"] == "ended"
    listed = client.get("/api/v1/watch-party/rooms", headers=host_h).json()
    assert listed == []
    assert (
        client.post(
            f"/api/v1/watch-party/rooms/{room_id}/join",
            headers=guest_h,
        ).status_code
        == 400
    )
