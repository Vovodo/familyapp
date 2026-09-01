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
                try:
                    buckets = self.supabase_client.storage.list_buckets()
                    names = [b.name for b in buckets] if buckets else []
                    if settings.STORAGE_BUCKET_NAME not in names:
                        self.supabase_client.storage.create_bucket(
                            settings.STORAGE_BUCKET_NAME,
                            options={"public": True}
                        )
                        logger.info(f"Created public Supabase storage bucket: {settings.STORAGE_BUCKET_NAME}")
                except Exception as b_err:
                    logger.debug(f"Bucket check note: {b_err}")
                logger.info("Supabase storage client initialized successfully.")
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

    def upload_audio(
        self,
        family_id: str,
        audio_bytes: bytes,
        extension: str = "webm",
        content_type: str = "audio/webm"
    ) -> Tuple[str, str]:
        """
        Uploads an audio voice note to Supabase Storage or Local Storage.
        Returns: (audio_path, audio_url)
        """
        unique_id = str(uuid.uuid4())
        audio_filename = f"voice_{unique_id}.{extension}"
        audio_path = f"{family_id}/audio/{audio_filename}"

        if self.supabase_client:
            try:
                bucket = settings.STORAGE_BUCKET_NAME
                self.supabase_client.storage.from_(bucket).upload(
                    path=audio_path,
                    file=audio_bytes,
                    file_options={"content-type": content_type}
                )
                audio_url = self.supabase_client.storage.from_(bucket).get_public_url(audio_path)
                return audio_path, audio_url
            except Exception as e:
                logger.error(f"Supabase audio upload failed: {e}. Falling back to local storage.")

        # Local fallback
        fam_dir_audio = os.path.join(settings.UPLOAD_DIR, "audio", family_id)
        os.makedirs(fam_dir_audio, exist_ok=True)
        local_audio_file = os.path.join(fam_dir_audio, audio_filename)

        with open(local_audio_file, "wb") as f:
            f.write(audio_bytes)

        audio_url = f"/uploads/audio/{family_id}/{audio_filename}"
        return audio_path, audio_url

    def delete_file(self, storage_path: str) -> bool:
        """
        Deletes a file from Supabase Storage bucket and/or local upload storage.
        """
        success = False
        if self.supabase_client and storage_path:
            try:
                bucket = settings.STORAGE_BUCKET_NAME
                self.supabase_client.storage.from_(bucket).remove([storage_path])
                success = True
                logger.info(f"[STORAGE] Deleted from Supabase: {storage_path}")
            except Exception as e:
                logger.warning(f"[STORAGE] Supabase delete warning: {e}")

        # Local fallback cleanup
        local_candidates = [
            os.path.join(settings.UPLOAD_DIR, storage_path),
            os.path.join(settings.UPLOAD_DIR, "original", storage_path),
            os.path.join(settings.UPLOAD_DIR, "thumbnails", storage_path),
            os.path.join(settings.UPLOAD_DIR, "audio", storage_path),
        ]
        for p in local_candidates:
            if os.path.exists(p):
                try:
                    os.remove(p)
                    success = True
                    logger.info(f"[STORAGE] Deleted from local disk: {p}")
                except Exception as ex:
                    logger.debug(f"[STORAGE] Local remove error: {ex}")

        return success

    def list_all_files(self, prefix: str = "") -> list:
        """
        Lists stored files in the Supabase Storage bucket or local directory.
        """
        files = []
        if self.supabase_client:
            try:
                bucket = settings.STORAGE_BUCKET_NAME
                res = self.supabase_client.storage.from_(bucket).list(path=prefix)
                if res:
                    for item in res:
                        files.append({
                            "name": item.get("name"),
                            "id": item.get("id"),
                            "created_at": item.get("created_at"),
                            "updated_at": item.get("updated_at"),
                            "metadata": item.get("metadata", {}),
                        })
                return files
            except Exception as e:
                logger.warning(f"[STORAGE] Error listing Supabase files: {e}")

        # Local directory listing fallback
        base_dir = settings.UPLOAD_DIR
        if os.path.exists(base_dir):
            for root, _, filenames in os.walk(base_dir):
                for fn in filenames:
                    full_p = os.path.join(root, fn)
                    rel_p = os.path.relpath(full_p, base_dir).replace("\\", "/")
                    try:
                        stat = os.stat(full_p)
                        files.append({
                            "name": fn,
                            "path": rel_p,
                            "size": stat.st_size,
                            "created_at": stat.st_ctime,
                        })
                    except Exception:
                        pass
        return files


storage_service = StorageService()


