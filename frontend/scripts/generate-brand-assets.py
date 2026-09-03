"""Ailem marka ikonlarını orijinal logo.png'den üretir. Logo yeniden çizilmez."""
from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "frontend" / "src" / "assets" / "branding" / "logo.png"
PUBLIC = ROOT / "frontend" / "public"
ICONS = PUBLIC / "icons"
ANDROID_RES = ROOT / "frontend" / "android" / "app" / "src" / "main" / "res"
IOS_RES = ROOT / "frontend" / "resources" / "ios"
RESOURCES = ROOT / "frontend" / "resources"

BRAND_SURFACE = (26, 18, 48, 255)
SPLASH_LIGHT = (250, 249, 246, 255)
SPLASH_DARK = (22, 16, 40, 255)


def fit_contain(img: Image.Image, size: int, bg: tuple[int, int, int, int] | None = None) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), bg or (0, 0, 0, 0))
    work = img.convert("RGBA")
    work.thumbnail((size, size), Image.Resampling.LANCZOS)
    x = (size - work.width) // 2
    y = (size - work.height) // 2
    canvas.paste(work, (x, y), work)
    return canvas


def padded(img: Image.Image, size: int, pad_ratio: float, bg: tuple[int, int, int, int]) -> Image.Image:
    inner = max(1, int(size * (1 - 2 * pad_ratio)))
    fitted = fit_contain(img, inner)
    canvas = Image.new("RGBA", (size, size), bg)
    x = (size - fitted.width) // 2
    y = (size - fitted.height) // 2
    canvas.paste(fitted, (x, y), fitted)
    return canvas


def save_png(img: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, format="PNG", optimize=True)


def splash(img: Image.Image, size: int, bg: tuple[int, int, int, int], logo_ratio: float = 0.38) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), bg)
    mark = fit_contain(img, max(1, int(size * logo_ratio)))
    x = (size - mark.width) // 2
    y = (size - mark.height) // 2
    canvas.paste(mark, (x, y), mark)
    return canvas


def main() -> None:
    if not SRC.exists():
        raise SystemExit(f"Logo yok: {SRC}")
    logo = Image.open(SRC).convert("RGBA")

    PUBLIC.mkdir(parents=True, exist_ok=True)
    ICONS.mkdir(parents=True, exist_ok=True)
    RESOURCES.mkdir(parents=True, exist_ok=True)
    IOS_RES.mkdir(parents=True, exist_ok=True)

    save_png(fit_contain(logo, 1024), RESOURCES / "icon.png")
    save_png(logo if logo.size[0] >= 512 else fit_contain(logo, 1024), PUBLIC / "branding" / "logo.png")

    for size in (16, 32, 48):
        save_png(fit_contain(logo, size), PUBLIC / f"favicon-{size}x{size}.png")

    ico_sizes = [(16, 16), (32, 32), (48, 48)]
    ico_images = [fit_contain(logo, s[0]).convert("RGBA") for s in ico_sizes]
    ico_images[0].save(
        PUBLIC / "favicon.ico",
        format="ICO",
        sizes=ico_sizes,
        append_images=ico_images[1:],
    )

    save_png(fit_contain(logo, 180), PUBLIC / "apple-touch-icon.png")
    save_png(fit_contain(logo, 192), ICONS / "icon-192.png")
    save_png(fit_contain(logo, 512), ICONS / "icon-512.png")
    save_png(padded(logo, 192, 0.18, BRAND_SURFACE), ICONS / "icon-maskable-192.png")
    save_png(padded(logo, 512, 0.18, BRAND_SURFACE), ICONS / "icon-maskable-512.png")

    save_png(splash(logo, 2732, SPLASH_DARK), RESOURCES / "splash.png")
    save_png(splash(logo, 2732, SPLASH_DARK), RESOURCES / "splash-dark.png")
    save_png(splash(logo, 2732, SPLASH_LIGHT), RESOURCES / "splash-light.png")

    launcher = {
        "mipmap-mdpi": 48,
        "mipmap-hdpi": 72,
        "mipmap-xhdpi": 96,
        "mipmap-xxhdpi": 144,
        "mipmap-xxxhdpi": 192,
    }
    foreground = {
        "mipmap-mdpi": 108,
        "mipmap-hdpi": 162,
        "mipmap-xhdpi": 216,
        "mipmap-xxhdpi": 324,
        "mipmap-xxxhdpi": 432,
    }
    for folder, size in launcher.items():
        icon = fit_contain(logo, size)
        save_png(icon, ANDROID_RES / folder / "ic_launcher.png")
        save_png(icon, ANDROID_RES / folder / "ic_launcher_round.png")
    for folder, size in foreground.items():
        save_png(padded(logo, size, 0.18, BRAND_SURFACE), ANDROID_RES / folder / "ic_launcher_foreground.png")

    splash_dark = splash(logo, 1280, SPLASH_DARK)
    for folder in (
        "drawable",
        "drawable-mdpi",
        "drawable-hdpi",
        "drawable-xhdpi",
        "drawable-xxhdpi",
        "drawable-xxxhdpi",
        "drawable-port-mdpi",
        "drawable-port-hdpi",
        "drawable-port-xhdpi",
        "drawable-port-xxhdpi",
        "drawable-port-xxxhdpi",
        "drawable-land-mdpi",
        "drawable-land-hdpi",
        "drawable-land-xhdpi",
        "drawable-land-xxhdpi",
        "drawable-land-xxxhdpi",
    ):
        save_png(splash_dark, ANDROID_RES / folder / "splash.png")
    save_png(splash_dark, ANDROID_RES / "drawable-night" / "splash.png")

    ios_icons = {
        "AppIcon-20.png": 20,
        "AppIcon-20@2x.png": 40,
        "AppIcon-20@3x.png": 60,
        "AppIcon-29.png": 29,
        "AppIcon-29@2x.png": 58,
        "AppIcon-29@3x.png": 87,
        "AppIcon-40.png": 40,
        "AppIcon-40@2x.png": 80,
        "AppIcon-40@3x.png": 120,
        "AppIcon-60@2x.png": 120,
        "AppIcon-60@3x.png": 180,
        "AppIcon-76.png": 76,
        "AppIcon-76@2x.png": 152,
        "AppIcon-83.5@2x.png": 167,
        "AppIcon-1024.png": 1024,
    }
    for name, size in ios_icons.items():
        save_png(fit_contain(logo, size), IOS_RES / name)

    print("Brand assets generated from", SRC)


if __name__ == "__main__":
    main()
