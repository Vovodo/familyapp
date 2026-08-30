import io
from PIL import Image, ImageOps
from typing import Tuple


def optimize_and_create_thumbnail(
    image_bytes: bytes,
    max_dimension: int = 1920,
    thumb_dimension: int = 300,
    quality: int = 80
) -> Tuple[bytes, bytes, int, int]:
    """
    Takes raw image bytes, auto-rotates by EXIF, resizes if larger than max_dimension,
    compresses to JPEG, and creates a lightweight square-cropped or proportional thumbnail.
    Returns: (optimized_bytes, thumbnail_bytes, width, height)
    """
    img = Image.open(io.BytesIO(image_bytes))
    
    # Handle EXIF orientation
    try:
        img = ImageOps.exif_transpose(img)
    except Exception:
        pass

    # Convert to RGB if RGBA or P
    if img.mode in ("RGBA", "P"):
        img = img.convert("RGB")

    # 1. Resize main image if dimensions exceed max_dimension
    width, height = img.size
    if width > max_dimension or height > max_dimension:
        img.thumbnail((max_dimension, max_dimension), Image.Resampling.LANCZOS)
        width, height = img.size

    opt_buffer = io.BytesIO()
    img.save(opt_buffer, format="JPEG", quality=quality, optimize=True)
    optimized_bytes = opt_buffer.getvalue()

    # 2. Generate thumbnail
    thumb_img = img.copy()
    thumb_img.thumbnail((thumb_dimension, thumb_dimension), Image.Resampling.LANCZOS)
    thumb_buffer = io.BytesIO()
    thumb_img.save(thumb_buffer, format="JPEG", quality=75, optimize=True)
    thumbnail_bytes = thumb_buffer.getvalue()

    return optimized_bytes, thumbnail_bytes, width, height
