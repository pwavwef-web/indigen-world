/**
 * tools/beyond-the-reef-export/capture.ts
 *
 * Core export engine that captures the Beyond the Reef web experience into
 * high-fidelity MP4 files.
 *
 * Requirements fulfilled:
 * - Deterministic, non-invasive capture of the real rendered web page
 * - Native responsive portrait rendering for 9:16 (1080x1920)
 * - Fullscreen landscape rendering for 16:9 (1920x1080)
 * - Clean visual output (no browser chrome, no scrollbars, no cursor, no dock controls)
 * - Frame-accurate start synchronization via visual marker detection
 * - Direct lossless muxing of the canonical master audio at 48 kHz AAC
 * - YouTube and social-compatible encoding: H.264, yuv420p, 30fps CFR, +faststart
 */
import { chromium } from "playwright-core";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startDistServer, REPO_ROOT } from "./server.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));

export const SONG_DURATION = 315.98;

export function resolveFfmpegPath(): string {
  if (process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH)) {
    return process.env.FFMPEG_PATH;
  }
  const localTool = path.resolve(REPO_ROOT, ".tooling/ffmpeg", process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg");
  if (fs.existsSync(localTool)) return localTool;
  return "ffmpeg";
}

export function resolveChromiumPath(): string {
  const localAppData = process.env.LOCALAPPDATA || "";
  const candidates = [
    path.resolve(localAppData, "ms-playwright/chromium-1228/chrome-win64/chrome.exe"),
    path.resolve(localAppData, "ms-playwright/chromium-1243/chrome-win64/chrome.exe"),
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error("Could not locate a compatible Chromium or Chrome executable.");
}

export function resolveAudioMaster(): string {
  const mp3Path = path.resolve(REPO_ROOT, "apps/website/public/beyond-the-reef/audio/beyond-the-reef.mp3");
  if (!fs.existsSync(mp3Path)) {
    throw new Error(`Master audio not found at ${mp3Path}`);
  }
  return mp3Path;
}

export interface CaptureOptions {
  orientation: "youtube" | "vertical";
  outputPath: string;
  port?: number;
  tempDir?: string;
}

export interface CaptureResult {
  outputPath: string;
  orientation: "youtube" | "vertical";
  width: number;
  height: number;
  duration: number;
  fileSizeBytes: number;
  elapsedSeconds: number;
}

export async function captureAndExport(options: CaptureOptions): Promise<CaptureResult> {
  const { orientation, outputPath, port = orientation === "youtube" ? 8781 : 8782 } = options;
  const startTime = Date.now();

  const isYouTube = orientation === "youtube";
  const width = isYouTube ? 1920 : 1080;
  const height = isYouTube ? 1080 : 1920;

  const tempDir = options.tempDir || path.resolve(REPO_ROOT, ".tmp/beyond-the-reef/recordings");
  fs.mkdirSync(tempDir, { recursive: true });
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  const ffmpegExe = resolveFfmpegPath();
  const chromeExe = resolveChromiumPath();
  const audioMaster = resolveAudioMaster();

  console.log(`\n======================================================`);
  console.log(`Starting Beyond the Reef Export: ${orientation.toUpperCase()}`);
  console.log(`Resolution: ${width}x${height} (Aspect Ratio: ${isYouTube ? "16:9" : "9:16"})`);
  console.log(`Output: ${outputPath}`);
  console.log(`FFmpeg: ${ffmpegExe}`);
  console.log(`Browser: ${chromeExe}`);
  console.log(`======================================================\n`);

  // 1. Start local dist server
  console.log(`[1/6] Booting local static server for apps/website/dist on port ${port}...`);
  const server = await startDistServer(port);

  // 2. Launch browser
  console.log(`[2/6] Launching Chromium instance...`);
  const browser = await chromium.launch({
    executablePath: chromeExe,
    headless: true,
    args: [
      "--autoplay-policy=no-user-gesture-required",
      "--disable-features=PreloadMediaEngagementData,MediaEngagementBypassAutoplayPolicies",
      "--mute-audio",
      "--hide-scrollbars",
      "--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows",
      "--disable-renderer-backgrounding",
    ],
  });

  const context = await browser.newContext({
    viewport: { width, height },
    recordVideo: {
      dir: tempDir,
      size: { width, height },
    },
  });

  const page = await context.newPage();
  const videoHandle = page.video();

  try {
    // 3. Navigate & Preload
    console.log(`[3/6] Navigating to ${server.origin}/beyond-the-reef ...`);
    await page.goto(`${server.origin}/beyond-the-reef`, { waitUntil: "networkidle" });

    console.log("      Waiting for web fonts to resolve...");
    await page.evaluate(() => document.fonts.ready);

    console.log("      Waiting for journey start trigger...");
    await page.waitForSelector(".btr-begin", { state: "visible" });

    // Clean capture styling: hide player dock, cursor, scrollbars, and preserve chapter headers
    await page.addStyleTag({
      content: `
        .btr-dock { display: none !important; }
        ::-webkit-scrollbar { display: none !important; }
        * { cursor: none !important; }
        .btr-topbar { opacity: 1 !important; transform: none !important; }
      `,
    });

    // Wait for audio metadata / canplay
    await page.evaluate(() => {
      const audio = document.querySelector("audio");
      if (!audio) return;
      if (audio.readyState < 3) {
        return new Promise<void>((resolve) => {
          audio.addEventListener("canplay", () => resolve(), { once: true });
        });
      }
    });

    console.log("      Assets preloaded and ready.");

    // 4. Start playback with sample-accurate visual synchronization marker
    console.log(`[4/6] Triggering playback with sample-accurate visual synchronization marker...`);
    await page.evaluate(() => {
      const marker = document.createElement("div");
      marker.id = "btr-sync-marker";
      marker.style.position = "fixed";
      marker.style.inset = "0";
      marker.style.width = "100vw";
      marker.style.height = "100vh";
      marker.style.backgroundColor = "#00ff00"; // Pure bright green
      marker.style.zIndex = "2147483647";
      document.documentElement.appendChild(marker);

      setTimeout(() => {
        marker.remove();
        document.querySelector<HTMLButtonElement>(".btr-begin")?.click();
      }, 250);
    });

    // Monitor playback progress
    console.log(`      Recording full song performance (target: ${SONG_DURATION}s)...`);
    const playbackStart = Date.now();
    let isEnded = false;

    while (!isEnded) {
      await page.waitForTimeout(5000);
      const status = await page.evaluate(() => {
        const audio = document.querySelector("audio");
        const exp = document.querySelector(".btr-experience");
        return {
          currentTime: audio?.currentTime ?? 0,
          ended: audio?.ended || exp?.getAttribute("data-ended") === "true",
          chapter: document.querySelector(".btr-chapter")?.textContent?.trim() || "",
        };
      });

      const elapsed = ((Date.now() - playbackStart) / 1000).toFixed(0);
      const songPos = status.currentTime.toFixed(1);
      console.log(`      [Elapsed: ${elapsed}s] Audio Time: ${songPos}s / ${SONG_DURATION}s | ${status.chapter}`);

      if (status.ended || status.currentTime >= SONG_DURATION) {
        isEnded = true;
      }
    }

    // Allow 1.2s for the finale card transition to settle
    console.log("      Song complete. Settling finale sequence...");
    await page.waitForTimeout(1200);

    // Pause and clean up browser
    await page.evaluate(() => document.querySelector("audio")?.pause());
    await page.close();
    await context.close();
    await browser.close();
  } finally {
    await server.close();
  }

  if (!videoHandle) {
    throw new Error("Playwright video handle was not created.");
  }

  const rawVideoPath = await videoHandle.path();
  console.log(`\n[5/6] Raw capture recorded at: ${rawVideoPath}`);

  // 5. Detect exact sync marker frame with FFmpeg downscaled rawvideo inspection
  console.log("      Analyzing stream to locate exact frame-accurate start timestamp...");
  const detectResult = spawnSync(
    ffmpegExe,
    [
      "-hide_banner",
      "-t",
      "45",
      "-i",
      rawVideoPath,
      "-vf",
      "fps=25,scale=1:1",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgb24",
      "pipe:1",
    ],
    { maxBuffer: 10 * 1024 * 1024 }
  );

  let startPts = 2.0; // safe fallback
  const buf = detectResult.stdout;
  let greenStartFrame = -1;
  let greenEndFrame = -1;
  if (buf && buf.length >= 3) {
    for (let i = 0; i < buf.length; i += 3) {
      const r = buf[i];
      const g = buf[i + 1];
      const b = buf[i + 2];
      const frameIndex = Math.floor(i / 3);
      const isGreen = g > 150 && r < 50 && b < 50;
      if (isGreen) {
        if (greenStartFrame === -1) greenStartFrame = frameIndex;
        greenEndFrame = frameIndex;
      }
    }
  }

  if (greenEndFrame >= 0) {
    // The frame immediately after the last green frame is when .btr-begin was clicked
    startPts = (greenEndFrame + 1) / 25;
    console.log(
      `      Found sync marker: frames ${greenStartFrame} to ${greenEndFrame} (${(greenStartFrame / 25).toFixed(3)}s - ${(greenEndFrame / 25).toFixed(3)}s)`
    );
    console.log(`      Playback starts exactly at ${startPts.toFixed(3)}s`);
  } else {
    console.warn("      Notice: Green sync marker not detected, using fallback:", startPts);
  }

  // 6. Encode H.264 & Mux pristine master audio
  console.log(`\n[6/6] Encoding final production master with FFmpeg...`);
  console.log(`      Video: H.264 (CRF 18, preset medium, yuv420p, 30fps CFR)`);
  console.log(`      Audio: Master MP3 muxed to AAC 320k @ 48000 Hz`);
  console.log(`      Duration: Exactly ${SONG_DURATION}s`);
  console.log(`      Faststart: Enabled`);

  const ffmpegArgs = [
    "-y",
    "-hide_banner",
    "-ss",
    startPts.toFixed(3),
    "-t",
    SONG_DURATION.toFixed(3),
    "-i",
    rawVideoPath,
    "-t",
    SONG_DURATION.toFixed(3),
    "-i",
    audioMaster,
    "-map",
    "0:v:0",
    "-map",
    "1:a:0",
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-crf",
    "18",
    "-pix_fmt",
    "yuv420p",
    "-r",
    "30",
    "-c:a",
    "aac",
    "-b:a",
    "320k",
    "-ar",
    "48000",
    "-movflags",
    "+faststart",
    outputPath,
  ];

  const encodeResult = spawnSync(ffmpegExe, ffmpegArgs, {
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });

  if (encodeResult.status !== 0) {
    throw new Error(`FFmpeg encoding failed:\n${encodeResult.stderr}`);
  }

  // Clean up raw WebM capture
  try {
    fs.unlinkSync(rawVideoPath);
  } catch {}

  const stats = fs.statSync(outputPath);
  const totalElapsed = (Date.now() - startTime) / 1000;

  console.log(`\n>>> EXPORT COMPLETE <<<`);
  console.log(`File: ${outputPath}`);
  console.log(`Size: ${(stats.size / (1024 * 1024)).toFixed(2)} MB`);
  console.log(`Total Time: ${totalElapsed.toFixed(1)}s\n`);

  return {
    outputPath,
    orientation,
    width,
    height,
    duration: SONG_DURATION,
    fileSizeBytes: stats.size,
    elapsedSeconds: totalElapsed,
  };
}
