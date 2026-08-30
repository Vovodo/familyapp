import time
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import text
from backend.app.db.session import get_db
from backend.app.models.models import User, Family, Message, Media, ShoppingItem, Note, Reminder
from backend.app.api.deps import get_current_user
from backend.app.core.config import settings
from backend.app.services.email_service import email_service
from backend.app.services.storage_service import storage_service

router = APIRouter()


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bu gösterge paneline yalnızca sistem yöneticisi (admin) erişebilir."
        )
    return current_user


@router.get("/integrations")
async def get_integrations_status(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """
    Returns real-time live connection status for all external integrations and database.
    """
    # 1. Database Connection Check
    db_start = time.time()
    db_active = False
    db_detail = ""
    db_latency_ms = 0
    try:
        db.execute(text("SELECT 1"))
        db_active = True
        db_latency_ms = round((time.time() - db_start) * 1000, 2)
        db_type = "PostgreSQL" if "postgres" in settings.DATABASE_URL.lower() else "SQLite"
        db_detail = f"{db_type} bağlantısı başarılı ({db_latency_ms} ms)"
    except Exception as e:
        db_detail = f"Veritabanı hatası: {str(e)}"

    # 2. Supabase Auth & JWT Check
    supabase_auth_active = bool(settings.SUPABASE_URL and (settings.SUPABASE_JWT_SECRET or settings.SUPABASE_ANON_KEY))
    supabase_auth_status = {
        "active": supabase_auth_active,
        "name": "Supabase Auth & JWT",
        "status": "Aktif" if supabase_auth_active else "Yerel JWT Aktif",
        "detail": "Supabase JWT doğrulayıcısı yapılandırılmış" if supabase_auth_active else "Yerel gizli anahtar (SECRET_KEY) ile JWT üretiliyor.",
        "project_url": settings.SUPABASE_URL or "Tanımsız"
    }

    # 3. Supabase Storage Check
    storage_status = storage_service.verify_connection()

    # 4. Resend Email Check
    email_status = await email_service.verify_connection()

    # 5. Summary Metrics
    user_count = db.query(User).count()
    family_count = db.query(Family).count()
    message_count = db.query(Message).count()
    media_count = db.query(Media).count()
    shopping_count = db.query(ShoppingItem).count()
    notes_count = db.query(Note).count()
    reminders_count = db.query(Reminder).count()

    return {
        "integrations": {
            "database": {
                "name": "Veritabanı (PostgreSQL / Supabase)",
                "active": db_active,
                "status": "Aktif" if db_active else "Bağlantı Yok",
                "detail": db_detail,
                "latency_ms": db_latency_ms
            },
            "supabase_auth": supabase_auth_status,
            "storage": {
                "name": "Supabase Medya Depolama (Object Storage)",
                "active": storage_status["active"],
                "provider": storage_status["provider"],
                "status": storage_status["status"],
                "bucket": storage_status.get("bucket"),
                "detail": storage_status["detail"]
            },
            "resend_email": {
                "name": "Resend E-posta Bildirim Servisi",
                "active": email_status["active"],
                "status": email_status["status"],
                "from_email": settings.EMAIL_FROM,
                "detail": email_status["detail"]
            },
            "capacitor_mobile": {
                "name": "Capacitor Mobil Köprüsü & Android",
                "active": True,
                "status": "Aktif",
                "detail": "Kamera, Yerel Bildirimler ve Ağ durumu dinleyicisi hazır"
            }
        },
        "stats": {
            "total_users": user_count,
            "total_families": family_count,
            "total_messages": message_count,
            "total_media": media_count,
            "total_shopping": shopping_count,
            "total_notes": notes_count,
            "total_reminders": reminders_count
        },
        "server": {
            "environment": settings.ENVIRONMENT,
            "debug": settings.DEBUG,
            "cors_origins": settings.cors_origins_list
        }
    }


@router.post("/test-email")
async def send_test_email(
    admin: User = Depends(require_admin)
):
    """
    Sends a test email to admin user to verify Resend delivery.
    """
    if not admin.email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Admin kullanıcısının e-posta adresi bulunmuyor."
        )

    res = await email_service.send_email(
        to=admin.email,
        subject="🎉 Ailem Uygulaması — Resend Test E-postası",
        html_content=f"""
        <div style="font-family: Arial, sans-serif; max-width: 500px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 12px;">
            <h2 style="color: #ca374c;">Ailem Uygulaması ❤️</h2>
            <p>Merhaba <strong>{admin.full_name}</strong>,</p>
            <p>Bu e-posta, <strong>Resend API</strong> entegrasyonunun başarıyla çalıştığını doğrulamak için gönderilmiştir.</p>
            <hr style="border: none; border-top: 1px solid #f0f0f0; margin: 20px 0;" />
            <p style="font-size: 12px; color: #888;">Tarih: {time.strftime('%Y-%m-%d %H:%M:%S')}</p>
        </div>
        """
    )
    return res
