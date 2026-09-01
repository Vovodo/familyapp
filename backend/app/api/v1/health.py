from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from backend.app.db.session import get_db
from backend.app.core.config import settings

router = APIRouter()


@router.get("/")
@router.get("/live")
def health_check():
    """
    Returns API health status immediately for Docker/Coolify health checks.
    """
    return {
        "status": "online",
        "app_name": settings.PROJECT_NAME,
        "environment": settings.ENVIRONMENT,
    }


@router.get("/ready")
def readiness_check(db: Session = Depends(get_db)):
    """
    Checks database connection readiness.
    """
    db_status = "healthy"
    try:
        db.execute(text("SELECT 1"))
    except Exception as e:
        db_status = f"unhealthy: {str(e)}"

    return {
        "status": "online",
        "app_name": settings.PROJECT_NAME,
        "environment": settings.ENVIRONMENT,
        "database": db_status
    }
