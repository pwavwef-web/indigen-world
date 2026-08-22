/**
 * scripts/prerender-meta.mjs
 *
 * Runs after `vite build`. This is a client-rendered SPA, so every route's
 * per-page <title>/description/canonical/OG tags are otherwise set only after
 * JS runs — invisible to non-JS crawlers and social unfurlers, which would see
 * the home page's generic tags for /about, /ecosystem, and so on.
 *
 * This bakes the correct static metadata for each route into its own
 * dist/<route>/index.html. Firebase Hosting serves that file directly (the
 * catch-all rewrite to /index.html only applies when no matching file exists),
 * so a crawler requesting /about gets /about's real title and description while
 * users still get the same SPA bundle.
 *
 * Route metadata is read from src/content/navigation.ts so this file and the
 * app share one source of truth — no hand-maintained duplicate to drift.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";

const root = resolve(import.meta.dirname, "..");
const distIndex = resolve(root, "dist/index.html");

const siteOrigin = (process.env.VITE_SITE_URL || "https://indigen-world.web.app").replace(/\/+$/, "");

const HOME_TITLE = "Indigen World — Culture belongs in the future";

/** Parse ROUTES (path, title, description) out of the app's navigation source. */
function readRoutes() {
  const source = readFileSync(resolve(root, "src/content/navigation.ts"), "utf8");
  const pattern =
    /path:\s*"([^"]+)",[\s\S]*?title:\s*"([^"]+)",\s*description:\s*"((?:[^"\\]|\\.)*)"/g;
  const routes = [];
  let match;
  while ((match = pattern.exec(source)) !== null) {
    routes.push({ path: match[1], title: match[2], description: match[3] });
  }
  if (routes.length === 0) {
    throw new Error("prerender-meta: no routes parsed from navigation.ts");
  }
  return routes;
}

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Replace one tag's `content`/`href` value. The tag is located by a unique
 * identifying attribute (e.g. name="description"); meta/link tags in the built
 * HTML can span multiple lines, so we match the whole tag rather than assume a
 * single-space layout.
 */
function replaceAttr(html, identifier, attr, value) {
  const attrRe = new RegExp(`(\\b${attr}=")[^"]*(")`);
  let replaced = false;
  const out = html.replace(/<(?:meta|link)\b[^>]*>/g, (tag) => {
    if (replaced || !tag.includes(identifier) || !attrRe.test(tag)) return tag;
    replaced = true;
    return tag.replace(attrRe, `$1${escapeHtml(value)}$2`);
  });
  if (!replaced) {
    throw new Error(`prerender-meta: could not find ${attr} for ${identifier}`);
  }
  return out;
}

function renderRoute(baseHtml, route) {
  const isHome = route.path === "home";
  const fullTitle = isHome ? HOME_TITLE : `${route.title} · Indigen World`;
  const url = isHome ? `${siteOrigin}/` : `${siteOrigin}/${route.path}`;
  const description = route.description;

  let html = baseHtml.replace(
    /<title>[^<]*<\/title>/,
    `<title>${escapeHtml(fullTitle)}</title>`
  );
  html = replaceAttr(html, 'name="description"', "content", description);
  html = replaceAttr(html, 'property="og:title"', "content", fullTitle);
  html = replaceAttr(html, 'property="og:description"', "content", description);
  html = replaceAttr(html, 'property="og:url"', "content", url);
  html = replaceAttr(html, 'name="twitter:title"', "content", fullTitle);
  html = replaceAttr(html, 'name="twitter:description"', "content", description);
  html = replaceAttr(html, 'rel="canonical"', "href", url);
  return html;
}

const baseHtml = readFileSync(distIndex, "utf8");
const routes = readRoutes();

let written = 0;
for (const route of routes) {
  const html = renderRoute(baseHtml, route);
  if (route.path === "home") {
    writeFileSync(distIndex, html, "utf8");
  } else {
    const target = resolve(root, "dist", route.path, "index.html");
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, html, "utf8");
  }
  written += 1;
}

console.log(`Prerendered per-route metadata for ${written} routes (origin ${siteOrigin}).`);
