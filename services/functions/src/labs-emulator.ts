/** Local-only entry avoids loading unrelated services during Labs tests. */
import { initializeApp } from "firebase-admin/app";
if (!process.env.GCLOUD_PROJECT?.startsWith("demo-"))
  throw new Error("The Labs emulator entry is restricted to demo projects.");
initializeApp();
export { labsApi } from "./labs.js";
