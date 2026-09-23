/**
 * tools/beyond-the-reef-export/validate.ts
 *
 * Automated file inspection and visual QA extraction utility.
 * Verifies resolution, codecs, sample rate, duration, file size,
 * and extracts QA milestone frames across the 5:16 song timeline.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { resolveFfmpegPath, SONG_DURATION } from "./capture.ts";

export interface ValidationReport {
  filePath: string;
  width: number;
  height: number;
  fps: number;
  videoCodec: string;
  pixelFormat: string;
  audioCodec: string;
  audioSampleRate: number;
  durationSeconds: number;
  durationDeltaSeconds: number;
  fileSizeBytes: number;
  qaFrames: string[];
}

export function validateExport(videoPath: string, label: string): ValidationReport {
  const ffmpegExe = resolveFfmpegPath();
  if (!fs.existsSync(videoPath)) {
    throw new Error(`Video file does not exist: ${videoPath}`);
  }

  const stats = fs.statSync(videoPath);

  // Probe with FFmpeg
  const probe = spawnSync(ffmpegExe, ["-hide_banner", "-i", videoPath], { encoding: "utf8" });
  const text = probe.stderr ?? "";

  // Parse duration
  const durMatch = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(text);
  const durationSeconds = durMatch
    ? Number(durMatch[1]) * 3600 + Number(durMatch[2]) * 60 + Number(durMatch[3])
    : 0;

  // Parse video stream
  const videoMatch = /Stream #0:0[^\n]*Video:\s*([a-zA-Z0-9_-]+)[^\n]*, ([a-zA-Z0-9_-]+)[^\n]*, (\d+)x(\d+)[^\n]*, (\d+(?:\.\d+)?)\s*fps/.exec(text);
  const videoCodec = videoMatch ? videoMatch[1] : "unknown";
  const pixelFormat = videoMatch ? videoMatch[2] : "unknown";
  const width = videoMatch ? Number(videoMatch[3]) : 0;
  const height = videoMatch ? Number(videoMatch[4]) : 0;
  const fps = videoMatch ? Number(videoMatch[5]) : 0;

  // Parse audio stream
  const audioMatch = /Stream #0:1[^\n]*Audio:\s*([a-zA-Z0-9_-]+)[^\n]*, (\d+)\s*Hz/.exec(text);
  const audioCodec = audioMatch ? audioMatch[1] : "none";
  const audioSampleRate = audioMatch ? Number(audioMatch[2]) : 0;

  const qaDir = path.resolve(path.dirname(videoPath), "qa", label);
  fs.mkdirSync(qaDir, { recursive: true });

  // Milestone points: 0% (~1.5s), 25% (~78s), 50% (~158s), 75% (~237s), 100% (~314.5s)
  const milestones = [
    { pct: "000pct", time: 1.5, name: "beginning_intro" },
    { pct: "025pct", time: 78.0, name: "verse_chorus_sync" },
    { pct: "050pct", time: 158.0, name: "midpoint_nightfall" },
    { pct: "075pct", time: 237.0, name: "discovery_dawn" },
    { pct: "100pct", time: 314.5, name: "ending_finale" },
  ];

  const qaFrames: string[] = [];
  for (const m of milestones) {
    const framePath = path.resolve(qaDir, `${m.pct}_${m.name}.png`);
    spawnSync(ffmpegExe, [
      "-y",
      "-hide_banner",
      "-i",
      videoPath,
      "-ss",
      m.time.toFixed(3),
      "-vframes",
      "1",
      framePath,
    ]);
    if (fs.existsSync(framePath)) {
      qaFrames.push(framePath);
    }
  }

  const report: ValidationReport = {
    filePath: videoPath,
    width,
    height,
    fps,
    videoCodec,
    pixelFormat,
    audioCodec,
    audioSampleRate,
    durationSeconds,
    durationDeltaSeconds: Math.abs(durationSeconds - SONG_DURATION),
    fileSizeBytes: stats.size,
    qaFrames,
  };

  console.log(`\n--- Validation Report: ${label.toUpperCase()} ---`);
  console.log(`Resolution: ${report.width}x${report.height}`);
  console.log(`Framerate: ${report.fps} fps`);
  console.log(`Video Codec: ${report.videoCodec} (${report.pixelFormat})`);
  console.log(`Audio: ${report.audioCodec} @ ${report.audioSampleRate} Hz`);
  console.log(`Duration: ${report.durationSeconds.toFixed(2)}s (Target: ${SONG_DURATION}s, Delta: ${report.durationDeltaSeconds.toFixed(2)}s)`);
  console.log(`File Size: ${(report.fileSizeBytes / (1024 * 1024)).toFixed(2)} MB`);
  console.log(`QA Frames extracted: ${report.qaFrames.length} in ${qaDir}`);

  return report;
}
