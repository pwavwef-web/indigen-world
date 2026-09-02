/**
 * apps/updates-blog/scripts/build-preview.mjs
 *
 * Generates the static preview pages from the Blogger theme itself, so the
 * preview can never drift from the XML you actually paste into Blogger.
 *
 * It pulls the CSS out of <b:skin>, resolves the Blogger Theme Designer
 * $(variable) substitutions to their declared defaults, pulls the runtime
 * JavaScript out of the body <script>, and wraps both around sample content
 * that mirrors the markup the Blog widget emits.
 *
 *   node apps/updates-blog/scripts/build-preview.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const themePath = join(root, "theme", "indigen-world-updates.xml");
const xml = readFileSync(themePath, "utf8");

/* ---------------------------------------------------------------- extract */

function between(source, open, close, { from = 0 } = {}) {
  const a = source.indexOf(open, from);
  if (a === -1) throw new Error(`build-preview: could not find ${open}`);
  const b = source.indexOf(close, a + open.length);
  if (b === -1) throw new Error(`build-preview: could not find ${close}`);
  return { text: source.slice(a + open.length, b), end: b + close.length };
}

const skin = between(xml, "<b:skin><![CDATA[", "]]></b:skin>").text;

// The body script is the last CDATA-wrapped script in the file.
const lastScript = xml.lastIndexOf("<script>//<![CDATA[");
const runtimeJs = between(xml, "<script>//<![CDATA[", "//]]></script>", { from: lastScript }).text;

/* ------------------------------------------------- resolve $(...) tokens */

// <Variable name="brand.gold" ... default="#d6a52b" .../>
const vars = new Map();
for (const m of skin.matchAll(/<Variable\s+name="([^"]+)"[^>]*?default="([^"]*)"/g)) {
  vars.set(m[1], m[2]);
}
if (vars.size === 0) throw new Error("build-preview: no <Variable> declarations found");

// A font variable such as "normal normal 16px 'Noto Sans', sans-serif" exposes
// .size and .family the same way Blogger does.
function resolve(token) {
  if (vars.has(token)) return vars.get(token);

  const dot = token.lastIndexOf(".");
  if (dot === -1) return null;
  const base = token.slice(0, dot);
  const part = token.slice(dot + 1);
  const value = vars.get(base);
  if (value === undefined) return null;

  const size = value.match(/(\d+(?:\.\d+)?(?:px|em|rem|%|pt))/);
  if (part === "size") return size ? size[1] : null;
  if (part === "family") {
    return size ? value.slice(value.indexOf(size[1]) + size[1].length).trim() : value;
  }
  return null;
}

const unresolved = [];
let css = skin.replace(/\$\(([^)]+)\)/g, (whole, token) => {
  const value = resolve(token.trim());
  if (value === null) {
    unresolved.push(token.trim());
    return whole;
  }
  return value;
});
if (unresolved.length) {
  throw new Error(`build-preview: unresolved theme variables: ${unresolved.join(", ")}`);
}

// Drop the leading Theme Designer declaration comment; it is Blogger-only.
css = css.replace(/^\/\*[\s\S]*?\*\/\s*/, "");

/* -------------------------------------------------------- sample content */

const MARK = `<svg aria-hidden="true" class="iw-mark" focusable="false" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <path class="iw-mark__frame" d="M15 47V23l17-9 17 9v24"/>
  <path class="iw-mark__line" d="M24 44V29m8 15V24m8 20V29"/>
  <circle class="iw-mark__sun" cx="32" cy="14" r="4"/>
</svg>`;

/** A woven, brand-coloured stand-in so the preview needs no network. */
function plate(seed) {
  const tones = [
    ["#24406e", "#101c36", "#d6a52b"],
    ["#1f5b3a", "#101c36", "#f0d99c"],
    ["#7a3f2c", "#191024", "#d6a52b"],
    ["#1e365d", "#0d1524", "#b65a3a"],
  ][seed % 4];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 450">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${tones[0]}"/><stop offset="1" stop-color="${tones[1]}"/>
    </linearGradient>
    <pattern id="w" width="34" height="34" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="34" height="34" fill="none"/>
      <path d="M0 8h34M0 22h34" stroke="${tones[2]}" stroke-opacity=".22" stroke-width="3"/>
    </pattern></defs>
    <rect width="800" height="450" fill="url(#g)"/>
    <rect width="800" height="450" fill="url(#w)"/>
    <circle cx="${120 + seed * 90}" cy="96" r="46" fill="none" stroke="${tones[2]}" stroke-opacity=".4" stroke-width="2"/>
    <circle cx="${120 + seed * 90}" cy="96" r="84" fill="none" stroke="${tones[2]}" stroke-opacity=".18" stroke-width="2"/>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const POSTS = [
  {
    title: "The validation desk is live for Kasem contributors",
    label: "Release",
    date: "2026-08-26",
    shown: "26 Aug 2026",
    snippet:
      "Community validators can now review, annotate and approve submitted Kasem entries in TribeStudio, with full provenance kept on every record.",
    image: true,
  },
  {
    title: "Dark mode across the mobile app",
    label: "Feature",
    date: "2026-08-19",
    shown: "19 Aug 2026",
    snippet:
      "A brightness-aware palette now runs through every screen of the Flutter app, including the community feed and the offline reading views.",
    image: true,
  },
  {
    title: "How we model a language cell",
    label: "Engineering",
    date: "2026-08-11",
    shown: "11 Aug 2026",
    snippet:
      "Project Kassena is the first implementation of a reusable structure. Here is what a language cell holds, and what has to travel with every entry.",
    image: false,
  },
  {
    title: "A reports queue for community moderation",
    label: "Governance",
    date: "2026-08-04",
    shown: "4 Aug 2026",
    snippet:
      "Reports raised in the app now land in a triaged admin queue, with decisions and reasons recorded against the originating record.",
    image: true,
  },
  {
    title: "The dialect map now carries district boundaries",
    label: "Language",
    date: "2026-07-29",
    shown: "29 Jul 2026",
    snippet:
      "Kasem dialect areas are drawn against real district lines, so contributors can place an entry precisely where it was collected.",
    image: false,
  },
];

function card(post, index) {
  // Mirrors the theme: the lead card is the index page's largest-contentful
  // paint, so it loads eagerly while every other card stays lazy.
  const media = post.image
    ? `<img alt="" decoding="async" fetchpriority="${index === 0 ? "high" : "auto"}" height="506" loading="${index === 0 ? "eager" : "lazy"}" src="${plate(index)}" width="900"/>`
    : `<span class="iw-card__motif">${MARK}</span>`;
  return `      <article class="iw-card${index === 0 ? " iw-card--lead" : ""}">
        <div class="iw-card__media">${media}</div>
        <div class="iw-card__body">
          <div class="iw-chips"><a class="iw-chip" data-label="${post.label}" href="#">${post.label}</a></div>
          <h2 class="iw-card__title"><a href="post.html">${post.title}</a></h2>
          <p class="iw-card__snippet">${post.snippet}</p>
          <div class="iw-card__foot">
            <time datetime="${post.date}">${post.shown}</time>
            <span class="iw-card__more">Read update</span>
          </div>
        </div>
      </article>`;
}

const NAV = `      <div class="iw-nav" id="iw-nav">
        <div class="iw-nav__in">
          <div class="section" id="mainnav"><div class="widget PageList">
            <ul class="iw-navlist">
              <li><a href="index.html">Latest</a></li>
              <li><a href="post.html">Releases</a></li>
              <li><a href="#">Features</a></li>
              <li><a href="#">Engineering</a></li>
              <li><a href="#">About</a></li>
            </ul>
          </div></div>
        </div>
      </div>`;

const ACTIONS = `      <div class="iw-head__act">
        <button aria-controls="iw-searchpane" aria-expanded="false" class="iw-ibtn" id="iw-search-btn" title="Search" type="button">
          <span class="iw-sr">Search</span>
          <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
        </button>
        <button aria-pressed="false" class="iw-ibtn" id="iw-theme-btn" title="Switch colour scheme" type="button">
          <span class="iw-sr">Switch colour scheme</span>
          <svg aria-hidden="true" class="iw-i-sun" focusable="false" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M4.2 4.2l1.6 1.6M18.2 18.2l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.2 19.8l1.6-1.6M18.2 5.8l1.6-1.6"/></svg>
          <svg aria-hidden="true" class="iw-i-moon" focusable="false" viewBox="0 0 24 24"><path d="M20 14.2A8.2 8.2 0 019.8 4a8.4 8.4 0 108.2 10.2z"/></svg>
        </button>
        <button aria-controls="iw-nav" aria-expanded="false" class="iw-ibtn iw-menubtn" id="iw-menu-btn" title="Menu" type="button">
          <span class="iw-sr">Menu</span>
          <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
        </button>
      </div>`;

const HEADER = `  <header class="iw-head" id="iw-head">
    <div class="iw-shell iw-head__in">
      <div class="section" id="masthead"><div class="widget Header">
        <a class="iw-brand" href="index.html" title="Indigen World Updates">
          ${MARK}
          <span class="iw-brand__text">
            <strong>Indigen World Updates</strong>
            <small>Culture belongs in the future</small>
          </span>
        </a>
      </div></div>
${NAV}
${ACTIONS}
    </div>
  </header>

  <div aria-labelledby="iw-q-label" class="iw-searchpane" hidden id="iw-searchpane">
    <div class="iw-shell">
      <form class="iw-searchform" role="search">
        <label class="iw-sr" for="iw-q" id="iw-q-label">Search this blog</label>
        <input autocomplete="off" id="iw-q" name="q" placeholder="Search updates, features, releases..." type="text"/>
        <button type="submit">Search</button>
      </form>
    </div>
  </div>`;

const SIDEBAR = `      <aside class="iw-side">
        <div class="section iw-side__in" id="sidebar">

          <div class="widget BlogSearch">
            <h3 class="iw-widget-title">Search</h3>
            <div class="widget-content">
              <form class="iw-sidesearch">
                <label class="iw-sr" for="iw-sq">Search this blog</label>
                <input autocomplete="off" id="iw-sq" placeholder="Search updates" type="text"/>
                <button type="submit">Go</button>
              </form>
            </div>
          </div>

          <div class="widget HTML">
            <h3 class="iw-widget-title">About these updates</h3>
            <div class="widget-content">
              <p>Release notes, feature updates and notes from the field across the Indigen World ecosystem.</p>
              <p style="margin-top:10px"><a href="https://indigenworld.com/">Visit indigenworld.com &#8594;</a></p>
            </div>
          </div>

          <div class="widget Label">
            <h3 class="iw-widget-title">Topics</h3>
            <div class="widget-content">
              <div class="iw-labels">
                <a class="iw-chip" data-label="Release" href="#">Release <span class="iw-labels__count">12</span></a>
                <a class="iw-chip" data-label="Feature" href="#">Feature <span class="iw-labels__count">9</span></a>
                <a class="iw-chip" data-label="Engineering" href="#">Engineering <span class="iw-labels__count">7</span></a>
                <a class="iw-chip" data-label="Community" href="#">Community <span class="iw-labels__count">5</span></a>
                <a class="iw-chip" data-label="Language" href="#">Language <span class="iw-labels__count">4</span></a>
                <a class="iw-chip" data-label="Governance" href="#">Governance <span class="iw-labels__count">3</span></a>
              </div>
            </div>
          </div>

          <div class="widget PopularPosts">
            <h3 class="iw-widget-title">Most read</h3>
            <div class="widget-content">
              <div class="iw-pp">
${POSTS.slice(0, 4)
  .map(
    (p, i) => `                <a class="iw-pp__item" href="post.html">
                  ${
                    p.image
                      ? `<img alt="" class="iw-pp__img" src="${plate(i)}"/>`
                      : `<span class="iw-pp__n">${i + 1}</span>`
                  }
                  <span class="iw-pp__t">${p.title}</span>
                </a>`
  )
  .join("\n")}
              </div>
            </div>
          </div>

          <div class="widget BlogArchive">
            <h3 class="iw-widget-title">Archive</h3>
            <div class="widget-content">
              <ul>
                <li class="archivedate"><a href="#">August 2026</a> (5)</li>
                <li class="archivedate"><a href="#">July 2026</a> (4)</li>
                <li class="archivedate"><a href="#">June 2026</a> (6)</li>
              </ul>
            </div>
          </div>

        </div>
      </aside>`;

const FOOTER = `  <footer class="iw-foot">
    <div class="iw-shell">
      <div class="iw-foot__top">
        <div class="iw-foot__brand">
          <a class="iw-brand" href="index.html">
            ${MARK}
            <span class="iw-brand__text">
              <strong>Indigen World Updates</strong>
              <small>Culture belongs in the future</small>
            </span>
          </a>
          <p>A cultural technology ecosystem for language preservation, cultural learning, storytelling and creator enablement.</p>
        </div>
        <div class="iw-foot__cols">
          <div class="section" id="footer1"><div class="widget HTML">
            <h3 class="iw-widget-title">Ecosystem</h3>
            <div class="widget-content"><ul>
              <li><a href="https://indigenworld.com/">Indigen World</a></li>
              <li><a href="https://indigenworld.com/ecosystem">Ecosystem</a></li>
              <li><a href="https://indigenworld.com/project-kassena">Project Kassena</a></li>
              <li><a href="https://indigenworld.com/get-involved">Get involved</a></li>
            </ul></div>
          </div></div>
          <div class="section" id="footer2"><div class="widget HTML">
            <h3 class="iw-widget-title">Indigen World</h3>
            <div class="widget-content"><ul>
              <li><a href="https://indigenworld.com/about">About</a></li>
              <li><a href="https://indigenworld.com/impact-governance">Impact and governance</a></li>
              <li><a href="https://indigenworld.com/contact">Contact</a></li>
              <li><a href="https://indigenworld.com/privacy">Privacy</a></li>
            </ul></div>
          </div></div>
          <div class="section" id="footer3"><div class="widget HTML">
            <h3 class="iw-widget-title">Follow along</h3>
            <div class="widget-content"><ul>
              <li><a href="#">RSS feed</a></li>
              <li><a href="#">All updates</a></li>
            </ul></div>
          </div></div>
        </div>
      </div>
      <div class="iw-foot__bottom">
        <p>&#169; <span id="iw-year">2026</span> Indigen World. Cultural materials may carry distinct permissions.</p>
        <span>Published with <a href="https://www.blogger.com" rel="nofollow noopener" target="_blank">Blogger</a></span>
      </div>
    </div>
  </footer>

  <button class="iw-top" id="iw-top" title="Back to top" type="button">
    <span class="iw-sr">Back to top</span>
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><path d="M12 19V5M6 11l6-6 6 6"/></svg>
  </button>`;

const THEME_INIT = `<script>
(function(){try{var s=localStorage.getItem('iw-theme');if(s==='dark'||s==='light'){document.documentElement.setAttribute('data-theme',s);}}catch(e){}})();
</script>`;

const BANNER = `  <div style="background:#101c36;color:#f0d99c;font:600 12px/1.5 'Noto Sans',sans-serif;letter-spacing:.06em;text-transform:uppercase;text-align:center;padding:8px 16px">
    Local preview &#183; generated from theme/indigen-world-updates.xml
  </div>`;

function page({ title, ogTitle, bodyClass = "iw", content, ogType = "website", ogImage = "" }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta content="width=device-width, initial-scale=1, viewport-fit=cover" name="viewport"/>
<meta content="#1e365d" name="theme-color"/>
<title>${title}</title>
<meta content="Indigen World Updates" property="og:site_name"/>
<meta content="${ogTitle || title}" property="og:title"/>
<meta content="Release notes, feature updates and notes from the field." property="og:description"/>
<meta content="${ogType}" property="og:type"/>
<meta content="https://indigenworld.example/updates" property="og:url"/>
${ogImage ? `<meta content="${ogImage}" property="og:image"/>` : ""}
<link crossorigin="anonymous" href="https://fonts.gstatic.com" rel="preconnect"/>
<link href="https://fonts.googleapis.com" rel="preconnect"/>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400&amp;family=Noto+Serif:ital,wght@0,400;0,500;0,600;1,400&amp;display=swap" rel="stylesheet"/>
${THEME_INIT}
<style>
${css}
</style>
</head>
<body class="${bodyClass}">
<a class="iw-skip" href="#iw-content">Skip to content</a>
<div aria-hidden="true" class="iw-progress"><i id="iw-progress-bar"></i></div>
${BANNER}
${content}
<script>
${runtimeJs}
</script>
</body>
</html>
`;
}

/* -------------------------------------------------------------- homepage */

const home = page({
  title: "Indigen World Updates",
  content: `${HEADER}

  <section class="iw-hero">
    <div class="iw-shell iw-hero__in">
      <p class="iw-eyebrow">Release notes and field notes</p>
      <h1 class="iw-hero__title">Indigen World Updates</h1>
      <p class="iw-hero__lede">What we are building, shipping and learning across the Indigen World ecosystem &#8212; the website, TribeStudio, the mobile app and Project Kassena.</p>
      <div class="iw-hero__actions">
        <a class="iw-btn iw-btn--gold" href="#iw-content">Browse updates
          <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><path d="M12 5v14M6 13l6 6 6-6"/></svg>
        </a>
        <a class="iw-btn iw-btn--ghost" href="#">
          <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><path d="M5 18.5a1 1 0 102 0 1 1 0 00-2 0"/><path d="M5 12a7 7 0 017 7M5 6a13 13 0 0113 13"/></svg>
          Subscribe by RSS
        </a>
      </div>
    </div>
  </section>

  <main class="iw-main" id="iw-content">
    <div class="iw-shell">
      <div class="iw-layout iw-layout--index">
        <div class="section" id="main"><div class="widget Blog">
          <div class="iw-grid" id="iw-grid">
${POSTS.map(card).join("\n")}
          </div>
          <nav class="iw-pager">
            <a class="iw-pager__link iw-pager__link--next" href="#" rel="next">
              <span class="iw-pager__kicker">Older &#8594;</span>
              <span class="iw-pager__title">Earlier updates</span>
            </a>
          </nav>
        </div></div>
${SIDEBAR}
        <aside class="iw-rail" hidden id="iw-rail"></aside>
      </div>
    </div>
  </main>

${FOOTER}`,
});

/* ---------------------------------------------------------------- article */

const article = page({
  title: "Dark mode across the mobile app &#183; Indigen World Updates",
  ogTitle: "Dark mode across the mobile app",
  ogType: "article",
  ogImage: plate(1),
  content: `${HEADER}

  <main class="iw-main" id="iw-content">
    <div class="iw-shell">
      <div class="iw-layout iw-layout--article">
        <div class="section" id="main"><div class="widget Blog">
          <article class="iw-article">
            <header class="iw-article__head">
              <div class="iw-chips">
                <a class="iw-chip" data-label="Feature" href="#">Feature</a>
                <a class="iw-chip" data-label="Release" href="#">Release</a>
              </div>
              <h1 class="iw-article__title">Dark mode across the mobile app</h1>
              <div class="iw-meta">
                <span class="iw-meta__author"><a href="#" rel="author">Andy Anim</a></span>
                <span class="iw-dot">&#183;</span>
                <time datetime="2026-08-19">19 August 2026</time>
                <span class="iw-dot" hidden id="iw-rt-dot">&#183;</span>
                <span hidden id="iw-readtime"></span>
              </div>
            </header>

            <figure class="iw-cover"><img alt="" decoding="async" fetchpriority="high" height="788" loading="eager" src="${plate(1)}" width="1400"/></figure>

            <div class="iw-prose" id="iw-postbody">
              <p class="iw-lede">Every screen in the Flutter app now reads from a brightness-aware palette, so the app follows the system setting instead of forcing a single appearance.</p>

              <p>Low-bandwidth and older devices matter to us, and so does reading at night on a phone with a dim screen. Dark mode is not a cosmetic toggle here &#8212; it is part of making the app usable in the conditions people actually use it in.</p>

              <h2>What changed</h2>
              <p>The palette moved out of individual widgets and into a single token layer shared with the website and TribeStudio. Every colour now resolves through a semantic name rather than a literal hex value.</p>

              <ul>
                <li>A brightness-aware palette across all screens, including the community feed.</li>
                <li>Offline reading views now respect the same tokens.</li>
                <li>Contrast raised on gold and terracotta accents so they stay legible on dark surfaces.</li>
              </ul>

              <div class="iw-ship"><strong>Shipped</strong>Available now in the current build. No action needed &#8212; the app follows your device setting by default.</div>

              <h3>The token layer</h3>
              <p>Semantic tokens sit on top of the brand palette. Components reference the semantic name, never the raw brand colour:</p>

              <pre><code>--surface:      #142036;  /* dark */
--text:         #f5f7fa;
--border:       rgba(255,255,255,.12);
--accent:       #e9bf55;  /* gold, lifted for contrast */</code></pre>

              <blockquote>Community governance is infrastructure. Every relevant record must preserve source, contributor, validation, dialect, consent, licence and cultural-permission metadata.</blockquote>

              <h2>Contrast results</h2>
              <p>We checked every accent pairing against WCAG AA for normal text.</p>

              <table>
                <thead><tr><th>Pair</th><th>Light</th><th>Dark</th><th>Result</th></tr></thead>
                <tbody>
                  <tr><td>Body on surface</td><td>13.9:1</td><td>14.6:1</td><td>Pass</td></tr>
                  <tr><td>Gold accent on surface</td><td>4.8:1</td><td>8.1:1</td><td>Pass</td></tr>
                  <tr><td>Terracotta on surface</td><td>4.6:1</td><td>5.9:1</td><td>Pass</td></tr>
                </tbody>
              </table>

              <div class="iw-note"><strong>Note</strong>Sepia and high-contrast themes are defined in the shared token file and will follow in a later release.</div>

              <h2>What is next</h2>
              <p>Per-screen overrides are being removed so the token layer is the only source of colour. After that, the same tokens move into the admin console.</p>

              <div class="iw-warn"><strong>Heads up</strong>If you have pinned an older build, the palette will not follow your system setting until you update.</div>

              <hr/>

              <p>Questions or something looking wrong on your device? <a href="https://indigenworld.com/contact">Tell us</a> and we will take a look.</p>
            </div>

            <footer class="iw-postfoot">
              <div class="iw-postfoot__row">
                <div class="iw-chips">
                  <a class="iw-chip" data-label="Feature" href="#">Feature</a>
                  <a class="iw-chip" data-label="Release" href="#">Release</a>
                </div>
                <div class="iw-share" id="iw-share"><span class="iw-share__label">Share</span></div>
              </div>

              <div class="iw-author">
                <span class="iw-author__mark">${MARK}</span>
                <div>
                  <div class="iw-author__name">Andy Anim</div>
                  <p class="iw-author__role">Writing for Indigen World Updates. Follow along for release notes, feature updates and notes from the field.</p>
                </div>
              </div>
            </footer>

            <section class="iw-related" id="iw-related">
              <h2>More on this topic</h2>
              <div class="iw-related__list" id="iw-related-list">
${POSTS.slice(2, 5)
  .map(
    (p, i) => `                <a class="iw-related__item" href="post.html">
                  ${
                    p.image
                      ? `<img alt="" class="iw-related__thumb" height="64" src="${plate(i + 2)}" width="64"/>`
                      : `<span class="iw-related__motif">${MARK}</span>`
                  }
                  <span class="iw-related__text"><span class="iw-related__t">${p.title}</span><span class="iw-related__d">${p.shown}</span></span>
                </a>`
  )
  .join("\n")}
              </div>
            </section>

            <section class="iw-comments" id="iw-comments">
              <div class="comments">
                <h4>2 comments</h4>
                <div class="comment-block">
                  <div class="comment-header"><cite class="user">Chinedum Okwonko Udeaja</cite><span class="datetime">20 August 2026</span></div>
                  <div class="comment-content">The contrast pass on the gold accent makes a real difference on the feed. Nice work.</div>
                  <div class="comment-actions"><a href="#">Reply</a></div>
                </div>
                <div class="comment-block">
                  <div class="comment-header"><cite class="user">Francis E. Onai</cite><span class="datetime">20 August 2026</span></div>
                  <div class="comment-content">Any plans to bring the sepia reading theme to the app as well?</div>
                  <div class="comment-actions"><a href="#">Reply</a></div>
                </div>
              </div>
            </section>
          </article>

          <nav class="iw-pager">
            <a class="iw-pager__link" href="#" rel="prev">
              <span class="iw-pager__kicker">&#8592; Newer</span>
              <span class="iw-pager__title">Next update</span>
            </a>
            <a class="iw-pager__link iw-pager__link--next" href="#" rel="next">
              <span class="iw-pager__kicker">Older &#8594;</span>
              <span class="iw-pager__title">Previous update</span>
            </a>
          </nav>
        </div></div>

        <aside class="iw-side"></aside>
        <aside class="iw-rail" hidden id="iw-rail">
          <nav class="iw-toc">
            <p class="iw-toc__title">On this page</p>
            <div class="iw-toc__list" id="iw-toc-list"></div>
          </nav>
        </aside>
      </div>
    </div>
  </main>

${FOOTER}`,
});

writeFileSync(join(root, "preview", "index.html"), home, "utf8");
writeFileSync(join(root, "preview", "post.html"), article, "utf8");

console.log(`build-preview: resolved ${vars.size} theme variables`);
console.log(`build-preview: css ${css.length} bytes, js ${runtimeJs.length} bytes`);
console.log("build-preview: wrote preview/index.html and preview/post.html");
