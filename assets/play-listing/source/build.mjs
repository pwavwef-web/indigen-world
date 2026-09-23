// Builds the Google Play listing screenshots: 1080×1920 PNGs that frame REAL
// captures of Indigen 0.1.22 (31) in an Android phone, with brand typography.
//
//   node assets/play-listing/source/build.mjs          → renders all eight
//   node assets/play-listing/source/build.mjs 03 05    → renders only those
//
// The PNGs are written to assets/play-listing/. Captures come from ./screens:
// full-resolution 1080×2400 emulator screencaps, stored as lossless WebP.
// Nothing inside a phone is drawn; the app UI is always the unedited capture.
// Needs Google Chrome and the repo's node_modules (for Noto Sans).

import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const SCREENS = join(here, "screens");
const OUT = join(here, "..");
const HTML = mkdtempSync(join(tmpdir(), "indigen-listing-"));
mkdirSync(OUT, { recursive: true });

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const FONTS = join(here, "../../../node_modules/@fontsource-variable/noto-sans/files");
const font = (f) => readFileSync(join(FONTS, f)).toString("base64");

// ── Brand ────────────────────────────────────────────────────────────────────
// Palette from apps/website/src/styles/comitia-theme.css; Noto Sans is the
// typeface of both the website (tokens.css) and the app (app_theme.dart).
const MARK = `<svg class="mark" viewBox="0 0 64 64" aria-hidden="true">
  <path d="M15 47V23l17-9 17 9v24" fill="none" stroke="#8eb4ff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M24 44V29m8 15V24m8 20V29" fill="none" stroke="#ffffff" stroke-width="5" stroke-linecap="round"/>
  <circle cx="32" cy="14" r="5" fill="#22d3ee"/>
</svg>`;

// A Kasena wall-painting band: zigzag triangles over a row of lozenges, the
// same family of motifs the app paints on its Today in Kasem and Word of the
// day tiles. Used faintly, and never over a phone.
const motifSvg = (stroke) =>
  `<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'>` +
  `<g fill='none' stroke='${stroke}' stroke-width='2.2' stroke-linejoin='round'>` +
  `<path d='M0 40 L20 12 L40 40 L60 12 L80 40 L100 12 L120 40'/>` +
  `<path d='M0 52 L120 52'/>` +
  `<path d='M30 60 L42 80 L30 100 L18 80 Z M90 60 L102 80 L90 100 L78 80 Z'/>` +
  `<path d='M0 108 L120 108'/></g>` +
  `<g fill='${stroke}' opacity='.55'><path d='M60 70 L66 80 L60 90 L54 80 Z M0 70 L6 80 L0 90 Z M120 70 L114 80 L120 90 Z'/></g>` +
  `</svg>`;
const motifUrl = (stroke) => `url("data:image/svg+xml;utf8,${encodeURIComponent(motifSvg(stroke))}")`;

// ── The eight images ─────────────────────────────────────────────────────────
// Copy is the brief's, except where the build ships one language (Kasem): the
// course picker only lists published courses, so plural claims are qualified.
const IMAGES = [
  {
    n: "01", file: "01-indigen-world-intro",
    eyebrow: "Kasem Collections",
    title: "Culture, Language &amp; Community — In One Place",
    sub: "Explore the Kasem language, cultural knowledge, communities and locally created content through Indigen World.",
    glow: ["50%", "68%", "rgba(47,107,255,.55)"], glow2: ["88%", "8%", "rgba(34,211,238,.16)"],
    layout: { type: "single", screen: "17-collection.webp" },
  },
  {
    n: "02", file: "02-indigen-language-learning",
    eyebrow: "Learn",
    title: "Learn African Languages, Starting with Kasem",
    sub: "Build your language skills through structured lessons and culturally grounded learning experiences.",
    glow: ["30%", "70%", "rgba(47,107,255,.50)"], glow2: ["85%", "60%", "rgba(34,211,238,.18)"],
    layout: {
      type: "duo", primary: "14-learn-dashboard.webp", secondary: "12-lesson-checked.webp",
      primarySide: "left", secScale: 0.83, secAlign: "top", secTilt: 2.5,
      labels: [{ on: "primary", where: "above", text: "Your course dashboard" }, { on: "secondary", where: "below", text: "Lessons with instant feedback" }],
    },
  },
  {
    n: "03", file: "03-indigen-community",
    eyebrow: "Community",
    title: "Connect With Your Community",
    sub: "Discover conversations, cultural content and people around the communities that matter to you.",
    glow: ["68%", "66%", "rgba(47,107,255,.50)"], glow2: ["12%", "40%", "rgba(33,73,184,.35)"],
    layout: {
      type: "duo", primary: "04-community-feed.webp", secondary: "49-communities.webp",
      primarySide: "right", secScale: 0.83, secAlign: "bottom", secTilt: 0,
      labels: [{ on: "primary", where: "above", text: "Posts in Kasem and English" }, { on: "secondary", where: "above", text: "Find and join communities" }],
    },
  },
  {
    n: "04", file: "04-indigen-cultural-discovery",
    eyebrow: "Collections",
    title: "Discover Culture Beyond the Textbook",
    sub: "Explore stories, traditions, knowledge and cultural content created around real communities.",
    glow: ["40%", "62%", "rgba(47,107,255,.46)"], glow2: ["80%", "85%", "rgba(242,177,52,.14)"],
    layout: {
      type: "duo", primary: "60-folktale-page.webp", secondary: "71-tono-dam-story.webp",
      primarySide: "left", secScale: 0.80, secAlign: "center", secTilt: 0,
      labels: [{ on: "primary", where: "above", text: "Illustrated folktale in Kasem" }, { on: "secondary", where: "above", text: "Stories of local places" }],
    },
  },
  {
    n: "05", file: "05-indigen-media",
    eyebrow: "Explore &amp; Music",
    title: "Watch, Listen &amp; Discover",
    sub: "Experience cultural content through the media formats available across Indigen World.",
    glow: ["32%", "64%", "rgba(34,211,238,.26)"], glow2: ["78%", "72%", "rgba(47,107,255,.44)"],
    layout: {
      type: "duo", primary: "65-explore-reel.webp", secondary: "74-music-miniplayer.webp",
      primarySide: "left", secScale: 0.83, secAlign: "bottom", secTilt: 0,
      labels: [{ on: "primary", where: "above", text: "Short videos to watch" }, { on: "secondary", where: "below", text: "Music plays while you learn" }],
    },
  },
  {
    n: "06", file: "06-indigen-kawuri",
    eyebrow: "Kawuri AI",
    title: "Meet Kawuri",
    sub: "Use Indigen World's AI-powered tools to explore language and cultural knowledge.",
    glow: ["62%", "62%", "rgba(34,211,238,.30)"], glow2: ["20%", "78%", "rgba(47,107,255,.40)"],
    layout: {
      type: "duo", primary: "43-kawuri-answer.webp", secondary: "33-kawuri-home.webp",
      primarySide: "right", secScale: 0.83, secAlign: "top", secTilt: -2.5,
      labels: [{ on: "primary", where: "above", text: "Answers from the dictionary" }, { on: "secondary", where: "below", text: "Ask, translate and practise" }],
    },
  },
  {
    n: "07", file: "07-indigen-contribute",
    eyebrow: "Contribute",
    title: "Help Culture Live Online",
    sub: "Create, contribute or share cultural knowledge using the tools available inside Indigen World.",
    glow: ["34%", "66%", "rgba(47,107,255,.50)"], glow2: ["82%", "30%", "rgba(22,132,102,.22)"],
    layout: {
      type: "duo", primary: "45-contribute-kinds.webp", secondary: "47-add-a-saying.webp",
      primarySide: "left", secScale: 0.83, secAlign: "bottom", secTilt: 0,
      labels: [{ on: "primary", where: "above", text: "Words, sayings, music, stories, video" }, { on: "secondary", where: "below", text: "Record how it is said" }],
    },
  },
  {
    n: "08", file: "08-indigen-world-experience",
    eyebrow: "Everything in one app",
    title: "Your Culture. Your Language. Your Community.",
    sub: "Explore the growing Indigen World experience from your Android device.",
    glow: ["50%", "70%", "rgba(47,107,255,.55)"], glow2: ["50%", "20%", "rgba(34,211,238,.14)"],
    layout: {
      type: "trio", left: "04-community-feed.webp", center: "14-learn-dashboard.webp", right: "65-explore-reel.webp",
      labels: { left: "Community", center: "Learn", right: "Explore" },
    },
  },
];

// ── Page ─────────────────────────────────────────────────────────────────────
const css = `
@font-face { font-family: "Noto Sans IW"; font-style: normal; font-weight: 100 900; font-display: block;
  src: url(data:font/woff2;base64,${font("noto-sans-latin-wght-normal.woff2")}) format("woff2");
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD; }
@font-face { font-family: "Noto Sans IW"; font-style: normal; font-weight: 100 900; font-display: block;
  src: url(data:font/woff2;base64,${font("noto-sans-latin-ext-wght-normal.woff2")}) format("woff2");
  unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+1E00-1E9F, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF; }
* { box-sizing: border-box; }
html, body { margin: 0; width: 1080px; height: 1920px; overflow: hidden; background: #0a1024; }
.canvas { position: relative; width: 1080px; height: 1920px; overflow: hidden; color: #fff;
  font-family: "Noto Sans IW", sans-serif; -webkit-font-smoothing: antialiased; }
.bg { position: absolute; inset: 0;
  background:
    radial-gradient(760px 760px at var(--gx) var(--gy), var(--gc), transparent 70%),
    radial-gradient(620px 620px at var(--hx) var(--hy), var(--hc), transparent 70%),
    linear-gradient(180deg, #0a1024 0%, #0f1830 48%, #13204a 100%); }
.motif { position: absolute; pointer-events: none; background-image: var(--motif); background-size: 120px 120px; }
.motif.corner { right: -40px; top: -30px; width: 620px; height: 560px; opacity: .17;
  -webkit-mask-image: radial-gradient(420px 380px at 100% 0%, #000 30%, transparent 100%); }
.motif.band { left: 0; right: 0; bottom: 0; height: 120px; opacity: .10;
  -webkit-mask-image: linear-gradient(0deg, #000 0%, transparent 100%); }
header { position: absolute; left: 76px; right: 76px; top: 70px; }
.lockup { display: flex; align-items: center; gap: 14px; font-size: 29px; font-weight: 700; letter-spacing: .005em; color: #fff; }
.lockup .mark { width: 50px; height: 50px; }
.eyebrow { margin-top: 42px; display: flex; align-items: center; gap: 14px; font-size: 23px; font-weight: 700;
  letter-spacing: .19em; text-transform: uppercase; color: #22d3ee; }
.eyebrow::before { content: ""; width: 14px; height: 14px; background: #f2b134; transform: rotate(45deg); border-radius: 2px; }
h1 { margin: 16px 0 0; font-size: 76px; line-height: 1.04; font-weight: 800; letter-spacing: -.028em; text-wrap: balance; }
.sub { margin: 22px 0 0; font-size: 33px; line-height: 1.36; font-weight: 400; color: #cfe0ff; text-wrap: pretty; }
.phone { position: absolute; background: linear-gradient(145deg, #2a3452, #0b0f1c 38%, #05070d 70%, #232c47);
  box-shadow: 0 0 0 2px rgba(142,180,255,.22), 0 50px 110px rgba(0,0,0,.55), 0 10px 30px rgba(0,0,0,.35);
  transform-origin: 50% 50%; }
.phone .screen { position: absolute; overflow: hidden; background: #000; }
.phone .screen img { display: block; width: 100%; height: 100%; }
.phone .cam { position: absolute; left: 50%; border-radius: 50%; background: #03050a;
  box-shadow: inset 0 0 0 2px #1b2236; transform: translateX(-50%); }
.phone .btn { position: absolute; right: -4px; width: 5px; border-radius: 0 3px 3px 0; background: #29324c; }
.label { position: absolute; display: inline-flex; align-items: center; gap: 12px; white-space: nowrap;
  padding: 11px 20px 12px; border-radius: 999px; font-size: 23px; font-weight: 600; color: #eaf0ff;
  background: rgba(15,24,48,.78); box-shadow: 0 0 0 1.5px rgba(142,180,255,.35), 0 12px 30px rgba(0,0,0,.35); }
.label::before { content: ""; width: 10px; height: 10px; border-radius: 50%; background: #22d3ee; box-shadow: 0 0 12px #22d3ee; }
`;

// Runs in the page: sizes the phones to whatever room the header leaves.
const layoutScript = `
const R = 2400 / 1080;          // capture aspect
const BEZEL = 0.024;            // bezel as a share of phone width
const W_FOR_H = (h) => h / ((1 - 2 * BEZEL) * R + 2 * BEZEL);
const H_FOR_W = (w) => (w - 2 * w * BEZEL) * R + 2 * w * BEZEL;

function phone(src, x, y, w, tilt = 0) {
  const h = H_FOR_W(w), p = Math.round(w * BEZEL), sw = w - 2 * p, s = sw / 1080;
  const el = document.createElement("div");
  el.className = "phone";
  Object.assign(el.style, { left: x + "px", top: y + "px", width: w + "px", height: h + "px",
    borderRadius: (w * 0.118) + "px", transform: "rotate(" + tilt + "deg)" });
  el.innerHTML = '<div class="screen" style="left:' + p + 'px;top:' + p + 'px;right:' + p + 'px;bottom:' + p +
    'px;border-radius:' + (w * 0.118 - p) + 'px"><img src="' + src + '"></div>' +
    '<i class="cam" style="top:' + (p + 40 * s) + 'px;width:' + (38 * s) + 'px;height:' + (38 * s) + 'px"></i>' +
    '<i class="btn" style="top:' + (h * 0.20) + 'px;height:' + (h * 0.075) + 'px"></i>' +
    '<i class="btn" style="top:' + (h * 0.31) + 'px;height:' + (h * 0.13) + 'px"></i>';
  document.querySelector(".canvas").appendChild(el);
  return { el, x, y, w, h, tilt };
}

// A pill naming what one phone shows, centred on it, above or below.
function label(text, box, where) {
  const el = document.createElement("div");
  el.className = "label"; el.textContent = text;
  document.querySelector(".canvas").appendChild(el);
  const lw = el.offsetWidth, lh = el.offsetHeight;
  let lx = box.x + box.w / 2 - lw / 2;
  lx = Math.max(40, Math.min(1080 - 40 - lw, lx));
  const r = box.el.getBoundingClientRect();
  const ly = where === "above" ? r.top - lh - 24 : r.bottom + 22;
  Object.assign(el.style, { left: lx + "px", top: ly + "px" });
  return el;
}

// Moves a finished group so it sits in the middle of the room under the header.
function centre(els, top, bottom) {
  let min = Infinity, max = -Infinity;
  for (const el of els) { const r = el.getBoundingClientRect(); min = Math.min(min, r.top); max = Math.max(max, r.bottom); }
  const dy = top + (bottom - top - (max - min)) / 2 - min;
  for (const el of els) el.style.top = (parseFloat(el.style.top) + dy) + "px";
}

// How far a rotated phone reaches past its unrotated box, sideways.
const spill = (w, h, deg) => {
  const a = Math.abs(deg) * Math.PI / 180;
  return ((w * Math.cos(a) + h * Math.sin(a)) - w) / 2;
};

async function run(spec) {
  await document.fonts.ready;
  const hb = document.querySelector("header").getBoundingClientRect().bottom;
  const top = hb + 56, bottom = 1920 - 50, room = bottom - top;
  const L = spec.layout;

  if (L.type === "single") {
    const h = Math.min(room, 1320), w = W_FOR_H(h);
    phone(L.screen, (1080 - w) / 2, top + (room - h) / 2, w);
  }

  if (L.type === "duo") {
    const labels = L.labels || [];
    const above = labels.some((l) => l.where === "above") ? 70 : 0;
    const below = labels.some((l) => l.where === "below") ? 70 : 0;
    const margin = 34, gap = 30, tilt = L.secTilt || 0;
    let hp = room - above - below, hs = hp * L.secScale;
    let wp = W_FOR_H(hp), ws = W_FOR_H(hs);
    const fit = (1080 - 2 * margin) / (wp + gap + ws + 2 * spill(ws, hs, tilt));
    if (fit < 1) { wp *= fit; ws *= fit; hp = H_FOR_W(wp); hs = H_FOR_W(ws); }
    const sp = spill(ws, hs, tilt);
    const groupX = (1080 - (wp + gap + ws + 2 * sp)) / 2;
    const px = L.primarySide === "left" ? groupX : groupX + ws + 2 * sp + gap;
    const sx = L.primarySide === "left" ? groupX + wp + gap + sp : groupX + sp;
    const py = top;
    const sy = L.secAlign === "top" ? py : L.secAlign === "bottom" ? py + hp - hs : py + (hp - hs) / 2;
    const P = phone(L.primary, px, py, wp, 0);
    const S = phone(L.secondary, sx, sy, ws, tilt);
    const els = [P.el, S.el];
    for (const lab of labels) els.push(label(lab.text, lab.on === "primary" ? P : S, lab.where));
    centre(els, top, bottom);
  }

  if (L.type === "trio") {
    // A larger centre phone in front of two smaller ones. They meet at the
    // bezels only, so no part of any screen is hidden.
    const margin = 30, touch = 10, drop = L.drop || 170;
    let wc = 440, ws = (1080 - 2 * margin - wc + 2 * touch) / 2;
    let hc = H_FOR_W(wc), hs = H_FOR_W(ws);
    const need = Math.max(hc, drop + hs);
    if (need > room) { const f = room / need; wc *= f; ws *= f; hc = H_FOR_W(wc); hs = H_FOR_W(ws); }
    const total = wc + 2 * ws - 2 * touch, lx = (1080 - total) / 2;
    const cx = lx + ws - touch, rx = cx + wc - touch;
    const left = phone(L.left, lx, top + drop, ws, 0);
    const right = phone(L.right, rx, top + drop, ws, 0);
    const mid = phone(L.center, cx, top, wc, 0);
    const els = [left.el, right.el, mid.el];
    if (L.labels) {
      els.push(label(L.labels.left, left, "below"));
      els.push(label(L.labels.center, mid, "below"));
      els.push(label(L.labels.right, right, "below"));
    }
    centre(els, top, bottom);
  }

  const imgs = [...document.images];
  await Promise.all(imgs.map((i) => i.complete ? 0 : new Promise((r) => { i.onload = r; i.onerror = r; })));
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  window.__ready = true;
}
run(window.SPEC);
`;

function pageFor(img) {
  const shot = (f) => pathToFileURL(join(SCREENS, f)).href;
  const L = structuredClone(img.layout);
  for (const k of ["screen", "primary", "secondary", "left", "center", "right"]) if (L[k]) L[k] = shot(L[k]);
  const [gx, gy, gc] = img.glow, [hx, hy, hc] = img.glow2;
  return `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>
<div class="canvas" style="--gx:${gx};--gy:${gy};--gc:${gc};--hx:${hx};--hy:${hy};--hc:${hc};--motif:${motifUrl("#8eb4ff")}">
  <div class="bg"></div><div class="motif corner"></div><div class="motif band"></div>
  <header>
    <div class="lockup">${MARK}<span>Indigen World</span></div>
    <div class="eyebrow">${img.eyebrow}</div>
    <h1>${img.title}</h1>
    <p class="sub">${img.sub}</p>
  </header>
</div>
<script>window.SPEC = ${JSON.stringify({ layout: L })};</script>
<script>${layoutScript}</script>
</body></html>`;
}

// ── Chrome over the DevTools protocol ────────────────────────────────────────
async function render(targets) {
  const port = 9300 + Math.floor(Math.random() * 400);
  const profile = join(HTML, "chrome-profile");
  rmSync(profile, { recursive: true, force: true });
  const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    "--allow-file-access-from-files", "--hide-scrollbars", "--force-color-profile=srgb", "about:blank"], { stdio: "ignore" });
  try {
    let tabs;
    for (let i = 0; i < 80; i++) {
      try { tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (tabs.length) break; } catch {}
      await new Promise((r) => setTimeout(r, 250));
    }
    const page = tabs.find((t) => t.type === "page");
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((r) => ws.addEventListener("open", r, { once: true }));
    let id = 0; const pending = new Map();
    ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
    const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
    await send("Page.enable"); await send("Runtime.enable");
    await send("Emulation.setDeviceMetricsOverride", { width: 1080, height: 1920, deviceScaleFactor: 1, mobile: false });
    for (const img of targets) {
      const htmlPath = join(HTML, img.file + ".html");
      writeFileSync(htmlPath, pageFor(img));
      await send("Page.navigate", { url: pathToFileURL(htmlPath).href });
      let ready = false;
      for (let i = 0; i < 120 && !ready; i++) {
        await new Promise((r) => setTimeout(r, 150));
        const res = await send("Runtime.evaluate", { expression: "window.__ready === true", returnByValue: true });
        ready = res.result?.result?.value === true;
      }
      if (!ready) throw new Error("page never became ready: " + img.file);
      const shot = await send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: 1080, height: 1920, scale: 1 } });
      writeFileSync(join(OUT, img.file + ".png"), Buffer.from(shot.result.data, "base64"));
      console.log("rendered", img.file + ".png");
    }
    ws.close();
  } finally {
    chrome.kill();
    // Chrome releases its profile a moment after it exits on Windows.
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 300));
      try { rmSync(profile, { recursive: true, force: true }); break; } catch {}
    }
  }
}

const only = process.argv.slice(2);
await render(IMAGES.filter((i) => !only.length || only.includes(i.n)));
