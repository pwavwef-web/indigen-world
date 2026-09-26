/**
 * tools/beyond-the-reef-export/render.ts
 *
 * Master runner that renders both YouTube (16:9) and TikTok/Reels/Shorts (9:16)
 * video masters sequentially, followed by automated metadata and visual QA verification.
 */
import path from "node:path";
import { captureAndExport } from "./capture.ts";
import { validateExport, ValidationReport } from "./validate.ts";
import { REPO_ROOT } from "./server.ts";

async function main() {
  const youtubeOutput = path.resolve(REPO_ROOT, "exports/beyond-the-reef/beyond-the-reef-youtube-16x9.mp4");
  const verticalOutput = path.resolve(REPO_ROOT, "exports/beyond-the-reef/beyond-the-reef-vertical-9x16.mp4");

  console.log("================================================================================");
  console.log("             BEYOND THE REEF — COMPLETE MUSIC VIDEO EXPORT PIPELINE              ");
  console.log("================================================================================");

  // 1. YouTube 16:9
  console.log("\n[STAGE 1/2] RENDERING YOUTUBE 16:9 MASTER...");
  await captureAndExport({
    orientation: "youtube",
    outputPath: youtubeOutput,
    port: 8781,
  });
  const ytReport = validateExport(youtubeOutput, "youtube-16x9");

  // 2. Vertical 9:16
  console.log("\n[STAGE 2/2] RENDERING TIKTOK/REELS/SHORTS 9:16 MASTER...");
  await captureAndExport({
    orientation: "vertical",
    outputPath: verticalOutput,
    port: 8782,
  });
  const vertReport = validateExport(verticalOutput, "vertical-9x16");

  console.log("\n================================================================================");
  console.log("                       EXPORT & VALIDATION SUMMARY REPORT                       ");
  console.log("================================================================================");
  printSummary("YouTube (16:9)", ytReport);
  printSummary("Vertical (9:16)", vertReport);
}

function printSummary(name: string, r: ValidationReport) {
  console.log(`\nMaster: ${name}`);
  console.log(`  File:       ${r.filePath}`);
  console.log(`  Resolution: ${r.width}x${r.height}`);
  console.log(`  Framerate:  ${r.fps} fps`);
  console.log(`  Video:      ${r.videoCodec} (${r.pixelFormat})`);
  console.log(`  Audio:      ${r.audioCodec} @ ${r.audioSampleRate} Hz`);
  console.log(`  Duration:   ${r.durationSeconds.toFixed(2)}s (Delta: ${r.durationDeltaSeconds.toFixed(2)}s)`);
  console.log(`  Size:       ${(r.fileSizeBytes / (1024 * 1024)).toFixed(2)} MB`);
  console.log(`  QA Frames:  ${r.qaFrames.length} captured`);
}

main().catch((err) => {
  console.error("\nExport pipeline failed:", err);
  process.exit(1);
});
