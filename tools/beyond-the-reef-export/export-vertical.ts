/**
 * tools/beyond-the-reef-export/export-vertical.ts
 *
 * Dedicated runner for the 9:16 portrait TikTok / Reels / Shorts music video export.
 * Rendered at genuine 1080x1920 so the site's responsive portrait layout renders naturally.
 * Output: exports/beyond-the-reef/beyond-the-reef-vertical-9x16.mp4 (1080x1920)
 */
import path from "node:path";
import { captureAndExport } from "./capture.ts";
import { validateExport } from "./validate.ts";
import { REPO_ROOT } from "./server.ts";

async function main() {
  const outputPath = path.resolve(REPO_ROOT, "exports/beyond-the-reef/beyond-the-reef-vertical-9x16.mp4");
  await captureAndExport({
    orientation: "vertical",
    outputPath,
  });

  validateExport(outputPath, "vertical-9x16");
}

main().catch((err) => {
  console.error("Export Vertical failed:", err);
  process.exit(1);
});
