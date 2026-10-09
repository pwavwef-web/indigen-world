import type { CaptionCue, CaptionTrack, CardSpec, TextOverlay } from './model';

/**
 * Text, captions and title cards, drawn with the browser's own canvas.
 *
 * The preview calls these on a canvas the size of the stage; an export calls
 * them on a canvas the size of the output frame and uploads the PNGs, which the
 * renderer composites where this code says. The same function draws both, so
 * a line break, a highlighted word or a box edge is where the member saw it.
 * Sizes are fractions of the frame's short side and positions fractions of
 * the frame, so the drawing scales exactly between a 360-pixel stage and a
 * 1080-pixel export.
 */

export const FONT_STACK = '"Segoe UI", Roboto, "Noto Sans", "Helvetica Neue", Arial, system-ui, sans-serif';

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

function wrap(ctx: Ctx, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(next).width > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    lines.push(line);
  }
  return lines.filter((l, i) => l || i === 0);
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  const radius = Math.min(r, h / 2, w / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

// ── Text overlays ───────────────────────────────────────────────────────────

export interface TextBox {
  lines: string[];
  fontPx: number;
  lineHeight: number;
  /** The drawn box around the text, in frame pixels, before motion. */
  left: number;
  top: number;
  width: number;
  height: number;
}

export function layoutText(ctx: Ctx, overlay: TextOverlay, W: number, H: number): TextBox {
  const short = Math.min(W, H);
  const fontPx = Math.max(6, overlay.size * short);
  ctx.font = `${overlay.weight} ${fontPx}px ${FONT_STACK}`;
  const lines = wrap(ctx, overlay.text || ' ', W * 0.86);
  const lineHeight = fontPx * 1.2;
  const textWidth = Math.max(...lines.map((l) => ctx.measureText(l).width), fontPx);
  const padX = overlay.box === 'none' ? fontPx * 0.2 : fontPx * 0.55;
  const padY = overlay.box === 'none' ? fontPx * 0.2 : fontPx * 0.3;
  const width = Math.ceil(textWidth + padX * 2);
  const height = Math.ceil(lines.length * lineHeight + padY * 2);
  return {
    lines,
    fontPx,
    lineHeight,
    width,
    height,
    left: Math.round(overlay.x * W - width / 2),
    top: Math.round(overlay.y * H - height / 2),
  };
}

/** Draws an overlay with its box at ([left], [top]) of [ctx]. */
function paintText(ctx: Ctx, overlay: TextOverlay, box: TextBox, left: number, top: number): void {
  ctx.save();
  if (overlay.box !== 'none') {
    ctx.fillStyle = overlay.boxColor;
    ctx.globalAlpha *= overlay.box === 'box' ? 0.78 : 0.92;
    roundRect(ctx, left, top, box.width, box.height, overlay.box === 'pill' ? box.height / 2 : box.fontPx * 0.18);
    ctx.fill();
    ctx.globalAlpha /= overlay.box === 'box' ? 0.78 : 0.92;
  }
  ctx.font = `${overlay.weight} ${box.fontPx}px ${FONT_STACK}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (overlay.box === 'none') {
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = box.fontPx * 0.18;
    ctx.shadowOffsetY = box.fontPx * 0.04;
  }
  ctx.fillStyle = overlay.color;
  const cx = left + box.width / 2;
  const firstY = top + (box.height - box.lines.length * box.lineHeight) / 2 + box.lineHeight / 2;
  box.lines.forEach((line, i) => ctx.fillText(line, cx, firstY + i * box.lineHeight));
  ctx.restore();
}

/** The preview: the overlay on the stage, with its motion applied. */
export function drawTextOverlay(ctx: Ctx, overlay: TextOverlay, W: number, H: number, state: { alpha: number; scale: number; shift: number }): TextBox {
  const box = layoutText(ctx, overlay, W, H);
  if (state.alpha <= 0) return box;
  ctx.save();
  ctx.globalAlpha = state.alpha;
  const cx = overlay.x * W;
  const cy = overlay.y * H + state.shift * H;
  ctx.translate(cx, cy);
  ctx.scale(state.scale, state.scale);
  ctx.translate(-cx, -cy);
  paintText(ctx, overlay, box, box.left, box.top + state.shift * H);
  ctx.restore();
  return box;
}

/** The export: the overlay alone on a tight transparent canvas, and where it goes. */
export function rasterizeText(overlay: TextOverlay, W: number, H: number): { canvas: HTMLCanvasElement; x: number; y: number } {
  const measure = document.createElement('canvas').getContext('2d')!;
  const box = layoutText(measure, overlay, W, H);
  // Room for the shadow either side.
  const pad = Math.ceil(box.fontPx * 0.3);
  const canvas = document.createElement('canvas');
  canvas.width = box.width + pad * 2;
  canvas.height = box.height + pad * 2;
  const ctx = canvas.getContext('2d')!;
  paintText(ctx, overlay, box, pad, pad);
  return { canvas, x: box.left - pad, y: box.top - pad };
}

// ── Captions ────────────────────────────────────────────────────────────────

export interface CaptionFrame {
  start: number;
  end: number;
  cue: CaptionCue;
  /** The word being spoken in this frame, for word-by-word styles. */
  activeWord: number | null;
}

/**
 * The frames a caption track is shown as. Line styles are one frame per cue;
 * word styles are one frame per word, so the highlight moves with the voice.
 */
export function captionFrames(track: CaptionTrack): CaptionFrame[] {
  const frames: CaptionFrame[] = [];
  const byWord = track.style === 'bold' || track.style === 'karaoke';
  for (const cue of track.cues) {
    if (cue.end - cue.start < 0.05 || !cue.text.trim()) continue;
    const words = cue.words?.filter((w) => w.end > w.start) ?? [];
    if (!byWord || words.length < 2) {
      frames.push({ start: cue.start, end: cue.end, cue, activeWord: null });
      continue;
    }
    words.forEach((w, i) => {
      const start = i === 0 ? cue.start : w.start;
      const end = i === words.length - 1 ? cue.end : words[i + 1]!.start;
      if (end - start > 0.02) frames.push({ start, end, cue, activeWord: i });
    });
  }
  return frames.sort((a, b) => a.start - b.start);
}

export function frameAt(frames: CaptionFrame[], t: number): CaptionFrame | null {
  for (const f of frames) if (t >= f.start && t < f.end) return f;
  return null;
}

const CAPTION_Y = { bottom: 0.82, middle: 0.5, top: 0.16 } as const;

/** Draws one caption frame over a whole [W]×[H] frame. */
export function drawCaption(ctx: Ctx, track: CaptionTrack, frame: CaptionFrame, W: number, H: number): void {
  const short = Math.min(W, H);
  const style = track.style;
  const fontPx = Math.max(8, track.size * short * (style === 'bold' ? 1.35 : style === 'minimal' ? 0.85 : 1));
  const weight = style === 'minimal' ? 600 : 800;
  ctx.save();
  ctx.font = `${weight} ${fontPx}px ${FONT_STACK}`;
  ctx.textBaseline = 'middle';
  const text = style === 'bold' ? frame.cue.text.toUpperCase() : frame.cue.text;
  const lines = wrap(ctx, text, W * (style === 'bold' ? 0.8 : 0.84));
  const lineHeight = fontPx * 1.22;
  const blockH = lines.length * lineHeight;
  const centreY = CAPTION_Y[track.position] * H;
  const top = centreY - blockH / 2;

  if (style === 'subtitle') {
    const width = Math.max(...lines.map((l) => ctx.measureText(l).width)) + fontPx * 1.1;
    ctx.fillStyle = 'rgba(8, 10, 18, 0.72)';
    roundRect(ctx, W / 2 - width / 2, top - fontPx * 0.35, width, blockH + fontPx * 0.7, fontPx * 0.3);
    ctx.fill();
  }

  // Word styles colour one word (bold) or every word so far (karaoke).
  let wordIndex = 0;
  lines.forEach((line, li) => {
    const y = top + li * lineHeight + lineHeight / 2;
    const lineWords = line.split(' ');
    const widths = lineWords.map((w) => ctx.measureText(w).width);
    const space = ctx.measureText(' ').width;
    const lineWidth = widths.reduce((a, b) => a + b, 0) + space * (lineWords.length - 1);
    let x = W / 2 - lineWidth / 2;
    lineWords.forEach((word, wi) => {
      const active = frame.activeWord !== null && (style === 'karaoke' ? wordIndex <= frame.activeWord : wordIndex === frame.activeWord);
      ctx.textAlign = 'left';
      if (style === 'bold' || style === 'minimal' || style === 'karaoke') {
        ctx.lineJoin = 'round';
        ctx.lineWidth = fontPx * (style === 'minimal' ? 0.08 : 0.16);
        ctx.strokeStyle = 'rgba(0,0,0,0.85)';
        ctx.strokeText(word, x, y);
      }
      ctx.fillStyle = active ? track.highlight : track.color;
      ctx.fillText(word, x, y);
      x += widths[wi]! + space;
      wordIndex += 1;
    });
  });
  ctx.restore();
}

/** One caption frame alone on a transparent canvas the size of the output. */
export function rasterizeCaption(track: CaptionTrack, frame: CaptionFrame, W: number, H: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  drawCaption(canvas.getContext('2d')!, track, frame, W, H);
  return canvas;
}

// ── Title and end cards ─────────────────────────────────────────────────────

export function drawCard(ctx: Ctx, card: CardSpec, W: number, H: number): void {
  const short = Math.min(W, H);
  ctx.save();
  const gradient = ctx.createLinearGradient(0, 0, W, H);
  gradient.addColorStop(0, card.background);
  gradient.addColorStop(1, shade(card.background, -0.35));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, W, H);
  // A soft accent glow and a short bar above the heading.
  const glow = ctx.createRadialGradient(W * 0.5, H * 0.42, 0, W * 0.5, H * 0.42, short * 0.7);
  glow.addColorStop(0, `${card.accent}33`);
  glow.addColorStop(1, `${card.accent}00`);
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  const headingPx = short * (card.style === 'title' ? 0.105 : 0.085);
  ctx.font = `800 ${headingPx}px ${FONT_STACK}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const heading = wrap(ctx, card.heading || ' ', W * 0.8);
  const subPx = short * 0.042;
  const blockH = heading.length * headingPx * 1.15 + (card.subheading ? subPx * 2.2 : 0);
  let y = H / 2 - blockH / 2;
  ctx.fillStyle = card.accent;
  roundRect(ctx, W / 2 - short * 0.05, y - short * 0.06, short * 0.1, short * 0.012, short * 0.006);
  ctx.fill();
  ctx.fillStyle = card.textColor;
  for (const line of heading) {
    ctx.fillText(line, W / 2, y + (headingPx * 1.15) / 2);
    y += headingPx * 1.15;
  }
  if (card.subheading) {
    ctx.font = `600 ${subPx}px ${FONT_STACK}`;
    ctx.globalAlpha = 0.86;
    for (const line of wrap(ctx, card.subheading, W * 0.78).slice(0, 2)) {
      y += subPx * 1.1;
      ctx.fillText(line, W / 2, y);
    }
  }
  ctx.restore();
}

export function rasterizeCard(card: CardSpec, W: number, H: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  drawCard(canvas.getContext('2d')!, card, W, H);
  return canvas;
}

/** Lightens (positive) or darkens (negative) a #rrggbb colour. */
export function shade(hex: string, amount: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const channel = (v: number) => Math.round(Math.min(255, Math.max(0, amount < 0 ? v * (1 + amount) : v + (255 - v) * amount)));
  const r = channel((n >> 16) & 255);
  const g = channel((n >> 8) & 255);
  const b = channel(n & 255);
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

export function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('The browser could not draw this text.'))), 'image/png'));
}
