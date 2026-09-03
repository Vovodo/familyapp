"""
Aile oyunları API'si. Şu an tek oyun: 'Çiz ve Tahmin Et'.

Gizlilik kuralı: aktif turun kelimesi yalnızca o turda çizen oyuncuya
serialize edilir. Kelime hiçbir zaman realtime broadcast payload'ına konmaz;
tüm istemciler kendi görünümünü bu REST uçlarından alır, böylece tahmin eden
oyuncular kanalı dinleyerek kelimeyi öğrenemez.
"""
import json
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session
from loguru import logger

from backend.app.api.deps import get_current_user, get_current_family_member
from backend.app.db.session import get_db
from backend.app.models.models import (
    DrawingGame,
    DrawingGamePlayer,
    DrawingGuess,
    DrawingStroke,
    DrawingWordHistory,
    FamilyMember,
    User,
)
from backend.app.services.drawing_words import (
    ALL_WORDS,
    POOL_SIZE,
    get_word_category,
    mask_word,
    normalize_guess,
    pick_word_for_user,
)

router = APIRouter()

MIN_PLAYERS = 2
ROUND_SECONDS = 150
MAX_STROKES_PER_ROUND = 4000
MAX_POINTS_PER_STROKE = 1200
GUESS_HISTORY_LIMIT = 60
# Heartbeat gelmezse oyuncu lobiden düşer. Uygulama kaydırılarak kapatıldığında
# JS çalışmasa bile bu süre sonunda oda temizlenir.
PRESENCE_TTL_SECONDS = 25

SCORE_CORRECT_GUESS = 3
SCORE_DRAWER_SOLVED = 2


# ---------------------------------------------------------------- şemalar


class DrawingPlayerOut(BaseModel):
    user_id: str
    name: str
    avatar_url: Optional[str] = None
    score: int
    rounds_drawn: int
    is_drawer: bool
    is_online: bool = True


class DrawingGuessOut(BaseModel):
    id: str
    user_id: str
    name: str
    text: str
    is_correct: bool
    created_at: datetime


class DrawingStrokeOut(BaseModel):
    seq: int
    round_number: int
    user_id: str
    kind: str
    payload: Optional[Dict[str, Any]] = None


class DrawingStateOut(BaseModel):
    game_id: Optional[str] = None
    status: str
    round_number: int
    drawer_user_id: Optional[str] = None
    drawer_name: Optional[str] = None
    is_drawer: bool = False
    # Yalnızca çizen oyuncu için dolu gelir.
    word: Optional[str] = None
    # Tahmin edenler için: harf sayısı görünür, harfler gizli.
    word_masked: Optional[str] = None
    word_length: Optional[int] = None
    word_category: Optional[str] = None
    # Tur bittiğinde herkese açılan kelime.
    revealed_word: Optional[str] = None
    round_started_at: Optional[datetime] = None
    round_ends_at: Optional[datetime] = None
    seconds_left: Optional[int] = None
    solved_by_user_id: Optional[str] = None
    solved_by_name: Optional[str] = None
    stroke_seq: int = 0
    revision: int = 0
    players: List[DrawingPlayerOut] = []
    guesses: List[DrawingGuessOut] = []
    is_player: bool = False
    min_players: int = MIN_PLAYERS
    max_players: Optional[int] = None
    family_member_count: int = 0
    pool_size: int = POOL_SIZE
    my_words_seen: int = 0
    online_count: int = 0


class StrokePayload(BaseModel):
    color: str = Field(default="#111827", max_length=32)
    width: float = Field(default=4, ge=0.5, le=80)
    points: List[int] = Field(default_factory=list)


class StrokeCreate(BaseModel):
    round_number: int
    strokes: List[StrokePayload] = Field(default_factory=list)


class GuessCreate(BaseModel):
    text: str = Field(..., min_length=1, max_length=120)


class StrokesOut(BaseModel):
    game_id: str
    round_number: int
    stroke_seq: int
    strokes: List[DrawingStrokeOut]


# ---------------------------------------------------------------- yardımcılar


def _display_name(user: Optional[User], member_nickname: Optional[str] = None) -> str:
    if member_nickname:
        return member_nickname
    if user and user.full_name:
        return user.full_name.split()[0]
    return "Aile Üyesi"


def _get_active_game(db: Session, family_id: str) -> Optional[DrawingGame]:
    return (
        db.query(DrawingGame)
        .filter(DrawingGame.family_id == family_id, DrawingGame.status != "finished")
        .order_by(DrawingGame.created_at.desc())
        .first()
    )


def _require_active_game(db: Session, family_id: str) -> DrawingGame:
    game = _get_active_game(db, family_id)
    if not game:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Aktif bir oyun bulunamadı. Yeni oyun başlatın.",
        )
    return game


def _nicknames_for_family(db: Session, family_id: str) -> Dict[str, str]:
    rows = db.query(FamilyMember).filter(FamilyMember.family_id == family_id).all()
    return {row.user_id: row.nickname for row in rows if row.nickname}


def _aware(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def _seconds_left(game: DrawingGame) -> Optional[int]:
    if game.status != "drawing" or not game.round_ends_at:
        return None
    ends_at = _aware(game.round_ends_at)
    if not ends_at:
        return None
    return max(0, int((ends_at - datetime.now(timezone.utc)).total_seconds()))


def _is_online(player: DrawingGamePlayer, now: Optional[datetime] = None) -> bool:
    if not player.is_present:
        return False
    seen = _aware(player.last_seen_at)
    if not seen:
        return False
    now = now or datetime.now(timezone.utc)
    return (now - seen).total_seconds() <= PRESENCE_TTL_SECONDS


def _lock_game(db: Session, game: DrawingGame) -> DrawingGame:
    locked = (
        db.query(DrawingGame)
        .filter(DrawingGame.id == game.id)
        .with_for_update()
        .first()
    )
    return locked or game


def _touch_player(player: DrawingGamePlayer) -> None:
    player.is_present = True
    player.last_seen_at = datetime.now(timezone.utc)


def _bump_revision(game: DrawingGame) -> None:
    game.revision = (game.revision or 0) + 1
    game.updated_at = datetime.now(timezone.utc)


def _avatar_url(user: Optional[User]) -> Optional[str]:
    if user and user.avatar_url:
        return user.avatar_url
    return None


def _touch_current_if_present(db: Session, game: DrawingGame, user_id: str) -> None:
    """İstekte bulunan oyuncuyu prune'dan önce canlı tutar; ayrılmışsa yeniden katmaz."""
    player = (
        db.query(DrawingGamePlayer)
        .filter(DrawingGamePlayer.game_id == game.id, DrawingGamePlayer.user_id == user_id)
        .first()
    )
    if player and player.is_present:
        _touch_player(player)


def _list_players(db: Session, game_id: str) -> List[DrawingGamePlayer]:
    return (
        db.query(DrawingGamePlayer)
        .filter(DrawingGamePlayer.game_id == game_id)
        .order_by(DrawingGamePlayer.joined_at.asc())
        .all()
    )


def _online_players(players: List[DrawingGamePlayer]) -> List[DrawingGamePlayer]:
    now = datetime.now(timezone.utc)
    return [p for p in players if _is_online(p, now)]


def _pause_to_lobby(db: Session, game: DrawingGame) -> None:
    db.query(DrawingStroke).filter(DrawingStroke.game_id == game.id).delete(synchronize_session=False)
    game.status = "lobby"
    game.drawer_user_id = None
    game.current_word = None
    game.word_category = None
    game.solved_by_user_id = None
    game.solved_at = None
    game.stroke_seq = 0
    game.round_started_at = None
    game.round_ends_at = None


def _begin_round(db: Session, game: DrawingGame, drawer: DrawingGamePlayer) -> None:
    db.query(DrawingStroke).filter(DrawingStroke.game_id == game.id).delete(synchronize_session=False)
    game.round_number = (game.round_number or 0) + 1
    game.drawer_user_id = drawer.user_id
    game.status = "drawing"
    game.round_started_at = datetime.now(timezone.utc)
    game.round_ends_at = game.round_started_at + timedelta(seconds=ROUND_SECONDS)
    game.solved_by_user_id = None
    game.solved_at = None
    game.stroke_seq = 0
    drawer.rounds_drawn = (drawer.rounds_drawn or 0) + 1
    _assign_word(db, game, drawer.user_id)


def _transfer_draw(
    db: Session, game: DrawingGame, new_drawer: DrawingGamePlayer, increment_round: bool
) -> None:
    db.query(DrawingStroke).filter(DrawingStroke.game_id == game.id).delete(synchronize_session=False)
    if increment_round:
        game.round_number = (game.round_number or 0) + 1
    game.drawer_user_id = new_drawer.user_id
    game.status = "drawing"
    game.round_started_at = datetime.now(timezone.utc)
    game.round_ends_at = game.round_started_at + timedelta(seconds=ROUND_SECONDS)
    game.solved_by_user_id = None
    game.solved_at = None
    game.stroke_seq = 0
    new_drawer.rounds_drawn = (new_drawer.rounds_drawn or 0) + 1
    _assign_word(db, game, new_drawer.user_id)


def _prune_presence(db: Session, game: DrawingGame) -> None:
    """Süresi dolan oyuncuları odadan düşürür; çizen gittiyse turu devreder."""
    now = datetime.now(timezone.utc)
    players = _list_players(db, game.id)
    changed = False
    for player in players:
        if player.is_present and not _is_online(player, now):
            player.is_present = False
            changed = True

    online = _online_players(players)
    if game.status == "drawing" and game.drawer_user_id:
        drawer_online = any(p.user_id == game.drawer_user_id for p in online)
        if not drawer_online:
            others = [p for p in online if p.user_id != game.drawer_user_id]
            if others:
                _transfer_draw(db, game, _pick_next_drawer(others, game.drawer_user_id), increment_round=False)
            else:
                _pause_to_lobby(db, game)
            changed = True

    if game.status in ("lobby", "round_end", "drawing") and not online:
        if game.status != "lobby":
            _pause_to_lobby(db, game)
            changed = True

    if changed:
        db.flush()


def _words_seen_count(db: Session, user_id: str) -> int:
    current_cycle = (
        db.query(func.max(DrawingWordHistory.cycle))
        .filter(DrawingWordHistory.user_id == user_id)
        .scalar()
        or 1
    )
    return (
        db.query(func.count(DrawingWordHistory.id))
        .filter(
            DrawingWordHistory.user_id == user_id,
            DrawingWordHistory.cycle == current_cycle,
        )
        .scalar()
        or 0
    )


def _serialize_state(
    db: Session,
    game: Optional[DrawingGame],
    current_user: User,
    member: FamilyMember,
    include_word_stats: bool = True,
) -> DrawingStateOut:
    family_member_count = (
        db.query(func.count(FamilyMember.id))
        .filter(FamilyMember.family_id == member.family_id)
        .scalar()
        or 0
    )
    words_seen = _words_seen_count(db, current_user.id) if include_word_stats else 0

    if not game:
        return DrawingStateOut(
            status="none",
            round_number=0,
            family_member_count=family_member_count,
            my_words_seen=words_seen,
        )

    nicknames = _nicknames_for_family(db, member.family_id)
    all_players = _list_players(db, game.id)
    online = _online_players(all_players)
    online_ids = {p.user_id for p in online}

    # Lobi: yalnızca odadakiler. Oyun içinde skorları kaybetmemek için
    # puanı olan / çizen / kazanan oyuncular da listede kalır.
    if game.status == "lobby":
        visible_players = online
    else:
        visible_ids = set(online_ids)
        if game.drawer_user_id:
            visible_ids.add(game.drawer_user_id)
        if game.solved_by_user_id:
            visible_ids.add(game.solved_by_user_id)
        visible_players = [
            p for p in all_players
            if p.user_id in visible_ids or (p.score or 0) > 0
        ]

    # Çizen yalnızca odada olan bir oyuncu olabilir; aksi halde isim/araçlar kayar.
    drawer_id = game.drawer_user_id if game.status == "drawing" else None
    if drawer_id and not any(p.user_id == drawer_id for p in online):
        drawer_id = None

    is_drawer = bool(drawer_id and drawer_id == current_user.id)
    drawer_player = next((p for p in online if p.user_id == drawer_id), None)
    drawer_user = drawer_player.user if drawer_player else (
        db.query(User).filter(User.id == drawer_id).first() if drawer_id else None
    )
    solved_by = (
        db.query(User).filter(User.id == game.solved_by_user_id).first()
        if game.solved_by_user_id
        else None
    )

    guesses = (
        db.query(DrawingGuess)
        .filter(DrawingGuess.game_id == game.id, DrawingGuess.round_number == game.round_number)
        .order_by(DrawingGuess.created_at.asc())
        .limit(GUESS_HISTORY_LIMIT)
        .all()
    )

    state = DrawingStateOut(
        game_id=game.id,
        status=game.status,
        round_number=game.round_number or 0,
        drawer_user_id=drawer_id,
        drawer_name=_display_name(
            drawer_user,
            nicknames.get(drawer_id or ""),
        ) if drawer_id else None,
        is_drawer=is_drawer,
        word_category=game.word_category,
        round_started_at=game.round_started_at,
        round_ends_at=game.round_ends_at,
        seconds_left=_seconds_left(game),
        solved_by_user_id=game.solved_by_user_id,
        solved_by_name=_display_name(solved_by, nicknames.get(game.solved_by_user_id or "")) if solved_by else None,
        stroke_seq=game.stroke_seq or 0,
        revision=game.revision or 0,
        is_player=any(p.user_id == current_user.id for p in online),
        family_member_count=family_member_count,
        my_words_seen=words_seen,
        online_count=len(online),
        players=[
            DrawingPlayerOut(
                user_id=p.user_id,
                name=_display_name(p.user, nicknames.get(p.user_id)),
                avatar_url=_avatar_url(p.user),
                score=p.score or 0,
                rounds_drawn=p.rounds_drawn or 0,
                is_drawer=bool(drawer_id) and p.user_id == drawer_id,
                is_online=p.user_id in online_ids,
            )
            for p in sorted(
                visible_players,
                key=lambda p: (-(p.score or 0), p.joined_at or datetime.now(timezone.utc)),
            )
        ],
        guesses=[
            DrawingGuessOut(
                id=g.id,
                user_id=g.user_id,
                name=_display_name(g.user, nicknames.get(g.user_id)),
                text=g.text,
                is_correct=bool(g.is_correct),
                created_at=g.created_at,
            )
            for g in guesses
        ],
    )

    # Kelime gizliliği: aktif turda yalnızca çizen görür.
    if game.current_word:
        if game.status == "drawing":
            if is_drawer:
                state.word = game.current_word
            else:
                state.word_masked = mask_word(game.current_word)
                state.word_length = len(game.current_word.replace(" ", ""))
        elif game.status == "round_end":
            # Tur bitti, kelime artık herkese açık.
            state.revealed_word = game.current_word

    return state


def _assign_word(db: Session, game: DrawingGame, drawer_user_id: str) -> None:
    """Çizen oyuncuya, geçmişine bakarak yeni bir kelime atar ve kaydeder."""
    current_cycle = (
        db.query(func.max(DrawingWordHistory.cycle))
        .filter(DrawingWordHistory.user_id == drawer_user_id)
        .scalar()
        or 1
    )
    shown_rows = (
        db.query(DrawingWordHistory.word)
        .filter(
            DrawingWordHistory.user_id == drawer_user_id,
            DrawingWordHistory.cycle == current_cycle,
        )
        .all()
    )
    shown_words = [row[0] for row in shown_rows]

    recent_rows = (
        db.query(DrawingWordHistory.word)
        .filter(DrawingWordHistory.user_id == drawer_user_id)
        .order_by(DrawingWordHistory.shown_at.desc())
        .limit(20)
        .all()
    )
    recent_words = [row[0] for row in recent_rows]

    word, cycle_reset = pick_word_for_user(shown_words, ALL_WORDS, avoid=recent_words)
    next_cycle = current_cycle + 1 if cycle_reset else current_cycle

    game.current_word = word
    game.word_category = get_word_category(word)

    db.add(
        DrawingWordHistory(
            user_id=drawer_user_id,
            family_id=game.family_id,
            word=word,
            cycle=next_cycle,
        )
    )


def _pick_next_drawer(
    players: List[DrawingGamePlayer], previous_drawer_id: Optional[str]
) -> DrawingGamePlayer:
    """En az çizmiş oyuncuyu seçer; mümkünse önceki çizeni tekrar seçmez."""
    candidates = [p for p in players if p.user_id != previous_drawer_id] or players
    return sorted(
        candidates,
        key=lambda p: ((p.rounds_drawn or 0), p.joined_at or datetime.now(timezone.utc)),
    )[0]


def _ensure_player(db: Session, game: DrawingGame, user_id: str) -> DrawingGamePlayer:
    player = (
        db.query(DrawingGamePlayer)
        .filter(DrawingGamePlayer.game_id == game.id, DrawingGamePlayer.user_id == user_id)
        .first()
    )
    if not player:
        player = DrawingGamePlayer(
            game_id=game.id,
            user_id=user_id,
            score=0,
            rounds_drawn=0,
            is_present=True,
            last_seen_at=datetime.now(timezone.utc),
        )
        db.add(player)
        db.flush()
    else:
        _touch_player(player)
    return player


# ---------------------------------------------------------------- uçlar


@router.get("/drawing/state", response_model=DrawingStateOut)
def get_drawing_state(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    member: FamilyMember = Depends(get_current_family_member),
):
    """
    Ailenin aktif oyun durumunu döndürür. Sayfa yenilendiğinde veya bağlantı
    koptuktan sonra istemcinin toparlanma kaynağı budur.
    """
    game = _get_active_game(db, member.family_id)
    if game and game.status == "finished":
        game = None
    return _serialize_state(db, game, current_user, member)


@router.post("/drawing/start", response_model=DrawingStateOut, status_code=status.HTTP_201_CREATED)
def start_drawing_game(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    member: FamilyMember = Depends(get_current_family_member),
):
    """
    Aile için yeni bir oyun lobisi açar. Aynı ailede zaten aktif bir oyun
    varsa onu döndürür, ikinci bir paralel oyun oluşturmaz.
    """
    game = _get_active_game(db, member.family_id)
    if not game:
        game = DrawingGame(
            family_id=member.family_id,
            created_by=current_user.id,
            status="lobby",
            round_number=0,
            stroke_seq=0,
        )
        db.add(game)
        db.flush()
        logger.info(f"Çizim oyunu başlatıldı: aile {member.family_id}, kuran {current_user.id}")

    _ensure_player(db, game, current_user.id)
    _prune_presence(db, game)
    _bump_revision(game)
    db.commit()
    db.refresh(game)
    return _serialize_state(db, game, current_user, member, include_word_stats=False)


@router.post("/drawing/join", response_model=DrawingStateOut)
def join_drawing_game(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    member: FamilyMember = Depends(get_current_family_member),
):
    """Aktif oyuna oyuncu olarak katılır. Üst sınır yoktur."""
    game = _require_active_game(db, member.family_id)
    _prune_presence(db, game)
    _ensure_player(db, game, current_user.id)
    _bump_revision(game)
    db.commit()
    db.refresh(game)
    return _serialize_state(db, game, current_user, member, include_word_stats=False)


@router.post("/drawing/heartbeat", response_model=DrawingStateOut)
def drawing_heartbeat(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    member: FamilyMember = Depends(get_current_family_member),
):
    """Oyuncu odada olduğunu bildirir. Gelmezse PRESENCE_TTL sonra düşer."""
    game = _get_active_game(db, member.family_id)
    if not game:
        return _serialize_state(db, None, current_user, member)
    _touch_current_if_present(db, game, current_user.id)
    _prune_presence(db, game)
    db.commit()
    db.refresh(game)
    return _serialize_state(db, game, current_user, member, include_word_stats=False)


@router.post("/drawing/leave", response_model=DrawingStateOut)
def leave_drawing_game(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    member: FamilyMember = Depends(get_current_family_member),
):
    """Lobiden / oyundan ayrılır. Çizen ayrılırsa tur diğerine devredilir."""
    game = _get_active_game(db, member.family_id)
    if not game:
        return _serialize_state(db, None, current_user, member)

    game = _lock_game(db, game)
    player = (
        db.query(DrawingGamePlayer)
        .filter(DrawingGamePlayer.game_id == game.id, DrawingGamePlayer.user_id == current_user.id)
        .first()
    )
    if player:
        player.is_present = False

    _prune_presence(db, game)
    remaining = _online_players(_list_players(db, game.id))

    if game.status == "drawing" and game.drawer_user_id == current_user.id:
        others = [p for p in remaining if p.user_id != current_user.id]
        if others:
            _transfer_draw(db, game, _pick_next_drawer(others, current_user.id), increment_round=False)
        else:
            _pause_to_lobby(db, game)
    elif game.status != "lobby" and len(remaining) < MIN_PLAYERS:
        _pause_to_lobby(db, game)

    _bump_revision(game)
    db.commit()
    return _serialize_state(
        db, None if game.status == "finished" else game, current_user, member, include_word_stats=False
    )


@router.post("/drawing/round/next", response_model=DrawingStateOut)
def start_next_round(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    member: FamilyMember = Depends(get_current_family_member),
):
    """
    Yeni tur başlatır: çizen oyuncuyu sırayla belirler ve ona geçmişine
    bakarak yeni bir kelime atar.
    """
    game = _lock_game(db, _require_active_game(db, member.family_id))
    _touch_current_if_present(db, game, current_user.id)
    _prune_presence(db, game)

    # Çift tıklama / iki istemcinin aynı anda tur başlatması: ikinci istek
    # yeni tur açmaz, mevcut çizenin olduğu durumu döner.
    if game.status == "drawing":
        db.commit()
        db.refresh(game)
        return _serialize_state(db, game, current_user, member)

    _ensure_player(db, game, current_user.id)
    db.flush()

    online = _online_players(_list_players(db, game.id))
    if len(online) < MIN_PLAYERS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Oyun için odada en az {MIN_PLAYERS} oyuncu olmalı. Diğer aile üyeleri de katılmalı.",
        )

    drawer = _pick_next_drawer(online, game.drawer_user_id)
    _begin_round(db, game, drawer)
    _bump_revision(game)

    db.commit()
    db.refresh(game)
    logger.info(
        f"Çizim turu {game.round_number} başladı: aile {member.family_id}, çizen {drawer.user_id}"
    )
    return _serialize_state(db, game, current_user, member)


@router.post("/drawing/round/skip-word", response_model=DrawingStateOut)
def skip_current_word(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    member: FamilyMember = Depends(get_current_family_member),
):
    """
    Çizen oyuncu kelimeyi beğenmezse yenisini ister. Atlanan kelime de
    'gösterilmiş' sayılır, böylece hemen tekrar önüne gelmez.
    """
    game = _require_active_game(db, member.family_id)
    if game.drawer_user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Kelimeyi yalnızca çizen oyuncu değiştirebilir.",
        )
    if game.status != "drawing":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Aktif bir tur yok.")

    db.query(DrawingStroke).filter(DrawingStroke.game_id == game.id).delete(synchronize_session=False)
    game.stroke_seq = 0
    _assign_word(db, game, current_user.id)
    _bump_revision(game)
    db.commit()
    db.refresh(game)
    return _serialize_state(db, game, current_user, member)


@router.post("/drawing/pass", response_model=DrawingStateOut)
def pass_drawing_turn(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    member: FamilyMember = Depends(get_current_family_member),
):
    """Çizen turu başka bir oyuncuya devreder; kelime değişir."""
    game = _lock_game(db, _require_active_game(db, member.family_id))
    if game.status != "drawing":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Aktif bir tur yok.")
    if game.drawer_user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Turu yalnızca çizen oyuncu devredebilir.",
        )

    _touch_current_if_present(db, game, current_user.id)
    _prune_presence(db, game)
    others = [
        p for p in _online_players(_list_players(db, game.id)) if p.user_id != current_user.id
    ]
    if not others:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Devretmek için odada başka bir oyuncu olmalı.",
        )

    _transfer_draw(db, game, _pick_next_drawer(others, current_user.id), increment_round=False)
    _bump_revision(game)
    db.commit()
    db.refresh(game)
    return _serialize_state(db, game, current_user, member)


@router.post("/drawing/round/reveal", response_model=DrawingStateOut)
def reveal_round(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    member: FamilyMember = Depends(get_current_family_member),
):
    """Süre dolduğunda turu kimse bulamamış olarak kapatır ve kelimeyi açar."""
    game = _require_active_game(db, member.family_id)
    if game.status != "drawing":
        return _serialize_state(db, game, current_user, member)

    game.status = "round_end"
    game.solved_by_user_id = None
    game.solved_at = None
    _bump_revision(game)
    db.commit()
    db.refresh(game)
    return _serialize_state(db, game, current_user, member)


@router.post("/drawing/finish", response_model=DrawingStateOut)
def finish_drawing_game(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    member: FamilyMember = Depends(get_current_family_member),
):
    """Oyunu bitirir ve çizim kayıtlarını temizler."""
    game = _require_active_game(db, member.family_id)
    db.query(DrawingStroke).filter(DrawingStroke.game_id == game.id).delete(synchronize_session=False)
    game.status = "finished"
    game.current_word = None
    game.drawer_user_id = None
    _bump_revision(game)
    db.commit()
    return _serialize_state(db, None, current_user, member)


@router.post("/drawing/guess", response_model=DrawingStateOut)
def submit_guess(
    payload: GuessCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    member: FamilyMember = Depends(get_current_family_member),
):
    """
    Tahmin gönderir. Doğruluk kontrolü yalnızca sunucuda yapılır; istemciye
    kelime gitmediği için tahmin de istemcide doğrulanamaz.
    """
    game = _lock_game(db, _require_active_game(db, member.family_id))
    if game.status != "drawing":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Şu anda tahmin edilebilecek aktif bir tur yok.",
        )
    if game.drawer_user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Çizen oyuncu tahmin yapamaz.",
        )

    guesser = _ensure_player(db, game, current_user.id)

    text = payload.text.strip()
    is_correct = bool(game.current_word) and normalize_guess(text) == normalize_guess(game.current_word)

    guess = DrawingGuess(
        game_id=game.id,
        round_number=game.round_number or 0,
        user_id=current_user.id,
        text=text,
        is_correct=is_correct,
    )
    db.add(guess)

    if is_correct:
        game.status = "round_end"
        game.solved_by_user_id = current_user.id
        game.solved_at = datetime.now(timezone.utc)
        guesser.score = (guesser.score or 0) + SCORE_CORRECT_GUESS
        if game.drawer_user_id:
            drawer = _ensure_player(db, game, game.drawer_user_id)
            drawer.score = (drawer.score or 0) + SCORE_DRAWER_SOLVED

    _bump_revision(game)
    db.commit()
    db.refresh(game)
    return _serialize_state(db, game, current_user, member, include_word_stats=False)


@router.get("/drawing/strokes", response_model=StrokesOut)
def list_strokes(
    since_seq: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    member: FamilyMember = Depends(get_current_family_member),
):
    """
    Aktif turun çizim olaylarını döndürür. `since_seq` ile yalnızca eksik
    kalan olaylar çekilir: sonradan katılma, sayfa yenileme ve kısa süreli
    bağlantı kopmasından sonra tuvalin toparlanma yolu budur.
    """
    game = _require_active_game(db, member.family_id)

    rows = (
        db.query(DrawingStroke)
        .filter(
            DrawingStroke.game_id == game.id,
            DrawingStroke.round_number == (game.round_number or 0),
            DrawingStroke.seq > since_seq,
        )
        .order_by(DrawingStroke.seq.asc())
        .all()
    )

    strokes: List[DrawingStrokeOut] = []
    for row in rows:
        parsed: Optional[Dict[str, Any]] = None
        if row.payload:
            try:
                parsed = json.loads(row.payload)
            except (ValueError, TypeError):
                parsed = None
        strokes.append(
            DrawingStrokeOut(
                seq=row.seq,
                round_number=row.round_number,
                user_id=row.user_id,
                kind=row.kind,
                payload=parsed,
            )
        )

    return StrokesOut(
        game_id=game.id,
        round_number=game.round_number or 0,
        stroke_seq=game.stroke_seq or 0,
        strokes=strokes,
    )


@router.post("/drawing/strokes", response_model=StrokesOut, status_code=status.HTTP_201_CREATED)
def append_strokes(
    payload: StrokeCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    member: FamilyMember = Depends(get_current_family_member),
):
    """
    Tamamlanmış çizgileri kalıcı hale getirir. Canlı akış broadcast ile
    gittiği için burada yalnızca 'fırça kaldırıldığında' toplu kayıt yapılır.
    """
    game = _require_active_game(db, member.family_id)
    if game.drawer_user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Yalnızca çizen oyuncu tuvale çizebilir.",
        )
    if game.status != "drawing":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Aktif bir tur yok.")
    if payload.round_number != (game.round_number or 0):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Tur değişti, çizim kaydedilmedi.",
        )

    existing_count = (
        db.query(func.count(DrawingStroke.id))
        .filter(DrawingStroke.game_id == game.id, DrawingStroke.round_number == game.round_number)
        .scalar()
        or 0
    )
    if existing_count >= MAX_STROKES_PER_ROUND:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Bu tur için çizim sınırına ulaşıldı. Tuvali temizleyin.",
        )

    seq = game.stroke_seq or 0
    for stroke in payload.strokes:
        points = stroke.points[: MAX_POINTS_PER_STROKE * 2]
        if len(points) < 2:
            continue
        seq += 1
        db.add(
            DrawingStroke(
                game_id=game.id,
                round_number=game.round_number or 0,
                seq=seq,
                user_id=current_user.id,
                kind="stroke",
                payload=json.dumps({"c": stroke.color, "w": stroke.width, "p": points}),
            )
        )

    game.stroke_seq = seq
    db.commit()

    return StrokesOut(
        game_id=game.id,
        round_number=game.round_number or 0,
        stroke_seq=seq,
        strokes=[],
    )


@router.post("/drawing/clear", response_model=StrokesOut)
def clear_canvas(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    member: FamilyMember = Depends(get_current_family_member),
):
    """Çizen oyuncu tuvali siler; kalıcı kayıtlar da temizlenir."""
    game = _require_active_game(db, member.family_id)
    if game.drawer_user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tuvali yalnızca çizen oyuncu temizleyebilir.",
        )

    db.query(DrawingStroke).filter(DrawingStroke.game_id == game.id).delete(synchronize_session=False)
    game.stroke_seq = 0
    db.commit()

    return StrokesOut(
        game_id=game.id,
        round_number=game.round_number or 0,
        stroke_seq=0,
        strokes=[],
    )


@router.get("/drawing/word-pool")
def get_word_pool_info(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    member: FamilyMember = Depends(get_current_family_member),
):
    """Kelime havuzunun boyutu ve oyuncunun güncel döngüde gördüğü kelime sayısı."""
    seen = _words_seen_count(db, current_user.id)
    return {
        "pool_size": POOL_SIZE,
        "words_seen_in_cycle": seen,
        "words_remaining_in_cycle": max(0, POOL_SIZE - seen),
    }
