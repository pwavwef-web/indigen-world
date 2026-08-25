#!/usr/bin/env python3
"""Redraw the Indigen launcher icon set from geometry, not from a bitmap.

Run from anywhere:  python apps/mobile/tool/generate_app_icons.py

Why this exists
---------------
The launcher artwork used to be one full-bleed 192px PNG, reused for every
purpose: the legacy square icon, the Android 12 splash, and — the mistake — the
*foreground* layer of the adaptive icon. An adaptive foreground is a 108dp
canvas of which a launcher may mask away everything outside the centre 72dp and
then translate what is left for parallax. Handing it art that already contains
its own background and its own kente border means the border is cropped off and
the house glyph is blown up past the edge. Different launchers crop differently,
so the icon looked wrong in a different way on every device.

The fix is to keep the layers apart, and to draw them large enough that nothing
is ever upscaled:

  * ic_launcher_background  — the heritage-green field and the kente bands,
                              full bleed, because it is meant to be cropped.
  * ic_launcher_foreground  — the house, the bars and the sun ONLY, on
                              transparency, inside the centre safe zone so no
                              mask can reach it.
  * ic_launcher_monochrome  — the same glyph in solid white, for the themed
                              icons Android 13+ asks for.
  * mipmap ic_launcher(_round) — the composed mark, for pre-26 launchers.
  * splash_logo             — the glyph alone on transparency, because the
                              splash already paints heritage green behind it.
  * the iOS AppIcon set     — composed, fully opaque, square-cornered.

The geometry below was measured off the approved 1024px master, expressed as
fractions of the canvas so every size is drawn rather than resampled. Shapes are
rendered at 4x and downsampled, which is how they get their antialiased edges —
Pillow's draw primitives have none of their own.
"""

from __future__ import annotations

import os
from PIL import Image, ImageDraw

# ── Palette (sampled from the approved master) ──────────────────────────────
FIELD = (11, 61, 46, 255)  # heritage green   #0B3D2E
BAND = (21, 91, 67, 255)  # savannah green   #155B43
BAND_GOLD = (207, 152, 31, 255)  # kente gold       #CF981F
CREAM = (255, 248, 231, 255)  # plaster cream    #FFF8E7
TERRACOTTA = (182, 90, 58, 255)  # terracotta       #B65A3A
SUN = (216, 155, 29, 255)  # kente gold       #D89B1D
WHITE = (255, 255, 255, 255)
CLEAR = (0, 0, 0, 0)

# ── Geometry, as fractions of the canvas edge ───────────────────────────────
# Kente bands.
BAND_H = 88 / 1024
BAND_PERIOD = 160 / 1024

# The house is one stroked polyline: up the left leg, over the apex, down the
# right leg. Round caps and joins are what give it its soft shoulders.
HOUSE = [
    (252 / 1024, 754 / 1024),
    (252 / 1024, 443 / 1024),
    (512 / 1024, 301 / 1024),
    (772 / 1024, 443 / 1024),
    (772 / 1024, 754 / 1024),
]
HOUSE_STROKE = 64 / 1024

# Three rounded bars under the roof; the middle one stands taller.
BARS = [
    (380 / 1024, 471 / 1024, 737 / 1024),
    (512 / 1024, 407 / 1024, 737 / 1024),
    (644 / 1024, 471 / 1024, 737 / 1024),
]
BAR_W = 52 / 1024

# The sun sits behind the apex, so the roof crosses in front of it.
SUN_C = (511 / 1024, 262 / 1024)
SUN_R = 54 / 1024

# Bounding box of the glyph (house + bars + sun) in the master, used to
# re-centre it when it is drawn on its own.
GLYPH_BOX = (220 / 1024, 208 / 1024, 804 / 1024, 786 / 1024)

SS = 4  # supersampling factor

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ANDROID_RES = os.path.join(REPO, "android", "app", "src", "main", "res")
IOS_ICONS = os.path.join(
    REPO, "ios", "Runner", "Assets.xcassets", "AppIcon.appiconset"
)


# ── Drawing primitives ──────────────────────────────────────────────────────
def _round_line(draw: ImageDraw.ImageDraw, a, b, width: float, fill) -> None:
    """A line with round caps. Pillow's `joint` only helps inside one call."""
    draw.line([a, b], fill=fill, width=int(round(width)))
    r = width / 2
    for x, y in (a, b):
        draw.ellipse([x - r, y - r, x + r, y + r], fill=fill)


def _draw_bands(draw: ImageDraw.ImageDraw, n: int) -> None:
    """The kente border: gold right-triangles marching across a green strip.

    Each triangle fills x from the period start out to `band - y`, which is
    what makes the diagonal read at exactly 45 degrees.
    """
    band = BAND_H * n
    period = BAND_PERIOD * n
    draw.rectangle([0, 0, n, band], fill=BAND)
    draw.rectangle([0, n - band, n, n], fill=BAND)
    x = 0.0
    while x < n:
        # Top band, then the same triangle mirrored along the bottom edge.
        draw.polygon([(x, 0), (x + band, 0), (x, band)], fill=BAND_GOLD)
        draw.polygon(
            [(x, n), (x + band, n), (x, n - band)],
            fill=BAND_GOLD,
        )
        x += period


def _draw_glyph(
    draw: ImageDraw.ImageDraw,
    n: int,
    *,
    scale: float,
    dx: float,
    dy: float,
    mono: bool,
) -> None:
    """House, bars and sun. `mono` collapses the three colours into white."""

    def p(fx: float, fy: float):
        return (n * (fx * scale + dx), n * (fy * scale + dy))

    cream = WHITE if mono else CREAM
    terra = WHITE if mono else TERRACOTTA
    sun = WHITE if mono else SUN

    # The sun first: the roof is meant to cross in front of it.
    cx, cy = p(*SUN_C)
    r = SUN_R * scale * n
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=sun)

    stroke = HOUSE_STROKE * scale * n
    for a, b in zip(HOUSE, HOUSE[1:]):
        _round_line(draw, p(*a), p(*b), stroke, cream)

    half = BAR_W * scale * n / 2
    for fx, top, bottom in BARS:
        x, y0 = p(fx, top)
        _, y1 = p(fx, bottom)
        draw.rounded_rectangle(
            [x - half, y0, x + half, y1], radius=half, fill=terra
        )


def _canvas(n: int, background) -> tuple[Image.Image, ImageDraw.ImageDraw]:
    image = Image.new("RGBA", (n * SS, n * SS), background)
    return image, ImageDraw.Draw(image)


def _finish(image: Image.Image, n: int) -> Image.Image:
    return image.resize((n, n), Image.LANCZOS)


# ── The five images ─────────────────────────────────────────────────────────
def composed(n: int) -> Image.Image:
    """The complete mark: field, kente bands, glyph. Fully opaque."""
    image, draw = _canvas(n, FIELD)
    _draw_bands(draw, n * SS)
    _draw_glyph(draw, n * SS, scale=1.0, dx=0.0, dy=0.0, mono=False)
    return _finish(image, n)


def adaptive_background(n: int) -> Image.Image:
    """Field and bands only. Full bleed — this layer is meant to be cropped."""
    image, draw = _canvas(n, FIELD)
    _draw_bands(draw, n * SS)
    return _finish(image, n)


def _safe_zone_transform() -> tuple[float, float, float]:
    """Fit and centre the glyph inside an adaptive icon's safe zone.

    An adaptive layer is 108dp; only the centre 72dp is guaranteed to survive
    every mask. `GLYPH_TARGET` keeps the glyph a little inside even that, so it
    never crowds the edge of a circle mask.
    """
    glyph_target = 0.56
    x0, y0, x1, y1 = GLYPH_BOX
    scale = glyph_target / max(x1 - x0, y1 - y0)
    dx = 0.5 - (x0 + x1) / 2 * scale
    dy = 0.5 - (y0 + y1) / 2 * scale
    return scale, dx, dy


def adaptive_foreground(n: int, *, mono: bool = False) -> Image.Image:
    """The glyph alone, on transparency, inside the safe zone."""
    scale, dx, dy = _safe_zone_transform()
    image, draw = _canvas(n, CLEAR)
    _draw_glyph(draw, n * SS, scale=scale, dx=dx, dy=dy, mono=mono)
    return _finish(image, n)


def splash(n: int) -> Image.Image:
    """The glyph on transparency for the splash, which paints its own green.

    Android 12+ masks the splash icon to a circle with its own safe zone, so
    this is drawn smaller than the launcher foreground.
    """
    x0, y0, x1, y1 = GLYPH_BOX
    scale = 0.5 / max(x1 - x0, y1 - y0)
    dx = 0.5 - (x0 + x1) / 2 * scale
    dy = 0.5 - (y0 + y1) / 2 * scale
    image, draw = _canvas(n, CLEAR)
    _draw_glyph(draw, n * SS, scale=scale, dx=dx, dy=dy, mono=False)
    return _finish(image, n)


def circle_masked(image: Image.Image) -> Image.Image:
    """Round icon for pre-26 launchers that ask for one."""
    n = image.size[0]
    mask = Image.new("L", (n * SS, n * SS), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, n * SS - 1, n * SS - 1], fill=255)
    out = image.copy()
    out.putalpha(mask.resize((n, n), Image.LANCZOS))
    return out


# ── Output ──────────────────────────────────────────────────────────────────
# 108dp adaptive layers and the legacy 48dp launcher icon, per density bucket.
DENSITIES = {
    "mdpi": 1,
    "hdpi": 1.5,
    "xhdpi": 2,
    "xxhdpi": 3,
    "xxxhdpi": 4,
}

IOS_SIZES = [
    ("Icon-App-20x20@1x.png", 20),
    ("Icon-App-20x20@2x.png", 40),
    ("Icon-App-20x20@3x.png", 60),
    ("Icon-App-29x29@1x.png", 29),
    ("Icon-App-29x29@2x.png", 58),
    ("Icon-App-29x29@3x.png", 87),
    ("Icon-App-40x40@1x.png", 40),
    ("Icon-App-40x40@2x.png", 80),
    ("Icon-App-40x40@3x.png", 120),
    ("Icon-App-60x60@2x.png", 120),
    ("Icon-App-60x60@3x.png", 180),
    ("Icon-App-76x76@1x.png", 76),
    ("Icon-App-76x76@2x.png", 152),
    ("Icon-App-83.5x83.5@2x.png", 167),
    ("Icon-App-1024x1024@1x.png", 1024),
]


def _save(image: Image.Image, *parts: str) -> None:
    path = os.path.join(*parts)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    image.save(path, "PNG", optimize=True)
    print(f"  {os.path.relpath(path, REPO)}  {image.size[0]}x{image.size[1]}")


def main() -> None:
    print("Android adaptive layers + legacy mipmaps")
    for bucket, factor in DENSITIES.items():
        layer = int(round(108 * factor))
        legacy = int(round(48 * factor))
        _save(
            adaptive_background(layer),
            ANDROID_RES,
            f"drawable-{bucket}",
            "ic_launcher_background.png",
        )
        _save(
            adaptive_foreground(layer),
            ANDROID_RES,
            f"drawable-{bucket}",
            "ic_launcher_foreground.png",
        )
        _save(
            adaptive_foreground(layer, mono=True),
            ANDROID_RES,
            f"drawable-{bucket}",
            "ic_launcher_monochrome.png",
        )
        square = composed(legacy)
        _save(square, ANDROID_RES, f"mipmap-{bucket}", "ic_launcher.png")
        _save(
            circle_masked(square),
            ANDROID_RES,
            f"mipmap-{bucket}",
            "ic_launcher_round.png",
        )

    # 128dp per bucket rather than one fixed-pixel nodpi file: the legacy
    # launch_background.xml draws this bitmap at its literal size, so a single
    # large PNG would overflow a low-density screen and look tiny on a tall one.
    print("Splash logo")
    for bucket, factor in DENSITIES.items():
        _save(
            splash(int(round(128 * factor))),
            ANDROID_RES,
            f"drawable-{bucket}",
            "splash_logo.png",
        )

    print("iOS AppIcon set")
    for name, size in IOS_SIZES:
        # iOS composites nothing behind the icon and rounds the corners itself,
        # so every file has to be flattened opaque with square corners.
        _save(composed(size).convert("RGB").convert("RGBA"), IOS_ICONS, name)


if __name__ == "__main__":
    main()
