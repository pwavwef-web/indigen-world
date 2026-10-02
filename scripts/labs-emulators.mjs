import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
const root = resolve(import.meta.dirname, "..");
const scratch = resolve(root, ".labs-local");
const localConfig = resolve(root, ".labs-local.firebase.json");
mkdirSync(resolve(scratch, "functions"), { recursive: true });
const functionsPackage = JSON.parse(
  readFileSync(resolve(root, "services/functions/package.json"), "utf8"),
);
writeFileSync(
  resolve(scratch, "functions/package.json"),
  JSON.stringify(
    {
      name: "indigen-world-labs-local",
      private: true,
      type: "module",
      engines: functionsPackage.engines,
      main: "../../services/functions/lib/labs-emulator.js",
      dependencies: {
        "firebase-admin": functionsPackage.dependencies["firebase-admin"],
        "firebase-functions":
          functionsPackage.dependencies["firebase-functions"],
      },
    },
    null,
    2,
  ),
);
const mainConfig = JSON.parse(
  readFileSync(resolve(root, "firebase.json"), "utf8"),
);
const portOffset = Number(process.env.LABS_TEST_PORT_OFFSET || 0);
if (!Number.isInteger(portOffset) || portOffset < 0 || portOffset > 1000)
  throw new Error("LABS_TEST_PORT_OFFSET must be an integer from 0 to 1000.");
if (portOffset) {
  for (const config of Object.values(mainConfig.emulators))
    if (config && typeof config === "object" && typeof config.port === "number") config.port += portOffset;
  mainConfig.emulators.hub = { port: 4400 + portOffset };
  mainConfig.emulators.logging = { port: 4500 + portOffset };
}
writeFileSync(
  localConfig,
  JSON.stringify(
    {
      functions: { source: ".labs-local/functions" },
      firestore: mainConfig.firestore,
      emulators: mainConfig.emulators,
    },
    null,
    2,
  ),
);
const testMode = process.argv.includes("--test");
const args = [
  resolve(root, "node_modules/firebase-tools/lib/bin/firebase.js"),
  testMode ? "emulators:exec" : "emulators:start",
  "--project",
  "demo-indigen-world",
  "--only",
  "auth,firestore,functions",
  "--config",
  localConfig,
];
if (testMode)
  args.push(
    "node --test --test-concurrency=1 firebase/tests/labs.rules.test.mjs firebase/tests/labs.e2e.test.mjs",
  );
const child = spawn(process.execPath, args, {
  cwd: root,
  stdio: "inherit",
  windowsHide: true,
  env: { ...process.env, FUNCTIONS_DISCOVERY_TIMEOUT: "120" },
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));
