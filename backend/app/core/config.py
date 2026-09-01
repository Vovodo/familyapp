from typing import List, Union
from pydantic_settings import BaseSettings, SettingsConfigDict


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
        return int(self.TOTAL_STORAGE_CAPACITY_BYTES * (self.CHAT_QUOTA_PERCENT / 100.0))

    @property
    def image_quota_bytes(self) -> int:
        return int(self.TOTAL_STORAGE_CAPACITY_BYTES * (self.IMAGE_QUOTA_PERCENT / 100.0))

    @property
    def audio_quota_bytes(self) -> int:
        return int(self.TOTAL_STORAGE_CAPACITY_BYTES * (self.AUDIO_QUOTA_PERCENT / 100.0))

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

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore"
    )


settings = Settings()
