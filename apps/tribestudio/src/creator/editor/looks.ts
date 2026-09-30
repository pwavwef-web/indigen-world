import type { Entrance, Exit, Look } from './model';

/**
 * Colour looks and layer motion, as the preview draws them.
 *
 * These are the renderer's own tables (`services/functions/src/video-editor/
 * looks.ts` and `animation.ts`) — the renderer composes the same operations
 * into FFmpeg filters and expressions. `scripts/video-editor.test.mjs` fails if
 * the two copies ever differ, because a look or an entrance that previews one
 * way and exports another is the one thing an editor must not do.
 */

export type LookOp =
  | { op: 'saturate'; amount: number }
  | { op: 'sepia'; amount: number }
  | { op: 'grayscale'; amount: number }
  | { op: 'hue-rotate'; deg: number }
  | { op: 'brightness'; amount: number }
  | { op: 'contrast'; amount: number };

export const LOOK_OPS: Record<Look, LookOp[]> = {
  none: [],
  vivid: [{ op: 'saturate', amount: 1.35 }, { op: 'contrast', amount: 1.08 }],
  warm: [{ op: 'sepia', amount: 0.18 }, { op: 'saturate', amount: 1.15 }, { op: 'brightness', amount: 1.03 }],
  cool: [{ op: 'hue-rotate', deg: -12 }, { op: 'saturate', amount: 0.9 }, { op: 'contrast', amount: 1.05 }],
  mono: [{ op: 'grayscale', amount: 1 }, { op: 'contrast', amount: 1.15 }],
  dusk: [{ op: 'sepia', amount: 0.25 }, { op: 'hue-rotate', deg: -25 }, { op: 'saturate', amount: 1.2 }, { op: 'contrast', amount: 1.06 }],
};

export const LOOKS: { id: Look; label: string; swatch: string }[] = [
  { id: 'none', label: 'Original', swatch: 'linear-gradient(135deg,#8292ae,#d7deea)' },
  { id: 'vivid', label: 'Vivid', swatch: 'linear-gradient(135deg,#ff5e62,#ffcb52,#26c6da)' },
  { id: 'warm', label: 'Warm', swatch: 'linear-gradient(135deg,#7a311f,#f1ae61)' },
  { id: 'cool', label: 'Cool', swatch: 'linear-gradient(135deg,#102a57,#5dc4df)' },
  { id: 'mono', label: 'Mono', swatch: 'linear-gradient(135deg,#171b24,#d9dde4)' },
  { id: 'dusk', label: 'Dusk', swatch: 'linear-gradient(135deg,#1a1e52,#b34f73,#ed9a59)' },
];

export function lookCss(look: Look): string {
  const ops = LOOK_OPS[look] ?? [];
  if (ops.length === 0) return 'none';
  return ops.map((op) => (op.op === 'hue-rotate' ? `hue-rotate(${op.deg}deg)` : `${op.op}(${op.amount})`)).join(' ');
}

export const ENTER_SEC = 0.35;
export const EXIT_SEC = 0.3;
export const SHIFT = 0.06;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

function popScale(p: number): number {
  return p < 0.6 ? 0.5 + (1.12 - 0.5) * (p / 0.6) : 1.12 - 0.12 * ((p - 0.6) / 0.4);
}

/** A layer's visibility, size and drop at time [t]. */
export function layerState(t: number, start: number, end: number, enter: Entrance, exit: Exit): { alpha: number; scale: number; shift: number } {
  if (t < start || t > end) return { alpha: 0, scale: 1, shift: 0 };
  const pin = enter === 'none' ? 1 : clamp01((t - start) / ENTER_SEC);
  const pout = exit === 'none' ? 1 : clamp01((end - t) / EXIT_SEC);
  let alpha = 1;
  let scale = 1;
  let shift = 0;
  if (enter === 'fade' || enter === 'rise') alpha *= pin;
  if (enter === 'pop') {
    alpha *= Math.min(1, pin * 2);
    scale *= popScale(pin);
  }
  if (enter === 'rise') shift += (1 - (1 - (1 - pin) ** 2)) * SHIFT;
  if (exit === 'fade' || exit === 'sink') alpha *= pout;
  if (exit === 'pop') {
    alpha *= pout;
    scale *= 0.5 + 0.5 * pout;
  }
  if (exit === 'sink') shift += (1 - pout) * SHIFT;
  return { alpha, scale, shift };
}

export const ENTRANCES: { id: Entrance; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'fade', label: 'Fade' },
  { id: 'pop', label: 'Pop' },
  { id: 'rise', label: 'Rise' },
];

export const EXITS: { id: Exit; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'fade', label: 'Fade' },
  { id: 'pop', label: 'Pop' },
  { id: 'sink', label: 'Sink' },
];
