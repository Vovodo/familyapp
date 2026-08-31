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

    audio_path, audio_url = storage_service.upload_audio(
        family_id=member.family_id,
        audio_bytes=file_bytes,
        extension=ext,
        content_type=content_type
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
        file_size=len(opt_bytes),
        caption=caption
    )
    db.add(media)
    db.commit()
    db.refresh(media)

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
