/**
 * Turns the raw generations into the files the page ships.
 *
 *   node apps/website/scripts/beyond-the-reef/encode-media.mjs [--force]
 *
 * public/beyond-the-reef/
 *   audio/beyond-the-reef.m4a    the MP3's own frames in an MP4 container (exact seeking)
 *   images/<still>.webp          1920×1080 stills
 *   images/<clip>-start.webp     a clip's first frame (its poster)
 *   images/<clip>-end.webp       a clip's last frame (what the shot rests on)
 *   video/<clip>.webm            VP9, 720p, silent — Chrome, Firefox, Android
 *   video/<clip>.mp4             H.264, 720p, silent, faststart — Safari and the rest
 *   images/social-cover.jpg      1200×630 link preview
 *   images/cover-512.jpg         square artwork for the lock screen player
 *
 * Clips are lightly denoised before encoding: Veo renders sea spray and
 * glitter at a detail no background needs, and it costs bitrate. The page adds
 * its own grain back over the top. Frames are always taken from the encoded
 * clip itself, so a poster or a resting frame matches the video pixel for pixel.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { CLIPS, STILLS } from "./plan.mjs";
import { PUBLIC_DIR, REPO, SOURCE_AUDIO, WORK_DIR, ensureDir, ffmpeg, mediaDuration } from "./shared.mjs";

const FORCE = process.argv.includes("--force");
const imagesDir = ensureDir(resolve(PUBLIC_DIR, "images"));
const videoDir = ensureDir(resolve(PUBLIC_DIR, "video"));
const stillsDir = resolve(WORK_DIR, "stills");
const clipsDir = resolve(WORK_DIR, "clips");

const needed = (target) => FORCE || !existsSync(target);

// ── Audio ───────────────────────────────────────────────────────────────────
// Stream copy, never a re-encode: the decoded samples stay identical to the
// MP3's. Browsers seek VBR MP3 by estimating byte offsets (measured up to ±1.1 s
// off in Chrome for this file); MP4 sample tables make seeks exact.
const remux = resolve(PUBLIC_DIR, "audio/beyond-the-reef.m4a");
if (needed(remux)) {
  ffmpeg(["-y", "-i", SOURCE_AUDIO, "-map", "0:a", "-c:a", "copy", "-map_metadata", "-1", "-metadata", "title=Beyond the Reef", "-movflags", "+faststart", "-f", "mp4", remux]);
}
const kb = (path) => `${Math.round(statSync(path).size / 1024)} KB`;

const CROP_16_9 = "crop='min(iw,ih*16/9)':'min(ih,iw*9/16)'";

function webp(input, output, filters, quality = 80) {
  ffmpeg(["-y", "-i", input, "-vf", filters, "-c:v", "libwebp", "-quality", String(quality), "-compression_level", "6", "-preset", "photo", output]);
}

/**
 * Extra framings cut from the full-resolution source, for shots that want to
 * sit closer than a zoom on the 1920px still could without going soft.
 * Regions are fractions of the source frame.
 */
const DETAILS = [{ id: "03-city-detail", from: "03-city", x: 0.175, y: 0.3, width: 0.55 }];

// ── Stills ──────────────────────────────────────────────────────────────────
// A clip's shot shows the clip's own first frame, so its still is not shipped —
// unless a shot uses the still by itself as well.
const CLIP_IDS = new Set(CLIPS.map((clip) => clip.id));
const STILLS_ALSO_SHOWN = new Set(["14-fleet"]);

for (const still of STILLS) {
  if (CLIP_IDS.has(still.id) && !STILLS_ALSO_SHOWN.has(still.id)) continue;
  const source = resolve(stillsDir, `${still.id}.png`);
  const target = resolve(imagesDir, `${still.id}.webp`);
  if (!existsSync(source)) {
    console.warn(`missing still ${still.id}`);
    continue;
  }
  if (needed(target)) webp(source, target, `${CROP_16_9},scale=1920:1080:flags=lanczos`);
  console.log(`still ${still.id}: ${kb(target)}`);
}

for (const detail of DETAILS) {
  const source = resolve(stillsDir, `${detail.from}.png`);
  const target = resolve(imagesDir, `${detail.id}.webp`);
  if (needed(target)) {
    const crop = `crop=iw*${detail.width}:iw*${detail.width}*9/16:iw*${detail.x}:ih*${detail.y}`;
    webp(source, target, `${crop},scale=1920:1080:flags=lanczos`, 82);
  }
  console.log(`detail ${detail.id}: ${kb(target)}`);
}

// ── Clips ───────────────────────────────────────────────────────────────────
const DENOISE = "hqdn3d=2:1.5:6:5";
const manifest = {};

for (const clip of CLIPS) {
  const source = resolve(clipsDir, `${clip.id}.mp4`);
  if (!existsSync(source)) {
    console.warn(`missing clip ${clip.id}`);
    continue;
  }
  const webm = resolve(videoDir, `${clip.id}.webm`);
  const mp4 = resolve(videoDir, `${clip.id}.mp4`);
  const filters = `${CROP_16_9},${DENOISE},scale=1280:720:flags=lanczos,format=yuv420p`;

  if (needed(webm)) {
    ffmpeg([
      "-y", "-i", source, "-an", "-vf", filters,
      "-c:v", "libvpx-vp9", "-b:v", "1400k", "-maxrate", "2000k", "-bufsize", "2800k", "-crf", "38",
      "-deadline", "good", "-cpu-used", "2", "-row-mt", "1", "-g", "48", "-keyint_min", "48",
      webm,
    ]);
  }
  if (needed(mp4)) {
    ffmpeg([
      "-y", "-i", source, "-an", "-vf", filters,
      "-c:v", "libx264", "-preset", "slow", "-crf", "29", "-maxrate", "2000k", "-bufsize", "4000k",
      "-profile:v", "high", "-level", "4.0", "-g", "48", "-keyint_min", "48", "-movflags", "+faststart",
      mp4,
    ]);
  }

  const start = resolve(imagesDir, `${clip.id}-start.webp`);
  const end = resolve(imagesDir, `${clip.id}-end.webp`);
  if (needed(start)) {
    ffmpeg(["-y", "-i", mp4, "-frames:v", "1", "-c:v", "libwebp", "-quality", "82", "-compression_level", "6", start]);
  }
  if (needed(end)) {
    // Decode the tail and keep overwriting one image: the file left behind is
    // the last frame. `-f image2` matters — the .webp muxer would otherwise
    // write every decoded frame into an animated WebP.
    ffmpeg(["-y", "-sseof", "-0.5", "-i", mp4, "-update", "1", "-f", "image2", "-c:v", "libwebp", "-quality", "82", "-compression_level", "6", end]);
  }
  manifest[clip.id] = { duration: Number(mediaDuration(mp4).toFixed(3)) };
  console.log(`clip ${clip.id}: webm ${kb(webm)}, mp4 ${kb(mp4)}, ${manifest[clip.id].duration}s`);
}

writeFileSync(resolve(WORK_DIR, "encoded-manifest.json"), JSON.stringify(manifest, null, 2));

// A clip's last frame at full resolution, for a shot that shows it as a still
// with a zoom (the 720p resting frame would go soft under the zoom).
const FINAL_FRAMES = [{ id: "05-reef-final", clip: "05-reef" }];
for (const frame of FINAL_FRAMES) {
  const target = resolve(imagesDir, `${frame.id}.webp`);
  if (needed(target)) {
    ffmpeg([
      "-y", "-sseof", "-0.5", "-i", resolve(clipsDir, `${frame.clip}.mp4`), "-update", "1", "-f", "image2",
      "-vf", `${CROP_16_9},scale=1920:1080:flags=lanczos`, "-c:v", "libwebp", "-quality", "80", "-compression_level", "6", target,
    ]);
  }
  console.log(`final frame ${frame.id}: ${kb(target)}`);
}

// ── Social artwork ──────────────────────────────────────────────────────────
function browserPath() {
  const candidates = [
    process.env.CHROME_PATH,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
  ].filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate));
}

/** Renders a small HTML card in headless Chrome, with the site's own font. */
function renderCard(html, width, height, target) {
  const browser = browserPath();
  if (!browser) throw new Error("Set CHROME_PATH to render the social artwork.");
  const page = resolve(WORK_DIR, `card-${width}x${height}.html`);
  writeFileSync(page, html);
  const shot = resolve(WORK_DIR, `card-${width}x${height}.png`);
  const result = spawnSync(browser, [
    "--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1",
    `--window-size=${width},${height}`, `--screenshot=${shot}`, pathToFileURL(page).href,
  ], { encoding: "utf8" });
  if (!existsSync(shot)) throw new Error(`Headless browser failed: ${result.stderr}`);
  ffmpeg(["-y", "-i", shot, "-q:v", "3", target]);
}

const fontDir = resolve(REPO, "node_modules/@fontsource-variable/noto-sans/files");
const latinFont = readdirSync(fontDir).find((name) => name === "noto-sans-latin-wght-normal.woff2");
const fontFace = latinFont
  ? `@font-face { font-family: "Noto Sans Variable"; src: url("${pathToFileURL(resolve(fontDir, latinFont)).href}") format("woff2"); font-weight: 100 900; }`
  : "";

const social = resolve(imagesDir, "social-cover.jpg");
if (needed(social)) {
  const art = pathToFileURL(resolve(stillsDir, "05-reef.png")).href;
  renderCard(
    `<!doctype html><html><head><style>${fontFace}
      html,body{margin:0;width:1200px;height:630px;overflow:hidden;background:#030814}
      .art{position:absolute;inset:0;background:url("${art}") center 46%/cover}
      .veil{position:absolute;inset:0;background:linear-gradient(90deg,rgba(3,8,20,.82) 0%,rgba(3,8,20,.45) 42%,rgba(3,8,20,0) 70%),linear-gradient(0deg,rgba(3,8,20,.55),rgba(3,8,20,0) 45%)}
      .text{position:absolute;left:72px;bottom:74px;color:#f4f8ff;font-family:"Noto Sans Variable",sans-serif}
      .eyebrow{font-size:22px;letter-spacing:.24em;text-transform:uppercase;color:rgba(207,224,255,.86);font-weight:600;margin:0 0 14px}
      h1{margin:0;font-size:92px;line-height:.98;font-weight:300;letter-spacing:-.01em;text-shadow:0 4px 40px rgba(3,8,20,.6)}
    </style></head><body><div class="art"></div><div class="veil"></div>
    <div class="text"><p class="eyebrow">Indigen World</p><h1>Beyond the Reef</h1></div></body></html>`,
    1200,
    630,
    social
  );
}
console.log(`social cover: ${kb(social)}`);

const square = resolve(imagesDir, "cover-512.jpg");
if (needed(square)) {
  ffmpeg(["-y", "-i", resolve(stillsDir, "05-reef.png"), "-vf", "crop=ih:ih,scale=512:512:flags=lanczos", "-q:v", "3", square]);
}
console.log(`square cover: ${kb(square)}`);
