"""
Kelime Savaşı: zincir doğrulama, süre sunucuda, izolasyon, lobi kuralları.
"""
import uuid
from datetime import datetime, timedelta, timezone

from backend.app.models.models import WordWarGame
from backend.app.services.word_war_words import (
    DICTIONARY,
    normalize_word,
    starts_with_required,
    turkish_lower,
    validate_word,
)


def _register(client, name="Oyuncu"):
    email = f"war_{uuid.uuid4().hex[:10]}@aile.com"
    res = client.post(
        "/api/v1/auth/register",
        json={"full_name": name, "email": email, "password": "Password123!"},
    )
    assert res.status_code == 201, res.text
    return {"Authorization": f"Bearer {res.json()['access_token']}"}


def _family_with_two(client):
    host = _register(client, "Anne")
    fam = client.post("/api/v1/families/", json={"name": "Kelime Ailesi"}, headers=host)
    assert fam.status_code == 201, fam.text
    family = fam.json()
    host["x-family-id"] = family["id"]

    guest = _register(client, "Baba")
    joined = client.post(
        "/api/v1/families/join",
        json={"invite_code": family["invite_code"], "nickname": "Baba"},
        headers=guest,
    )
    assert joined.status_code == 200, joined.text
    guest["x-family-id"] = family["id"]
    return host, guest, family


def _state(client, headers):
    res = client.get("/api/v1/games/word-war/state", headers=headers)
    assert res.status_code == 200, res.text
    return res.json()


def _open_and_begin(client, host, guest):
    assert client.post("/api/v1/games/word-war/start", headers=host).status_code == 201
    assert client.post("/api/v1/games/word-war/join", headers=guest).status_code == 200
    res = client.post("/api/v1/games/word-war/begin", headers=host)
    assert res.status_code == 200, res.text
    return res.json()


def _skip_countdown(db, family_id):
    game = (
        db.query(WordWarGame)
        .filter(WordWarGame.family_id == family_id, WordWarGame.status != "finished")
        .order_by(WordWarGame.created_at.desc())
        .first()
    )
    assert game is not None
    game.phase_ends_at = datetime.now(timezone.utc) - timedelta(seconds=1)
    db.commit()
    return game


def _pick_word(letter: str, banned: set[str]) -> str:
    for word in sorted(DICTIONARY, key=len):
        if word not in banned and starts_with_required(word, letter):
            return word
    raise AssertionError(f"Sözlükte '{letter}' ile başlayan kelime yok")


def test_turkish_normalize_and_chain_letter():
    assert turkish_lower("IŞIK") == "ışık"
    assert turkish_lower("İnek") == "inek"
    assert normalize_word(" Çilek! ") == "çilek"
    word, err = validate_word("elma", "e", set())
    assert err is None and word == "elma"
    word, err = validate_word("elma", "a", set())
    assert err == "letter"
    word, err = validate_word("elma", "e", {"elma"})
    assert err == "used"
    word, err = validate_word("asdfghjk", "a", set())
    assert err == "unknown"
    word, err = validate_word("İnek", "i", set())
    assert err is None and word == "inek"


def test_start_requires_two_players(client):
    host = _register(client, "Tek")
    fam = client.post("/api/v1/families/", json={"name": "Tekli"}, headers=host).json()
    host["x-family-id"] = fam["id"]
    assert client.post("/api/v1/games/word-war/start", headers=host).status_code == 201
    res = client.post("/api/v1/games/word-war/begin", headers=host)
    assert res.status_code == 400
    assert "2" in res.json()["detail"]


def test_play_valid_word_and_reject_duplicate(client, db):
    host, guest, family = _family_with_two(client)
    _open_and_begin(client, host, guest)
    _skip_countdown(db, family["id"])
    state = _state(client, host)
    assert state["status"] == "playing"
    assert state["required_letter"]
    assert state["previous_word"]

    current_id = state["current_player_id"]
    actor = host if state["is_my_turn"] else guest
    other = guest if actor is host else host
    banned = {state["previous_word"]}
    word = _pick_word(state["required_letter"], banned)
    res = client.post("/api/v1/games/word-war/answer", json={"word": word}, headers=actor)
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["previous_word"] == word
    assert body["last_result"]["kind"] == "accepted"
    assert body["last_result"]["delta"] >= 10

    # Aynı kelime tekrar kullanılamaz.
    if body["status"] == "playing" and body["current_player_id"] != current_id:
        dup = client.post("/api/v1/games/word-war/answer", json={"word": word}, headers=other)
        assert dup.status_code == 200, dup.text
        assert dup.json()["last_result"]["kind"] in ("invalid", "timeout")
        if dup.json()["last_result"]["kind"] == "invalid":
            assert dup.json()["last_result"]["delta"] < 0


def test_timeout_is_server_side(client, db):
    host, guest, family = _family_with_two(client)
    _open_and_begin(client, host, guest)
    _skip_countdown(db, family["id"])
    skipped = _state(client, host)
    assert skipped["status"] == "playing"
    db.expire_all()
    game = (
        db.query(WordWarGame)
        .filter(WordWarGame.family_id == family["id"], WordWarGame.status == "playing")
        .first()
    )
    assert game is not None
    victim_id = game.current_player_id
    game.turn_ends_at = datetime.now(timezone.utc) - timedelta(seconds=1)
    db.commit()

    state = _state(client, host)
    assert state["last_result"]["kind"] == "timeout"
    assert state["last_result"]["user_id"] == victim_id
    victim = next(p for p in state["players"] if p["user_id"] == victim_id)
    assert victim["miss_count"] >= 1


def test_wrong_turn_is_conflict(client, db):
    host, guest, family = _family_with_two(client)
    _open_and_begin(client, host, guest)
    _skip_countdown(db, family["id"])
    state = _state(client, host)
    waiter = guest if state["is_my_turn"] else host
    res = client.post("/api/v1/games/word-war/answer", json={"word": "elma"}, headers=waiter)
    assert res.status_code == 409


def test_isolation_foreign_family_cannot_see_word_war(client):
    host, guest, family = _family_with_two(client)
    assert client.post("/api/v1/games/word-war/start", headers=host).status_code == 201

    outsider = _register(client, "Yabancı")
    other = client.post("/api/v1/families/", json={"name": "Başka"}, headers=outsider).json()
    outsider["x-family-id"] = other["id"]
    spoofed = dict(outsider)
    spoofed["x-family-id"] = family["id"]
    assert client.get("/api/v1/games/word-war/state", headers=spoofed).status_code == 403
    assert client.post("/api/v1/games/word-war/join", headers=spoofed).status_code == 403
    assert client.post("/api/v1/games/word-war/answer", json={"word": "elma"}, headers=spoofed).status_code == 403
    mine = _state(client, outsider)
    assert mine["status"] in ("none", "lobby")
    assert mine.get("game_id") in (None, )
    host_state = _state(client, host)
    assert host_state["game_id"]
    assert host_state["online_count"] >= 1
