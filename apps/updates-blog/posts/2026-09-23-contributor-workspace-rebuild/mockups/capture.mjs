// Captures the rebuilt contributor workspace from TribeStudio's dev-only design preview
// (sample data, nothing saved or sent).
//
//   npm run dev --workspace @indigen-world/tribestudio -- --port 5199
//   node apps/updates-blog/posts/2026-09-23-contributor-workspace-rebuild/mockups/capture.mjs
//
// Set PREVIEW_ORIGIN to capture from another port. The preview's sample translations are
// placeholders, so shots clear them rather than invent Kasem, and the preview banner is removed.
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const port = 9347;
const origin = process.env.PREVIEW_ORIGIN ?? 'http://localhost:5199';

// Runs in the page before each shot: drop the preview-only banner and the placeholder translations.
const tidy = `(() => {
  document.querySelector('.cw-preview-banner')?.remove();
  document.querySelectorAll('textarea').forEach((t) => { if (t.value.startsWith('[Sample')) t.value = ''; });
  document.activeElement?.blur();
})()`;

const jobs = [
  { out: 'desktop-overview.png', path: '/contributor/preview', width: 1440, height: 960, mobile: false },
  { out: 'desktop-payments.png', path: '/contributor/preview/account/payments', width: 1440, height: 1060, mobile: false },
  { out: 'desktop-kawuri.png', path: '/contributor/preview/kawuri?work=everyday&item=e3&mode=context_needed', width: 1440, height: 1000, mobile: false },
  { out: 'phone-overview.png', path: '/contributor/preview', width: 390, height: 844, mobile: true },
  { out: 'phone-editor.png', path: '/contributor/preview/assignment/everyday?item=e3', width: 390, height: 844, mobile: true, scrollTo: '.cw-editor__head', offset: 64 },
];

const browser = spawn(chrome, ['--headless=new', `--remote-debugging-port=${port}`,
  `--user-data-dir=${mkdtempSync(join(tmpdir(), 'iw-workspace-'))}`, '--hide-scrollbars'], { stdio: 'ignore' });
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
  // The workspace honours reduced motion, so skeletons and transitions settle before capture.
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  for (const job of jobs) {
    await send('Emulation.setDeviceMetricsOverride', {
      width: job.width, height: job.height, deviceScaleFactor: 2, mobile: job.mobile,
    });
    await send('Page.navigate', { url: origin + job.path });
    for (let wait = 0; wait < 100; wait += 1) {
      const { result } = await send('Runtime.evaluate', { expression: 'Boolean(document.querySelector(".cw-page h1"))' });
      if (result.value === true) break;
      await sleep(150);
    }
    await run('document.fonts.ready');
    // The Kawuri page asks the preview for its sample answer after load.
    await sleep(1200);
    await run(tidy);
    const { result: top } = await send('Runtime.evaluate', { returnByValue: true, expression: job.scrollTo
      ? `Math.max(0, document.querySelector(${JSON.stringify(job.scrollTo)}).getBoundingClientRect().top + scrollY - ${job.offset ?? 16})` : '0' });
    await run(`window.scrollTo(0, ${top.value})`);
    await sleep(400);
    const shot = await send('Page.captureScreenshot', {
      format: 'png',
      clip: { x: 0, y: top.value, width: job.width, height: job.height, scale: 1 },
    });
    writeFileSync(join(here, '../screens', job.out), Buffer.from(shot.data, 'base64'));
    console.log('captured', job.out);
  }
  socket.close();
} finally {
  browser.kill();
}
