import os
from fastapi import APIRouter, HTTPException, status
from fastapi.responses import FileResponse
from loguru import logger

router = APIRouter()

@router.get("/apk")
@router.get("/ailem.apk")
def download_android_apk():
    """
    Directly streams the Android APK file with proper MIME type and Content-Disposition headers.
    Ensures mobile browsers trigger an immediate download instead of showing a blank page.
    """
    current_dir = os.path.dirname(os.path.abspath(__file__)) # .../api/v1
    app_dir = os.path.dirname(current_dir) # .../app
    backend_dir = os.path.dirname(app_dir) # .../backend or /app/backend
    root_dir = os.path.dirname(backend_dir) # / or project root
    
    candidate_paths = [
        os.path.join(app_dir, "static", "ailem.apk"),
        os.path.join(backend_dir, "static", "ailem.apk"),
        os.path.join(root_dir, "app", "static", "ailem.apk"),
        os.path.join(root_dir, "static", "ailem.apk"),
        os.path.join(root_dir, "ailem.apk"),
        "/app/static/ailem.apk",
        "/app/backend/app/static/ailem.apk",
        "/app/ailem.apk",
        os.path.join(root_dir, "frontend", "public", "downloads", "ailem.apk"),
        os.path.join(root_dir, "frontend", "android", "app", "build", "outputs", "apk", "debug", "app-debug.apk"),
    ]

    apk_file = None
    for p in candidate_paths:
        if os.path.exists(p) and os.path.getsize(p) > 1000000:
            apk_file = p
            break

    if not apk_file:
        logger.error(f"APK file not found in any candidate path: {candidate_paths}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="APK dosyası sunucuda henüz hazır değil veya derlenmedi."
        )

    file_size_mb = round(os.path.getsize(apk_file) / (1024 * 1024), 2)
    logger.info(f"Serving APK download from {apk_file} ({file_size_mb} MB)")

    return FileResponse(
        path=apk_file,
        filename="ailem.apk",
        media_type="application/vnd.android.package-archive",
        headers={
            "Content-Disposition": 'attachment; filename="ailem.apk"',
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Expose-Headers": "Content-Disposition",
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0",
        }
    )
