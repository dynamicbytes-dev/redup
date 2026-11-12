import os
from PIL import Image, ImageDraw, ImageFilter

src_path = "/Users/rosangeles/.gemini/antigravity/brain/1fef806d-0158-489a-b187-27dc55328865/.user_uploaded/media_1794498768906_9bb46543.webp"
raw_img = Image.open(src_path).convert("RGBA").resize((1024, 1024), Image.LANCZOS)

# Create perfectly smooth circular cut of Itachi's Sharingan
circle_mask = Image.new("L", (1024, 1024), 0)
mask_draw = ImageDraw.Draw(circle_mask)
mask_draw.ellipse([512 - 482, 512 - 482, 512 + 482, 512 + 482], fill=255)
circle_mask = circle_mask.filter(ImageFilter.GaussianBlur(1.0))

sharingan_circle = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
sharingan_circle.paste(raw_img, (0, 0))
orig_alpha = raw_img.getchannel("A")
final_alpha = Image.new("L", (1024, 1024), 0)
for y in range(1024):
    for x in range(1024):
        final_alpha.putpixel((x, y), min(orig_alpha.getpixel((x, y)), circle_mask.getpixel((x, y))))
sharingan_circle.putalpha(final_alpha)

# 1. assets/images/logo.png (dedicated crisp logo image)
sharingan_circle.save("assets/images/logo.png", "PNG")
print("Saved assets/images/logo.png")

# 2. assets/images/icon.png
icon = Image.new("RGBA", (1024, 1024), (11, 11, 14, 255))
icon.paste(sharingan_circle, (0, 0), sharingan_circle)
icon.save("assets/images/icon.png", "PNG")
print("Saved assets/images/icon.png")

# 3. assets/images/splash-icon.png
# Transparent background with Sharingan centered
splash_ic = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
s_sz = 720
scaled_s = sharingan_circle.resize((s_sz, s_sz), Image.LANCZOS)
s_off = (1024 - s_sz) // 2
splash_ic.paste(scaled_s, (s_off, s_off), scaled_s)
splash_ic.save("assets/images/splash-icon.png", "PNG")
print("Saved assets/images/splash-icon.png")

# 4. Android native splashscreen_logo.png
splash_densities = {
    "drawable-mdpi": 288,
    "drawable-hdpi": 432,
    "drawable-xhdpi": 576,
    "drawable-xxhdpi": 864,
    "drawable-xxxhdpi": 1152,
}

res_dir = "android/app/src/main/res"
for folder, size in splash_densities.items():
    folder_path = os.path.join(res_dir, folder)
    if os.path.isdir(folder_path):
        target = os.path.join(folder_path, "splashscreen_logo.png")
        # Splash canvas is size x size, Sharingan centered with 0.62 safe ratio
        sp_canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        sh_sz = int(size * 0.62)
        sh_img = sharingan_circle.resize((sh_sz, sh_sz), Image.LANCZOS)
        off = (size - sh_sz) // 2
        sp_canvas.paste(sh_img, (off, off), sh_img)
        sp_canvas.save(target, "PNG")
        print(f"Updated {target} ({size}x{size})")

