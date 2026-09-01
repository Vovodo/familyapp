from datetime import datetime
from typing import Optional, List, Any, Dict
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


class QuickJoinRequest(BaseModel):
    full_name: str
    nickname: Optional[str] = None
    avatar_url: Optional[str] = None
    device_id: Optional[str] = None
    action: Optional[str] = "create"  # "create" or "join"
    family_name: Optional[str] = "Bizim Aile ❤️"
    invite_code: Optional[str] = None


class QuickJoinResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse
    family_id: str
    family_name: str


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


class SendVerificationCodeRequest(BaseModel):
    email: EmailStr
    purpose: str = "register" # "register" or "reset_password"


class VerifyAndRegisterRequest(BaseModel):
    email: EmailStr
    code: str
    full_name: str
    password: str
    family_action: Optional[str] = "create" # "create" or "join"
    invite_code: Optional[str] = None
    family_name: Optional[str] = "Bizim Aile ❤️"
    nickname: Optional[str] = None


class ResetPasswordRequest(BaseModel):
    email: EmailStr
    code: str
    new_password: str


class FamilySettingsUpdate(BaseModel):
    name: Optional[str] = None
    is_public: Optional[bool] = None
    cloud_chat_backup_enabled: Optional[bool] = None


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
    is_public: bool = False
    created_by: Optional[str]
    cloud_chat_backup_enabled: bool = False
    last_chat_backup_at: Optional[datetime] = None
    chat_backup_size_bytes: int = 0
    chat_backup_message_count: int = 0
    chat_backup_media_count: int = 0
    created_at: datetime
    members: List[FamilyMemberResponse] = []
    model_config = ConfigDict(from_attributes=True)


# --- Sync & Backup Schemas ---
class SyncStatusResponse(BaseModel):
    family_id: str
    cloud_chat_backup_enabled: bool
    last_chat_backup_at: Optional[datetime] = None
    chat_backup_size_bytes: int = 0
    chat_backup_message_count: int = 0
    chat_backup_media_count: int = 0
    mandatory_sync_health: str = "ok"


class BackupItemPayload(BaseModel):
    id: Optional[str] = None
    client_message_id: Optional[str] = None
    sender_id: str
    content: Optional[str] = None
    media_url: Optional[str] = None
    media_type: Optional[str] = None
    created_at: datetime


class BatchChatBackupRequest(BaseModel):
    messages: List[BackupItemPayload] = []


class BatchChatBackupResponse(BaseModel):
    status: str
    saved_count: int
    total_backup_messages: int
    total_backup_size_bytes: int
    backup_timestamp: datetime


class ChatRestoreItem(BaseModel):
    id: str
    client_message_id: Optional[str] = None
    sender_id: str
    sender_name: Optional[str] = None
    sender_avatar: Optional[str] = None
    sender_nickname: Optional[str] = None
    content: Optional[str] = None
    media_url: Optional[str] = None
    media_thumbnail_url: Optional[str] = None
    media_type: Optional[str] = None
    created_at: datetime


class ChatRestoreResponse(BaseModel):
    family_id: str
    family_name: str
    total_messages: int
    total_media_files: int
    total_size_bytes: int
    messages: List[ChatRestoreItem]
    has_more: bool = False


class MandatoryDataSyncResponse(BaseModel):
    family_id: str
    synced_at: datetime
    notes: List[Dict[str, Any]] = []
    tasks: List[Dict[str, Any]] = []
    budget: List[Dict[str, Any]] = []
    shopping: List[Dict[str, Any]] = []
    reminders: List[Dict[str, Any]] = []
    members: List[Dict[str, Any]] = []


# --- Storage Quota & Retention Schemas ---
class CategoryQuotaMetric(BaseModel):
    category: str
    percent_quota: int
    quota_bytes: int
    used_bytes: int
    available_bytes: int
    usage_percent: float
    item_count: int


class StorageQuotaBreakdown(BaseModel):
    family_id: Optional[str] = None
    total_capacity_bytes: int
    total_used_bytes: int
    total_available_bytes: int
    total_usage_percent: float
    occupancy_level: str # 'NORMAL', 'WARNING', 'HIGH', 'CRITICAL'
    chat: CategoryQuotaMetric
    image: CategoryQuotaMetric
    audio: CategoryQuotaMetric


class StorageReconciliationResponse(BaseModel):
    status: str
    reconciled_at: datetime
    db_total_bytes: int
    storage_actual_bytes: int
    discrepancy_bytes: int
    orphan_files_detected: int
    orphan_files_purged: int
    purged_bytes: int
    details: List[str] = []


class CleanupJobLogResponse(BaseModel):
    id: str
    family_id: Optional[str] = None
    category: str
    trigger_reason: str
    required_bytes: int
    freed_bytes: int
    deleted_messages_count: int
    deleted_storage_objects_count: int
    status: str
    started_at: datetime
    completed_at: Optional[datetime] = None
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
    poll: Optional[Dict[str, Any]] = None
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


class DeviceTokenCreate(BaseModel):
    device_id: str
    token: str
    platform: Optional[str] = "android"


class DeviceTokenResponse(BaseModel):
    id: str
    user_id: str
    device_id: str
    platform: str
    token: str
    is_active: bool
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


class HeartEventRequest(BaseModel):
    message: Optional[str] = None


class HeartEventResponse(BaseModel):
    status: str = "success"
    event_id: str
    sender_id: str
    sender_name: str
    family_id: str
    recipients_count: int
    push_sent_count: int
    created_at: datetime

