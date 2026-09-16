/**
 * scripts/prerender-meta.mjs
 *
 * Runs after `vite build`. This is a client-rendered SPA, so every route's
 * per-page <title>/description/canonical/OG tags are otherwise set only after
 * JS runs — invisible to non-JS crawlers and social unfurlers, which would see
 * the home page's generic tags for /about, /ecosystem, and so on.
 *
 * This bakes the correct static metadata for each route into its own
 * dist/<route>/index.html. Firebase Hosting serves those files directly, so a
 * crawler requesting /about gets /about's real title and description while
 * users still get the same SPA bundle. A noindex 404.html uses that bundle to
 * render NotFoundPage while allowing Hosting to return a genuine HTTP 404.
 *
 * Route metadata is read from src/content/navigation.ts so this file and the
 * app share one source of truth — no hand-maintained duplicate to drift.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";

const root = resolve(import.meta.dirname, "..");
const distIndex = resolve(root, "dist/index.html");

const siteOrigin = (process.env.VITE_SITE_URL || "https://indigenworld.com").replace(/\/+$/, "");

const HOME_TITLE = "Indigen World — Culture belongs in the future";
const NOT_FOUND_ROUTE = {
  path: "404",
  title: "Page not found",
  description: "The page you're looking for doesn't exist.",
  noindex: true,
};

/**
 * Parse ROUTES out of the app's navigation source: path, title, description,
 * noindex, and an optional per-route link preview (ogImage, ogImageAlt).
 *
 * Each route's text runs from its `path:` to the next one, so optional fields
 * can sit in any order without one regex having to anticipate all of them.
 */
function readRoutes() {
  const source = readFileSync(resolve(root, "src/content/navigation.ts"), "utf8");
  const start = source.indexOf("export const ROUTES");
  const end = source.indexOf("\n];", start);
  if (start < 0 || end < 0) {
    throw new Error("prerender-meta: ROUTES array not found in navigation.ts");
  }
  const block = source.slice(start, end);
  const stringField = (text, key) => {
    const match = new RegExp(`\\b${key}:\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(text);
    return match ? match[1] : undefined;
  };
  const heads = [...block.matchAll(/\bpath:\s*"([^"]+)"/g)];
  const routes = heads.map((head, index) => {
    const body = block.slice(head.index, index + 1 < heads.length ? heads[index + 1].index : block.length);
    const title = stringField(body, "title");
    const description = stringField(body, "description");
    if (!title || !description) {
      throw new Error(`prerender-meta: route "${head[1]}" needs a title and a description`);
    }
    return {
      path: head[1],
      title,
      description,
      noindex: /\bnoindex:\s*true/.test(body),
      ogImage: stringField(body, "ogImage"),
      ogImageAlt: stringField(body, "ogImageAlt"),
    };
  });
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
  html = replaceAttr(html, 'name="robots"', "content", route.noindex ? "noindex" : "index, follow");
  if (route.noindex) {
    html = html.replace(/\s*<link\b[^>]*rel="canonical"[^>]*\/?\s*>/, "");
  } else {
    html = replaceAttr(html, 'rel="canonical"', "href", url);
  }
  if (route.ogImage) {
    const image = new URL(route.ogImage, `${siteOrigin}/`).href;
    const type = /\.png$/i.test(route.ogImage) ? "image/png" : /\.webp$/i.test(route.ogImage) ? "image/webp" : "image/jpeg";
    html = replaceAttr(html, 'property="og:image"', "content", image);
    html = replaceAttr(html, 'property="og:image:type"', "content", type);
    html = replaceAttr(html, 'name="twitter:image"', "content", image);
    if (route.ogImageAlt) {
      html = replaceAttr(html, 'property="og:image:alt"', "content", route.ogImageAlt);
      html = replaceAttr(html, 'name="twitter:image:alt"', "content", route.ogImageAlt);
    }
  }
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

writeFileSync(resolve(root, "dist/404.html"), renderRoute(baseHtml, NOT_FOUND_ROUTE), "utf8");

console.log(`Prerendered metadata for ${written} routes plus the hosting 404 page (origin ${siteOrigin}).`);
