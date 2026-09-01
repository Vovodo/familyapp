from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status, Query
from sqlalchemy.orm import Session
from backend.app.db.session import get_db
from backend.app.models.models import Media, User, FamilyMember
from backend.app.schemas.schemas import MediaResponse
from backend.app.services.image_service import optimize_and_create_thumbnail
from backend.app.services.storage_service import storage_service
from backend.app.api.deps import get_current_user, get_current_family_member
from backend.app.core.config import settings
from loguru import logger

router = APIRouter()

ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/webp", "image/heic"}
ALLOWED_AUDIO_MIME_TYPES = {
    "audio/webm", "audio/mp4", "audio/ogg", "audio/mpeg", "audio/wav", "audio/aac", "audio/x-m4a", "audio/m4a", "audio/3gpp"
}


@router.post("/upload-audio")
async def upload_audio_endpoint(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    member: FamilyMember = Depends(get_current_family_member)
):
    """
    Uploads a voice recording (audio note) and returns the public media URL.
    """
    content_type = file.content_type or "audio/webm"
    file_bytes = await file.read()

    if len(file_bytes) > settings.MAX_UPLOAD_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Ses kaydı boyutu çok büyük. Maksimum {settings.MAX_UPLOAD_SIZE // (1024 * 1024)}MB yükleyebilirsiniz."
        )

    ext = "webm"
    if "mp4" in content_type or "m4a" in content_type:
        ext = "m4a"
    elif "ogg" in content_type:
        ext = "ogg"
    elif "wav" in content_type:
        ext = "wav"
    elif "mpeg" in content_type or "mp3" in content_type:
        ext = "mp3"

    from backend.app.services.quota_retention_service import quota_retention_service, QuotaExceededException

    checksum = quota_retention_service.compute_sha256(file_bytes)
    try:
        quota_retention_service.preflight_and_prepare_space(
            db=db,
            family_id=member.family_id,
            incoming_bytes_by_category={"AUDIO": len(file_bytes)}
        )
    except QuotaExceededException as qe:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=str(qe)
        )

    audio_path, audio_url = storage_service.upload_audio(
        family_id=member.family_id,
        audio_bytes=file_bytes,
        extension=ext,
        content_type=content_type
    )

    quota_retention_service.register_storage_object(
        db=db,
        family_id=member.family_id,
        user_id=current_user.id,
        storage_path=audio_path,
        public_url=audio_url,
        category="AUDIO",
        file_size=len(file_bytes),
        mime_type=content_type,
        checksum=checksum
    )

    return {
        "url": audio_url,
        "path": audio_path,
        "media_type": "audio"
    }


@router.post("/upload-avatar")
async def upload_avatar_endpoint(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Uploads and optimizes user avatar picture, sets avatar_url on current_user, and returns the URL.
    """
    if file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Desteklenmeyen dosya türü. Lütfen JPEG, PNG veya WEBP fotoğraf yükleyin."
        )

    file_bytes = await file.read()
    if len(file_bytes) > settings.MAX_UPLOAD_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Profil fotoğrafı boyutu çok büyük."
        )

    try:
        opt_bytes, thumb_bytes, width, height = optimize_and_create_thumbnail(file_bytes, max_dimension=400, quality=85)
    except Exception as e:
        logger.error(f"Avatar processing error: {e}")
        opt_bytes = file_bytes
        thumb_bytes = file_bytes

    main_path, main_url, thumb_path, thumb_url = storage_service.upload_image(
        family_id="avatars",
        file_name=f"avatar_{current_user.id}_{int(datetime.now().timestamp())}.jpg",
        image_bytes=opt_bytes,
        thumbnail_bytes=thumb_bytes
    )

    avatar_url = thumb_url or main_url
    current_user.avatar_url = avatar_url
    db.commit()
    db.refresh(current_user)

    return {
        "avatar_url": current_user.avatar_url,
        "status": "success"
    }


@router.post("/upload", response_model=MediaResponse, status_code=status.HTTP_201_CREATED)
async def upload_photo(
    file: UploadFile = File(...),
    caption: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    member: FamilyMember = Depends(get_current_family_member)
):
    """
    Safely uploads a photo, compresses it, creates a thumbnail, and registers metadata.
    """
    if file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Desteklenmeyen dosya türü. Lütfen JPEG, PNG veya WEBP fotoğraf yükleyin."
        )

    file_bytes = await file.read()
    if len(file_bytes) > settings.MAX_UPLOAD_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Dosya boyutu çok büyük. Maksimum {settings.MAX_UPLOAD_SIZE // (1024 * 1024)}MB yükleyebilirsiniz."
        )

    try:
        opt_bytes, thumb_bytes, width, height = optimize_and_create_thumbnail(file_bytes)
    except Exception as e:
        logger.error(f"Image processing error: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Fotoğraf işlenirken bir hata oluştu."
        )

    from backend.app.services.quota_retention_service import quota_retention_service, QuotaExceededException

    total_img_bytes = len(opt_bytes) + len(thumb_bytes)
    checksum = quota_retention_service.compute_sha256(opt_bytes)

    try:
        quota_retention_service.preflight_and_prepare_space(
            db=db,
            family_id=member.family_id,
            incoming_bytes_by_category={"IMAGE": total_img_bytes}
        )
    except QuotaExceededException as qe:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=str(qe)
        )

    main_path, main_url, thumb_path, thumb_url = storage_service.upload_image(
        family_id=member.family_id,
        file_name=file.filename or "photo.jpg",
        image_bytes=opt_bytes,
        thumbnail_bytes=thumb_bytes
    )

    media = Media(
        family_id=member.family_id,
        uploader_id=current_user.id,
        storage_path=main_path,
        public_url=main_url,
        thumbnail_url=thumb_url,
        file_name=file.filename,
        mime_type="image/jpeg",
        file_size=total_img_bytes,
        caption=caption
    )
    db.add(media)
    db.commit()
    db.refresh(media)

    quota_retention_service.register_storage_object(
        db=db,
        family_id=member.family_id,
        user_id=current_user.id,
        storage_path=main_path,
        public_url=main_url,
        category="IMAGE",
        file_size=total_img_bytes,
        mime_type="image/jpeg",
        checksum=checksum
    )

    return MediaResponse(
        id=media.id,
        family_id=media.family_id,
        uploader_id=media.uploader_id,
        storage_path=media.storage_path,
        public_url=media.public_url,
        thumbnail_url=media.thumbnail_url,
        file_name=media.file_name,
        mime_type=media.mime_type,
        file_size=media.file_size,
        caption=media.caption,
        taken_at=media.taken_at,
        created_at=media.created_at,
        uploader_name=current_user.full_name
    )


@router.get("/", response_model=List[MediaResponse])
def get_gallery(
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    member: FamilyMember = Depends(get_current_family_member)
):
    """
    Returns family photo gallery ordered by date descending.
    """
    items = (
        db.query(Media)
        .filter(Media.family_id == member.family_id)
        .order_by(Media.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    results = []
    for item in items:
        uploader = db.query(User).filter(User.id == item.uploader_id).first()
        results.append(
            MediaResponse(
                id=item.id,
                family_id=item.family_id,
                uploader_id=item.uploader_id,
                storage_path=item.storage_path,
                public_url=item.public_url,
                thumbnail_url=item.thumbnail_url,
                file_name=item.file_name,
                mime_type=item.mime_type,
                file_size=item.file_size,
                caption=item.caption,
                taken_at=item.taken_at,
                created_at=item.created_at,
                uploader_name=uploader.full_name if uploader else "Aile Üyesi"
            )
        )
    return results


@router.delete("/{media_id}")
def delete_photo(
    media_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    member: FamilyMember = Depends(get_current_family_member)
):
    """
    Deletes a photo from the family gallery.
    """
    media = (
        db.query(Media)
        .filter(Media.id == media_id, Media.family_id == member.family_id)
        .first()
    )
    if not media:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Fotoğraf bulunamadı.")

    if media.uploader_id != current_user.id and member.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bu fotoğrafı silme yetkiniz yok."
        )

    db.delete(media)
    db.commit()
    return {"message": "Fotoğraf silindi."}


@router.get("/storage-stats")
def get_storage_stats(
    db: Session = Depends(get_db),
    member: FamilyMember = Depends(get_current_family_member)
):
    """
    Returns current family and global storage quota metrics (Supabase 1 GB free tier).
    """
    total_bytes = 0
    photo_count = db.query(Media).filter(Media.family_id == member.family_id).count()
    all_media = db.query(Media.file_size).filter(Media.family_id == member.family_id).all()
    for m in all_media:
        if m.file_size:
            total_bytes += m.file_size

    used_mb = round(total_bytes / (1024 * 1024), 2)
    quota_mb = 1000.0  # 1 GB
    usage_percent = round((used_mb / quota_mb) * 100, 2)

    return {
        "used_bytes": total_bytes,
        "used_mb": used_mb,
        "quota_mb": quota_mb,
        "usage_percent": usage_percent,
        "photo_count": photo_count,
        "status": "warning" if usage_percent > 80 else "normal",
        "provider": "Supabase Cloud Storage (1 GB Ücretsiz)" if settings.SUPABASE_URL else "Yerel Sunucu Depolaması"
    }


@router.delete("/clear-all")
def clear_all_photos(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    member: FamilyMember = Depends(get_current_family_member)
):
    """
    Deletes all gallery photos for the current family to completely reset/free storage.
    """
    photos = db.query(Media).filter(Media.family_id == member.family_id).all()
    count = len(photos)

    for p in photos:
        db.delete(p)

    db.commit()
    logger.info(f"Cleared all {count} photos from family {member.family_id} by user {current_user.id}")
    return {
        "status": "success",
        "message": f"Tüm aile fotoğrafları ({count} adet) başarıyla temizlendi ve depolama alanı boşaltıldı.",
        "deleted_count": count
    }
