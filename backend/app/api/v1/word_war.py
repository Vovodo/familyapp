"""
Kelime Savaşı API. Oyun durumu sunucu otoritelidir; süre, sıra ve kelime
doğrulaması burada çözülür. İstemciler REST + broadcast ile senkron kalır.
"""
import json
import random
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Set

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.app.api.deps import get_current_family_member, get_current_user
from backend.app.db.session import get_db
from backend.app.models.models import FamilyMember, User, WordWarGame, WordWarPlayer, WordWarWord
from backend.app.services.word_war_words import (
    CATEGORY_LABELS,
    chain_letter,
    pick_category,
    pick_start_word,
    validate_word,
)

router = APIRouter()

MIN_PLAYERS = 2
TOTAL_ROUNDS = 5
DEFAULT_TURN_SECONDS = 8
SPEED_TURN_SECONDS = 5
LAST_CHANCE_SECONDS = 3
COUNTDOWN_SECONDS = 3
ROUND_BREAK_SECONDS = 5
WINNER_RETURN_SECONDS = 10
PRESENCE_TTL_SECONDS = 25
EVENT_CHANCE = 0.32
EVENTS = ("speed", "last_chance", "category", "bomb", "freeze", "reverse", "risky")

SCORE_OK = 10
SCORE_FAST = 5
SCORE_EVENT = 5
SCORE_RISKY_OK = 10
SCORE_INVALID = -5
SCORE_TIMEOUT = -10
SCORE_BOMB = -18
SCORE_RISKY_FAIL = -20

ERROR_MESSAGES = {
    "empty": "Bir kelime yaz.",
    "letters": "Yalnızca Türkçe harf kullan.",
    "short": "Kelime en az 2 harf olmalı.",
    "unknown": "Bu kelime sözlükte yok.",
    "letter": "Kelime istenen harfle başlamıyor.",
    "used": "Bu kelime zaten kullanıldı.",
    "category": "Bu kelime seçilen kategoriye uymuyor.",
}


class WordWarPlayerOut(BaseModel):
    user_id: str
    name: str
    avatar_url: Optional[str] = None
    score: int
    correct_count: int = 0
    miss_count: int = 0
    round_score: int = 0
    last_status: str = "idle"
    is_current: bool = False
    is_online: bool = True


class WordWarLastResult(BaseModel):
    kind: str
    user_id: Optional[str] = None
    name: Optional[str] = None
    word: Optional[str] = None
    delta: int = 0
    reason: Optional[str] = None


class WordWarRoundSummary(BaseModel):
    round_number: int = 0
    scores: List[WordWarPlayerOut] = []
    fastest_user_id: Optional[str] = None
    fastest_name: Optional[str] = None
    correct_count: int = 0
    miss_count: int = 0


class WordWarWinnerStats(BaseModel):
    winner_user_id: Optional[str] = None
    winner_name: Optional[str] = None
    fastest_user_id: Optional[str] = None
    fastest_name: Optional[str] = None
    word_master_user_id: Optional[str] = None
    word_master_name: Optional[str] = None
    risk_taker_user_id: Optional[str] = None
    risk_taker_name: Optional[str] = None


class WordWarStateOut(BaseModel):
    game_id: Optional[str] = None
    status: str
    round_number: int = 0
    total_rounds: int = TOTAL_ROUNDS
    current_player_id: Optional[str] = None
    current_player_name: Optional[str] = None
    is_my_turn: bool = False
    previous_word: Optional[str] = None
    required_letter: Optional[str] = None
    event_type: Optional[str] = None
    event_label: Optional[str] = None
    event_category: Optional[str] = None
    turn_started_at: Optional[datetime] = None
    turn_ends_at: Optional[datetime] = None
    phase_ends_at: Optional[datetime] = None
    seconds_left: Optional[int] = None
    countdown_left: Optional[int] = None
    turn_seconds: int = DEFAULT_TURN_SECONDS
    revision: int = 0
    players: List[WordWarPlayerOut] = []
    last_result: Optional[WordWarLastResult] = None
    round_summary: Optional[WordWarRoundSummary] = None
    winner_stats: Optional[WordWarWinnerStats] = None
    used_count: int = 0
    is_player: bool = False
    min_players: int = MIN_PLAYERS
    family_member_count: int = 0
    online_count: int = 0
    server_now: Optional[datetime] = None


class WordWarAnswerIn(BaseModel):
    word: str = Field(..., min_length=1, max_length=40)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _aware(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def _seconds_until(dt: Optional[datetime]) -> Optional[int]:
    target = _aware(dt)
    if not target:
        return None
    left = (target - _now()).total_seconds()
    if left <= 0:
        return 0
    return max(1, int(left + 0.999))


def _display_name(user: Optional[User], member_nickname: Optional[str] = None) -> str:
    if member_nickname:
        return member_nickname
    if user and user.full_name:
        return user.full_name.split()[0]
    return "Aile Üyesi"


def _avatar_url(user: Optional[User]) -> Optional[str]:
    return user.avatar_url if user and user.avatar_url else None


def _nicknames_for_family(db: Session, family_id: str) -> Dict[str, str]:
    rows = db.query(FamilyMember).filter(FamilyMember.family_id == family_id).all()
    return {row.user_id: row.nickname for row in rows if row.nickname}


def _load_json(raw: Optional[str]) -> Optional[Any]:
    if not raw:
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return None


def _dump_json(payload: Any) -> str:
    return json.dumps(payload, ensure_ascii=False)


def _get_active_game(db: Session, family_id: str) -> Optional[WordWarGame]:
    return (
        db.query(WordWarGame)
        .filter(WordWarGame.family_id == family_id, WordWarGame.status != "finished")
        .order_by(WordWarGame.created_at.desc())
        .first()
    )


def _require_active_game(db: Session, family_id: str) -> WordWarGame:
    game = _get_active_game(db, family_id)
    if not game:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Aktif bir Kelime Savaşı lobisi yok.",
        )
    return game


def _lock_game(db: Session, game: WordWarGame) -> WordWarGame:
    locked = db.query(WordWarGame).filter(WordWarGame.id == game.id).with_for_update().first()
    return locked or game


def _bump_revision(game: WordWarGame) -> None:
    game.revision = (game.revision or 0) + 1
    game.updated_at = _now()


def _touch_player(player: WordWarPlayer) -> None:
    player.is_present = True
    player.last_seen_at = _now()


def _is_online(player: WordWarPlayer, now: Optional[datetime] = None) -> bool:
    if not player.is_present:
        return False
    seen = _aware(player.last_seen_at)
    if not seen:
        return False
    now = now or _now()
    return (now - seen).total_seconds() <= PRESENCE_TTL_SECONDS


def _list_players(db: Session, game_id: str) -> List[WordWarPlayer]:
    return (
        db.query(WordWarPlayer)
        .filter(WordWarPlayer.game_id == game_id)
        .order_by(WordWarPlayer.joined_at.asc())
        .all()
    )


def _online_players(players: List[WordWarPlayer]) -> List[WordWarPlayer]:
    now = _now()
    return [p for p in players if _is_online(p, now)]


def _ensure_player(db: Session, game: WordWarGame, user_id: str) -> WordWarPlayer:
    player = (
        db.query(WordWarPlayer)
        .filter(WordWarPlayer.game_id == game.id, WordWarPlayer.user_id == user_id)
        .first()
    )
    if player:
        _touch_player(player)
        return player
    player = WordWarPlayer(game_id=game.id, user_id=user_id, last_status="idle")
    db.add(player)
    db.flush()
    _touch_player(player)
    return player


def _touch_current_if_present(db: Session, game: WordWarGame, user_id: str) -> None:
    player = (
        db.query(WordWarPlayer)
        .filter(WordWarPlayer.game_id == game.id, WordWarPlayer.user_id == user_id)
        .first()
    )
    if player and player.is_present:
        _touch_player(player)


def _used_words(db: Session, game_id: str) -> Set[str]:
    rows = db.query(WordWarWord.word).filter(WordWarWord.game_id == game_id).all()
    return {row[0] for row in rows if row[0]}


def _rotation(game: WordWarGame) -> List[str]:
    data = _load_json(game.rotation_json)
    if isinstance(data, list):
        return [str(x) for x in data]
    return []


def _set_rotation(game: WordWarGame, user_ids: List[str]) -> None:
    game.rotation_json = _dump_json(user_ids)


def _player_map(players: List[WordWarPlayer]) -> Dict[str, WordWarPlayer]:
    return {p.user_id: p for p in players}


def _event_label(event_type: Optional[str], category: Optional[str] = None) -> Optional[str]:
    labels = {
        "speed": "Hızlandı",
        "last_chance": "Son Şans",
        "category": f"Kategori: {CATEGORY_LABELS.get(category or '', category or '')}".strip(),
        "bomb": "Bomba",
        "freeze": "Donma",
        "reverse": "Tersine",
        "risky": "Riskli Tur",
    }
    if not event_type:
        return None
    return labels.get(event_type, event_type)


def _clear_turn(game: WordWarGame) -> None:
    game.current_player_id = None
    game.event_type = None
    game.event_category = None
    game.turn_started_at = None
    game.turn_ends_at = None
    game.turn_seconds = DEFAULT_TURN_SECONDS


def _reset_match_fields(db: Session, game: WordWarGame, keep_lobby: bool = True) -> None:
    db.query(WordWarWord).filter(WordWarWord.game_id == game.id).delete(synchronize_session=False)
    game.round_number = 0
    game.previous_word = None
    game.required_letter = None
    game.phase_ends_at = None
    game.last_result_json = None
    game.round_summary_json = None
    game.winner_stats_json = None
    game.turn_index = 0
    game.rotation_json = None
    _clear_turn(game)
    if keep_lobby:
        game.status = "lobby"
    for player in _list_players(db, game.id):
        player.score = 0
        player.correct_count = 0
        player.miss_count = 0
        player.fastest_ms = None
        player.longest_word = 0
        player.event_hits = 0
        player.risky_hits = 0
        player.round_score = 0
        player.last_status = "idle"


def _pause_to_lobby(db: Session, game: WordWarGame) -> None:
    game.status = "lobby"
    game.phase_ends_at = None
    _clear_turn(game)


def _deactivate_empty_game(db: Session, game: WordWarGame) -> None:
    db.query(WordWarWord).filter(WordWarWord.game_id == game.id).delete(synchronize_session=False)
    game.status = "finished"
    game.phase_ends_at = None
    _clear_turn(game)


def _apply_delta(player: WordWarPlayer, delta: int) -> None:
    player.score = max(0, (player.score or 0) + delta)
    player.round_score = (player.round_score or 0) + delta


def _set_last_result(
    game: WordWarGame,
    kind: str,
    player: Optional[WordWarPlayer],
    word: Optional[str],
    delta: int,
    reason: Optional[str],
    name: Optional[str],
) -> None:
    game.last_result_json = _dump_json(
        {
            "kind": kind,
            "user_id": player.user_id if player else None,
            "name": name,
            "word": word,
            "delta": delta,
            "reason": reason,
        }
    )


def _pick_event(game: WordWarGame) -> Optional[str]:
    if (game.round_number or 0) < 1:
        return None
    if (game.turn_index or 0) == 0 and (game.round_number or 0) == 1:
        return None
    if game.event_type:
        # Ard arda event olmasın: bir önceki tur event ise şans düşer.
        if random.random() > EVENT_CHANCE * 0.45:
            return None
    elif random.random() > EVENT_CHANCE:
        return None
    return random.choice(EVENTS)


def _arm_turn(game: WordWarGame, player: WordWarPlayer, event_type: Optional[str]) -> None:
    seconds = DEFAULT_TURN_SECONDS
    category = None
    if event_type == "speed":
        seconds = SPEED_TURN_SECONDS
    elif event_type == "last_chance":
        seconds = LAST_CHANCE_SECONDS
    elif event_type == "category":
        category_key, _label = pick_category(game.required_letter)
        category = category_key
    game.event_type = event_type
    game.event_category = category
    game.current_player_id = player.user_id
    game.turn_seconds = seconds
    now = _now()
    game.turn_started_at = now
    game.turn_ends_at = now + timedelta(seconds=seconds)
    game.status = "playing"
    player.last_status = "thinking"


def _next_required(game: WordWarGame, word: str) -> str:
    if game.event_type == "reverse" and word:
        return word[0]
    return chain_letter(word)


def _begin_turn(db: Session, game: WordWarGame, player: WordWarPlayer) -> None:
    for p in _list_players(db, game.id):
        if p.user_id != player.user_id and p.last_status in ("thinking", "critical"):
            p.last_status = "idle"
    event_type = _pick_event(game)
    if event_type == "freeze":
        player.last_status = "frozen"
        _set_last_result(game, "frozen", player, None, 0, "Sıra dondu", None)
        game.event_type = "freeze"
        game.event_category = None
        _advance_after_turn(db, game)
        return
    _arm_turn(game, player, event_type)


def _start_round(db: Session, game: WordWarGame, players: List[WordWarPlayer], increment: bool) -> None:
    online = _online_players(players)
    if len(online) < MIN_PLAYERS:
        _pause_to_lobby(db, game)
        return
    if increment:
        game.round_number = (game.round_number or 0) + 1
    for p in players:
        p.round_score = 0
        if p.last_status != "won":
            p.last_status = "idle"
    order = [p.user_id for p in online]
    start_at = ((game.round_number or 1) - 1) % len(order)
    rotated = order[start_at:] + order[:start_at]
    _set_rotation(game, rotated)
    game.turn_index = 0
    if not game.previous_word:
        used = _used_words(db, game.id)
        start = pick_start_word(used)
        db.add(WordWarWord(game_id=game.id, round_number=game.round_number or 1, word=start))
        game.previous_word = start
        game.required_letter = chain_letter(start)
    first = _player_map(players).get(rotated[0])
    if not first:
        _pause_to_lobby(db, game)
        return
    _begin_turn(db, game, first)


def _finish_round(db: Session, game: WordWarGame, nicknames: Dict[str, str]) -> None:
    players = _list_players(db, game.id)
    users = {u.id: u for u in db.query(User).filter(User.id.in_([p.user_id for p in players])).all()} if players else {}
    fastest = min(
        (p for p in players if p.fastest_ms is not None),
        key=lambda p: p.fastest_ms or 10_000,
        default=None,
    )
    summary = {
        "round_number": game.round_number or 0,
        "fastest_user_id": fastest.user_id if fastest else None,
        "fastest_name": _display_name(users.get(fastest.user_id), nicknames.get(fastest.user_id)) if fastest else None,
        "correct_count": sum(p.correct_count or 0 for p in players),
        "miss_count": sum(p.miss_count or 0 for p in players),
        "scores": [
            {
                "user_id": p.user_id,
                "name": _display_name(users.get(p.user_id), nicknames.get(p.user_id)),
                "score": p.score or 0,
                "round_score": p.round_score or 0,
            }
            for p in sorted(players, key=lambda x: (-(x.round_score or 0), -(x.score or 0)))
        ],
    }
    game.round_summary_json = _dump_json(summary)
    _clear_turn(game)
    if (game.round_number or 0) >= TOTAL_ROUNDS:
        _enter_winner(db, game, players, nicknames, users)
        return
    game.status = "round_end"
    game.phase_ends_at = _now() + timedelta(seconds=ROUND_BREAK_SECONDS)


def _enter_winner(
    db: Session,
    game: WordWarGame,
    players: List[WordWarPlayer],
    nicknames: Dict[str, str],
    users: Dict[str, User],
) -> None:
    ranked = sorted(players, key=lambda p: (-(p.score or 0), -(p.correct_count or 0), p.joined_at or _now()))
    winner = ranked[0] if ranked else None
    fastest = min(
        (p for p in players if p.fastest_ms is not None),
        key=lambda p: p.fastest_ms or 10_000,
        default=None,
    )
    master = max(players, key=lambda p: ((p.longest_word or 0), p.correct_count or 0), default=None)
    risk = max(players, key=lambda p: (p.risky_hits or 0, p.event_hits or 0), default=None)
    if winner:
        winner.last_status = "won"
    stats = {
        "winner_user_id": winner.user_id if winner else None,
        "winner_name": _display_name(users.get(winner.user_id), nicknames.get(winner.user_id)) if winner else None,
        "fastest_user_id": fastest.user_id if fastest else None,
        "fastest_name": _display_name(users.get(fastest.user_id), nicknames.get(fastest.user_id)) if fastest else None,
        "word_master_user_id": master.user_id if master and (master.longest_word or 0) > 0 else None,
        "word_master_name": (
            _display_name(users.get(master.user_id), nicknames.get(master.user_id))
            if master and (master.longest_word or 0) > 0
            else None
        ),
        "risk_taker_user_id": risk.user_id if risk and (risk.risky_hits or 0) > 0 else None,
        "risk_taker_name": (
            _display_name(users.get(risk.user_id), nicknames.get(risk.user_id))
            if risk and (risk.risky_hits or 0) > 0
            else None
        ),
    }
    game.winner_stats_json = _dump_json(stats)
    game.status = "winner"
    game.phase_ends_at = _now() + timedelta(seconds=WINNER_RETURN_SECONDS)
    game.current_player_id = winner.user_id if winner else None


def _advance_after_turn(db: Session, game: WordWarGame) -> None:
    players = _list_players(db, game.id)
    rotation = _rotation(game)
    online_ids = {p.user_id for p in _online_players(players)}
    game.turn_index = (game.turn_index or 0) + 1
    nicknames = _nicknames_for_family(db, game.family_id)

    while game.turn_index < len(rotation):
        nxt_id = rotation[game.turn_index]
        nxt = _player_map(players).get(nxt_id)
        if nxt and nxt_id in online_ids:
            _begin_turn(db, game, nxt)
            return
        game.turn_index += 1

    _finish_round(db, game, nicknames)


def _timeout_current(db: Session, game: WordWarGame) -> None:
    players = _list_players(db, game.id)
    player = _player_map(players).get(game.current_player_id or "")
    if not player:
        _advance_after_turn(db, game)
        return
    if game.event_type == "risky":
        delta = SCORE_RISKY_FAIL
    elif game.event_type == "bomb":
        delta = SCORE_BOMB
    else:
        delta = SCORE_TIMEOUT
    _apply_delta(player, delta)
    player.miss_count = (player.miss_count or 0) + 1
    player.last_status = "miss"
    nick = _nicknames_for_family(db, game.family_id).get(player.user_id)
    user = db.query(User).filter(User.id == player.user_id).first()
    _set_last_result(game, "timeout", player, None, delta, "Süre bitti", _display_name(user, nick))
    _advance_after_turn(db, game)


def _start_match(db: Session, game: WordWarGame) -> None:
    players = _list_players(db, game.id)
    online = _online_players(players)
    if len(online) < MIN_PLAYERS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Oyunu başlatmak için en az {MIN_PLAYERS} oyuncu gerekli.",
        )
    db.query(WordWarWord).filter(WordWarWord.game_id == game.id).delete(synchronize_session=False)
    for p in players:
        p.score = 0
        p.correct_count = 0
        p.miss_count = 0
        p.fastest_ms = None
        p.longest_word = 0
        p.event_hits = 0
        p.risky_hits = 0
        p.round_score = 0
        p.last_status = "idle"
    used: Set[str] = set()
    start = pick_start_word(used)
    game.round_number = 1
    game.previous_word = start
    game.required_letter = chain_letter(start)
    game.status = "countdown"
    game.phase_ends_at = _now() + timedelta(seconds=COUNTDOWN_SECONDS)
    game.winner_stats_json = None
    game.round_summary_json = None
    game.last_result_json = None
    _clear_turn(game)
    db.add(WordWarWord(game_id=game.id, round_number=1, word=start))
    order = [p.user_id for p in online]
    _set_rotation(game, order)
    game.turn_index = 0


def _advance_clocks(db: Session, game: WordWarGame) -> bool:
    """Süreleri işler. True = durum değişti."""
    now = _now()
    changed = False
    status = game.status
    phase = _aware(game.phase_ends_at)
    ends = _aware(game.turn_ends_at)

    if status == "countdown" and phase and now >= phase:
        players = _list_players(db, game.id)
        _start_round(db, game, players, increment=False)
        changed = True
    elif status == "playing" and ends and now >= ends:
        _timeout_current(db, game)
        changed = True
    elif status == "round_end" and phase and now >= phase:
        players = _list_players(db, game.id)
        used = _used_words(db, game.id)
        start = pick_start_word(used)
        db.add(WordWarWord(game_id=game.id, round_number=(game.round_number or 0) + 1, word=start))
        game.previous_word = start
        game.required_letter = chain_letter(start)
        _start_round(db, game, players, increment=True)
        changed = True
    elif status == "winner" and phase and now >= phase:
        _reset_match_fields(db, game, keep_lobby=True)
        changed = True

    if changed:
        _bump_revision(game)
        db.flush()
    return changed


def _prune_presence(db: Session, game: WordWarGame) -> bool:
    now = _now()
    players = _list_players(db, game.id)
    changed = False
    for player in players:
        if player.is_present and not _is_online(player, now):
            player.is_present = False
            changed = True

    online = _online_players(players)
    if not online:
        if game.status != "finished":
            _deactivate_empty_game(db, game)
            _bump_revision(game)
            changed = True
        if changed:
            db.flush()
        return changed

    if game.status in ("countdown", "playing", "round_end") and len(online) < MIN_PLAYERS:
        _pause_to_lobby(db, game)
        _bump_revision(game)
        changed = True
    elif game.status == "playing" and game.current_player_id:
        if not any(p.user_id == game.current_player_id for p in online):
            _advance_after_turn(db, game)
            _bump_revision(game)
            changed = True

    if changed:
        db.flush()
    return changed


def _serialize_state(
    db: Session,
    game: Optional[WordWarGame],
    current_user: User,
    member: FamilyMember,
) -> WordWarStateOut:
    family_member_count = (
        db.query(func.count(FamilyMember.id)).filter(FamilyMember.family_id == member.family_id).scalar() or 0
    )
    if not game:
        return WordWarStateOut(status="none", family_member_count=family_member_count, server_now=_now())

    nicknames = _nicknames_for_family(db, member.family_id)
    all_players = _list_players(db, game.id)
    online = _online_players(all_players)
    online_ids = {p.user_id for p in online}
    users = {}
    if all_players:
        users = {u.id: u for u in db.query(User).filter(User.id.in_([p.user_id for p in all_players])).all()}

    if game.status == "lobby":
        visible = online
    else:
        visible_ids = set(online_ids)
        if game.current_player_id:
            visible_ids.add(game.current_player_id)
        visible = [p for p in all_players if p.user_id in visible_ids or (p.score or 0) > 0]

    current_user_obj = users.get(game.current_player_id or "")
    last_raw = _load_json(game.last_result_json) or {}
    last_result = None
    if last_raw.get("kind"):
        last_result = WordWarLastResult(
            kind=last_raw.get("kind"),
            user_id=last_raw.get("user_id"),
            name=last_raw.get("name"),
            word=last_raw.get("word"),
            delta=int(last_raw.get("delta") or 0),
            reason=last_raw.get("reason"),
        )

    summary_raw = _load_json(game.round_summary_json) or {}
    round_summary = None
    if game.status in ("round_end", "winner") and summary_raw:
        scores = []
        for row in summary_raw.get("scores") or []:
            scores.append(
                WordWarPlayerOut(
                    user_id=row.get("user_id"),
                    name=row.get("name") or "Oyuncu",
                    score=int(row.get("score") or 0),
                    round_score=int(row.get("round_score") or 0),
                )
            )
        round_summary = WordWarRoundSummary(
            round_number=int(summary_raw.get("round_number") or 0),
            scores=scores,
            fastest_user_id=summary_raw.get("fastest_user_id"),
            fastest_name=summary_raw.get("fastest_name"),
            correct_count=int(summary_raw.get("correct_count") or 0),
            miss_count=int(summary_raw.get("miss_count") or 0),
        )

    winner_raw = _load_json(game.winner_stats_json) or {}
    winner_stats = None
    if game.status == "winner" and winner_raw:
        winner_stats = WordWarWinnerStats(**{k: winner_raw.get(k) for k in WordWarWinnerStats.model_fields})

    seconds_left = None
    countdown_left = None
    if game.status == "playing":
        seconds_left = _seconds_until(game.turn_ends_at)
    elif game.status in ("countdown", "round_end", "winner"):
        countdown_left = _seconds_until(game.phase_ends_at)
        seconds_left = countdown_left

    used_count = db.query(func.count(WordWarWord.id)).filter(WordWarWord.game_id == game.id).scalar() or 0

    def status_for(player: WordWarPlayer) -> str:
        if game.status == "playing" and player.user_id == game.current_player_id:
            left = seconds_left if seconds_left is not None else game.turn_seconds
            if left is not None and left <= 3:
                return "critical"
            return "thinking"
        return player.last_status or "idle"

    return WordWarStateOut(
        game_id=game.id,
        status=game.status,
        round_number=game.round_number or 0,
        current_player_id=game.current_player_id,
        current_player_name=_display_name(current_user_obj, nicknames.get(game.current_player_id or ""))
        if game.current_player_id
        else None,
        is_my_turn=bool(game.status == "playing" and game.current_player_id == current_user.id),
        previous_word=game.previous_word,
        required_letter=game.required_letter,
        event_type=game.event_type,
        event_label=_event_label(game.event_type, game.event_category),
        event_category=game.event_category,
        turn_started_at=game.turn_started_at,
        turn_ends_at=game.turn_ends_at,
        phase_ends_at=game.phase_ends_at,
        seconds_left=seconds_left,
        countdown_left=countdown_left,
        turn_seconds=game.turn_seconds or DEFAULT_TURN_SECONDS,
        revision=game.revision or 0,
        players=[
            WordWarPlayerOut(
                user_id=p.user_id,
                name=_display_name(users.get(p.user_id), nicknames.get(p.user_id)),
                avatar_url=_avatar_url(users.get(p.user_id)),
                score=p.score or 0,
                correct_count=p.correct_count or 0,
                miss_count=p.miss_count or 0,
                round_score=p.round_score or 0,
                last_status=status_for(p),
                is_current=bool(game.current_player_id == p.user_id and game.status in ("playing", "countdown")),
                is_online=p.user_id in online_ids,
            )
            for p in sorted(visible, key=lambda x: (-(x.score or 0), x.joined_at or _now()))
        ],
        last_result=last_result,
        round_summary=round_summary,
        winner_stats=winner_stats,
        used_count=int(used_count),
        is_player=any(p.user_id == current_user.id for p in online),
        family_member_count=family_member_count,
        online_count=len(online),
        server_now=_now(),
    )


def _prepare_game(db: Session, family_id: str, user_id: str) -> WordWarGame:
    game = _get_active_game(db, family_id)
    if not game:
        game = WordWarGame(family_id=family_id, created_by=user_id, status="lobby")
        db.add(game)
        db.flush()
    _ensure_player(db, game, user_id)
    _prune_presence(db, game)
    _advance_clocks(db, game)
    return game


@router.get("/word-war/state", response_model=WordWarStateOut)
def get_word_war_state(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    member: FamilyMember = Depends(get_current_family_member),
):
    game = _get_active_game(db, member.family_id)
    if game:
        game = _lock_game(db, game)
        changed = False
        if _prune_presence(db, game):
            changed = True
        if _advance_clocks(db, game):
            changed = True
        if changed:
            db.commit()
            db.refresh(game)
        if game.status == "finished":
            game = None
    return _serialize_state(db, game, current_user, member)


@router.post("/word-war/start", response_model=WordWarStateOut, status_code=status.HTTP_201_CREATED)
def start_word_war(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    member: FamilyMember = Depends(get_current_family_member),
):
    game = _prepare_game(db, member.family_id, current_user.id)
    _bump_revision(game)
    db.commit()
    db.refresh(game)
    return _serialize_state(db, game, current_user, member)


@router.post("/word-war/join", response_model=WordWarStateOut)
def join_word_war(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    member: FamilyMember = Depends(get_current_family_member),
):
    game = _require_active_game(db, member.family_id)
    game = _lock_game(db, game)
    _prune_presence(db, game)
    _ensure_player(db, game, current_user.id)
    _advance_clocks(db, game)
    _bump_revision(game)
    db.commit()
    db.refresh(game)
    return _serialize_state(db, game, current_user, member)


@router.post("/word-war/leave", response_model=WordWarStateOut)
def leave_word_war(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    member: FamilyMember = Depends(get_current_family_member),
):
    game = _get_active_game(db, member.family_id)
    if not game:
        return _serialize_state(db, None, current_user, member)
    game = _lock_game(db, game)
    player = (
        db.query(WordWarPlayer)
        .filter(WordWarPlayer.game_id == game.id, WordWarPlayer.user_id == current_user.id)
        .first()
    )
    if player:
        player.is_present = False
        player.last_seen_at = _now() - timedelta(seconds=PRESENCE_TTL_SECONDS + 5)
    _prune_presence(db, game)
    _advance_clocks(db, game)
    _bump_revision(game)
    db.commit()
    if game.status == "finished":
        game = None
    return _serialize_state(db, game, current_user, member)


@router.post("/word-war/heartbeat", response_model=WordWarStateOut)
def word_war_heartbeat(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    member: FamilyMember = Depends(get_current_family_member),
):
    game = _get_active_game(db, member.family_id)
    if not game:
        return _serialize_state(db, None, current_user, member)
    game = _lock_game(db, game)
    _touch_current_if_present(db, game, current_user.id)
    _prune_presence(db, game)
    _advance_clocks(db, game)
    db.commit()
    db.refresh(game)
    if game.status == "finished":
        game = None
    return _serialize_state(db, game, current_user, member)


@router.post("/word-war/begin", response_model=WordWarStateOut)
def begin_word_war(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    member: FamilyMember = Depends(get_current_family_member),
):
    game = _require_active_game(db, member.family_id)
    game = _lock_game(db, game)
    _touch_current_if_present(db, game, current_user.id)
    _prune_presence(db, game)
    if game.status not in ("lobby", "winner"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Oyun zaten devam ediyor.")
    _start_match(db, game)
    _bump_revision(game)
    db.commit()
    db.refresh(game)
    return _serialize_state(db, game, current_user, member)


@router.post("/word-war/replay", response_model=WordWarStateOut)
def replay_word_war(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    member: FamilyMember = Depends(get_current_family_member),
):
    game = _require_active_game(db, member.family_id)
    game = _lock_game(db, game)
    _ensure_player(db, game, current_user.id)
    _prune_presence(db, game)
    _start_match(db, game)
    _bump_revision(game)
    db.commit()
    db.refresh(game)
    return _serialize_state(db, game, current_user, member)


@router.post("/word-war/answer", response_model=WordWarStateOut)
def answer_word_war(
    payload: WordWarAnswerIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    member: FamilyMember = Depends(get_current_family_member),
):
    game = _require_active_game(db, member.family_id)
    game = _lock_game(db, game)
    _touch_current_if_present(db, game, current_user.id)
    _prune_presence(db, game)
    _advance_clocks(db, game)

    if game.status != "playing":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Şu anda cevap sırası yok.")
    if game.current_player_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Sıra sende değil.")

    ends = _aware(game.turn_ends_at)
    if ends and _now() >= ends:
        _timeout_current(db, game)
        _bump_revision(game)
        db.commit()
        db.refresh(game)
        return _serialize_state(db, game, current_user, member)

    player = (
        db.query(WordWarPlayer)
        .filter(WordWarPlayer.game_id == game.id, WordWarPlayer.user_id == current_user.id)
        .first()
    )
    if not player:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Oyunda değilsin.")

    used = _used_words(db, game.id)
    token, err = validate_word(
        payload.word,
        game.required_letter or "",
        used,
        game.event_category if game.event_type == "category" else None,
    )
    nick = _nicknames_for_family(db, member.family_id).get(current_user.id)
    name = _display_name(current_user, nick)

    if err or not token:
        if game.event_type == "risky":
            delta = SCORE_RISKY_FAIL
        else:
            delta = SCORE_INVALID
        _apply_delta(player, delta)
        player.miss_count = (player.miss_count or 0) + 1
        player.last_status = "miss"
        _set_last_result(game, "invalid", player, payload.word.strip(), delta, ERROR_MESSAGES.get(err or "", "Geçersiz"), name)
        _advance_after_turn(db, game)
        _bump_revision(game)
        db.commit()
        db.refresh(game)
        return _serialize_state(db, game, current_user, member)

    started = _aware(game.turn_started_at) or _now()
    elapsed_ms = max(0, int((_now() - started).total_seconds() * 1000))
    allotted = max(1, game.turn_seconds or DEFAULT_TURN_SECONDS)
    delta = SCORE_OK
    if elapsed_ms <= allotted * 1000 * 0.4:
        delta += SCORE_FAST
    extra_len = max(0, min(8, len(token) - 4))
    delta += extra_len
    if game.event_type:
        delta += SCORE_EVENT
        player.event_hits = (player.event_hits or 0) + 1
    if game.event_type == "risky":
        delta += SCORE_RISKY_OK
        player.risky_hits = (player.risky_hits or 0) + 1

    _apply_delta(player, delta)
    player.correct_count = (player.correct_count or 0) + 1
    player.last_status = "answered"
    if player.fastest_ms is None or elapsed_ms < player.fastest_ms:
        player.fastest_ms = elapsed_ms
    player.longest_word = max(player.longest_word or 0, len(token))

    db.add(WordWarWord(game_id=game.id, round_number=game.round_number or 0, user_id=current_user.id, word=token))
    game.previous_word = token
    game.required_letter = _next_required(game, token)
    _set_last_result(game, "accepted", player, token, delta, None, name)
    _advance_after_turn(db, game)
    _bump_revision(game)
    db.commit()
    db.refresh(game)
    return _serialize_state(db, game, current_user, member)
