import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Column,
    String,
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    BigInteger,
    Float,
    Text,
    UniqueConstraint,
    Index
)
from sqlalchemy.orm import relationship
from backend.app.db.session import Base


def generate_uuid() -> str:
    return str(uuid.uuid4())


def get_utc_now() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "profiles"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    full_name = Column(String(100), nullable=False)
    email = Column(String(255), unique=True, index=True, nullable=True)
    phone = Column(String(30), unique=True, index=True, nullable=True)
    hashed_password = Column(String(255), nullable=True)
    avatar_url = Column(Text, nullable=True)
    role = Column(String(20), default="member") # 'admin' or 'member'
    created_at = Column(DateTime(timezone=True), default=get_utc_now)
    updated_at = Column(DateTime(timezone=True), default=get_utc_now, onupdate=get_utc_now)

    # Relationships
    family_memberships = relationship("FamilyMember", back_populates="user", cascade="all, delete-orphan")
    messages = relationship("Message", back_populates="sender", cascade="all, delete-orphan")
    notes = relationship("Note", back_populates="author", cascade="all, delete-orphan")
    reminders = relationship("Reminder", back_populates="creator", cascade="all, delete-orphan")
    created_items = relationship("ShoppingItem", foreign_keys="ShoppingItem.created_by", back_populates="creator")


class Family(Base):
    __tablename__ = "families"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    name = Column(String(100), nullable=False, default="Bizim Aile ❤️")
    invite_code = Column(String(12), unique=True, index=True, nullable=False)
    is_public = Column(Boolean, default=False) # Public vs Private
    created_by = Column(String(36), ForeignKey("profiles.id", ondelete="SET NULL"), nullable=True)
    
    # Cloud Chat & Media Backup Configuration
    cloud_chat_backup_enabled = Column(Boolean, default=False)
    last_chat_backup_at = Column(DateTime(timezone=True), nullable=True)
    chat_backup_size_bytes = Column(BigInteger, default=0)
    chat_backup_message_count = Column(Integer, default=0)
    chat_backup_media_count = Column(Integer, default=0)

    created_at = Column(DateTime(timezone=True), default=get_utc_now)
    updated_at = Column(DateTime(timezone=True), default=get_utc_now, onupdate=get_utc_now)

    # Relationships
    members = relationship("FamilyMember", back_populates="family", cascade="all, delete-orphan", lazy="joined")
    messages = relationship("Message", back_populates="family", cascade="all, delete-orphan")
    media = relationship("Media", back_populates="family", cascade="all, delete-orphan")
    shopping_items = relationship("ShoppingItem", back_populates="family", cascade="all, delete-orphan")
    notes = relationship("Note", back_populates="family", cascade="all, delete-orphan")
    reminders = relationship("Reminder", back_populates="family", cascade="all, delete-orphan")


class FamilyMember(Base):
    __tablename__ = "family_members"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    family_id = Column(String(36), ForeignKey("families.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(String(36), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False)
    nickname = Column(String(50), nullable=True) # e.g. 'Anne', 'Baba', 'Ege'
    role = Column(String(20), default="member") # 'admin' or 'member'
    joined_at = Column(DateTime(timezone=True), default=get_utc_now)

    __table_args__ = (
        UniqueConstraint("family_id", "user_id", name="uq_family_user"),
        Index("idx_family_members_lookup", "family_id", "user_id"),
    )

    # Relationships
    family = relationship("Family", back_populates="members")
    user = relationship("User", back_populates="family_memberships", lazy="joined")


class Message(Base):
    __tablename__ = "messages"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    client_message_id = Column(String(64), nullable=True, index=True)
    family_id = Column(String(36), ForeignKey("families.id", ondelete="CASCADE"), nullable=False, index=True)
    sender_id = Column(String(36), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False)
    content = Column(Text, nullable=True)
    media_url = Column(Text, nullable=True)
    media_thumbnail_url = Column(Text, nullable=True)
    media_type = Column(String(50), nullable=True) # e.g. 'image/jpeg'
    is_edited = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), default=get_utc_now)
    updated_at = Column(DateTime(timezone=True), default=get_utc_now, onupdate=get_utc_now)

    __table_args__ = (
        Index("idx_messages_family_created", "family_id", "created_at"),
    )

    # Relationships
    family = relationship("Family", back_populates="messages")
    sender = relationship("User", back_populates="messages")


class Media(Base):
    __tablename__ = "media"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    family_id = Column(String(36), ForeignKey("families.id", ondelete="CASCADE"), nullable=False, index=True)
    uploader_id = Column(String(36), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False)
    storage_path = Column(Text, nullable=False)
    public_url = Column(Text, nullable=False)
    thumbnail_url = Column(Text, nullable=True)
    file_name = Column(String(255), nullable=True)
    mime_type = Column(String(100), nullable=True)
    file_size = Column(Integer, nullable=True) # in bytes
    caption = Column(Text, nullable=True)
    taken_at = Column(DateTime(timezone=True), default=get_utc_now)
    created_at = Column(DateTime(timezone=True), default=get_utc_now)

    __table_args__ = (
        Index("idx_media_family_date", "family_id", "taken_at"),
    )

    # Relationships
    family = relationship("Family", back_populates="media")


class ShoppingItem(Base):
    __tablename__ = "shopping_items"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    family_id = Column(String(36), ForeignKey("families.id", ondelete="CASCADE"), nullable=False, index=True)
    created_by = Column(String(36), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False)
    completed_by = Column(String(36), ForeignKey("profiles.id", ondelete="SET NULL"), nullable=True)
    title = Column(String(200), nullable=False)
    quantity = Column(String(50), default="1 adet")
    category = Column(String(50), default="Genel") # Market, Manav, Kasap, Eczane, Ev
    is_completed = Column(Boolean, default=False, index=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=get_utc_now)
    updated_at = Column(DateTime(timezone=True), default=get_utc_now, onupdate=get_utc_now)

    __table_args__ = (
        Index("idx_shopping_family_completed", "family_id", "is_completed"),
    )

    # Relationships
    family = relationship("Family", back_populates="shopping_items")
    creator = relationship("User", foreign_keys=[created_by], back_populates="created_items")


class Note(Base):
    __tablename__ = "notes"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    family_id = Column(String(36), ForeignKey("families.id", ondelete="CASCADE"), nullable=False, index=True)
    author_id = Column(String(36), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False)
    title = Column(String(200), nullable=False)
    content = Column(Text, nullable=False)
    is_private = Column(Boolean, default=False) # True = only author can read
    color = Column(String(20), default="amber") # amber, emerald, sky, rose, purple
    created_at = Column(DateTime(timezone=True), default=get_utc_now)
    updated_at = Column(DateTime(timezone=True), default=get_utc_now, onupdate=get_utc_now)

    __table_args__ = (
        Index("idx_notes_family", "family_id"),
    )

    # Relationships
    family = relationship("Family", back_populates="notes")
    author = relationship("User", back_populates="notes")


class Reminder(Base):
    __tablename__ = "reminders"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    family_id = Column(String(36), ForeignKey("families.id", ondelete="CASCADE"), nullable=False, index=True)
    creator_id = Column(String(36), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False)
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    remind_at = Column(DateTime(timezone=True), nullable=False, index=True)
    repeat_interval = Column(String(20), default="none") # none, daily, weekly, monthly
    notify_before_minutes = Column(Integer, default=15)
    is_completed = Column(Boolean, default=False, index=True)
    created_at = Column(DateTime(timezone=True), default=get_utc_now)
    updated_at = Column(DateTime(timezone=True), default=get_utc_now, onupdate=get_utc_now)

    __table_args__ = (
        Index("idx_reminders_family_remind", "family_id", "remind_at"),
    )

    # Relationships
    family = relationship("Family", back_populates="reminders")
    creator = relationship("User", back_populates="reminders")


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    family_id = Column(String(36), ForeignKey("families.id", ondelete="CASCADE"), nullable=False, index=True)
    recipient_id = Column(String(36), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(200), nullable=False)
    body = Column(Text, nullable=False)
    type = Column(String(50), default="general") # chat, reminder, shopping, heart, system
    is_read = Column(Boolean, default=False)
    data = Column(Text, nullable=True) # JSON payload string
    created_at = Column(DateTime(timezone=True), default=get_utc_now)

    __table_args__ = (
        Index("idx_notifications_family_recipient", "family_id", "recipient_id"),
        Index("idx_notifications_created", "created_at"),
    )


class DeviceToken(Base):
    __tablename__ = "device_tokens"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    device_id = Column(String(100), nullable=False)
    platform = Column(String(20), default="android") # android, ios, web
    token = Column(String(500), nullable=False, index=True)
    is_active = Column(Boolean, default=True, index=True)
    created_at = Column(DateTime(timezone=True), default=get_utc_now)
    updated_at = Column(DateTime(timezone=True), default=get_utc_now, onupdate=get_utc_now)

    __table_args__ = (
        Index("idx_device_user_active", "user_id", "is_active"),
        Index("idx_device_token_unique", "user_id", "device_id", unique=True),
    )

    user = relationship("User", backref="device_tokens")


class VerificationCode(Base):
    __tablename__ = "verification_codes"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    email = Column(String(255), nullable=False, index=True)
    code = Column(String(6), nullable=False)
    purpose = Column(String(30), nullable=False) # 'register', 'reset_password'
    expires_at = Column(DateTime(timezone=True), nullable=False)
    is_used = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), default=get_utc_now)

    __table_args__ = (
        Index("idx_verification_email_purpose", "email", "purpose", "is_used"),
    )


class TaskItem(Base):
    __tablename__ = "task_items"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    family_id = Column(String(36), ForeignKey("families.id", ondelete="CASCADE"), nullable=False, index=True)
    created_by = Column(String(36), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False)
    assigned_to = Column(String(36), ForeignKey("profiles.id", ondelete="SET NULL"), nullable=True)
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    priority = Column(String(20), default="normal") # 'normal' or 'urgent'
    is_completed = Column(Boolean, default=False, index=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    completed_by = Column(String(36), ForeignKey("profiles.id", ondelete="SET NULL"), nullable=True)
    due_date = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=get_utc_now)
    updated_at = Column(DateTime(timezone=True), default=get_utc_now, onupdate=get_utc_now)

    __table_args__ = (
        Index("idx_tasks_family_completed", "family_id", "is_completed"),
    )

    # Relationships
    family = relationship("Family", backref="task_items")
    creator = relationship("User", foreign_keys=[created_by])
    assignee = relationship("User", foreign_keys=[assigned_to])
    completer = relationship("User", foreign_keys=[completed_by])


class BudgetItem(Base):
    __tablename__ = "budget_items"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    family_id = Column(String(36), ForeignKey("families.id", ondelete="CASCADE"), nullable=False, index=True)
    created_by = Column(String(36), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False)
    type = Column(String(20), nullable=False) # 'expense' or 'income'
    amount = Column(Float, nullable=False)
    category = Column(String(50), default="Diğer") # Market & Mutfak, Faturalar, vb.
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    transaction_date = Column(DateTime(timezone=True), default=get_utc_now, index=True)
    created_at = Column(DateTime(timezone=True), default=get_utc_now)
    updated_at = Column(DateTime(timezone=True), default=get_utc_now, onupdate=get_utc_now)

    __table_args__ = (
        Index("idx_budget_family_date", "family_id", "transaction_date"),
    )

    family = relationship("Family", backref="budget_items")
    creator = relationship("User", foreign_keys=[created_by])


class Poll(Base):
    __tablename__ = "polls"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    message_id = Column(String(36), ForeignKey("messages.id", ondelete="CASCADE"), nullable=True, index=True)
    family_id = Column(String(36), ForeignKey("families.id", ondelete="CASCADE"), nullable=False, index=True)
    creator_id = Column(String(36), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False)
    question = Column(String(300), nullable=False)
    options = Column(Text, nullable=False) # JSON encoded list of strings
    duration_hours = Column(Integer, default=12)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    is_closed = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), default=get_utc_now)

    __table_args__ = (
        Index("idx_polls_family_created", "family_id", "created_at"),
    )

    family = relationship("Family", backref="polls")
    creator = relationship("User", foreign_keys=[creator_id])
    votes = relationship("PollVote", back_populates="poll", cascade="all, delete-orphan")


class PollVote(Base):
    __tablename__ = "poll_votes"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    poll_id = Column(String(36), ForeignKey("polls.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(String(36), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False)
    option_index = Column(Integer, nullable=False)
    created_at = Column(DateTime(timezone=True), default=get_utc_now)

    __table_args__ = (
        UniqueConstraint("poll_id", "user_id", name="uq_poll_user_vote"),
        Index("idx_poll_votes_poll_user", "poll_id", "user_id"),
    )

    poll = relationship("Poll", back_populates="votes")
    user = relationship("User", foreign_keys=[user_id])


class StorageObject(Base):
    __tablename__ = "storage_objects"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    family_id = Column(String(36), ForeignKey("families.id", ondelete="CASCADE"), nullable=False, index=True)
    message_id = Column(String(36), ForeignKey("messages.id", ondelete="SET NULL"), nullable=True, index=True)
    user_id = Column(String(36), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    storage_path = Column(Text, nullable=False, index=True)
    public_url = Column(Text, nullable=False)
    category = Column(String(20), nullable=False, index=True) # 'CHAT', 'IMAGE', 'AUDIO', 'VIDEO', 'DOCUMENT', 'OTHER'
    file_size = Column(BigInteger, nullable=False, default=0) # Size in bytes
    mime_type = Column(String(100), nullable=True)
    checksum = Column(String(64), nullable=True, index=True) # SHA256 hash
    status = Column(String(30), default="backed_up", index=True) # 'pending', 'backed_up', 'marked_for_deletion', 'deleted'
    is_protected = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), default=get_utc_now)
    backed_up_at = Column(DateTime(timezone=True), default=get_utc_now, index=True)
    deleted_at = Column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        Index("idx_storage_family_category_status", "family_id", "category", "status"),
        Index("idx_storage_retention_order", "category", "status", "backed_up_at"),
        Index("idx_storage_family_backed_up", "family_id", "backed_up_at"),
        Index("idx_storage_checksum", "family_id", "checksum"),
    )

    family = relationship("Family", backref="storage_objects")
    user = relationship("User", foreign_keys=[user_id])
    message = relationship("Message", foreign_keys=[message_id])


class StorageCleanupJob(Base):
    __tablename__ = "storage_cleanup_jobs"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    family_id = Column(String(36), ForeignKey("families.id", ondelete="CASCADE"), nullable=True, index=True)
    category = Column(String(20), nullable=False) # 'CHAT', 'IMAGE', 'AUDIO', 'GLOBAL'
    trigger_reason = Column(String(100), nullable=False) # 'preflight_incoming_backup', 'manual_cleanup', 'reconciliation'
    required_bytes = Column(BigInteger, default=0)
    freed_bytes = Column(BigInteger, default=0)
    deleted_messages_count = Column(Integer, default=0)
    deleted_storage_objects_count = Column(Integer, default=0)
    status = Column(String(30), default="completed") # 'in_progress', 'completed', 'failed'
    error_message = Column(Text, nullable=True)
    started_at = Column(DateTime(timezone=True), default=get_utc_now)
    completed_at = Column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        Index("idx_cleanup_family_created", "family_id", "started_at"),
    )

    family = relationship("Family", backref="cleanup_jobs")


class DrawingGame(Base):
    """Aile içi 'Çiz ve Tahmin Et' oyununun tur durumu."""
    __tablename__ = "drawing_games"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    family_id = Column(String(36), ForeignKey("families.id", ondelete="CASCADE"), nullable=False, index=True)
    created_by = Column(String(36), ForeignKey("profiles.id", ondelete="SET NULL"), nullable=True)
    status = Column(String(20), default="lobby", index=True)  # 'lobby', 'drawing', 'round_end', 'finished'
    round_number = Column(Integer, default=0)
    drawer_user_id = Column(String(36), ForeignKey("profiles.id", ondelete="SET NULL"), nullable=True)

    # Aktif turun kelimesi. ASLA çizen dışındaki oyunculara serialize edilmez.
    current_word = Column(String(80), nullable=True)
    word_category = Column(String(40), nullable=True)

    round_started_at = Column(DateTime(timezone=True), nullable=True)
    round_ends_at = Column(DateTime(timezone=True), nullable=True)
    solved_by_user_id = Column(String(36), ForeignKey("profiles.id", ondelete="SET NULL"), nullable=True)
    solved_at = Column(DateTime(timezone=True), nullable=True)

    # Çizim olaylarının sırası ve yeniden bağlanma sonrası fark alma için sayaç
    stroke_seq = Column(Integer, default=0)
    # İstemcinin eski heartbeat/state yanıtını yeni skorun üzerine yazmasını engeller
    revision = Column(Integer, default=0, nullable=False)

    created_at = Column(DateTime(timezone=True), default=get_utc_now)
    updated_at = Column(DateTime(timezone=True), default=get_utc_now, onupdate=get_utc_now)

    __table_args__ = (
        Index("idx_drawing_games_family_status", "family_id", "status"),
    )

    family = relationship("Family", backref="drawing_games")
    drawer = relationship("User", foreign_keys=[drawer_user_id])
    players = relationship("DrawingGamePlayer", back_populates="game", cascade="all, delete-orphan")


class DrawingGamePlayer(Base):
    __tablename__ = "drawing_game_players"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    game_id = Column(String(36), ForeignKey("drawing_games.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(String(36), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    score = Column(Integer, default=0)
    rounds_drawn = Column(Integer, default=0)
    is_present = Column(Boolean, default=True)
    last_seen_at = Column(DateTime(timezone=True), default=get_utc_now)
    joined_at = Column(DateTime(timezone=True), default=get_utc_now)

    __table_args__ = (
        UniqueConstraint("game_id", "user_id", name="uq_drawing_game_player"),
        Index("idx_drawing_players_game", "game_id", "user_id"),
    )

    game = relationship("DrawingGame", back_populates="players")
    user = relationship("User", foreign_keys=[user_id], lazy="joined")


class DrawingStroke(Base):
    """
    Tamamlanmış çizim olaylarının kalıcı kaydı. Canlı çizim Supabase broadcast
    ile akar; bu tablo sonradan katılan oyuncu, sayfa yenileme ve kopan
    bağlantı sonrası farkı almak (since_seq) için kullanılır.
    """
    __tablename__ = "drawing_strokes"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    game_id = Column(String(36), ForeignKey("drawing_games.id", ondelete="CASCADE"), nullable=False, index=True)
    round_number = Column(Integer, nullable=False, default=0)
    seq = Column(Integer, nullable=False, default=0)
    user_id = Column(String(36), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False)
    kind = Column(String(10), nullable=False, default="stroke")  # 'stroke', 'clear', 'undo'
    payload = Column(Text, nullable=True)  # JSON: {"c": renk, "w": kalınlık, "p": [x,y,...]}
    created_at = Column(DateTime(timezone=True), default=get_utc_now)

    __table_args__ = (
        Index("idx_drawing_strokes_replay", "game_id", "round_number", "seq"),
    )


class DrawingGuess(Base):
    __tablename__ = "drawing_guesses"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    game_id = Column(String(36), ForeignKey("drawing_games.id", ondelete="CASCADE"), nullable=False, index=True)
    round_number = Column(Integer, nullable=False, default=0)
    user_id = Column(String(36), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False)
    text = Column(String(120), nullable=False)
    is_correct = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), default=get_utc_now)

    __table_args__ = (
        Index("idx_drawing_guesses_round", "game_id", "round_number", "created_at"),
    )

    user = relationship("User", foreign_keys=[user_id], lazy="joined")


class DrawingWordHistory(Base):
    """
    Oyuncuya gösterilmiş kelimeler. Yalnızca user_id ile ilişkilidir, böylece
    bir oyuncunun geçmişi başka oyuncuların kelime dağılımını etkilemez.
    `cycle`, havuz tükendiğinde artar; seçim yalnızca güncel döngüye bakar.
    """
    __tablename__ = "drawing_word_history"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    family_id = Column(String(36), ForeignKey("families.id", ondelete="SET NULL"), nullable=True)
    word = Column(String(80), nullable=False)
    cycle = Column(Integer, nullable=False, default=1)
    shown_at = Column(DateTime(timezone=True), default=get_utc_now)

    __table_args__ = (
        Index("idx_drawing_word_history_user_cycle", "user_id", "cycle"),
        Index("idx_drawing_word_history_user_word", "user_id", "word"),
    )


class WatchRoom(Base):
    """
    Aile seyir odası. Oynatma konumu sunucuda çapadır: playing iken
    gerçek konum = position_ms + (şimdi - position_updated_at).
    Video dosyası saklanmaz; yalnızca sağlayıcı kimliği (ör. YouTube id).
    """
    __tablename__ = "watch_rooms"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    family_id = Column(String(36), ForeignKey("families.id", ondelete="CASCADE"), nullable=False, index=True)
    created_by = Column(String(36), ForeignKey("profiles.id", ondelete="SET NULL"), nullable=True)
    host_user_id = Column(String(36), ForeignKey("profiles.id", ondelete="SET NULL"), nullable=True)
    title = Column(String(120), nullable=False, default="Seyir Odası")
    status = Column(String(20), nullable=False, default="open", index=True)  # open | ended

    video_provider = Column(String(30), nullable=True)  # youtube | ...
    video_id = Column(String(40), nullable=True)
    video_url = Column(String(500), nullable=True)
    video_title = Column(String(200), nullable=True)
    duration_ms = Column(Integer, nullable=True)

    playback_state = Column(String(20), nullable=False, default="idle")  # idle | playing | paused | ended
    position_ms = Column(Integer, nullable=False, default=0)
    position_updated_at = Column(DateTime(timezone=True), default=get_utc_now)
    playback_rate = Column(Float, nullable=False, default=1.0)
    control_seq = Column(Integer, nullable=False, default=0)
    last_control_user_id = Column(String(36), ForeignKey("profiles.id", ondelete="SET NULL"), nullable=True)

    created_at = Column(DateTime(timezone=True), default=get_utc_now)
    updated_at = Column(DateTime(timezone=True), default=get_utc_now, onupdate=get_utc_now)

    __table_args__ = (
        Index("idx_watch_rooms_family_status", "family_id", "status"),
    )

    family = relationship("Family", backref="watch_rooms")
    participants = relationship("WatchRoomParticipant", back_populates="room", cascade="all, delete-orphan")
    messages = relationship("WatchRoomMessage", back_populates="room", cascade="all, delete-orphan")


class WatchRoomParticipant(Base):
    __tablename__ = "watch_room_participants"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    room_id = Column(String(36), ForeignKey("watch_rooms.id", ondelete="CASCADE"), nullable=False, index=True)
    family_id = Column(String(36), ForeignKey("families.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(String(36), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    is_present = Column(Boolean, default=True)
    last_seen_at = Column(DateTime(timezone=True), default=get_utc_now)
    joined_at = Column(DateTime(timezone=True), default=get_utc_now)

    __table_args__ = (
        UniqueConstraint("room_id", "user_id", name="uq_watch_room_participant"),
        Index("idx_watch_participants_room", "room_id", "is_present"),
    )

    room = relationship("WatchRoom", back_populates="participants")
    user = relationship("User", foreign_keys=[user_id], lazy="joined")


class WatchRoomMessage(Base):
    """Oda sohbeti. video_position_ms ileride sahne yorumları için saklanır."""
    __tablename__ = "watch_room_messages"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    room_id = Column(String(36), ForeignKey("watch_rooms.id", ondelete="CASCADE"), nullable=False, index=True)
    family_id = Column(String(36), ForeignKey("families.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(String(36), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False)
    body = Column(String(500), nullable=False)
    video_position_ms = Column(Integer, nullable=True)
    client_message_id = Column(String(100), nullable=True)
    created_at = Column(DateTime(timezone=True), default=get_utc_now)

    __table_args__ = (
        Index("idx_watch_messages_room_created", "room_id", "created_at"),
        UniqueConstraint("room_id", "client_message_id", name="uq_watch_message_client_id"),
    )

    room = relationship("WatchRoom", back_populates="messages")
    user = relationship("User", foreign_keys=[user_id], lazy="joined")


class VoiceChannelParticipant(Base):
    """Aile başına tek ses kanalı. Satır = şu anda odada olan üye."""
    __tablename__ = "voice_channel_participants"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    family_id = Column(String(36), ForeignKey("families.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(String(36), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    muted = Column(Boolean, default=False, nullable=False)
    last_heartbeat_at = Column(DateTime(timezone=True), default=get_utc_now, nullable=False)
    joined_at = Column(DateTime(timezone=True), default=get_utc_now, nullable=False)

    __table_args__ = (
        UniqueConstraint("family_id", "user_id", name="uq_voice_channel_participant"),
        Index("idx_voice_channel_family_heartbeat", "family_id", "last_heartbeat_at"),
    )

    user = relationship("User", foreign_keys=[user_id])

