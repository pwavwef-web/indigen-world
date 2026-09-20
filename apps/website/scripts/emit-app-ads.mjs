import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { appAdsRecord } from "../../../scripts/admob-release-config.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// The exact account record is deployment configuration: the publisher id
// embedded in it must not be copied into source control or logs. It comes from
// ADMOB_APP_ADS_TXT_RECORD in the environment, or from the ignored
// admob.local.json at the repository root — the same file the mobile release
// build reads its four identifiers from, so there is one place to put the
// account's details and one place to change them.
//
// A malformed record throws from appAdsRecord(); an absent one is not an error,
// because most website deploys have nothing to do with advertising.
const record = appAdsRecord();

if (!record) {
  console.warn(
    "app-ads.txt not emitted: no ADMOB_APP_ADS_TXT_RECORD in the environment or admob.local.json.",
  );
  process.exit(0);
}

const output = path.join(root, "dist", "app-ads.txt");
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, `${record}\n`, "utf8");
console.log("Emitted app-ads.txt without logging the publisher record.");
