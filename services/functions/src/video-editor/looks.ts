import type { SceneLook } from './render-spec.js';

/**
 * Colour looks, defined once as CSS filter operations.
 *
 * The editor previews a look with the CSS `filter` property; the renderer has
 * to produce the same colours with FFmpeg. CSS's colour filters are all 3×3
 * matrices on RGB (saturate, sepia, grayscale, hue-rotate) or a per-channel
 * linear map (brightness, contrast), and the matrices are written out in the
 * Filter Effects spec — so each look is kept as the list of operations the
 * preview applies, and the renderer composes the same operations into one
 * `colorchannelmixer` plus one `lutrgb`. The TribeStudio editor carries this
 * exact table (`editor/looks.ts`); a look added in one place and not the other
 * would preview one way and export another.
 */

export type LookOp =
  | { op: 'saturate'; amount: number }
  | { op: 'sepia'; amount: number }
  | { op: 'grayscale'; amount: number }
  | { op: 'hue-rotate'; deg: number }
  | { op: 'brightness'; amount: number }
  | { op: 'contrast'; amount: number };

export const LOOK_OPS: Record<SceneLook, LookOp[]> = {
  none: [],
  vivid: [{ op: 'saturate', amount: 1.35 }, { op: 'contrast', amount: 1.08 }],
  warm: [{ op: 'sepia', amount: 0.18 }, { op: 'saturate', amount: 1.15 }, { op: 'brightness', amount: 1.03 }],
  cool: [{ op: 'hue-rotate', deg: -12 }, { op: 'saturate', amount: 0.9 }, { op: 'contrast', amount: 1.05 }],
  mono: [{ op: 'grayscale', amount: 1 }, { op: 'contrast', amount: 1.15 }],
  dusk: [{ op: 'sepia', amount: 0.25 }, { op: 'hue-rotate', deg: -25 }, { op: 'saturate', amount: 1.2 }, { op: 'contrast', amount: 1.06 }],
};

type M3 = [number, number, number, number, number, number, number, number, number];
const IDENTITY: M3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

function multiply(a: M3, b: M3): M3 {
  // a · b, rows of a with columns of b.
  const out = [] as unknown as M3;
  for (let r = 0; r < 3; r += 1) {
    for (let c = 0; c < 3; c += 1) {
      out[r * 3 + c] = a[r * 3]! * b[c]! + a[r * 3 + 1]! * b[3 + c]! + a[r * 3 + 2]! * b[6 + c]!;
    }
  }
  return out;
}

function lerp(from: M3, to: M3, t: number): M3 {
  return from.map((v, i) => v + (to[i]! - v) * t) as M3;
}

/** The matrices of the Filter Effects spec (§ feColorMatrix and the CSS shorthands). */
function matrixFor(op: LookOp): M3 | null {
  switch (op.op) {
    case 'saturate': {
      const s = op.amount;
      return [
        0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s,
        0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s,
        0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s,
      ];
    }
    case 'sepia':
      return lerp(IDENTITY, [0.393, 0.769, 0.189, 0.349, 0.686, 0.168, 0.272, 0.534, 0.131], Math.min(1, op.amount));
    case 'grayscale':
      return lerp(IDENTITY, [0.2126, 0.7152, 0.0722, 0.2126, 0.7152, 0.0722, 0.2126, 0.7152, 0.0722], Math.min(1, op.amount));
    case 'hue-rotate': {
      const a = (op.deg * Math.PI) / 180;
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      return [
        0.213 + cos * 0.787 - sin * 0.213, 0.715 - cos * 0.715 - sin * 0.715, 0.072 - cos * 0.072 + sin * 0.928,
        0.213 - cos * 0.213 + sin * 0.143, 0.715 + cos * 0.285 + sin * 0.14, 0.072 - cos * 0.072 - sin * 0.283,
        0.213 - cos * 0.213 - sin * 0.787, 0.715 - cos * 0.715 + sin * 0.715, 0.072 + cos * 0.928 + sin * 0.072,
      ];
    }
    default:
      return null;
  }
}

/**
 * The FFmpeg filters for a look, or '' for none.
 *
 * Matrix operations are composed in order into one `colorchannelmixer`.
 * Brightness and contrast are affine maps that CSS applies after whatever came
 * before them; every look above lists them last, which is what lets them fold
 * into a single `lutrgb` after the matrix.
 */
export function lookFilter(look: SceneLook): string {
  const ops = LOOK_OPS[look] ?? [];
  if (ops.length === 0) return '';
  let matrix: M3 = IDENTITY;
  let brightness = 1;
  let contrast = 1;
  for (const op of ops) {
    const m = matrixFor(op);
    if (m) matrix = multiply(m, matrix);
    else if (op.op === 'brightness') brightness *= op.amount;
    else if (op.op === 'contrast') contrast *= op.amount;
  }
  const f = (v: number) => Number(v.toFixed(4));
  const filters = [
    `colorchannelmixer=rr=${f(matrix[0])}:rg=${f(matrix[1])}:rb=${f(matrix[2])}:gr=${f(matrix[3])}:gg=${f(matrix[4])}:gb=${f(matrix[5])}:br=${f(matrix[6])}:bg=${f(matrix[7])}:bb=${f(matrix[8])}`,
  ];
  if (brightness !== 1 || contrast !== 1) {
    // CSS: brightness(b) is v·b; contrast(c) is (v − ½)·c + ½; applied in that order.
    // Single-quoted in the graph, so the commas inside need no escaping.
    const expr = `clip(((val*${f(brightness)})/255-0.5)*${f(contrast)}*255+127.5,0,255)`;
    filters.push(`lutrgb=r='${expr}':g='${expr}':b='${expr}'`);
  }
  return filters.join(',');
}

/** The CSS filter the editor previews the same look with. */
export function lookCss(look: SceneLook): string {
  const ops = LOOK_OPS[look] ?? [];
  if (ops.length === 0) return 'none';
  return ops.map((op) => (op.op === 'hue-rotate' ? `hue-rotate(${op.deg}deg)` : `${op.op}(${op.amount})`)).join(' ');
}
