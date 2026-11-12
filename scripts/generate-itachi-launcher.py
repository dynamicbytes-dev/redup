import os
import math
from PIL import Image, ImageDraw, ImageFilter

src_path = "/Users/rosangeles/.gemini/antigravity/brain/1fef806d-0158-489a-b187-27dc55328865/.user_uploaded/media_1794498768906_9bb46543.webp"
raw_img = Image.open(src_path).convert("RGBA")

# Ensure perfectly square 1024x1024
raw_img = raw_img.resize((1024, 1024), Image.LANCZOS)

# Create a clean circular alpha mask for the Sharingan to eliminate any rough outer pixels
circle_mask = Image.new("L", (1024, 1024), 0)
mask_draw = ImageDraw.Draw(circle_mask)
# Radius 484 to ensure crisp edge
mask_draw.ellipse([512 - 484, 512 - 484, 512 + 484, 512 + 484], fill=255)
circle_mask = circle_mask.filter(ImageFilter.GaussianBlur(0.8))

clean_sharingan = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
clean_sharingan.paste(raw_img, (0, 0))
# Multiply existing alpha with smooth circle mask
orig_alpha = raw_img.getchannel("A")
final_alpha = Image.new("L", (1024, 1024), 0)
for y in range(1024):
    for x in range(1024):
        a1 = orig_alpha.getpixel((x, y))
        a2 = circle_mask.getpixel((x, y))
        final_alpha.putpixel((x, y), min(a1, a2))

clean_sharingan.putalpha(final_alpha)
print("Created clean isolated Sharingan image.")

# 1. assets/images/icon.png (1024x1024)
# Full icon with dark ninja obsidian background and subtle red ambient glow
icon = Image.new("RGBA", (1024, 1024), (11, 11, 14, 255))
icon_draw = ImageDraw.Draw(icon)
# Subtle crimson aura behind Sharingan
icon_draw.ellipse([1024*0.12, 1024*0.12, 1024*0.88, 1024*0.88], fill=(55, 12, 18, 255))
icon = icon.filter(ImageFilter.GaussianBlur(100))

# Place Sharingan scaled to ~90% (padding = 50px)
sharingan_920 = clean_sharingan.resize((924, 924), Image.LANCZOS)
icon.paste(sharingan_920, (50, 50), sharingan_920)
icon.save("assets/images/icon.png", "PNG")
print("Saved assets/images/icon.png")

# 2. assets/images/android-icon-background.png (1024x1024)
bg = Image.new("RGBA", (1024, 1024), (11, 11, 14, 255))
bg_draw = ImageDraw.Draw(bg)
bg_draw.ellipse([1024*0.2, 1024*0.2, 1024*0.8, 1024*0.8], fill=(45, 10, 16, 255))
bg = bg.filter(ImageFilter.GaussianBlur(120))
bg.save("assets/images/android-icon-background.png", "PNG")
print("Saved assets/images/android-icon-background.png")

# 3. assets/images/android-icon-foreground.png (1024x1024)
# Android Adaptive Icon safe zone: 66% (diameter ~676px centered)
fg = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
fg_size = 676
sharingan_fg = clean_sharingan.resize((fg_size, fg_size), Image.LANCZOS)
offset = (1024 - fg_size) // 2
fg.paste(sharingan_fg, (offset, offset), sharingan_fg)
fg.save("assets/images/android-icon-foreground.png", "PNG")
print("Saved assets/images/android-icon-foreground.png")

# 4. assets/images/android-icon-monochrome.png (1024x1024)
# Android 13+ themed icon: white silhouette on transparent
# The red iris becomes white, and the black pinwheel blades become transparent cutouts
mono = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
for y in range(fg_size):
    for x in range(fg_size):
        r, g, b, a = sharingan_fg.getpixel((x, y))
        if a > 20:
            # If red > black (iris or center pupil): make pure white
            # If black blade: transparent
            if r > 60 and (g < 60 and b < 60):
                alpha = int(min(255, a * (r / 255.0)))
                mono.putpixel((offset + x, offset + y), (255, 255, 255, alpha))

mono.save("assets/images/android-icon-monochrome.png", "PNG")
print("Saved assets/images/android-icon-monochrome.png")

# 5. assets/images/splash-icon.png (1024x1024)
splash = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
splash_size = 760
sharingan_splash = clean_sharingan.resize((splash_size, splash_size), Image.LANCZOS)
s_offset = (1024 - splash_size) // 2
splash.paste(sharingan_splash, (s_offset, s_offset), sharingan_splash)
splash.save("assets/images/splash-icon.png", "PNG")
print("Saved assets/images/splash-icon.png")

# 6. assets/images/favicon.png (192x192)
favicon = Image.new("RGBA", (192, 192), (11, 11, 14, 255))
sharingan_fav = clean_sharingan.resize((176, 176), Image.LANCZOS)
favicon.paste(sharingan_fav, (8, 8), sharingan_fav)
favicon.save("assets/images/favicon.png", "PNG")
print("Saved assets/images/favicon.png")

# 7. Update Android Native mipmaps
# Sizes for Android mipmaps:
# mdpi: 48x48, hdpi: 72x72, xhdpi: 96x96, xxhdpi: 144x144, xxxhdpi: 192x192
mipmap_sizes = {
    "mipmap-mdpi": (48, 108),
    "mipmap-hdpi": (72, 162),
    "mipmap-xhdpi": (96, 216),
    "mipmap-xxhdpi": (144, 324),
    "mipmap-xxxhdpi": (192, 432),
}

res_dir = "android/app/src/main/res"
if os.path.isdir(res_dir):
    for folder, (legacy_sz, adaptive_sz) in mipmap_sizes.items():
        dir_path = os.path.join(res_dir, folder)
        if not os.path.isdir(dir_path):
            continue
        
        # 1. ic_launcher.webp (legacy full icon)
        ic_leg = icon.resize((legacy_sz, legacy_sz), Image.LANCZOS)
        ic_leg.save(os.path.join(dir_path, "ic_launcher.webp"), "WEBP")
        
        # 2. ic_launcher_round.webp (circular legacy)
        round_mask = Image.new("L", (legacy_sz, legacy_sz), 0)
        ImageDraw.Draw(round_mask).ellipse([0, 0, legacy_sz, legacy_sz], fill=255)
        ic_round = Image.new("RGBA", (legacy_sz, legacy_sz), (0, 0, 0, 0))
        ic_round.paste(ic_leg, (0, 0))
        ic_round.putalpha(round_mask)
        ic_round.save(os.path.join(dir_path, "ic_launcher_round.webp"), "WEBP")
        
        # 3. ic_launcher_foreground.webp (adaptive)
        ic_fg = fg.resize((adaptive_sz, adaptive_sz), Image.LANCZOS)
        ic_fg.save(os.path.join(dir_path, "ic_launcher_foreground.webp"), "WEBP")
        
        # 4. ic_launcher_background.webp (adaptive)
        ic_bg = bg.resize((adaptive_sz, adaptive_sz), Image.LANCZOS)
        ic_bg.save(os.path.join(dir_path, "ic_launcher_background.webp"), "WEBP")
        
        # 5. ic_launcher_monochrome.webp (adaptive)
        ic_mono = mono.resize((adaptive_sz, adaptive_sz), Image.LANCZOS)
        ic_mono.save(os.path.join(dir_path, "ic_launcher_monochrome.webp"), "WEBP")
        
        print(f"Updated native mipmaps in {folder}")

