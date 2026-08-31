from datetime import datetime
from typing import Optional, List, Any
from pydantic import BaseModel, EmailStr, ConfigDict, field_validator


# --- Auth & User Schemas ---
class UserBase(BaseModel):
    full_name: str
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    avatar_url: Optional[str] = None

    @field_validator('email', 'phone', 'avatar_url', mode='before')
    @classmethod
    def empty_str_to_none(cls, v):
        if isinstance(v, str) and not v.strip():
            return None
        return v


class UserCreate(UserBase):
    password: str
    nickname: Optional[str] = None

    @field_validator('nickname', mode='before')
    @classmethod
    def empty_nickname_to_none(cls, v):
        if isinstance(v, str) and not v.strip():
            return None
        return v


class UserLogin(BaseModel):
    email_or_phone: str
    password: str


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None
    avatar_url: Optional[str] = None
    nickname: Optional[str] = None

    @field_validator('full_name', 'phone', 'avatar_url', 'nickname', mode='before')
    @classmethod
    def empty_str_to_none(cls, v):
        if isinstance(v, str) and not v.strip():
            return None
        return v


class UserResponse(UserBase):
    id: str
    role: str
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class TokenPayload(BaseModel):
    sub: Optional[str] = None
    exp: Optional[int] = None


# --- Family & Member Schemas ---
class FamilyBase(BaseModel):
    name: str = "Bizim Aile ❤️"


class FamilyCreate(FamilyBase):
    pass


class FamilyJoin(BaseModel):
    invite_code: str
    nickname: Optional[str] = None


class FamilyMemberResponse(BaseModel):
    id: str
    family_id: str
    user_id: str
    nickname: Optional[str] = None
    role: str
    joined_at: datetime
    user: Optional[UserResponse] = None
    model_config = ConfigDict(from_attributes=True)


class FamilyResponse(FamilyBase):
    id: str
    invite_code: str
    created_by: Optional[str]
    created_at: datetime
    members: List[FamilyMemberResponse] = []
    model_config = ConfigDict(from_attributes=True)


# --- Message & Chat Schemas ---
class MessageBase(BaseModel):
    content: Optional[str] = None
    media_url: Optional[str] = None
    media_thumbnail_url: Optional[str] = None
    media_type: Optional[str] = None
    client_message_id: Optional[str] = None


class MessageCreate(MessageBase):
    pass


class MessageUpdate(BaseModel):
    content: str


class MessageResponse(MessageBase):
    id: str
    family_id: str
    sender_id: str
    is_edited: bool
    created_at: datetime
    sender_name: Optional[str] = None
    sender_avatar: Optional[str] = None
    sender_nickname: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)


# --- Media & Gallery Schemas ---
class MediaBase(BaseModel):
    caption: Optional[str] = None


class MediaResponse(MediaBase):
    id: str
    family_id: str
    uploader_id: str
    storage_path: str
    public_url: str
    thumbnail_url: Optional[str] = None
    file_name: Optional[str] = None
    mime_type: Optional[str] = None
    file_size: Optional[int] = None
    taken_at: datetime
    created_at: datetime
    uploader_name: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)


# --- Shopping List Schemas ---
class ShoppingItemBase(BaseModel):
    title: str
    quantity: str = "1 adet"
    category: str = "Genel"


class ShoppingItemCreate(ShoppingItemBase):
    pass


class ShoppingItemUpdate(BaseModel):
    title: Optional[str] = None
    quantity: Optional[str] = None
    category: Optional[str] = None
    is_completed: Optional[bool] = None


class ShoppingItemResponse(ShoppingItemBase):
    id: str
    family_id: str
    created_by: str
    completed_by: Optional[str] = None
    is_completed: bool
    completed_at: Optional[datetime] = None
    created_at: datetime
    creator_name: Optional[str] = None
    completed_by_name: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)


# --- Notes Schemas ---
class NoteBase(BaseModel):
    title: str
    content: str
    is_private: bool = False
    color: str = "amber"


class NoteCreate(NoteBase):
    pass


class NoteUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    is_private: Optional[bool] = None
    color: Optional[str] = None


class NoteResponse(NoteBase):
    id: str
    family_id: str
    author_id: str
    author_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


# --- Reminders Schemas ---
class ReminderBase(BaseModel):
    title: str
    description: Optional[str] = None
    remind_at: datetime
    repeat_interval: str = "none"
    notify_before_minutes: int = 15


class ReminderCreate(ReminderBase):
    pass


class ReminderUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    remind_at: Optional[datetime] = None
    repeat_interval: Optional[str] = None
    notify_before_minutes: Optional[int] = None
    is_completed: Optional[bool] = None


class ReminderResponse(ReminderBase):
    id: str
    family_id: str
    creator_id: str
    is_completed: bool
    created_at: datetime
    creator_name: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)


# --- Notifications Schemas ---
class NotificationResponse(BaseModel):
    id: str
    family_id: str
    recipient_id: str
    title: str
    body: str
    type: str
    is_read: bool
    data: Optional[str] = None
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)
