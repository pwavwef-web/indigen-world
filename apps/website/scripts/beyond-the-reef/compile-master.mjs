/**
 * Compiles the whole visual timeline into one silent video: every shot, drift,
 * held last frame and crossfade, cut to the song's exact length.
 *
 *   node apps/website/scripts/beyond-the-reef/compile-master.mjs
 *
 * It reads `SHOTS` straight from src/features/beyond-the-reef/scenes.ts (Node 23+
 * runs the TypeScript directly), so the master is the same film the page
 * plays. It has no audio and no lyrics by design — the page keeps both live —
 * and the page does not load it: it is a shareable, reviewable cut, written to
 * the work directory rather than shipped.
 *
 * Clips come from the raw 1080p Veo files; stills from the full-resolution
 * sources, so drifts stay sharp. Output: <work>/beyond-the-reef-visual-master.mp4.
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { FEATURE_DIR, WORK_DIR, WEBSITE, ffmpeg, mediaDuration } from "./shared.mjs";

const WIDTH = Number(process.env.BTR_MASTER_WIDTH || 1280);
const HEIGHT = Math.round((WIDTH * 9) / 16);
const FPS = 24;
/**
 * xfade ends the whole chain at a one-frame transition, so a cut the page makes
 * instantly (the storm clip taking over from its own first frame) gets a short
 * dissolve here — between two identical frames, so it cannot be seen.
 */
const MIN_FADE = 0.25;

const { SHOTS } = await import(pathToFileURL(resolve(FEATURE_DIR, "scenes.ts")).href);
const { SONG_DURATION } = await import(pathToFileURL(resolve(FEATURE_DIR, "lyrics.ts")).href);

/**
 * The best local source for a page path: the raw generation when there is one
 * (a 1080p Veo clip, a full-resolution still), the shipped file otherwise.
 */
function sourceFor(publicPath, kind) {
  const id = publicPath.split("/").pop().replace(/\.(webp|mp4|webm)$/, "");
  const raw = kind === "clip" ? resolve(WORK_DIR, "clips", `${id}.mp4`) : resolve(WORK_DIR, "stills", `${id}.png`);
  if (existsSync(raw)) return raw;
  const shipped = resolve(WEBSITE, "public", publicPath.replace(/^\//, ""));
  if (existsSync(shipped)) return shipped;
  throw new Error(`No source for ${publicPath}`);
}

const inputs = [];
const filters = [];

SHOTS.forEach((shot, index) => {
  const next = SHOTS[index + 1];
  // Each segment runs on under the next shot's crossfade.
  const length = next ? next.start + Math.max(next.fade ?? 1.8, MIN_FADE) - shot.start : SONG_DURATION - shot.start;
  const frames = Math.round((shot.end - shot.start) * FPS);
  const drift = shot.drift ?? { from: [1, 0, 0], to: [1, 0, 0] };
  const progress = `min(on/${frames}\\,1.3)`;
  const zoom = `max(1\\,${drift.from[0]}+(${drift.to[0] - drift.from[0]})*${progress})`;
  const limit = `((zoom-1)/(2*zoom)*100)`;
  const shift = (from, to) => `max(-${limit}\\,min(${limit}\\,${from}+(${to - from})*${progress}))`;
  // CSS translate-then-scale about the centre, expressed as zoompan's crop origin.
  const x = `iw/2-(iw/2+${shift(drift.from[1], drift.to[1])}/100*iw)/zoom`;
  const y = `ih/2-(ih/2+${shift(drift.from[2], drift.to[2])}/100*ih)/zoom`;
  const zoompan = `zoompan=z='${zoom}':x='${x}':y='${y}':d=1:s=${WIDTH}x${HEIGHT}:fps=${FPS}`;
  const label = `s${index}`;

  if (shot.clip) {
    const clipPath = sourceFor(shot.clip.mp4, "clip");
    const rate = shot.rate ?? 1;
    const played = mediaDuration(clipPath) / rate;
    inputs.push("-i", clipPath);
    filters.push(
      `[${index}:v]scale=${WIDTH * 2}:${HEIGHT * 2}:flags=lanczos,setsar=1,` +
        `setpts=(PTS-STARTPTS)/${rate},fps=${FPS},` +
        `tpad=stop_mode=clone:stop_duration=${Math.max(0, length - played + 1).toFixed(3)},` +
        `trim=duration=${length.toFixed(3)},setpts=PTS-STARTPTS,${zoompan},fps=${FPS},settb=AVTB,format=yuv420p[${label}]`
    );
  } else {
    const stillPath = sourceFor(shot.image, "still");
    inputs.push("-loop", "1", "-framerate", String(FPS), "-t", length.toFixed(3), "-i", stillPath);
    filters.push(
      `[${index}:v]crop='min(iw,ih*16/9)':'min(ih,iw*9/16)',scale=${WIDTH * 2}:${HEIGHT * 2}:flags=lanczos,setsar=1,` +
        `${zoompan},trim=duration=${length.toFixed(3)},setpts=PTS-STARTPTS,fps=${FPS},settb=AVTB,format=yuv420p[${label}]`
    );
  }
});

let current = "s0";
SHOTS.slice(1).forEach((shot, offsetIndex) => {
  const index = offsetIndex + 1;
  const out = index === SHOTS.length - 1 ? "film" : `x${index}`;
  const fade = Math.max(shot.fade ?? 1.8, MIN_FADE);
  filters.push(`[${current}][s${index}]xfade=transition=fade:duration=${fade}:offset=${shot.start.toFixed(3)}[${out}]`);
  current = out;
});
filters.push(`[${current}]trim=duration=${SONG_DURATION.toFixed(3)},setpts=PTS-STARTPTS[master]`);

const output = resolve(WORK_DIR, "beyond-the-reef-visual-master.mp4");
const started = Date.now();
ffmpeg([
  "-y",
  ...inputs,
  "-filter_complex", filters.join(";"),
  "-map", "[master]",
  "-an",
  "-c:v", "libx264", "-preset", "medium", "-crf", "24", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
  output,
]);
console.log(`Wrote ${output}: ${mediaDuration(output).toFixed(2)} s (song ${SONG_DURATION} s) in ${((Date.now() - started) / 1000).toFixed(0)} s`);
