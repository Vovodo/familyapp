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

logger = setup_logging()


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


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: create tables and seed admin
    logger.info("Initializing database tables...")
    try:
        Base.metadata.create_all(bind=engine)
        logger.info("Database tables initialized successfully.")
        seed_admin_user()
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

# Static file serving for uploads (local storage mode)
if not os.path.exists(settings.UPLOAD_DIR):
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)

app.mount("/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="uploads")


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
