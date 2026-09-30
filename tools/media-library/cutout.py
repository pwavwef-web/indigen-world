#!/usr/bin/env python3
"""Cut the generated stickers out of their chroma-key background, and check them.

Nano Banana Pro returns opaque images, and asked for "a transparent background"
image models tend to paint a grey-and-white checkerboard, which is the fake
transparency the library must never contain. So every sticker is painted on a
flat, uniform chroma colour (pure green, or magenta for the one subject that is
green) with a white die-cut border, and this script removes that colour.

How the cut works:

1. The background colour is read from the image's own border rather than
   assumed, and the border must be uniform. A checkerboard, a gradient or a
   shadow fails here instead of producing a blotchy cut-out.
2. Background is what is connected to the edges of the frame and close to that
   colour, found with a flood fill. The subject's own colours are never touched
   just for resembling the key: only what is reachable from outside the white
   border goes.
3. Enclosed holes (the middle of a ring, the gap under an arm) are also removed,
   but only where the colour is the key colour almost exactly.
4. Edge pixels get a soft alpha from how much key colour they hold, and the key
   colour's spill is taken out of them, so there is no green fringe.
5. The result is cropped to the subject with an even margin and resized with
   premultiplied alpha (so no key colour bleeds back in).

Then it checks what a person would: the background was flat; the subject is not
cut off at the frame; no key colour is left inside the sticker; the edge band is
clean; the sticker is mostly one piece; there is a white border. The report
says PASS, WARN or FAIL for each, and a contact sheet shows every result on a
checkerboard, a dark and a light background for a human look.

    python tools/media-library/cutout.py            # every downloaded sticker
    python tools/media-library/cutout.py label-new  # just these
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
WORK = ROOT / ".work"
RAW = WORK / "stickers" / "raw"
OUT = WORK / "stickers" / "cut"
BRIEFS = json.loads((ROOT / "briefs" / "stickers.json").read_text(encoding="utf8"))

MAX_SIDE = 512
MARGIN = 0.04


def keyness(rgb: np.ndarray, key: str) -> np.ndarray:
    """How strongly each pixel is the key colour, 0..255 (negative = the opposite)."""
    r, g, b = (rgb[..., i].astype(np.int32) for i in range(3))
    if key == "green":
        return g - np.maximum(r, b)
    return np.minimum(r, b) - g


def detect_background(rgb: np.ndarray) -> dict:
    h, w, _ = rgb.shape
    band = 6
    border = np.concatenate([
        rgb[:band].reshape(-1, 3), rgb[-band:].reshape(-1, 3),
        rgb[:, :band].reshape(-1, 3), rgb[:, -band:].reshape(-1, 3),
    ]).astype(np.float64)
    median = np.median(border, axis=0)
    spread = float(np.mean(np.linalg.norm(border - median, axis=1)))
    r, g, b = median
    if g > 150 and g - max(r, b) > 90:
        key = "green"
    elif min(r, b) > 150 and min(r, b) - g > 90:
        key = "magenta"
    else:
        key = "unknown"
    return {"key": key, "median": [round(v) for v in median], "spread": round(spread, 2)}


def flood_edge_connected(mask: np.ndarray) -> np.ndarray:
    """Pixels of `mask` connected to the frame's edge (4-connectivity), via PIL's C flood fill."""
    h, w = mask.shape
    padded = np.zeros((h + 2, w + 2), dtype=np.uint8)
    padded[1:-1, 1:-1] = np.where(mask, 255, 0)
    padded[0, :] = padded[-1, :] = 255
    padded[:, 0] = padded[:, -1] = 255
    # .copy(): fromarray shares the array's buffer read-only, and a fill on it
    # lands on a private copy the array never sees.
    img = Image.fromarray(padded, "L").copy()
    ImageDraw.floodfill(img, (0, 0), 128, thresh=0)
    return (np.asarray(img)[1:-1, 1:-1] == 128)


def components(mask: np.ndarray, min_size: int = 1) -> list[tuple[int, np.ndarray]]:
    """Connected components of a boolean mask as (size, member-mask), largest first."""
    work = np.where(mask, 255, 0).astype(np.uint8)
    img = Image.fromarray(work, "L").copy()
    found: list[tuple[int, np.ndarray]] = []
    marker = 1
    arr = np.asarray(img)
    while True:
        remaining = np.argwhere(arr == 255)
        if remaining.size == 0 or marker > 250:
            break
        y, x = remaining[0]
        ImageDraw.floodfill(img, (int(x), int(y)), marker, thresh=0)
        arr = np.asarray(img)
        member = arr == marker
        size = int(member.sum())
        if size >= min_size:
            found.append((size, member))
        marker += 1
    found.sort(key=lambda item: -item[0])
    return found


def dilate(mask: np.ndarray, steps: int) -> np.ndarray:
    out = mask.copy()
    for _ in range(steps):
        grown = out.copy()
        grown[1:, :] |= out[:-1, :]
        grown[:-1, :] |= out[1:, :]
        grown[:, 1:] |= out[:, :-1]
        grown[:, :-1] |= out[:, 1:]
        out = grown
    return out


def cut(sticker: dict) -> dict:
    sid = sticker["id"]
    src = next((p for p in RAW.glob(f"{sid}.*")), None)
    if src is None:
        return {"id": sid, "verdict": "MISSING", "checks": {}}
    rgb = np.asarray(Image.open(src).convert("RGB"))
    h, w, _ = rgb.shape
    bg = detect_background(rgb)
    checks: dict[str, dict] = {}
    expected = sticker.get("background", "green")
    # A fake checkerboard, a gradient or a shadow spreads far beyond 40. A green
    # that is merely a little uneven still cuts cleanly — the checks below
    # prove that — so it is only worth a warning.
    right_key = bg["key"] == expected
    checks["flat_background"] = {
        "result": "PASS" if right_key and bg["spread"] < 18 else ("WARN" if right_key and bg["spread"] < 40 else "FAIL"),
        "detail": f"border reads {bg['key']} {bg['median']} (spread {bg['spread']}); expected {expected}",
    }
    key = expected
    k = keyness(rgb, key)
    bg_key = max(1.0, float(np.median(keyness(rgb[:6].reshape(1, -1, 3), key))))

    edge_bg = flood_edge_connected(k > bg_key * 0.45)
    # Holes: the key colour almost exactly, enclosed by the subject.
    tight = (k > bg_key * 0.8) & ~edge_bg
    holes = np.zeros_like(tight)
    for size, member in components(tight, min_size=24):
        holes |= member
    background = edge_bg | holes

    # Soft alpha in a band around the background, from how much key colour a pixel holds.
    band = dilate(background, 2) & ~background
    alpha = np.where(background, 0.0, 1.0)
    lo, hi = bg_key * 0.12, bg_key * 0.6
    soft = np.clip(1.0 - (k.astype(np.float64) - lo) / (hi - lo), 0.0, 1.0)
    alpha = np.where(band, np.minimum(alpha, soft), alpha)

    # Despill: take the key colour's excess out of every visible pixel that has it.
    out = rgb.astype(np.int32).copy()
    if not sticker.get("allowGreen") or key != "green":
        spill = np.clip(k, 0, None)
        if key == "green":
            out[..., 1] -= np.where(band | (alpha > 0), spill, 0)
        else:
            out[..., 0] -= np.where(band | (alpha > 0), spill, 0)
            out[..., 2] -= np.where(band | (alpha > 0), spill, 0)
    out = np.clip(out, 0, 255).astype(np.uint8)

    a8 = (alpha * 255).round().astype(np.uint8)
    opaque = a8 > 127
    checks["not_cut_off"] = {
        "result": "PASS" if not (opaque[0].any() or opaque[-1].any() or opaque[:, 0].any() or opaque[:, -1].any()) else "FAIL",
        "detail": "subject clear of the frame edges" if not opaque[[0, -1]].any() else "subject touches the frame edge",
    }
    coverage = float(opaque.mean())
    checks["coverage"] = {
        "result": "PASS" if 0.08 <= coverage <= 0.85 else "WARN",
        "detail": f"{coverage:.0%} of the frame is sticker",
    }
    inner = (a8 > 230) & ~dilate(~opaque, 3)
    residual = float(((k > bg_key * 0.35) & inner).sum()) / max(1, int(inner.sum()))
    if sticker.get("allowGreen") and key == "green":
        residual = 0.0
    checks["no_key_colour_left"] = {
        "result": "PASS" if residual < 0.004 else ("WARN" if residual < 0.02 else "FAIL"),
        "detail": f"{residual:.2%} of the sticker's inside still reads as {key}",
    }
    edge_band = (a8 > 20) & (a8 < 235)
    halo = float(((keyness(out, key) > 25) & edge_band).sum()) / max(1, int(edge_band.sum()))
    checks["clean_edge"] = {
        "result": "PASS" if halo < 0.02 else ("WARN" if halo < 0.08 else "FAIL"),
        "detail": f"{halo:.1%} of the edge band still tinted {key}",
    }
    parts = components(opaque, min_size=150)
    main = parts[0][0] / max(1, int(opaque.sum())) if parts else 0.0
    checks["one_piece"] = {
        "result": "PASS" if main >= 0.9 else "WARN",
        "detail": f"{len(parts)} opaque parts; the largest holds {main:.0%}",
    }
    rim = opaque & dilate(~opaque, 2)
    white = (out[..., 0] > 225) & (out[..., 1] > 225) & (out[..., 2] > 225)
    rim_white = float((rim & white).sum()) / max(1, int(rim.sum()))
    checks["white_border"] = {
        "result": "PASS" if rim_white >= 0.55 else "WARN",
        "detail": f"{rim_white:.0%} of the outline is white die-cut border",
    }

    # Crop to the subject with an even margin, then resize with premultiplied alpha.
    ys, xs = np.nonzero(a8 > 8)
    rgba = np.dstack([out, a8])
    if ys.size:
        y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        side = max(y1 - y0, x1 - x0)
        pad = int(round(side * MARGIN))
        rgba = rgba[max(0, y0 - pad):min(h, y1 + pad), max(0, x0 - pad):min(w, x1 + pad)]
    image = Image.fromarray(rgba, "RGBA")
    scale = min(1.0, MAX_SIDE / max(image.size))
    if scale < 1.0:
        size = (max(1, round(image.width * scale)), max(1, round(image.height * scale)))
        image = image.convert("RGBa").resize(size, Image.LANCZOS).convert("RGBA")
    OUT.mkdir(parents=True, exist_ok=True)
    dest = OUT / f"{sid}.png"
    image.save(dest, optimize=True)

    worst = "PASS"
    for c in checks.values():
        if c["result"] == "FAIL":
            worst = "FAIL"
        elif c["result"] == "WARN" and worst == "PASS":
            worst = "WARN"
    return {
        "id": sid,
        "verdict": worst,
        "file": str(dest.relative_to(WORK)).replace("\\", "/"),
        "width": image.width,
        "height": image.height,
        "bytes": dest.stat().st_size,
        "background": bg,
        "checks": checks,
    }


def checkerboard(size: tuple[int, int], cell: int = 16) -> Image.Image:
    w, h = size
    board = Image.new("RGB", size, (236, 236, 236))
    draw = ImageDraw.Draw(board)
    for y in range(0, h, cell):
        for x in range(0, w, cell):
            if (x // cell + y // cell) % 2:
                draw.rectangle([x, y, x + cell - 1, y + cell - 1], fill=(200, 200, 200))
    return board


def contact_sheet(results: list[dict]) -> Path:
    tile = 220
    cols = 3  # checker / dark / light for each sticker
    rows = len(results)
    sheet = Image.new("RGB", (tile * cols + 260, tile * rows), (255, 255, 255))
    draw = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.truetype("arial.ttf", 16)
    except OSError:
        font = ImageFont.load_default()
    for row, result in enumerate(results):
        if result.get("verdict") == "MISSING":
            continue
        sticker = Image.open(WORK / result["file"]).convert("RGBA")
        sticker.thumbnail((tile - 20, tile - 20))
        for col, bg in enumerate([None, (24, 22, 48), (250, 247, 240)]):
            base = checkerboard((tile, tile)) if bg is None else Image.new("RGB", (tile, tile), bg)
            base.paste(sticker, ((tile - sticker.width) // 2, (tile - sticker.height) // 2), sticker)
            sheet.paste(base, (col * tile, row * tile))
        colour = {"PASS": (20, 130, 60), "WARN": (190, 120, 0), "FAIL": (190, 30, 30)}[result["verdict"]]
        draw.text((tile * cols + 12, row * tile + 12), result["id"], fill=(20, 20, 20), font=font)
        draw.text((tile * cols + 12, row * tile + 36), result["verdict"], fill=colour, font=font)
        y = row * tile + 60
        for name, check in result["checks"].items():
            if check["result"] != "PASS":
                draw.text((tile * cols + 12, y), f"{name}: {check['result']}", fill=colour, font=font)
                y += 20
    dest = WORK / "stickers" / "contact-sheet.png"
    sheet.save(dest)
    return dest


def main() -> None:
    wanted = set(sys.argv[1:])
    stickers = [s for s in BRIEFS["stickers"] if not wanted or s["id"] in wanted]
    results = [cut(s) for s in stickers]
    results = [r for r in results if r["verdict"] != "MISSING"]
    report_path = WORK / "stickers" / "cutout-report.json"
    previous = json.loads(report_path.read_text(encoding="utf8")) if report_path.exists() else {}
    for r in results:
        previous[r["id"]] = r
    report_path.write_text(json.dumps(previous, indent=2), encoding="utf8")
    sheet = contact_sheet(results) if results else None
    for r in results:
        issues = [f"{n}={c['result']}" for n, c in r["checks"].items() if c["result"] != "PASS"]
        print(f"{r['verdict']:5} {r['id']:26} {r['width']}x{r['height']} {r['bytes'] // 1024} KB {' '.join(issues)}")
    if sheet:
        print(f"contact sheet: {sheet}")


if __name__ == "__main__":
    main()
