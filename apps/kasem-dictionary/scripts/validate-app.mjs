import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const app = read("src/App.tsx");
const firebase = read("src/firebase.ts");
const html = read("index.html");
const styles = read("src/styles.css");

assert.match(html, /<title>Kasem Dictionary<\/title>/, "app has standalone product metadata");
assert.match(html, /<link rel="canonical" href="https:\/\/www\.venacula\.com\/" \/>/, "www.venacula.com is the canonical address, not the web.app defaults");
assert.match(read("public/robots.txt"), /Sitemap: https:\/\/www\.venacula\.com\/sitemap\.xml/, "robots.txt points crawlers at the canonical sitemap");
assert.match(read("public/sitemap.xml"), /<loc>https:\/\/www\.venacula\.com\/<\/loc>/, "the sitemap lists the canonical address");
assert.match(app, /Search Kasem or English/, "app exposes bilingual search");
assert.match(app, /SAVED_KEY/, "app supports device-local saved words");
assert.match(app, /LETTERS/, "app supports alphabetical browsing");
assert.match(app, /aria-modal=\{mobileDetail/, "mobile word details open as a modal screen");
assert.match(styles, /\.showing-detail \.definition-panel \{[\s\S]*position:fixed;/, "mobile word details fill the viewport instead of appearing below results");
assert.match(styles, /--navy-900:#0f1830;/, "dictionary uses the shared Indigen World navy");
assert.match(styles, /--blue:#2f6bff;/, "dictionary uses the shared Indigen World action blue");
assert.match(html, /name="theme-color" content="#0f1830"/, "browser chrome matches the shared Indigen World theme");
assert.match(app, /search_kasem_dictionary/, "app exposes its primary search journey to supporting agents");
assert.match(firebase, /where\("isPublished", "==", true\)/, "app reads published entries only");
assert.match(firebase, /4c3913f1d671a7b129a0df/, "app uses its dedicated Firebase Web App registration");

console.log("Validated the standalone Kasem Dictionary product and publication boundary.");
