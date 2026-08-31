import os
from fastapi import APIRouter, HTTPException, status
from fastapi.responses import FileResponse

router = APIRouter()

@router.get("/apk")
def download_android_apk():
    """
    Directly streams the Android APK file with proper MIME type and Content-Disposition headers.
    Ensures mobile browsers trigger an immediate download instead of showing a blank page.
    """
    # Possible paths where the APK is located
    current_dir = os.path.dirname(os.path.abspath(__file__))
    app_dir = os.path.dirname(os.path.dirname(current_dir)) # backend/app
    
    candidate_paths = [
        os.path.join(app_dir, "static", "ailem.apk"),
        os.path.join(os.path.dirname(app_dir), "frontend", "public", "downloads", "ailem.apk"),
        os.path.join(os.path.dirname(app_dir), "frontend", "android", "app", "build", "outputs", "apk", "debug", "app-debug.apk"),
    ]

    apk_file = None
    for p in candidate_paths:
        if os.path.exists(p):
            apk_file = p
            break

    if not apk_file:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="APK dosyası sunucuda bulunamadı."
        )

    return FileResponse(
        path=apk_file,
        filename="ailem.apk",
        media_type="application/vnd.android.package-archive",
        headers={
            "Content-Disposition": "attachment; filename=ailem.apk",
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0",
        }
    )
