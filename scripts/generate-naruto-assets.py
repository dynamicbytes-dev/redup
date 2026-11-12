import math
from PIL import Image, ImageDraw, ImageFilter

def create_sasuke_sharingan(size=1024, padding_ratio=0.1, bg_color=None, add_glow=True):
    """
    Renders Sasuke Uchiha's Mangekyo Sharingan:
    - Deep crimson iris
    - Center black pupil
    - 3 intersecting black ellipses at 0, 60, 120 degrees forming the iconic 6-point star
    - Thick outer black limbal ring
    - High-quality supersampling (4x)
    """
    scale = 4
    canvas_size = size * scale
    img = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    cx = canvas_size / 2
    cy = canvas_size / 2
    
    # Outer radius based on padding
    radius = (canvas_size / 2) * (1.0 - padding_ratio)

    if bg_color:
        bg = Image.new("RGBA", (canvas_size, canvas_size), bg_color)
        img = bg
        draw = ImageDraw.Draw(img)

    # Subtle red chakra glow behind the eye if requested
    if add_glow:
        glow_layer = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
        glow_draw = ImageDraw.Draw(glow_layer)
        glow_draw.ellipse(
            [cx - radius * 1.08, cy - radius * 1.08, cx + radius * 1.08, cy + radius * 1.08],
            fill=(220, 20, 30, 90)
        )
        glow_layer = glow_layer.filter(ImageFilter.GaussianBlur(radius * 0.15))
        img = Image.alpha_composite(img, glow_layer)
        draw = ImageDraw.Draw(img)

    # 1. Base Iris: Crimson red with subtle radial gradation
    iris_layer = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    iris_draw = ImageDraw.Draw(iris_layer)

    # Multi-layered gradient rings for deep organic look
    num_rings = 40
    for i in range(num_rings, 0, -1):
        r = radius * (i / num_rings)
        # From vibrant red #E6192E at center to dark crimson #8A0713 at edge
        factor = i / num_rings
        red = int(235 - factor * 75)
        green = int(25 - factor * 20)
        blue = int(35 - factor * 25)
        iris_draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(red, green, blue, 255))

    img = Image.alpha_composite(img, iris_layer)
    draw = ImageDraw.Draw(img)

    # 2. Sasuke's 6-pointed Mangekyo Sharingan pattern:
    # It consists of 3 intersecting ellipses through the center at angles 0°, 60°, and 120°
    pattern_layer = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    
    # Create one horizontal ellipse in a separate high-res layer
    ellipse_w = radius * 1.84
    ellipse_h = radius * 0.44

    base_ellipse = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    base_draw = ImageDraw.Draw(base_ellipse)
    base_draw.ellipse(
        [cx - ellipse_w / 2, cy - ellipse_h / 2, cx + ellipse_w / 2, cy + ellipse_h / 2],
        fill=(12, 11, 16, 255)
    )

    # Rotate by 0, 60, and 120 degrees and composite
    for angle in [0, 60, 120]:
        rotated = base_ellipse.rotate(angle, resample=Image.BICUBIC, center=(cx, cy))
        pattern_layer = Image.alpha_composite(pattern_layer, rotated)

    # Draw the inner red hollows if needed, or in Sasuke's MS, the 3 ellipses cross:
    # When 3 black ellipses cross, they leave 6 red petal gaps in between, and a solid black central area.
    # To match Sasuke's exact MS, in the center there is a small black pupil ring and central pupil.
    img = Image.alpha_composite(img, pattern_layer)
    draw = ImageDraw.Draw(img)

    # 3. Outer black limbal ring
    ring_thickness = radius * 0.08
    draw.ellipse(
        [cx - radius, cy - radius, cx + radius, cy + radius],
        outline=(12, 11, 16, 255),
        width=int(ring_thickness)
    )
    # Thin bright red highlight ring right inside the black ring
    draw.ellipse(
        [cx - (radius - ring_thickness), cy - (radius - ring_thickness),
         cx + (radius - ring_thickness), cy + (radius - ring_thickness)],
        outline=(255, 60, 70, 70),
        width=int(scale * 2)
    )

    # 4. Central pupil (deep obsidian black circle)
    pupil_radius = radius * 0.17
    draw.ellipse(
        [cx - pupil_radius, cy - pupil_radius, cx + pupil_radius, cy + pupil_radius],
        fill=(8, 7, 10, 255)
    )
    # Pupil reflection dot (ninja glare)
    glare_r = pupil_radius * 0.28
    draw.ellipse(
        [cx - pupil_radius * 0.35 - glare_r, cy - pupil_radius * 0.35 - glare_r,
         cx - pupil_radius * 0.35 + glare_r, cy - pupil_radius * 0.35 + glare_r],
        fill=(255, 255, 255, 140)
    )

    # Resize with antialiasing down to target size
    final_img = img.resize((size, size), Image.LANCZOS)
    return final_img

def create_sasuke_sharingan_monochrome(size=1024, padding_ratio=0.18):
    """
    Pure white silhouette for Android 13+ monochrome adaptive icon.
    """
    scale = 4
    canvas_size = size * scale
    img = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    cx = canvas_size / 2
    cy = canvas_size / 2
    radius = (canvas_size / 2) * (1.0 - padding_ratio)

    # Outer circle
    draw.ellipse([cx - radius, cy - radius, cx + radius, cy + radius], outline=(255, 255, 255, 255), width=int(radius * 0.08))

    # 3 intersecting ellipses
    ellipse_w = radius * 1.84
    ellipse_h = radius * 0.44

    base_ellipse = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    base_draw = ImageDraw.Draw(base_ellipse)
    base_draw.ellipse(
        [cx - ellipse_w / 2, cy - ellipse_h / 2, cx + ellipse_w / 2, cy + ellipse_h / 2],
        fill=(255, 255, 255, 255)
    )

    pattern_layer = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    for angle in [0, 60, 120]:
        rotated = base_ellipse.rotate(angle, resample=Image.BICUBIC, center=(cx, cy))
        pattern_layer = Image.alpha_composite(pattern_layer, rotated)

    img = Image.alpha_composite(img, pattern_layer)
    draw = ImageDraw.Draw(img)

    # Center pupil
    pupil_radius = radius * 0.17
    draw.ellipse([cx - pupil_radius, cy - pupil_radius, cx + pupil_radius, cy + pupil_radius], fill=(255, 255, 255, 255))

    return img.resize((size, size), Image.LANCZOS)

def create_akatsuki_cloud(size=192, monochrome=True, with_red_fill=False):
    """
    Renders the iconic Akatsuki cloud:
    - Distinctive billowing puffs with curly tail/spiral.
    - If monochrome: white silhouette on transparent (for Android notification bar).
    - If with_red_fill: Akatsuki red (#DC2626) with white outline.
    """
    scale = 4
    canvas_size = size * scale
    img = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    cx = canvas_size * 0.48
    cy = canvas_size * 0.52
    unit = canvas_size * 0.08

    # The Akatsuki cloud consists of overlapping circles creating the puff shape
    # Puffs:
    # 1. Main center-top puff
    # 2. Right-top puff
    # 3. Left-top puff
    # 4. Far right tail/spiral puff
    # 5. Far left tail curl
    # 6. Flat/bottom puffs
    puffs = [
        (cx - unit * 1.8, cy + unit * 0.2, unit * 2.2),  # Left base
        (cx - unit * 1.2, cy - unit * 1.2, unit * 2.4),  # Left top puff
        (cx + unit * 0.6, cy - unit * 1.6, unit * 2.8),  # Center top main puff
        (cx + unit * 2.4, cy - unit * 0.6, unit * 2.5),  # Right top puff
        (cx + unit * 3.2, cy + unit * 1.0, unit * 2.0),  # Right bottom puff
        (cx + unit * 1.2, cy + unit * 1.4, unit * 2.3),  # Center bottom
        (cx - unit * 0.8, cy + unit * 1.3, unit * 2.1),  # Center-left bottom
    ]

    fill_color = (255, 255, 255, 255) if monochrome else (220, 38, 38, 255)
    outline_color = (255, 255, 255, 255)

    # Cloud body layer
    cloud_layer = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    cloud_draw = ImageDraw.Draw(cloud_layer)

    for px, py, pr in puffs:
        cloud_draw.ellipse([px - pr, py - pr, px + pr, py + pr], fill=fill_color)

    # Inner swirl of the Akatsuki cloud (the famous spiral on the left side)
    # A curved stroke cut into or drawn on the cloud
    if not monochrome:
        # White spiral line
        swirl_r = unit * 1.3
        cloud_draw.arc(
            [cx - unit * 2.0 - swirl_r, cy - unit * 0.6 - swirl_r,
             cx - unit * 2.0 + swirl_r, cy - unit * 0.6 + swirl_r],
            start=40, end=320, fill=(255, 255, 255, 255), width=int(scale * 3)
        )
    else:
        # Cutout spiral inside monochrome silhouette
        swirl_r = unit * 1.1
        cloud_draw.arc(
            [cx - unit * 1.9 - swirl_r, cy - unit * 0.5 - swirl_r,
             cx - unit * 1.9 + swirl_r, cy - unit * 0.5 + swirl_r],
            start=40, end=320, fill=(0, 0, 0, 255), width=int(scale * 2.5)
        )

    # Resize down with antialiasing
    return cloud_layer.resize((size, size), Image.LANCZOS)

def main():
    print("Generating Sasuke Sharingan & Akatsuki assets...")

    # 1. Main app icon (1024x1024 with dark background and glow)
    icon = create_sasuke_sharingan(size=1024, padding_ratio=0.08, bg_color=(11, 11, 14, 255), add_glow=True)
    icon.save("assets/images/icon.png", "PNG")
    print("Saved assets/images/icon.png")

    # 2. Android adaptive icon background (1024x1024 dark ninja obsidian)
    bg = Image.new("RGBA", (1024, 1024), (11, 11, 14, 255))
    # Subtle dark red ambient gradient
    bg_draw = ImageDraw.Draw(bg)
    bg_draw.ellipse([1024*0.2, 1024*0.2, 1024*0.8, 1024*0.8], fill=(35, 12, 16, 255))
    bg = bg.filter(ImageFilter.GaussianBlur(120))
    bg.save("assets/images/android-icon-background.png", "PNG")
    print("Saved assets/images/android-icon-background.png")

    # 3. Android adaptive icon foreground (1024x1024 with Sharingan in safe zone ~580px, padding=0.22)
    fg = create_sasuke_sharingan(size=1024, padding_ratio=0.22, bg_color=None, add_glow=True)
    fg.save("assets/images/android-icon-foreground.png", "PNG")
    print("Saved assets/images/android-icon-foreground.png")

    # 4. Android adaptive monochrome icon (1024x1024 white silhouette)
    mono = create_sasuke_sharingan_monochrome(size=1024, padding_ratio=0.22)
    mono.save("assets/images/android-icon-monochrome.png", "PNG")
    print("Saved assets/images/android-icon-monochrome.png")

    # 5. Splash icon (1024x1024 Sharingan)
    splash = create_sasuke_sharingan(size=1024, padding_ratio=0.15, bg_color=None, add_glow=True)
    splash.save("assets/images/splash-icon.png", "PNG")
    print("Saved assets/images/splash-icon.png")

    # 6. Favicon (192x192)
    favicon = create_sasuke_sharingan(size=192, padding_ratio=0.06, bg_color=(11, 11, 14, 255), add_glow=False)
    favicon.save("assets/images/favicon.png", "PNG")
    print("Saved assets/images/favicon.png")

    # 7. Notification icon (192x192 Akatsuki Cloud - pure white monochrome on transparent for Android status bar)
    notif = create_akatsuki_cloud(size=192, monochrome=True)
    notif.save("assets/images/notification-icon.png", "PNG")
    print("Saved assets/images/notification-icon.png")

    print("All assets successfully generated!")

if __name__ == "__main__":
    main()
