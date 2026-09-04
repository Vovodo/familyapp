from pathlib import Path
from typing import List, Union
from pydantic_settings import BaseSettings, SettingsConfigDict

_BACKEND_DIR = Path(__file__).resolve().parents[2]
_REPO_DIR = Path(__file__).resolve().parents[3]
_ENV_FILES = tuple(
    str(path) for path in (_BACKEND_DIR / ".env", _REPO_DIR / ".env") if path.exists()
) or (str(_BACKEND_DIR / ".env"),)


class Settings(BaseSettings):
    PROJECT_NAME: str = "Aile Uygulaması"
    ENVIRONMENT: str = "production"
    DEBUG: bool = False
    API_V1_STR: str = "/api/v1"

    # CORS configuration for Web and Capacitor Android
    CORS_ORIGINS: Union[str, List[str]] = (
        "https://family.rfqcollector.com,"
        "https://familyapi.rfqcollector.com,"
        "capacitor://localhost,"
        "http://localhost,"
        "https://localhost,"
        "http://localhost:5173,"
        "http://localhost:3000"
    )

    @property
    def cors_origins_list(self) -> List[str]:
        if isinstance(self.CORS_ORIGINS, list):
            return self.CORS_ORIGINS
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]

    # Database
    DATABASE_URL: str = "sqlite:///./family_app.db"

    # Supabase / JWT
    SUPABASE_URL: str = ""
    SUPABASE_ANON_KEY: str = ""
    SUPABASE_SERVICE_ROLE_KEY: str = ""
    SUPABASE_JWT_SECRET: str = ""

    SENTRY_DSN: str = ""

    SECRET_KEY: str = "supersecretfamilyappjwtkeychangeinproduction"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 30  # 30 days

    STORAGE_BUCKET_NAME: str = "family-media"
    UPLOAD_DIR: str = "./uploads"
    MAX_UPLOAD_SIZE: int = 15 * 1024 * 1024  # 15MB

    # Storage Quota & Retention Engine Settings (Configurable, Logical Partitions)
    TOTAL_STORAGE_CAPACITY_BYTES: int = 2 * 1024 * 1024 * 1024  # 2 GB default
    CHAT_QUOTA_PERCENT: int = 50   # 50% = 1 GB
    IMAGE_QUOTA_PERCENT: int = 40  # 40% = 800 MB
    AUDIO_QUOTA_PERCENT: int = 10  # 10% = 200 MB
    ORPHAN_GRACE_PERIOD_HOURS: int = 2

    @property
    def chat_quota_bytes(self) -> int:
        return (self.TOTAL_STORAGE_CAPACITY_BYTES * self.CHAT_QUOTA_PERCENT) // 100

    @property
    def image_quota_bytes(self) -> int:
        return (self.TOTAL_STORAGE_CAPACITY_BYTES * self.IMAGE_QUOTA_PERCENT) // 100

    @property
    def audio_quota_bytes(self) -> int:
        return self.TOTAL_STORAGE_CAPACITY_BYTES - self.chat_quota_bytes - self.image_quota_bytes

    def validate_quota_allocation(self) -> bool:
        total_percent = self.CHAT_QUOTA_PERCENT + self.IMAGE_QUOTA_PERCENT + self.AUDIO_QUOTA_PERCENT
        if total_percent != 100:
            raise ValueError(f"Storage quota allocation must equal exactly 100%. Current sum: {total_percent}%")
        return True

    # Resend Email Integration
    RESEND_API_KEY: str = ""
    EMAIL_FROM: str = "Ailem <bildirim@rfqcollector.com>"

    # Default Admin User
    ADMIN_EMAIL: str = "admin@aile.com"
    ADMIN_PASSWORD: str = "Admin1234!*"
    ADMIN_NAME: str = "Sistem Yöneticisi (Ege)"

    # Firebase Cloud Messaging (FCM) + ses kanalı (WebRTC sinyal)
    FIREBASE_CREDENTIALS_JSON: str = ""
    FIREBASE_CREDENTIALS_PATH: str = ""
    FIREBASE_PROJECT_ID: str = "ailem-b2489"
    FIREBASE_WEB_API_KEY: str = "AIzaSyB-UqdkE5u4vbli9uq6NyZmDvTMV4yXW5o"
    FIREBASE_AUTH_DOMAIN: str = "ailem-b2489.firebaseapp.com"
    FIREBASE_DATABASE_URL: str = "https://ailem-b2489-default-rtdb.europe-west1.firebasedatabase.app"
    FIREBASE_STORAGE_BUCKET: str = "ailem-b2489.firebasestorage.app"
    FIREBASE_MESSAGING_SENDER_ID: str = "856921346242"
    FIREBASE_APP_ID: str = "1:856921346242:web:b72500ebd2f9944a95ab5b"
    TURN_URLS: str = ""
    TURN_USERNAME: str = ""
    TURN_CREDENTIAL: str = ""

    model_config = SettingsConfigDict(
        env_file=_ENV_FILES,
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore"
    )


settings = Settings()
