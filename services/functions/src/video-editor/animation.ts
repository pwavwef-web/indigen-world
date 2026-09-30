import type { Entrance, Exit } from './render-spec.js';

/**
 * How layers arrive and leave, as numbers and as FFmpeg expressions.
 *
 * The editor's preview evaluates these curves in JavaScript
 * (`apps/tribestudio/src/creator/editor/animation.ts` carries the same
 * constants and formulas); the renderer writes them into overlay and scale
 * expressions evaluated per frame. Both read the same three quantities for a
 * layer on screen from `start` to `end`:
 *
 *   alpha   0–1   how visible it is
 *   scale   ×     how much larger than its placed size
 *   shift   0–1   how far below its placed position, as a share of frame height
 */

export const ENTER_SEC = 0.35;
export const EXIT_SEC = 0.3;
/** How far a rising or sinking layer travels, as a share of the frame height. */
export const SHIFT = 0.06;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

function popScale(p: number): number {
  return p < 0.6 ? 0.5 + (1.12 - 0.5) * (p / 0.6) : 1.12 - 0.12 * ((p - 0.6) / 0.4);
}

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

const f = (v: number) => Number(v.toFixed(4));

/** The in and out progress terms, as FFmpeg expressions of `t`. */
function progress(start: number, end: number): { pin: string; pout: string } {
  return {
    pin: `clip((t-${f(start)})/${ENTER_SEC},0,1)`,
    pout: `clip((${f(end)}-t)/${EXIT_SEC},0,1)`,
  };
}

/** Scale factor over time, or null when the layer never changes size. */
export function scaleExpr(start: number, end: number, enter: Entrance, exit: Exit): string | null {
  if (enter !== 'pop' && exit !== 'pop') return null;
  const { pin, pout } = progress(start, end);
  const terms: string[] = [];
  if (enter === 'pop') terms.push(`if(lt(${pin},0.6),0.5+0.62*(${pin}/0.6),1.12-0.12*((${pin}-0.6)/0.4))`);
  if (exit === 'pop') terms.push(`(0.5+0.5*${pout})`);
  return terms.join('*');
}

/** Downward shift as a share of frame height, or null when the layer never moves. */
export function shiftExpr(start: number, end: number, enter: Entrance, exit: Exit): string | null {
  const { pin, pout } = progress(start, end);
  const terms: string[] = [];
  if (enter === 'rise') terms.push(`(1-(1-pow(1-${pin},2)))*${SHIFT}`);
  if (exit === 'sink') terms.push(`(1-${pout})*${SHIFT}`);
  return terms.length ? terms.join('+') : null;
}

/**
 * The alpha ramps as `fade` filters on the layer's own stream. `fade` with
 * `alpha=1` is linear, which is exactly the fade/rise/sink curves above; a pop
 * reaches full opacity in half its entrance, hence the halved duration.
 */
export function alphaFilters(start: number, end: number, enter: Entrance, exit: Exit): string[] {
  const out: string[] = [];
  if (enter === 'fade' || enter === 'rise') out.push(`fade=t=in:st=${f(start)}:d=${ENTER_SEC}:alpha=1`);
  if (enter === 'pop') out.push(`fade=t=in:st=${f(start)}:d=${ENTER_SEC / 2}:alpha=1`);
  if (exit !== 'none') out.push(`fade=t=out:st=${f(Math.max(start, end - EXIT_SEC))}:d=${EXIT_SEC}:alpha=1`);
  return out;
}
