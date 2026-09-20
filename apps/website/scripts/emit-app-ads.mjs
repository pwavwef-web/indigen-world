import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const record = process.env.ADMOB_APP_ADS_TXT_RECORD?.trim() ?? "";

// The exact account record is intentionally deployment configuration: the
// publisher id embedded in it must not be copied into source control or logs.
if (!record) {
  console.warn("app-ads.txt not emitted: ADMOB_APP_ADS_TXT_RECORD is unset.");
  process.exit(0);
}

if (!/^google\.com, pub-\d{16}, DIRECT, f08c47fec0942fa0$/.test(record)) {
  throw new Error("ADMOB_APP_ADS_TXT_RECORD is not a valid Google app-ads.txt record.");
}

const output = path.join(root, "dist", "app-ads.txt");
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, `${record}\n`, "utf8");
console.log("Emitted app-ads.txt without logging the publisher record.");
