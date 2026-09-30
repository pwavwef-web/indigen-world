import { createRequire } from "node:module";
import { resolve, dirname } from "node:path";
import { spawn } from "node:child_process";
const root = resolve(import.meta.dirname, ".."),
  website = resolve(root, "apps/website");
const require = createRequire(resolve(website, "package.json"));
const child = spawn(
  process.execPath,
  [
    resolve(dirname(require.resolve("vite/package.json")), "bin/vite.js"),
    "--host",
    "127.0.0.1",
    "--port",
    "5173",
    "--strictPort",
  ],
  {
    cwd: website,
    stdio: "inherit",
    windowsHide: true,
    env: {
      ...process.env,
      VITE_USE_EMULATORS: "true",
      VITE_SITE_URL: "http://127.0.0.1:5173",
      VITE_FIREBASE_API_KEY: "demo-key",
      VITE_FIREBASE_PROJECT_ID: "demo-indigen-world",
      VITE_FIREBASE_APP_ID: "demo-labs",
      VITE_FIREBASE_AUTH_DOMAIN: "localhost",
      VITE_ANALYTICS_ENABLED: "false",
    },
  },
);
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));
