from fastapi import APIRouter
from backend.app.api.v1.auth import router as auth_router
from backend.app.api.v1.families import router as families_router
from backend.app.api.v1.messages import router as messages_router
from backend.app.api.v1.media import router as media_router
from backend.app.api.v1.shopping import router as shopping_router
from backend.app.api.v1.notes import router as notes_router
from backend.app.api.v1.reminders import router as reminders_router
from backend.app.api.v1.tasks import router as tasks_router
from backend.app.api.v1.budget import router as budget_router
from backend.app.api.v1.health import router as health_router
from backend.app.api.v1.admin import router as admin_router
from backend.app.api.v1.downloads import router as downloads_router
from backend.app.api.v1.notifications import router as notifications_router
from backend.app.api.v1.events import router as events_router
from backend.app.api.v1.sync import router as sync_router
from backend.app.api.v1.weather import router as weather_router

api_router = APIRouter()

api_router.include_router(health_router, prefix="/health", tags=["Sağlık"])
api_router.include_router(downloads_router, prefix="/downloads", tags=["İndirmeler"])
api_router.include_router(auth_router, prefix="/auth", tags=["Kimlik Doğrulama"])
api_router.include_router(families_router, prefix="/families", tags=["Aile"])
api_router.include_router(messages_router, prefix="/messages", tags=["Mesajlar"])
api_router.include_router(media_router, prefix="/media", tags=["Medya ve Fotoğraflar"])
api_router.include_router(shopping_router, prefix="/shopping", tags=["Alışveriş"])
api_router.include_router(tasks_router, prefix="/tasks", tags=["Yapılacaklar"])
api_router.include_router(budget_router, prefix="/budget", tags=["Bütçe & Harcamalar"])
api_router.include_router(notes_router, prefix="/notes", tags=["Notlar"])
api_router.include_router(reminders_router, prefix="/reminders", tags=["Hatırlatıcılar"])
api_router.include_router(notifications_router, prefix="/notifications", tags=["Bildirimler"])
api_router.include_router(events_router, prefix="/events", tags=["SSE Olaylar"])
api_router.include_router(sync_router, prefix="/sync", tags=["Senkronizasyon ve Yedekleme"])
api_router.include_router(weather_router, prefix="/weather", tags=["Hava Durumu"])
api_router.include_router(admin_router, prefix="/admin", tags=["Sistem Yönetimi"])

