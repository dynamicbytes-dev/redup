import sys
from PIL import Image, ImageFilter, ImageOps

src_path = "/Users/rosangeles/.gemini/antigravity/brain/1fef806d-0158-489a-b187-27dc55328865/.user_uploaded/media_1794498461267_71f42558.jpg"
img = Image.open(src_path)

# Cloud crop from the uploaded image
bbox = (220, 100, 500, 280)
crop = img.crop(bbox)

w, h = crop.size
alpha_mask = Image.new('L', (w, h), 0)

for y in range(h):
    for x in range(w):
        r, g, b = crop.getpixel((x, y))[:3]
        val = min(r, g, b)
        if val >= 135:
            a = 255
        elif val <= 35:
            a = 0
        else:
            t = (val - 35) / (135 - 35)
            a = int((3 * t**2 - 2 * t**3) * 255)
        alpha_mask.putpixel((x, y), a)

# Slightly dilate alpha mask (1px max filter) to ensure optical weight at small icon sizes
alpha_dilated = alpha_mask.filter(ImageFilter.MaxFilter(3))
# Blend 70% dilated + 30% original for crisp, anti-aliased, bold micro-iconography
alpha_blended = Image.blend(alpha_mask, alpha_dilated, 0.45)

icon_crop = Image.new('RGBA', (w, h), (255, 255, 255, 0))
icon_crop.putalpha(alpha_blended)

# Trim to content
trim_box = icon_crop.getbbox()
trimmed = icon_crop.crop(trim_box)
tw, th = trimmed.size

print(f"Trimmed cloud size: {tw}x{th}")

def generate_square_icon(target_size, padding_ratio=0.10):
    canvas = Image.new('RGBA', (target_size, target_size), (0, 0, 0, 0))
    max_dim = int(target_size * (1 - 2 * padding_ratio))
    
    # Keep aspect ratio
    scale = min(max_dim / tw, max_dim / th)
    new_w = int(round(tw * scale))
    new_h = int(round(th * scale))
    
    scaled = trimmed.resize((new_w, new_h), Image.LANCZOS)
    
    offset_x = (target_size - new_w) // 2
    offset_y = (target_size - new_h) // 2
    
    canvas.paste(scaled, (offset_x, offset_y), scaled)
    return canvas

# Save Expo primary asset
icon_192 = generate_square_icon(192, padding_ratio=0.10)
icon_192.save("assets/images/notification-icon.png", "PNG")
print("Saved assets/images/notification-icon.png (192x192)")

# Android native drawables
densities = [
    ("android/app/src/main/res/drawable-mdpi/notification_icon.png", 24),
    ("android/app/src/main/res/drawable-hdpi/notification_icon.png", 36),
    ("android/app/src/main/res/drawable-xhdpi/notification_icon.png", 48),
    ("android/app/src/main/res/drawable-xxhdpi/notification_icon.png", 72),
    ("android/app/src/main/res/drawable-xxxhdpi/notification_icon.png", 96),
]

for out_path, sz in densities:
    ic = generate_square_icon(sz, padding_ratio=0.10)
    ic.save(out_path, "PNG")
    print(f"Saved {out_path} ({sz}x{sz})")

