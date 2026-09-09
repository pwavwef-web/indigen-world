import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const app = read("src/App.tsx");
const firebase = read("src/firebase.ts");
const html = read("index.html");

assert.match(html, /<title>Kasena Dictionary<\/title>/, "app has standalone product metadata");
assert.match(app, /Search Kasem or English/, "app exposes bilingual search");
assert.match(app, /SAVED_KEY/, "app supports device-local saved words");
assert.match(app, /LETTERS/, "app supports alphabetical browsing");
assert.match(app, /search_kasena_dictionary/, "app exposes its primary search journey to supporting agents");
assert.match(firebase, /where\("isPublished", "==", true\)/, "app reads published entries only");
assert.match(firebase, /4c3913f1d671a7b129a0df/, "app uses its dedicated Firebase Web App registration");

console.log("Validated the standalone Kasena Dictionary product and publication boundary.");
