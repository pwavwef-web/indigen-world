// Captures this post's screens into ../screens with headless Chrome.
//
//   npm run dev --workspace @indigen-world/website -- --port 5180
//   npx vite --config apps/updates-blog/posts/2026-09-27-share-an-expression/mockups/studio-preview/vite.config.mjs
//   node apps/updates-blog/posts/2026-09-27-share-an-expression/mockups/capture.mjs
//
// The website screens are the real pages from the dev server. The TribeStudio
// screens come from studio-preview/, which renders the real expressions page
// with sample data and mocked Firebase — its Kasem is labelled placeholder
// text. Then run render.mjs to frame them.
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const port = 9352;
const website = process.env.WEBSITE_ORIGIN ?? 'http://localhost:5180';
const studio = process.env.STUDIO_PREVIEW_ORIGIN ?? 'http://localhost:5198';

// Scrolls a section to just under the site header before the shot.
const scrollTo = (selector, offset) => `(() => { const el = document.querySelector(${JSON.stringify(selector)}); window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - ${offset}); })()`;

const jobs = [
  { out: 'web-contribute.png', url: `${website}/contribute`, width: 1440, height: 900 },
  { out: 'web-contribute-review.png', url: `${website}/contribute`, width: 1440, height: 900, run: scrollTo('#task', 40) },
  { out: 'web-home-paths.png', url: `${website}/`, width: 1440, height: 900, run: scrollTo('#find-your-path', -40) },
  { out: 'phone-home.png', url: `${website}/`, width: 390, height: 844, mobile: true, scale: 2 },
  { out: 'studio-form.png', url: `${studio}/`, width: 1440, height: 900 },
  { out: 'phone-status.png', url: `${studio}/`, width: 390, height: 844, mobile: true, scale: 2, run: scrollTo('.expr-mine', 70) },
];

const browser = spawn(chrome, ['--headless=new', `--remote-debugging-port=${port}`,
  `--user-data-dir=${mkdtempSync(join(tmpdir(), 'iw-expression-capture-'))}`, '--hide-scrollbars'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function target() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' });
      if (response.ok) return response.json();
    } catch {
      // Chrome is still starting.
    }
    await sleep(200);
  }
  throw new Error('Chrome did not start');
}

try {
  const tab = await target();
  const socket = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((resolve) => socket.addEventListener('open', resolve, { once: true }));
  let id = 0;
  const pending = new Map();
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    }
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    id += 1;
    pending.set(id, (message) => (message.error ? reject(new Error(message.error.message)) : resolve(message.result)));
    socket.send(JSON.stringify({ id, method, params }));
  });
  const run = async (expression) => {
    const { exceptionDetails } = await send('Runtime.evaluate', { expression, awaitPromise: true });
    if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
  };

  await send('Page.enable');
  await send('Runtime.enable');
  // Both apps honour reduced motion, so transitions settle before capture.
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  for (const job of jobs) {
    await send('Emulation.setDeviceMetricsOverride', {
      width: job.width, height: job.height, deviceScaleFactor: job.scale ?? 1, mobile: Boolean(job.mobile),
    });
    await send('Page.navigate', { url: job.url });
    await sleep(5000);
    // Reveal-on-scroll sections start hidden; show them for the shot.
    await run(`document.querySelectorAll('[data-reveal]').forEach((el) => el.classList.add('is-visible'))`);
    if (job.run) await run(job.run);
    await sleep(700);
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(here, '../screens', job.out), Buffer.from(shot.data, 'base64'));
    console.log('captured', job.out);
  }
  socket.close();
} finally {
  browser.kill();
}
