/**
 * tools/beyond-the-reef-export/export-youtube.ts
 *
 * Dedicated runner for the 16:9 landscape YouTube music video export.
 * Output: exports/beyond-the-reef/beyond-the-reef-youtube-16x9.mp4 (1920x1080)
 */
import path from "node:path";
import { captureAndExport } from "./capture.ts";
import { validateExport } from "./validate.ts";
import { REPO_ROOT } from "./server.ts";

async function main() {
  const outputPath = path.resolve(REPO_ROOT, "exports/beyond-the-reef/beyond-the-reef-youtube-16x9.mp4");
  await captureAndExport({
    orientation: "youtube",
    outputPath,
  });

  validateExport(outputPath, "youtube-16x9");
}

main().catch((err) => {
  console.error("Export YouTube failed:", err);
  process.exit(1);
});
