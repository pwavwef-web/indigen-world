/**
 * Generates the film's silent clips with the project's Veo model, each one
 * starting from its own still (image-to-video), so a clip opens on exactly the
 * frame the page shows as its poster.
 *
 *   node apps/website/scripts/beyond-the-reef/generate-clips.mjs [id ...] [--force]
 *
 * Raw MP4s land in <work>/clips/. `encode-media.mjs` compresses them for the web.
 * Audio generation is off: the song is the only soundtrack.
 */
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { CLIPS, NEGATIVE } from "./plan.mjs";
import {
  WORK_DIR,
  ensureDir,
  ffmpeg,
  genai,
  genaiExports,
  labels,
  sleep,
  vertexConfig,
  withQuotaRetry,
} from "./shared.mjs";

const args = process.argv.slice(2);
const FORCE = args.includes("--force");
const only = new Set(args.filter((arg) => !arg.startsWith("--")));
const DURATION = Number(process.env.BTR_CLIP_SECONDS || 8);
const RESOLUTION = process.env.BTR_CLIP_RESOLUTION || "1080p";

const cfg = await vertexConfig();
const clipsDir = ensureDir(resolve(WORK_DIR, "clips"));
const framesDir = ensureDir(resolve(WORK_DIR, "clips/first-frames"));

const FILM = "Cinematic 35mm film look with soft grain and gentle halation, matching the colours, light and boat of the starting image. Slow, continuous camera and natural motion; no cuts, no text, no people facing the camera.";

/** The still, cropped to exactly 16:9 and sized 1920×1080, as the first frame. */
function firstFrame(id) {
  const target = resolve(framesDir, `${id}.jpg`);
  if (!existsSync(target)) {
    ffmpeg([
      "-y",
      "-i", resolve(WORK_DIR, "stills", `${id}.png`),
      "-vf", "crop='min(iw,ih*16/9)':'min(ih,iw*9/16)',scale=1920:1080:flags=lanczos",
      "-q:v", "2",
      target,
    ]);
  }
  return readFileSync(target).toString("base64");
}

/**
 * Starting a clip is the billed step, so its operation name is written down the
 * moment Veo accepts it; a later run resumes waiting on that operation instead
 * of paying for the same clip twice.
 */
async function generate(clip) {
  const ai = await genai(cfg.project, cfg.videoLocation);
  const { GenerateVideosOperation } = await genaiExports();
  const started = Date.now();
  const pendingPath = resolve(clipsDir, `${clip.id}.operation.json`);
  const pending = existsSync(pendingPath) ? JSON.parse(readFileSync(pendingPath, "utf8")) : null;
  const operation = pending ?? await withQuotaRetry(clip.id, () =>
    ai.models.generateVideos({
      model: cfg.videoModel,
      source: {
        prompt: `${clip.prompt} ${FILM}`,
        image: { imageBytes: firstFrame(clip.id), mimeType: "image/jpeg" },
      },
      config: {
        numberOfVideos: 1,
        aspectRatio: "16:9",
        durationSeconds: DURATION,
        resolution: RESOLUTION,
        negativePrompt: NEGATIVE,
        generateAudio: false,
        personGeneration: "allow_adult",
        labels: labels("clip-generation"),
        httpOptions: { timeout: 120_000 },
      },
    })
  );
  if (!operation?.name) throw new Error("Veo did not return an operation");
  if (!pending) writeFileSync(pendingPath, JSON.stringify({ name: operation.name }));
  console.log(`… ${clip.id} ${pending ? "resumed" : "started"} (${cfg.videoModel}) ${operation.name}`);

  let result = pending ? null : operation;
  let networkFailures = 0;
  while (!result?.done) {
    await sleep(15_000);
    const poll = new GenerateVideosOperation();
    poll.name = operation.name;
    try {
      result = await ai.operations.getVideosOperation({
        operation: poll,
        config: { httpOptions: { timeout: 90_000, retryOptions: { attempts: 3, httpStatusCodes: [429, 500, 502, 503, 504] } } },
      });
      networkFailures = 0;
    } catch (error) {
      // Reading an operation is free; a dropped connection is simply retried.
      networkFailures += 1;
      if (networkFailures > 20) throw error;
      console.warn(`  ${clip.id}: status check failed (${error?.message ?? error}); retrying`);
    }
  }
  if (result.error) {
    unlinkSync(pendingPath);
    throw new Error(`Veo failed: ${JSON.stringify(result.error)}`);
  }
  const video = result.response?.generatedVideos?.[0]?.video;
  const filtered = result.response?.raiMediaFilteredReasons;
  if (!video?.videoBytes) {
    throw new Error(`No video bytes returned${filtered ? ` (filtered: ${JSON.stringify(filtered)})` : ""}: ${JSON.stringify(result.response ?? {}).slice(0, 400)}`);
  }
  writeFileSync(resolve(clipsDir, `${clip.id}.mp4`), Buffer.from(video.videoBytes, "base64"));
  unlinkSync(pendingPath);
  writeFileSync(
    resolve(clipsDir, `${clip.id}.json`),
    JSON.stringify({ id: clip.id, model: cfg.videoModel, durationSeconds: DURATION, resolution: RESOLUTION, seconds: (Date.now() - started) / 1000, prompt: `${clip.prompt} ${FILM}` }, null, 2)
  );
  console.log(`✓ ${clip.id} (${((Date.now() - started) / 1000).toFixed(0)} s)`);
}

const wanted = CLIPS.filter(
  (clip) => (only.size === 0 || only.has(clip.id)) && (FORCE || !existsSync(resolve(clipsDir, `${clip.id}.mp4`)))
);
const failures = [];
let next = 0;
await Promise.all(
  Array.from({ length: Number(process.env.BTR_CLIP_CONCURRENCY || 3) }, async () => {
    while (next < wanted.length) {
      const clip = wanted[next++];
      try {
        await generate(clip);
      } catch (error) {
        failures.push(clip.id);
        console.error(`✗ ${clip.id}: ${error?.message ?? error}`);
      }
    }
  })
);
if (failures.length) {
  console.error(`Failed: ${failures.join(", ")}`);
  process.exitCode = 1;
}
