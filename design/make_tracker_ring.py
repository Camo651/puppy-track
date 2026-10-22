from PIL import Image, ImageDraw, ImageFilter
import os

SRC = "/Users/matthagger/.cursor/projects/Users-matthagger-Desktop-projects-puppy-track/assets/Stylized_Tri-Color_Puppy_Portrait-33f41912-b05e-4f7a-ac72-77d8fe81609f.png"
DELIV = "/Users/matthagger/Desktop/projects/puppy-track/design/app-icons/tracker-ring"
PUBLIC = "/Users/matthagger/Desktop/projects/puppy-track/packages/frontend/public"
os.makedirs(DELIV, exist_ok=True)

SS = 4
BASE = 512
BIG = BASE * SS
CX = CY = BIG // 2
RADIUS = int(BASE * 0.2237) * SS  # rounded-square corner radius

AMBER = (248, 178, 74)
WHITE = (255, 255, 255)

puppy = Image.open(SRC).convert("RGBA")


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def darker(c, f=0.80):
    return tuple(int(x * f) for x in c)


def amber_gradient():
    g = Image.new("RGB", (BIG, BIG))
    px = g.load()
    top = lerp(AMBER, WHITE, 0.12)
    bot = darker(AMBER, 0.80)
    for y in range(BIG):
        c = lerp(top, bot, y / (BIG - 1))
        for x in range(BIG):
            px[x, y] = c
    return g.convert("RGBA")


def rounded_alpha(img, radius):
    m = Image.new("L", img.size, 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, img.size[0] - 1, img.size[1] - 1], radius=radius, fill=255)
    img.putalpha(m)
    return img


def compose_content(scale=1.0, with_ring=True, ring_color=AMBER, plate_shadow=True):
    """Transparent BIG canvas with the white plate + puppy, optional dashed ring."""
    layer = Image.new("RGBA", (BIG, BIG), (0, 0, 0, 0))

    d = int(BIG * 0.68 * scale)
    left = CX - d // 2
    top = CY - d // 2

    if plate_shadow:
        sh = Image.new("RGBA", (BIG, BIG), (0, 0, 0, 0))
        ImageDraw.Draw(sh).ellipse([left, top + int(d * 0.03), left + d, top + d + int(d * 0.03)],
                                   fill=(0, 0, 0, 70))
        sh = sh.filter(ImageFilter.GaussianBlur(BIG * 0.02))
        layer = Image.alpha_composite(layer, sh)

    if with_ring:
        rl = Image.new("RGBA", (BIG, BIG), (0, 0, 0, 0))
        rd = ImageDraw.Draw(rl)
        rr = int(d * 0.62)
        w = int(BIG * 0.022 * scale)
        seg, gap, ang = 18, 6, 0
        while ang < 360:
            rd.arc([CX - rr, CY - rr, CX + rr, CY + rr], ang, ang + seg,
                   fill=ring_color + (235,), width=w)
            ang += seg + gap
        layer = Image.alpha_composite(layer, rl)

    # white plate
    plate = Image.new("RGBA", (BIG, BIG), (0, 0, 0, 0))
    ImageDraw.Draw(plate).ellipse([left, top, left + d, top + d], fill=WHITE + (255,))
    layer = Image.alpha_composite(layer, plate)

    # puppy fitted + circular mask
    pd = int(d * 0.98)
    pup = puppy.resize((pd, pd), Image.LANCZOS)
    mask = Image.new("L", (pd, pd), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, pd - 1, pd - 1], fill=255)
    pl = Image.new("RGBA", (BIG, BIG), (0, 0, 0, 0))
    pl.paste(pup, (CX - pd // 2, CY - pd // 2), mask)
    layer = Image.alpha_composite(layer, pl)

    return layer


def tight_crop(img, margin_frac=0.04):
    bbox = img.getbbox()
    if not bbox:
        return img
    cropped = img.crop(bbox)
    w, h = cropped.size
    side = max(w, h)
    margin = int(side * margin_frac)
    canvas = side + margin * 2
    out = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    out.paste(cropped, ((canvas - w) // 2, (canvas - h) // 2), cropped)
    return out


def save(img, path, size):
    img.resize((size, size), Image.LANCZOS).save(path)
    print("  wrote", os.path.relpath(path), f"{size}x{size}")


# ---------- high-quality deliverables (1024) ----------
print("deliverables:")
# 1. inner circle only, transparent
inner = tight_crop(compose_content(with_ring=False))
save(inner, os.path.join(DELIV, "inner-circle.png"), 1024)

# 2. inner circle + dashed ring, transparent (amber ring so it reads on any bg)
inner_ring = tight_crop(compose_content(with_ring=True, ring_color=AMBER))
save(inner_ring, os.path.join(DELIV, "inner-circle-dashed-ring.png"), 1024)

# 3. app icon: white dashed ring on amber, rounded square
app = amber_gradient()
app = Image.alpha_composite(app, compose_content(with_ring=True, ring_color=WHITE))
app_rounded = rounded_alpha(app.copy(), RADIUS)
save(app_rounded, os.path.join(DELIV, "app-icon.png"), 1024)

# ---------- wired public/ assets ----------
print("public assets:")
# full-bleed square amber icon (OS applies its own corner rounding)
app_square = amber_gradient()
app_square = Image.alpha_composite(app_square, compose_content(with_ring=True, ring_color=WHITE))
app_square_rgb = app_square.convert("RGB")

save(app_square_rgb, os.path.join(PUBLIC, "icon-192.png"), 192)
save(app_square_rgb, os.path.join(PUBLIC, "icon-512.png"), 512)
save(app_square_rgb, os.path.join(PUBLIC, "apple-touch-icon.png"), 180)
save(app_square_rgb, os.path.join(PUBLIC, "favicon-32.png"), 32)
save(app_square_rgb, os.path.join(PUBLIC, "favicon-16.png"), 16)

# maskable: content pulled into the safe zone (~80%), full amber bleed
mask_icon = amber_gradient()
mask_icon = Image.alpha_composite(mask_icon, compose_content(scale=0.82, with_ring=True, ring_color=WHITE))
save(mask_icon.convert("RGB"), os.path.join(PUBLIC, "icon-512-maskable.png"), 512)

print("done")
