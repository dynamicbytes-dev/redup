from PIL import Image, ImageDraw, ImageFilter

src = "/Users/rosangeles/.gemini/antigravity/brain/1fef806d-0158-489a-b187-27dc55328865/.user_uploaded/media_1794498874669_77cb667e.jpg"
img = Image.open(src).convert("RGBA")

# Crop tightly around the eyes and blood:
# x: 4..231, y: 78..184
# Size: 227 x 106
crop = img.crop((4, 78, 231, 184))
w, h = crop.size

# Upscale 3x with Lanczos for ultra-crisp display on mobile Retina screens
scale = 3
w3, h3 = w * scale, h * scale
up = crop.resize((w3, h3), Image.LANCZOS)

# Blood threshold: in crop coordinates, blood begins around y=36 (in 3x: 36*3 = 108)
blood_y_start = 36 * scale

# 1. Open Eyes (without blood, on transparent background)
open_eyes = Image.new("RGBA", (w3, h3), (0, 0, 0, 0))

# Mask non-black pixels of eyes only
eye_mask = Image.new("L", (w3, h3), 0)
for y in range(h3):
    for x in range(w3):
        # Eyes are in the upper section (y < blood_y_start + 6*scale)
        if y < (blood_y_start + 6 * scale):
            r, g, b, a = up.getpixel((x, y))
            if r > 30 or g > 30 or b > 30:
                eye_mask.putpixel((x, y), 255)

# Expand mask by 6px to include outer black eyeliner and eyelashes
eye_mask_dilated = eye_mask.filter(ImageFilter.MaxFilter(int(scale * 2.5)))
eye_mask_smooth = eye_mask_dilated.filter(ImageFilter.GaussianBlur(1.2))

for y in range(h3):
    for x in range(w3):
        a = eye_mask_smooth.getpixel((x, y))
        if a > 0:
            r, g, b, _ = up.getpixel((x, y))
            # In the lower left area, clear out any residual blood from the base
            if y >= blood_y_start and x < (110 * scale):
                if r > 45 and g < 45 and b < 45:
                    r, g, b = 0, 0, 0
            open_eyes.putpixel((x, y), (r, g, b, a))

open_eyes.save("assets/images/itachi-eyes-open.png", "PNG")
print("Saved assets/images/itachi-eyes-open.png")

# 2. Blood Layer (isolated on transparent background)
blood_layer = Image.new("RGBA", (w3, h3), (0, 0, 0, 0))
for y in range(h3):
    for x in range(w3):
        if y >= (blood_y_start - 2 * scale) and x < (115 * scale):
            r, g, b, a = up.getpixel((x, y))
            if r > 45 and g < 42 and b < 42:
                alpha = min(255, int((r / 180.0) * 255))
                # Boost blood vibrancy slightly for high-impact anime look
                cr = min(255, int(r * 1.2))
                blood_layer.putpixel((x, y), (cr, g, b, alpha))

blood_layer.save("assets/images/itachi-eyes-blood.png", "PNG")
print("Saved assets/images/itachi-eyes-blood.png")

# 3. Closed Eyes Layer (the closed eyelid crease and lash line)
closed_eyes = Image.new("RGBA", (w3, h3), (0, 0, 0, 0))
draw = ImageDraw.Draw(closed_eyes)

# Left eye closed crease: curves from ~x=25 to x=85 around y=24
# Right eye closed crease: curves from ~x=145 to x=210 around y=24
# In 3x coordinates:
draw.arc([15 * scale, 16 * scale, 90 * scale, 32 * scale], start=185, end=355, fill=(15, 15, 18, 255), width=int(scale * 2.2))
draw.arc([140 * scale, 16 * scale, 215 * scale, 32 * scale], start=185, end=355, fill=(15, 15, 18, 255), width=int(scale * 2.2))

closed_eyes.save("assets/images/itachi-eyes-closed.png", "PNG")
print("Saved assets/images/itachi-eyes-closed.png")

