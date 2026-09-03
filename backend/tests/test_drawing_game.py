"""
'Çiz ve Tahmin Et' oyununun testleri.

Kapsam: en az 2 oyuncu kuralı, kelime gizliliği (çizen görür / tahmin edenler
görmez), tahmin doğrulama, çizim kalıcılığı ve since_seq ile toparlanma,
oyuncu bazlı kelime tekrarı engelleme ve aileler arası izolasyon.
"""
import uuid

from backend.app.services.drawing_words import (
    ALL_WORDS,
    POOL_SIZE,
    mask_word,
    normalize_guess,
    pick_word_for_user,
)


def _register(client, name="Oyuncu"):
    email = f"draw_{uuid.uuid4().hex[:10]}@aile.com"
    res = client.post(
        "/api/v1/auth/register",
        json={"full_name": name, "email": email, "password": "Password123!"},
    )
    assert res.status_code == 201, res.text
    return {"Authorization": f"Bearer {res.json()['access_token']}"}


def _family_with_two_players(client):
    """Aile kurar, ikinci üyeyi davet koduyla ekler, ikisini de oyuna sokar."""
    host = _register(client, "Anne")
    fam = client.post("/api/v1/families/", json={"name": "Oyun Ailesi"}, headers=host)
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

    assert client.post("/api/v1/games/drawing/start", headers=host).status_code == 201
    assert client.post("/api/v1/games/drawing/join", headers=guest).status_code == 200
    return host, guest, family


def _start_round(client, headers):
    res = client.post("/api/v1/games/drawing/round/next", headers=headers)
    assert res.status_code == 200, res.text
    return res.json()


def _state(client, headers):
    res = client.get("/api/v1/games/drawing/state", headers=headers)
    assert res.status_code == 200, res.text
    return res.json()


# ---------------------------------------------------------------- havuz


def test_word_pool_is_large_and_clean():
    assert POOL_SIZE >= 500, f"Havuz en az 500 kelime olmalı, şu an {POOL_SIZE}"
    assert len(set(ALL_WORDS)) == POOL_SIZE, "Havuzda tekrar eden kelime var"
    assert all(w == w.strip() and w for w in ALL_WORDS)


def test_pick_word_never_repeats_until_pool_is_exhausted():
    """Havuz tükenene kadar hiçbir kelime iki kez gelmemeli."""
    shown: list[str] = []
    for _ in range(POOL_SIZE):
        word, cycle_reset = pick_word_for_user(shown, ALL_WORDS)
        assert not cycle_reset
        assert word not in shown, f"'{word}' havuz tükenmeden tekrar geldi"
        shown.append(word)

    assert len(set(shown)) == POOL_SIZE, "Havuzun tamamı tüketilmedi"

    # Havuz bitti: döngü sıfırlanır ve en son görülenler hemen tekrarlanmaz.
    recent = shown[-20:]
    word, cycle_reset = pick_word_for_user(shown, ALL_WORDS, avoid=recent)
    assert cycle_reset is True
    assert word not in recent


def test_mask_and_normalize_helpers():
    assert mask_word("kar tanesi") == "_ _ _   _ _ _ _ _ _"
    assert normalize_guess("  Kar   Tanesi!! ") == "kar tanesi"
    assert normalize_guess("Kedi") == normalize_guess("  kedi ")


# ---------------------------------------------------------------- oyun akışı


def test_round_requires_at_least_two_players(client):
    host = _register(client, "Tek Kişi")
    fam = client.post("/api/v1/families/", json={"name": "Tek Kişilik Aile"}, headers=host)
    host["x-family-id"] = fam.json()["id"]

    assert client.post("/api/v1/games/drawing/start", headers=host).status_code == 201

    res = client.post("/api/v1/games/drawing/round/next", headers=host)
    assert res.status_code == 400
    assert "en az 2 oyuncu" in res.json()["detail"].lower()

    # İkinci oyuncu katıldığında tur başlayabiliyor
    guest = _register(client, "İkinci Kişi")
    invite = client.get("/api/v1/families/me", headers=host).json()["invite_code"]
    client.post("/api/v1/families/join", json={"invite_code": invite}, headers=guest)
    guest["x-family-id"] = host["x-family-id"]
    client.post("/api/v1/games/drawing/join", headers=guest)

    started = _start_round(client, host)
    assert started["status"] == "drawing"
    assert started["round_number"] == 1
    assert len(started["players"]) == 2


def test_drawer_sees_word_and_guessers_never_do(client):
    host, guest, _ = _family_with_two_players(client)
    round_state = _start_round(client, host)

    drawer_id = round_state["drawer_user_id"]
    drawer_headers = host if round_state["is_drawer"] else guest
    guesser_headers = guest if round_state["is_drawer"] else host

    drawer_view = _state(client, drawer_headers)
    assert drawer_view["is_drawer"] is True
    assert drawer_view["word"], "Çizen oyuncu kelimeyi görmeli"
    assert drawer_view["word"] in ALL_WORDS
    assert drawer_view["word_masked"] is None

    guesser_view = _state(client, guesser_headers)
    assert guesser_view["is_drawer"] is False
    assert guesser_view["word"] is None, "Tahmin eden oyuncuya kelime sızdı!"
    assert guesser_view["revealed_word"] is None
    assert guesser_view["word_masked"], "Tahmin eden maskeyi görmeli"
    assert guesser_view["word_length"] == len(drawer_view["word"].replace(" ", ""))
    assert guesser_view["drawer_user_id"] == drawer_id

    # Maske harf sızdırmıyor
    assert set(guesser_view["word_masked"]) <= {"_", " "}


def test_correct_guess_ends_round_reveals_word_and_scores(client):
    host, guest, _ = _family_with_two_players(client)
    round_state = _start_round(client, host)
    drawer_headers = host if round_state["is_drawer"] else guest
    guesser_headers = guest if round_state["is_drawer"] else host

    secret = _state(client, drawer_headers)["word"]

    wrong = client.post(
        "/api/v1/games/drawing/guess", json={"text": "kesinlikle alakasiz"}, headers=guesser_headers
    )
    assert wrong.status_code == 200
    assert wrong.json()["status"] == "drawing", "Yanlış tahmin turu bitirmemeli"
    assert wrong.json()["word"] is None

    correct = client.post(
        "/api/v1/games/drawing/guess", json={"text": f"  {secret.upper()} "}, headers=guesser_headers
    )
    assert correct.status_code == 200, correct.text
    body = correct.json()
    assert body["status"] == "round_end"
    assert body["solved_by_user_id"]
    assert body["revealed_word"] == secret, "Tur bitince kelime herkese açılmalı"

    scores = {p["user_id"]: p["score"] for p in body["players"]}
    assert scores[body["solved_by_user_id"]] == 3
    assert scores[round_state["drawer_user_id"]] == 2

    # Tahmin listesi her iki tahmini de içeriyor ve doğrusu işaretli
    guesses = body["guesses"]
    assert len(guesses) == 2
    assert [g["is_correct"] for g in guesses] == [False, True]


def test_drawer_cannot_guess_own_word(client):
    host, guest, _ = _family_with_two_players(client)
    round_state = _start_round(client, host)
    drawer_headers = host if round_state["is_drawer"] else guest
    secret = _state(client, drawer_headers)["word"]

    res = client.post("/api/v1/games/drawing/guess", json={"text": secret}, headers=drawer_headers)
    assert res.status_code == 403
    assert "çizen" in res.json()["detail"].lower()


def test_next_round_rotates_drawer_and_gives_a_new_word(client):
    host, guest, _ = _family_with_two_players(client)
    first = _start_round(client, host)
    first_drawer = first["drawer_user_id"]
    first_drawer_headers = host if first["is_drawer"] else guest
    first_word = _state(client, first_drawer_headers)["word"]

    client.post("/api/v1/games/drawing/round/reveal", headers=host)
    second = _start_round(client, host)

    assert second["round_number"] == 2
    assert second["drawer_user_id"] != first_drawer, "Çizen sırayla değişmeli"

    second_drawer_headers = guest if first["is_drawer"] else host
    second_word = _state(client, second_drawer_headers)["word"]
    assert second_word, "Yeni çizen kelimesini görmeli"
    assert second_word != first_word


def test_round_in_progress_cannot_be_restarted(client):
    host, guest, _ = _family_with_two_players(client)
    first = _start_round(client, host)
    res = client.post("/api/v1/games/drawing/round/next", headers=guest)
    assert res.status_code == 200
    body = res.json()
    assert body["round_number"] == first["round_number"]
    assert body["drawer_user_id"] == first["drawer_user_id"]
    host_view = _state(client, host)
    guest_view = _state(client, guest)
    assert [host_view["is_drawer"], guest_view["is_drawer"]].count(True) == 1
    assert host_view["drawer_user_id"] == guest_view["drawer_user_id"]


def test_skip_word_marks_word_as_seen_and_clears_canvas(client):
    host, guest, _ = _family_with_two_players(client)
    round_state = _start_round(client, host)
    drawer_headers = host if round_state["is_drawer"] else guest
    guesser_headers = guest if round_state["is_drawer"] else host

    first_word = _state(client, drawer_headers)["word"]

    # Tahmin eden atlayamaz
    assert client.post("/api/v1/games/drawing/round/skip-word", headers=guesser_headers).status_code == 403

    skipped = client.post("/api/v1/games/drawing/round/skip-word", headers=drawer_headers)
    assert skipped.status_code == 200
    assert skipped.json()["word"] != first_word
    assert skipped.json()["stroke_seq"] == 0


# ---------------------------------------------------------------- çizim akışı


def test_strokes_persist_and_since_seq_returns_only_the_delta(client):
    """Sonradan katılan / yenileyen oyuncunun tuvali toparlama yolu."""
    host, guest, _ = _family_with_two_players(client)
    round_state = _start_round(client, host)
    drawer_headers = host if round_state["is_drawer"] else guest
    guesser_headers = guest if round_state["is_drawer"] else host
    round_number = round_state["round_number"]

    first = client.post(
        "/api/v1/games/drawing/strokes",
        json={
            "round_number": round_number,
            "strokes": [
                {"color": "#111827", "width": 4, "points": [100, 100, 200, 250, 300, 400]},
                {"color": "#ef4444", "width": 8, "points": [500, 500, 600, 650]},
            ],
        },
        headers=drawer_headers,
    )
    assert first.status_code == 201, first.text
    assert first.json()["stroke_seq"] == 2

    # Sonradan katılan oyuncu sıfırdan tüm çizimi görebiliyor
    full = client.get("/api/v1/games/drawing/strokes", headers=guesser_headers)
    assert full.status_code == 200
    assert len(full.json()["strokes"]) == 2
    assert full.json()["strokes"][0]["payload"]["p"] == [100, 100, 200, 250, 300, 400]
    assert full.json()["strokes"][1]["payload"]["c"] == "#ef4444"

    # Bağlantı koptu, tek çizgi kaçırıldı
    client.post(
        "/api/v1/games/drawing/strokes",
        json={"round_number": round_number, "strokes": [{"points": [10, 10, 20, 20]}]},
        headers=drawer_headers,
    )

    delta = client.get("/api/v1/games/drawing/strokes?since_seq=2", headers=guesser_headers)
    assert delta.status_code == 200
    assert len(delta.json()["strokes"]) == 1, "Yalnızca eksik olay dönmeli"
    assert delta.json()["strokes"][0]["seq"] == 3
    assert delta.json()["stroke_seq"] == 3


def test_only_drawer_can_draw_or_clear(client):
    host, guest, _ = _family_with_two_players(client)
    round_state = _start_round(client, host)
    drawer_headers = host if round_state["is_drawer"] else guest
    guesser_headers = guest if round_state["is_drawer"] else host

    blocked = client.post(
        "/api/v1/games/drawing/strokes",
        json={"round_number": round_state["round_number"], "strokes": [{"points": [1, 1, 2, 2]}]},
        headers=guesser_headers,
    )
    assert blocked.status_code == 403

    assert client.post("/api/v1/games/drawing/clear", headers=guesser_headers).status_code == 403

    cleared = client.post("/api/v1/games/drawing/clear", headers=drawer_headers)
    assert cleared.status_code == 200
    assert cleared.json()["stroke_seq"] == 0
    assert client.get("/api/v1/games/drawing/strokes", headers=guesser_headers).json()["strokes"] == []


def test_new_round_starts_with_an_empty_canvas(client):
    host, guest, _ = _family_with_two_players(client)
    round_state = _start_round(client, host)
    drawer_headers = host if round_state["is_drawer"] else guest

    client.post(
        "/api/v1/games/drawing/strokes",
        json={"round_number": round_state["round_number"], "strokes": [{"points": [5, 5, 9, 9]}]},
        headers=drawer_headers,
    )
    client.post("/api/v1/games/drawing/round/reveal", headers=host)
    _start_round(client, host)

    fresh = client.get("/api/v1/games/drawing/strokes", headers=host)
    assert fresh.json()["strokes"] == []
    assert fresh.json()["stroke_seq"] == 0


def test_stroke_points_are_capped(client):
    host, guest, _ = _family_with_two_players(client)
    round_state = _start_round(client, host)
    drawer_headers = host if round_state["is_drawer"] else guest

    huge = list(range(10000))
    res = client.post(
        "/api/v1/games/drawing/strokes",
        json={"round_number": round_state["round_number"], "strokes": [{"points": huge}]},
        headers=drawer_headers,
    )
    assert res.status_code == 201
    stored = client.get("/api/v1/games/drawing/strokes", headers=host).json()["strokes"][0]
    assert len(stored["payload"]["p"]) == 2400, "Nokta sayısı sunucuda sınırlanmalı"


# ------------------------------------------------- kelime geçmişi ve izolasyon


def test_word_history_is_per_player_and_does_not_repeat_across_rounds(client):
    """
    Aynı oyuncu üst üste çizdiğinde kelimeler tekrar etmemeli ve iki
    oyuncunun geçmişi birbirine karışmamalı.
    """
    host, guest, _ = _family_with_two_players(client)

    host_words: list[str] = []
    guest_words: list[str] = []

    for _ in range(12):
        state = _start_round(client, host)
        drawer_is_host = state["is_drawer"]
        drawer_headers = host if drawer_is_host else guest
        word = _state(client, drawer_headers)["word"]
        (host_words if drawer_is_host else guest_words).append(word)
        client.post("/api/v1/games/drawing/round/reveal", headers=host)

    assert len(host_words) >= 5 and len(guest_words) >= 5
    assert len(set(host_words)) == len(host_words), f"Aynı oyuncuya kelime tekrarladı: {host_words}"
    assert len(set(guest_words)) == len(guest_words), f"Aynı oyuncuya kelime tekrarladı: {guest_words}"

    # Geçmişler ayrı sayılıyor: her oyuncunun sayacı yalnızca kendi kelimelerini görüyor
    host_pool = client.get("/api/v1/games/drawing/word-pool", headers=host).json()
    guest_pool = client.get("/api/v1/games/drawing/word-pool", headers=guest).json()
    assert host_pool["pool_size"] == POOL_SIZE
    assert host_pool["words_seen_in_cycle"] == len(host_words)
    assert guest_pool["words_seen_in_cycle"] == len(guest_words)
    assert host_pool["words_remaining_in_cycle"] == POOL_SIZE - len(host_words)


def test_another_family_cannot_read_or_touch_the_game(client):
    host, guest, family = _family_with_two_players(client)
    round_state = _start_round(client, host)
    drawer_headers = host if round_state["is_drawer"] else guest
    secret = _state(client, drawer_headers)["word"]

    outsider = _register(client, "Yabancı")
    outsider_fam = client.post(
        "/api/v1/families/", json={"name": "Yabancı Aile"}, headers=outsider
    )
    outsider["x-family-id"] = outsider_fam.json()["id"]

    # Kendi ailesinde oyun yok
    own_view = _state(client, outsider)
    assert own_view["status"] == "none"
    assert own_view["game_id"] is None

    # Başka ailenin x-family-id'si ile 403
    spoofed = dict(outsider)
    spoofed["x-family-id"] = family["id"]
    assert client.get("/api/v1/games/drawing/state", headers=spoofed).status_code == 403
    assert client.get("/api/v1/games/drawing/strokes", headers=spoofed).status_code == 403
    assert (
        client.post("/api/v1/games/drawing/guess", json={"text": secret}, headers=spoofed).status_code
        == 403
    )
    assert client.post("/api/v1/games/drawing/round/next", headers=spoofed).status_code == 403
    assert client.post("/api/v1/games/drawing/heartbeat", headers=spoofed).status_code == 403
    assert client.post("/api/v1/games/drawing/leave", headers=spoofed).status_code == 403
    assert client.post("/api/v1/games/drawing/pass", headers=spoofed).status_code == 403


def test_finish_clears_the_game_state(client):
    host, guest, _ = _family_with_two_players(client)
    _start_round(client, host)

    finished = client.post("/api/v1/games/drawing/finish", headers=host)
    assert finished.status_code == 200
    assert finished.json()["status"] == "none"

    assert _state(client, host)["status"] == "none"
    assert client.get("/api/v1/games/drawing/strokes", headers=host).status_code == 404


def test_leave_removes_player_and_pauses_if_too_few_remain(client):
    host, guest, _ = _family_with_two_players(client)
    round_state = _start_round(client, host)
    guest_view = _state(client, guest)
    assert guest_view["is_player"] is True
    assert len(round_state["players"]) == 2

    left = client.post("/api/v1/games/drawing/leave", headers=guest)
    assert left.status_code == 200
    assert left.json()["is_player"] is False

    host_view = _state(client, host)
    assert len(host_view["players"]) == 1
    assert host_view["status"] == "lobby"
    assert host_view["is_player"] is True

    blocked = client.post("/api/v1/games/drawing/round/next", headers=host)
    assert blocked.status_code == 400


def test_pass_changes_drawer_and_word(client):
    host, guest, _ = _family_with_two_players(client)
    round_state = _start_round(client, host)
    drawer_headers = host if round_state["is_drawer"] else guest
    guesser_headers = guest if round_state["is_drawer"] else host
    first_word = _state(client, drawer_headers)["word"]
    first_drawer = round_state["drawer_user_id"]

    assert client.post("/api/v1/games/drawing/pass", headers=guesser_headers).status_code == 403

    passed = client.post("/api/v1/games/drawing/pass", headers=drawer_headers)
    assert passed.status_code == 200, passed.text
    body = passed.json()
    assert body["status"] == "drawing"
    assert body["drawer_user_id"] != first_drawer
    assert body["round_number"] == round_state["round_number"]

    new_drawer_headers = guest if drawer_headers is host else host
    new_word = _state(client, new_drawer_headers)["word"]
    assert new_word and new_word != first_word
    old_drawer_view = _state(client, drawer_headers)
    assert old_drawer_view["is_drawer"] is False
    assert old_drawer_view["word"] is None


def test_left_player_does_not_reappear_without_join(client):
    host, guest, _ = _family_with_two_players(client)
    client.post("/api/v1/games/drawing/leave", headers=guest)
    host_view = _state(client, host)
    assert len(host_view["players"]) == 1
    guest_view = _state(client, guest)
    assert guest_view["is_player"] is False
    heartbeat = client.post("/api/v1/games/drawing/heartbeat", headers=guest)
    assert heartbeat.status_code == 200
    assert heartbeat.json()["is_player"] is False


def test_more_than_four_players_can_join_lobby(client):
    host, guest, family = _family_with_two_players(client)
    extras = []
    for index in range(4):
        extra = _register(client, f"Oyuncu{index + 3}")
        joined = client.post(
            "/api/v1/families/join",
            json={"invite_code": family["invite_code"], "nickname": f"Oyuncu{index + 3}"},
            headers=extra,
        )
        assert joined.status_code == 200, joined.text
        extra["x-family-id"] = family["id"]
        assert client.post("/api/v1/games/drawing/join", headers=extra).status_code == 200
        extras.append(extra)

    lobby = _state(client, host)
    assert lobby["max_players"] is None
    assert lobby["min_players"] == 2
    assert len(lobby["players"]) == 6


def test_correct_guess_keeps_score_after_later_state_read(client):
    host, guest, _ = _family_with_two_players(client)
    round_state = _start_round(client, host)
    drawer_headers = host if round_state["is_drawer"] else guest
    guesser_headers = guest if round_state["is_drawer"] else host
    secret = _state(client, drawer_headers)["word"]

    before = _state(client, guesser_headers)
    solved = client.post(
        "/api/v1/games/drawing/guess", json={"text": secret}, headers=guesser_headers
    )
    assert solved.status_code == 200, solved.text
    body = solved.json()
    assert body["revision"] > (before.get("revision") or 0)
    assert body["solved_by_user_id"]
    scores = {p["user_id"]: p["score"] for p in body["players"]}
    assert scores[body["solved_by_user_id"]] == 3
    assert scores[round_state["drawer_user_id"]] == 2

    later = _state(client, host)
    later_scores = {p["user_id"]: p["score"] for p in later["players"]}
    assert later_scores[body["solved_by_user_id"]] == 3
    assert later_scores[round_state["drawer_user_id"]] == 2


def test_countdown_left_when_round_starts(client):
    host, guest, _ = _family_with_two_players(client)
    body = _start_round(client, host)
    assert body["status"] == "drawing"
    assert body["countdown_left"] in (2, 3)
    assert body["seconds_left"] == 150


def test_empty_room_deactivates_game_until_new_start(client):
    host, guest, _ = _family_with_two_players(client)
    assert client.post("/api/v1/games/drawing/leave", headers=guest).status_code == 200
    assert _state(client, host)["status"] == "lobby"

    left = client.post("/api/v1/games/drawing/leave", headers=host)
    assert left.status_code == 200
    assert left.json()["status"] == "none"
    assert _state(client, host)["status"] == "none"
    assert _state(client, guest)["status"] == "none"

    restarted = client.post("/api/v1/games/drawing/start", headers=host)
    assert restarted.status_code == 201
    assert restarted.json()["status"] == "lobby"
