/**
 * Shared plumbing for the Beyond the Reef media pipeline.
 *
 * Everything here runs on a developer's machine, never in a visitor's browser:
 * the page ships only the finished files these scripts produce. Vertex AI is
 * reached with Application Default Credentials (`gcloud auth
 * application-default login`), exactly like the functions' own Vertex calls,
 * so there is no API key or service-account file anywhere in this folder.
 *
 * Model names are not chosen here. They come from the functions' own config
 * readers — `readKawuriMediaConfig` (analysis + Veo) and
 * `readIllustrationConfig` (Nano Banana) — so the same `VERTEX_*` variables
 * steer both the product and this pipeline. Build the functions first:
 * `npm run build:functions`.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const HERE = dirname(fileURLToPath(import.meta.url));
export const WEBSITE = resolve(HERE, "../..");
export const REPO = resolve(WEBSITE, "../..");
export const PUBLIC_DIR = resolve(WEBSITE, "public/beyond-the-reef");
export const FEATURE_DIR = resolve(WEBSITE, "src/features/beyond-the-reef");

/** Scratch space for raw generations and intermediate encodes (gitignored). */
export const WORK_DIR = resolve(process.env.BTR_WORK_DIR || resolve(REPO, ".tmp/beyond-the-reef"));

/** The source recording. Copied into public/ untouched by `encode-media.mjs`. */
export const SOURCE_AUDIO = resolve(
  process.env.BTR_SOURCE_AUDIO || resolve(PUBLIC_DIR, "audio/beyond-the-reef.mp3")
);

export const FIREBASE_PROJECT = "project-kassena-7e026";

export function ensureDir(path) {
  mkdirSync(path, { recursive: true });
  return path;
}

/** `FFMPEG_PATH`, else a copy in the gitignored `.tooling/ffmpeg/`, else PATH. */
export function ffmpegPath() {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  const local = resolve(REPO, ".tooling/ffmpeg", process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg");
  return existsSync(local) ? local : "ffmpeg";
}

/** Runs ffmpeg synchronously and throws with its stderr on failure. */
export function ffmpeg(args, { quiet = true } = {}) {
  const result = spawnSync(ffmpegPath(), ["-hide_banner", ...(quiet ? ["-loglevel", "error"] : []), ...args], {
    encoding: "buffer",
    maxBuffer: 1024 * 1024 * 512,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`ffmpeg ${args.join(" ")}\n${result.stderr.toString()}`);
  }
  return result;
}

/** Duration in seconds, read from ffmpeg's own header parse. */
export function mediaDuration(path) {
  const result = spawnSync(ffmpegPath(), ["-hide_banner", "-i", path], { encoding: "utf8" });
  const match = /Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/.exec(result.stderr ?? "");
  if (!match) throw new Error(`Could not read the duration of ${path}`);
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

/**
 * The functions' Vertex configuration, read through their own resolvers so
 * this pipeline and the deployed product can never disagree about models.
 */
export async function vertexConfig() {
  const lib = resolve(REPO, "services/functions/lib");
  const media = resolve(lib, "kawuri-media-policy.js");
  const illustration = resolve(lib, "learn-illustration-policy.js");
  if (!existsSync(media) || !existsSync(illustration)) {
    throw new Error("Build the functions first so their Vertex config readers exist: npm run build:functions");
  }
  const { readKawuriMediaConfig, thinkingConfigFor } = await import(pathToFileURL(media).href);
  const { readIllustrationConfig } = await import(pathToFileURL(illustration).href);
  const project = process.env.VERTEX_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || FIREBASE_PROJECT;
  const kawuri = readKawuriMediaConfig(process.env, project);
  const art = readIllustrationConfig(process.env, project);
  return {
    project: kawuri.project,
    location: kawuri.location,
    videoLocation: kawuri.videoLocation,
    analysisModels: kawuri.analysisModels,
    /** Nano Banana Pro first: this is showcase artwork, the desk's "best" tier. */
    imageModels: art.bestModels,
    /** The standard Veo model (the "plan" tier) over the fast default. */
    videoModel: kawuri.videoPlanModel || kawuri.videoModel,
    thinkingConfigFor,
  };
}

let genaiModule = null;
const clients = new Map();

/** A Vertex-backed Gen AI client for [location], authenticated by ADC. */
export async function genai(project, location) {
  genaiModule ??= await import("@google/genai");
  const key = `${project}/${location}`;
  if (!clients.has(key)) {
    clients.set(key, new genaiModule.GoogleGenAI({ vertexai: true, project, location }));
  }
  return clients.get(key);
}

export async function genaiExports() {
  genaiModule ??= await import("@google/genai");
  return genaiModule;
}

/** Billing labels, matching the functions' convention. */
export function labels(capability) {
  return { app: "indigen-world", feature: "beyond-the-reef", capability };
}

export function readJson(path, fallback = null) {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, "utf8"));
}

export function sleep(ms) {
  return new Promise((done) => setTimeout(done, ms));
}

/**
 * A 429 is Vertex's per-minute quota, not a verdict on the request: wait and
 * ask again. Nothing was generated, so nothing is billed twice.
 */
export async function withQuotaRetry(label, call, attempts = 8) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await call();
    } catch (error) {
      const status = error?.status ?? 0;
      if (status !== 429 || attempt >= attempts) throw error;
      const wait = Math.min(120, 15 * attempt);
      console.warn(`  ${label}: quota busy, retrying in ${wait} s`);
      await sleep(wait * 1000);
    }
  }
}

/** Pulls the first JSON object out of a model's text parts. */
export function responseJson(response) {
  const parts = response?.candidates?.[0]?.content?.parts ?? [];
  const text = parts
    .filter((part) => typeof part.text === "string" && !part.thought)
    .map((part) => part.text)
    .join("");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) {
    throw new Error(`No JSON in model response (finish ${response?.candidates?.[0]?.finishReason}): ${text.slice(0, 400)}`);
  }
  return JSON.parse(text.slice(start, end + 1));
}
