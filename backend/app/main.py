from contextlib import asynccontextmanager
import os
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from backend.app.core.config import settings
from backend.app.core.logging import setup_logging
from backend.app.db.session import engine
from backend.app.db.base import Base
from backend.app.api.v1.api import api_router

logger = setup_logging()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: create tables
    logger.info("Initializing database tables...")
    try:
        Base.metadata.create_all(bind=engine)
        logger.info("Database tables initialized successfully.")
    except Exception as e:
        logger.error(f"Error creating database tables: {e}")
    yield
    # Shutdown
    logger.info("Shutting down Aile Uygulaması API...")


app = FastAPI(
    title=settings.PROJECT_NAME,
    description="4 kişilik aile için güvenli, sade ve modern mobil uygulama arka uç servisi.",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None,
)

# CORS configuration
origins = settings.cors_origins_list
if "*" in origins or not origins:
    origins = ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if settings.DEBUG else origins,
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
        "docs": "/docs" if settings.DEBUG else "disabled in production"
    }


# Include API v1 routers
app.include_router(api_router, prefix=settings.API_V1_STR)
