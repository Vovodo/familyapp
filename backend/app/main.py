from contextlib import asynccontextmanager
import os
import uuid
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from backend.app.core.config import settings
from backend.app.core.logging import setup_logging
from backend.app.core.security import get_password_hash
from backend.app.db.session import engine, SessionLocal
from backend.app.db.base import Base
from backend.app.models.models import User
from backend.app.api.v1.api import api_router
from sqlalchemy import text

logger = setup_logging()


def run_safe_migrations():
    """
    Ensures all new tables and columns exist in Postgres/SQLite database without breaking existing tables.
    """
    try:
        # Create all declared tables if they do not exist
        Base.metadata.create_all(bind=engine)

        with engine.connect() as conn:
            migrations = [
                "ALTER TABLE families ADD COLUMN IF NOT EXISTS created_by VARCHAR(36);",
                "ALTER TABLE families ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT FALSE;",
                "ALTER TABLE families ADD COLUMN IF NOT EXISTS cloud_chat_backup_enabled BOOLEAN DEFAULT FALSE;",
                "ALTER TABLE families ADD COLUMN IF NOT EXISTS last_chat_backup_at TIMESTAMP WITH TIME ZONE;",
                "ALTER TABLE families ADD COLUMN IF NOT EXISTS chat_backup_size_bytes BIGINT DEFAULT 0;",
                "ALTER TABLE families ADD COLUMN IF NOT EXISTS chat_backup_message_count INTEGER DEFAULT 0;",
                "ALTER TABLE families ADD COLUMN IF NOT EXISTS chat_backup_media_count INTEGER DEFAULT 0;",
                "ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_thumbnail_url VARCHAR(500);",
                "ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_type VARCHAR(20);",
                "ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_edited BOOLEAN DEFAULT FALSE;",
                "ALTER TABLE messages ADD COLUMN IF NOT EXISTS client_message_id VARCHAR(100);",
                "ALTER TABLE messages ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;",
                "ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(500);",
                "ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone VARCHAR(30);",
            ]
            for sql in migrations:
                try:
                    conn.execute(text(sql))
                    conn.commit()
                except Exception as ex:
                    logger.debug(f"Migration notice ({sql}): {ex}")
        logger.info("Safe database migrations executed successfully.")
    except Exception as e:
        logger.warning(f"Database migration note: {e}")


def seed_admin_user():
    """
    Creates initial admin user if not already present.
    """
    db = SessionLocal()
    try:
        admin = db.query(User).filter(User.email == settings.ADMIN_EMAIL).first()
        if not admin:
            logger.info(f"Seeding default admin user: {settings.ADMIN_EMAIL}")
            admin = User(
                id=str(uuid.uuid4()),
                full_name=settings.ADMIN_NAME,
                email=settings.ADMIN_EMAIL,
                hashed_password=get_password_hash(settings.ADMIN_PASSWORD),
                role="admin"
            )
            db.add(admin)
            db.commit()
            logger.info("Default admin user created successfully.")
        else:
            # Ensure role is admin
            if admin.role != "admin":
                admin.role = "admin"
                db.commit()
    except Exception as e:
        logger.error(f"Error seeding admin user: {e}")
    finally:
        db.close()


from backend.app.services.cleanup_service import run_periodic_cleanup_job
import asyncio

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: create tables, run safe migrations, seed admin, and start auto-cleanup job
    logger.info("Initializing database tables...")
    try:
        Base.metadata.create_all(bind=engine)
        run_safe_migrations()
        logger.info("Database tables and migrations initialized successfully.")
        seed_admin_user()
        # Launch automatic 14-day old message purge job in background
        asyncio.create_task(run_periodic_cleanup_job())
    except Exception as e:
        logger.error(f"Error initializing startup tasks: {e}")
    yield
    # Shutdown
    logger.info("Shutting down Aile Uygulaması API...")


app = FastAPI(
    title=settings.PROJECT_NAME,
    description="4 kişilik aile için güvenli, sade ve modern mobil uygulama arka uç servisi.",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs" if settings.DEBUG else "/docs",  # Kept accessible for admin verification
    redoc_url="/redoc" if settings.DEBUG else None,
)

# Robust CORS configuration for Web, PWA, and Capacitor Android/iOS Native
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_origin_regex=r"https?://.*|capacitor://.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static file serving for uploads and public assets (APK)
if not os.path.exists(settings.UPLOAD_DIR):
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)

app.mount("/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="uploads")

static_dir = os.path.join(os.path.dirname(__file__), "static")
if not os.path.exists(static_dir):
    os.makedirs(static_dir, exist_ok=True)

app.mount("/static", StaticFiles(directory=static_dir), name="static")


# Global Exception Handler for friendly error responses
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception on {request.url.path}: {exc}")
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "detail": "Bir sorun oluştu. Lütfen tekrar deneyin."
        }
    )


# Root check
@app.get("/")
def root():
    return {
        "app": settings.PROJECT_NAME,
        "version": "1.0.0",
        "docs": "/docs"
    }


# Include API v1 routers
app.include_router(api_router, prefix=settings.API_V1_STR)
