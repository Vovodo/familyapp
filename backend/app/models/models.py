import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Column,
    String,
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
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
    created_by = Column(String(36), ForeignKey("profiles.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=get_utc_now)
    updated_at = Column(DateTime(timezone=True), default=get_utc_now, onupdate=get_utc_now)

    # Relationships
    members = relationship("FamilyMember", back_populates="family", cascade="all, delete-orphan")
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
    user = relationship("User", back_populates="family_memberships")


class Message(Base):
    __tablename__ = "messages"

    id = Column(String(36), primary_key=True, default=generate_uuid)
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
    family_id = Column(String(36), ForeignKey("families.id", ondelete="CASCADE"), nullable=False)
    recipient_id = Column(String(36), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(200), nullable=False)
    body = Column(Text, nullable=False)
    type = Column(String(50), default="general") # chat, reminder, shopping, system
    is_read = Column(Boolean, default=False)
    data = Column(Text, nullable=True) # JSON payload string
    created_at = Column(DateTime(timezone=True), default=get_utc_now)
