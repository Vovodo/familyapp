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
