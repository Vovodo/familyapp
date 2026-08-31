import os
from PIL import Image, ImageDraw, ImageFont

def draw_heart(draw, center_x, center_y, size, fill_color):
    """
    Draws a smooth mathematical bezier heart shape.
    """
    import math
    points = []
    # Heart parametric curve: x = 16 sin^3(t), y = 13 cos(t) - 5 cos(2t) - 2 cos(3t) - cos(4t)
    steps = 180
    scale = size / 34.0
    for i in range(steps):
        t = (i / steps) * 2 * math.pi
        x = 16 * (math.sin(t) ** 3)
        y = -(13 * math.cos(t) - 5 * math.cos(2*t) - 2 * math.cos(3*t) - math.cos(4*t))
        px = center_x + x * scale
        py = center_y + y * scale
        points.append((px, py))
    draw.polygon(points, fill=fill_color)

def generate_icons():
    base_res_dir = r"frontend/android/app/src/main/res"
    
    densities = {
        "mipmap-mdpi": (48, 108),
        "mipmap-hdpi": (72, 162),
        "mipmap-xhdpi": (96, 216),
        "mipmap-xxhdpi": (144, 324),
        "mipmap-xxxhdpi": (192, 432),
    }

    for folder, (app_size, fg_size) in densities.items():
        folder_path = os.path.join(base_res_dir, folder)
        os.makedirs(folder_path, exist_ok=True)

        # 1. Standard App Icon (Rounded square)
        img = Image.new("RGBA", (app_size * 4, app_size * 4), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)
        
        # Rounded rectangle background (Family Crimson Gradient)
        radius = int(app_size * 4 * 0.24)
        draw.rounded_rectangle([0, 0, app_size * 4 - 1, app_size * 4 - 1], radius=radius, fill=(225, 29, 72, 255))
        
        # Subtle glow border
        draw.rounded_rectangle([0, 0, app_size * 4 - 1, app_size * 4 - 1], radius=radius, outline=(244, 63, 94, 255), width=max(2, app_size // 8))
        
        # White Heart in center
        draw_heart(draw, (app_size * 4) / 2, (app_size * 4) / 2 - (app_size * 4 * 0.03), app_size * 4 * 0.52, (255, 255, 255, 255))
        
        img_resized = img.resize((app_size, app_size), Image.Resampling.LANCZOS)
        img_resized.save(os.path.join(folder_path, "ic_launcher.png"))

        # 2. Round App Icon (Circle)
        img_round = Image.new("RGBA", (app_size * 4, app_size * 4), (0, 0, 0, 0))
        draw_round = ImageDraw.Draw(img_round)
        draw_round.ellipse([0, 0, app_size * 4 - 1, app_size * 4 - 1], fill=(225, 29, 72, 255))
        draw_round.ellipse([0, 0, app_size * 4 - 1, app_size * 4 - 1], outline=(244, 63, 94, 255), width=max(2, app_size // 8))
        draw_heart(draw_round, (app_size * 4) / 2, (app_size * 4) / 2 - (app_size * 4 * 0.03), app_size * 4 * 0.52, (255, 255, 255, 255))
        
        img_round_resized = img_round.resize((app_size, app_size), Image.Resampling.LANCZOS)
        img_round_resized.save(os.path.join(folder_path, "ic_launcher_round.png"))

        # 3. Foreground Icon (Adaptive Icon)
        img_fg = Image.new("RGBA", (fg_size * 2, fg_size * 2), (0, 0, 0, 0))
        draw_fg = ImageDraw.Draw(img_fg)
        draw_heart(draw_fg, (fg_size * 2) / 2, (fg_size * 2) / 2 - (fg_size * 2 * 0.02), fg_size * 2 * 0.38, (255, 255, 255, 255))
        
        img_fg_resized = img_fg.resize((fg_size, fg_size), Image.Resampling.LANCZOS)
        img_fg_resized.save(os.path.join(folder_path, "ic_launcher_foreground.png"))

        print(f"Generated icons for {folder}: {app_size}x{app_size}")

if __name__ == "__main__":
    generate_icons()
