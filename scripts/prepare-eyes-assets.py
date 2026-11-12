import os
from PIL import Image, ImageFilter

src = "/Users/rosangeles/.gemini/antigravity/brain/1fef806d-0158-489a-b187-27dc55328865/.user_uploaded/media_1794498874669_77cb667e.jpg"
img = Image.open(src).convert("RGBA")
w, h = img.size

# Upscale 3x using high quality Lanczos for crisp retina display
scale = 3
w3, h3 = w * scale, h * scale
up = img.resize((w3, h3), Image.LANCZOS)

# 1. Base Eyes (remove blood below y=114 in original, so y=114*3=342 in upscaled)
base_eyes = up.copy()
blood_threshold_y = 114 * scale

for y in range(h3):
    for x in range(w3):
        # In the left eye region below threshold
        if y >= blood_threshold_y and x < 120 * scale:
            r, g, b, a = base_eyes.getpixel((x, y))
            # If it's blood (red > 50 and g < 45 and b < 45), fill with background black
            if r > 40 and g < 45 and b < 45:
                base_eyes.putpixel((x, y), (0, 0, 0, 255))

# Smooth the edge around y=blood_threshold_y
base_eyes.save("assets/images/itachi-eyes-base.png", "PNG")
print("Saved assets/images/itachi-eyes-base.png")

# 2. Blood Layer (isolated transparent layer)
blood_layer = Image.new("RGBA", (w3, h3), (0, 0, 0, 0))
for y in range(h3):
    for x in range(w3):
        if y >= (112 * scale) and x < (120 * scale):
            r, g, b, a = up.getpixel((x, y))
            # Blood pixel detection
            if r > 45 and g < 40 and b < 40:
                # Retain rich crimson color and calculate alpha
                alpha = min(255, int((r / 180.0) * 255))
                # Boost blood vibrancy slightly for dramatic anime effect
                cr = min(255, int(r * 1.15))
                blood_layer.putpixel((x, y), (cr, g, b, alpha))

blood_layer.save("assets/images/itachi-eyes-blood.png", "PNG")
print("Saved assets/images/itachi-eyes-blood.png")

