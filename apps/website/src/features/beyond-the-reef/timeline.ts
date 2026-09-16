/**
 * Pure timing math for Beyond the Reef.
 *
 * Every function here takes the song position and returns what should be on
 * screen at that position — nothing keeps its own timer. That is what keeps
 * lyrics and visuals honest after a pause, a rewind, a jump forward or a
 * restart: they are recomputed from the audio element's `currentTime`, never
 * advanced independently of it.
 */
import type { LyricLine, Shot } from "./types";

export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
export const lerp = (from: number, to: number, t: number) => from + (to - from) * t;

export function easeInOut(t: number): number {
  const x = clamp(t, 0, 1);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

export function easeOut(t: number): number {
  const x = clamp(t, 0, 1);
  return 1 - Math.pow(1 - x, 3);
}

/** Index of the last item that has started by [time], or -1 before the first. */
export function lastStartedIndex(items: readonly { start: number }[], time: number): number {
  let low = 0;
  let high = items.length - 1;
  let found = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (items[mid].start <= time) {
      found = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return found;
}

export function formatTime(seconds: number): string {
  const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  const minutes = Math.floor(safe / 60);
  const rest = Math.floor(safe % 60);
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

/** Spoken form for assistive technology: "1 minute 5 seconds". */
export function spokenTime(seconds: number): string {
  const safe = Math.floor(Number.isFinite(seconds) && seconds > 0 ? seconds : 0);
  const minutes = Math.floor(safe / 60);
  const rest = safe % 60;
  const parts = [];
  if (minutes) parts.push(`${minutes} minute${minutes === 1 ? "" : "s"}`);
  parts.push(`${rest} second${rest === 1 ? "" : "s"}`);
  return parts.join(" ");
}

// ── Lyrics ──────────────────────────────────────────────────────────────────

/** Longest glide from one line to the next, in seconds. */
const GLIDE_SECONDS = 0.75;
/** Share of the distance to the next line covered slowly while a line holds. */
const HOLD_DRIFT = 0.16;
/** How long the first line takes to rise into place before it is sung. */
const LEAD_IN_SECONDS = 2.4;

/**
 * Progress of the glide into the line after [index]: 0 while [index] holds,
 * rising to 1 exactly when the next line's first syllable is sung.
 */
function glideProgress(lines: readonly LyricLine[], index: number, time: number): number {
  if (lines.length === 0) return 0;
  if (index < 0) {
    const first = lines[0].start;
    const lead = Math.min(first, LEAD_IN_SECONDS);
    return lead <= 0 ? 1 : easeOut((time - (first - lead)) / lead);
  }
  const line = lines[index];
  const next = lines[index + 1];
  if (!next) return 0;
  const glide = Math.min(GLIDE_SECONDS, (next.start - line.start) * 0.45);
  const glideStart = next.start - glide;
  return time < glideStart ? 0 : easeInOut((time - glideStart) / glide);
}

/**
 * Where the lyric column rests at [time], as a fractional line index: 3 means
 * line 3 sits exactly on the focus line, 3.5 means halfway to line 4.
 *
 * Between two lines the column first drifts upward slowly, like film credits,
 * then glides the rest of the way so the next line arrives in focus exactly as
 * it is sung. After the final line it keeps rising until the song ends.
 */
export function lyricScroll(
  lines: readonly LyricLine[],
  time: number,
  duration: number,
  reducedMotion = false
): number {
  if (lines.length === 0) return 0;
  const index = lastStartedIndex(lines, time);
  if (reducedMotion) return Math.max(0, index);
  if (index < 0) return -1 + glideProgress(lines, -1, time);

  const line = lines[index];
  const next = lines[index + 1];
  if (!next) {
    const span = Math.max(1, duration - line.start);
    return index + clamp((time - line.start) / span, 0, 1) * 1.4;
  }
  const glide = Math.min(GLIDE_SECONDS, (next.start - line.start) * 0.45);
  const holdSpan = Math.max(0.001, next.start - glide - line.start);
  const hold = clamp((time - line.start) / holdSpan, 0, 1);
  return index + HOLD_DRIFT * hold + (1 - HOLD_DRIFT) * glideProgress(lines, index, time);
}

/**
 * How strongly line [index] is emphasised at [time], from 0 to 1.
 *
 * The line being sung is fully lit; it relaxes a little once the singer rests
 * on it, and hands its light to the next line during the glide.
 */
export function lineEmphasis(
  lines: readonly LyricLine[],
  index: number,
  time: number,
  reducedMotion = false
): number {
  const current = lastStartedIndex(lines, time);
  if (index !== current && index !== current + 1) return 0;
  const glide = reducedMotion ? 0 : glideProgress(lines, current, time);
  if (index === current + 1) return glide;
  const line = lines[current];
  const resting = time - line.end;
  const rest = resting > 0.35 ? 1 - 0.38 * clamp((resting - 0.35) / 1.6, 0, 1) : 1;
  return rest * (1 - glide);
}

/**
 * Vertical position of the column for a fractional line index, given each
 * line's measured centre. Positions before the first and after the last line
 * are extrapolated so the column can rise into view and drift out of it.
 */
export function scrollOffset(centres: readonly number[], scroll: number): number {
  if (centres.length === 0) return 0;
  if (centres.length === 1) return centres[0] + scroll * 48;
  const last = centres.length - 1;
  const at = (index: number) => {
    if (index < 0) return centres[0] + index * (centres[1] - centres[0]) * 2.5;
    if (index > last) return centres[last] + (index - last) * (centres[last] - centres[last - 1]) * 2;
    return centres[index];
  };
  const floor = Math.floor(scroll);
  return lerp(at(floor), at(floor + 1), scroll - floor);
}

// ── Visuals ─────────────────────────────────────────────────────────────────

export const DEFAULT_FADE_SECONDS = 1.8;

/** The shot on screen at [time]: the last one that has started. */
export function activeShotIndex(shots: readonly Shot[], time: number): number {
  return Math.max(0, lastStartedIndex(shots, time));
}

export interface ShotFrame {
  opacity: number;
  scale: number;
  /** Translation in percent of the frame. */
  x: number;
  y: number;
  /** Where the clip should be, in clip seconds; null for a still. */
  clipTime: number | null;
  /** The clip has run out and the shot rests on its last frame. */
  holding: boolean;
}

/**
 * The state of one shot's layer at [time].
 *
 * Opacity fades in over the shot's crossfade; later shots are stacked above
 * earlier ones, so the outgoing shot simply stays put underneath. The drift
 * runs linearly across the shot and a little beyond, so nothing stops moving
 * while the next shot fades in over it. A translation is always kept inside
 * what the zoom has cropped, so a frame edge can never slide into view.
 */
export function shotFrame(shot: Shot, time: number, reducedMotion: boolean): ShotFrame {
  const fade = reducedMotion ? Math.min(shot.fade ?? DEFAULT_FADE_SECONDS, 1.2) : shot.fade ?? DEFAULT_FADE_SECONDS;
  const opacity = time < shot.start ? 0 : fade <= 0 ? 1 : easeInOut((time - shot.start) / fade);

  let scale = 1;
  let x = 0;
  let y = 0;
  if (shot.drift && !reducedMotion) {
    const progress = clamp((time - shot.start) / Math.max(0.001, shot.end - shot.start), 0, 1.3);
    scale = Math.max(1, lerp(shot.drift.from[0], shot.drift.to[0], progress));
    const limit = ((scale - 1) / (2 * scale)) * 100;
    x = clamp(lerp(shot.drift.from[1], shot.drift.to[1], progress), -limit, limit);
    y = clamp(lerp(shot.drift.from[2], shot.drift.to[2], progress), -limit, limit);
  }

  let clipTime: number | null = null;
  let holding = false;
  if (shot.clip && !reducedMotion) {
    const wanted = (shot.clipFrom ?? 0) + Math.max(0, time - shot.start) * (shot.rate ?? 1);
    holding = wanted >= shot.clip.duration - 0.08;
    clipTime = holding ? shot.clip.duration : wanted;
  }

  return { opacity, scale, x, y, clipTime, holding };
}
