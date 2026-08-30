import os
import uuid
from typing import Tuple, Dict, Any
from backend.app.core.config import settings
from loguru import logger

# Ensure upload directories exist
os.makedirs(os.path.join(settings.UPLOAD_DIR, "original"), exist_ok=True)
os.makedirs(os.path.join(settings.UPLOAD_DIR, "thumbnails"), exist_ok=True)


class StorageService:
    def __init__(self):
        self.supabase_client = None
        self._init_client()

    def _init_client(self):
        if settings.SUPABASE_URL and settings.SUPABASE_SERVICE_ROLE_KEY:
            try:
                from supabase import create_client
                self.supabase_client = create_client(
                    settings.SUPABASE_URL,
                    settings.SUPABASE_SERVICE_ROLE_KEY
                )
                logger.info("Supabase storage client initialized.")
            except Exception as e:
                logger.warning(f"Failed to initialize Supabase client: {e}. Falling back to local storage.")

    def verify_connection(self) -> Dict[str, Any]:
        """
        Checks if Supabase Object Storage is configured and reachable.
        """
        if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_ROLE_KEY:
            return {
                "active": False,
                "provider": "Yerel Disk (Local Storage)",
                "status": "Yerel Depolama Aktif",
                "bucket": settings.STORAGE_BUCKET_NAME,
                "detail": "SUPABASE_URL veya SERVICE_ROLE_KEY tanımlanmamış. Fotoğraflar sunucu diskinde saklanıyor."
            }

        if not self.supabase_client:
            self._init_client()

        if self.supabase_client:
            try:
                # Test listing buckets
                buckets = self.supabase_client.storage.list_buckets()
                bucket_names = [b.name for b in buckets] if buckets else []
                bucket_exists = settings.STORAGE_BUCKET_NAME in bucket_names

                return {
                    "active": True,
                    "provider": "Supabase Object Storage",
                    "status": "Aktif",
                    "bucket": settings.STORAGE_BUCKET_NAME,
                    "bucket_exists": bucket_exists,
                    "detail": f"Supabase Storage bağlantısı başarılı. '{settings.STORAGE_BUCKET_NAME}' bucket'ı {'mevcut' if bucket_exists else 'oluşturulmalı'}."
                }
            except Exception as e:
                return {
                    "active": False,
                    "provider": "Supabase (Hata)",
                    "status": "Bağlantı Hatası",
                    "bucket": settings.STORAGE_BUCKET_NAME,
                    "detail": f"Supabase Storage sorgulanamadı: {str(e)}"
                }

        return {
            "active": False,
            "provider": "Yerel Disk",
            "status": "Deaktif",
            "detail": "İstemci başlatılamadı."
        }

    def upload_image(
        self,
        family_id: str,
        file_name: str,
        image_bytes: bytes,
        thumbnail_bytes: bytes
    ) -> Tuple[str, str, str, str]:
        """
        Uploads image and thumbnail to Supabase Storage or Local Storage.
        Returns: (main_path, main_url, thumb_path, thumb_url)
        """
        ext = "jpg"
        unique_id = str(uuid.uuid4())
        main_filename = f"{unique_id}.{ext}"
        thumb_filename = f"{unique_id}_thumb.{ext}"
        
        main_path = f"{family_id}/{main_filename}"
        thumb_path = f"{family_id}/{thumb_filename}"

        if self.supabase_client:
            try:
                # Upload to Supabase Storage Bucket
                bucket = settings.STORAGE_BUCKET_NAME
                self.supabase_client.storage.from_(bucket).upload(
                    path=main_path,
                    file=image_bytes,
                    file_options={"content-type": "image/jpeg"}
                )
                self.supabase_client.storage.from_(bucket).upload(
                    path=thumb_path,
                    file=thumbnail_bytes,
                    file_options={"content-type": "image/jpeg"}
                )
                main_url = self.supabase_client.storage.from_(bucket).get_public_url(main_path)
                thumb_url = self.supabase_client.storage.from_(bucket).get_public_url(thumb_path)
                return main_path, main_url, thumb_path, thumb_url
            except Exception as e:
                logger.error(f"Supabase upload failed: {e}. Falling back to local storage.")

        # Local storage fallback
        fam_dir_orig = os.path.join(settings.UPLOAD_DIR, "original", family_id)
        fam_dir_thumb = os.path.join(settings.UPLOAD_DIR, "thumbnails", family_id)
        os.makedirs(fam_dir_orig, exist_ok=True)
        os.makedirs(fam_dir_thumb, exist_ok=True)

        local_main_file = os.path.join(fam_dir_orig, main_filename)
        local_thumb_file = os.path.join(fam_dir_thumb, thumb_filename)

        with open(local_main_file, "wb") as f:
            f.write(image_bytes)

        with open(local_thumb_file, "wb") as f:
            f.write(thumbnail_bytes)

        main_url = f"/uploads/original/{family_id}/{main_filename}"
        thumb_url = f"/uploads/thumbnails/{family_id}/{thumb_filename}"

        return main_path, main_url, thumb_path, thumb_url


storage_service = StorageService()
