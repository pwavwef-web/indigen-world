// Captures the contributor portal from TribeStudio's dev-only design preview (sample data, nothing sent).
//
//   npm run dev --workspace @indigen-world/tribestudio -- --port 5199
//   node apps/updates-blog/posts/2026-09-16-contributor-portal/mockups/capture.mjs
//
// The preview's sample translations are placeholders, so shots clear them rather than invent Kasem.
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const port = 9337;
const url = 'http://localhost:5199/contributor/preview';

// Runs in the page before each shot: drop the preview-only banner and the placeholder translations.
const tidy = `(() => {
  document.querySelector('.contributor-preview-controls')?.remove();
  document.querySelectorAll('textarea').forEach(t => { if (t.value.startsWith('[Sample')) t.value = ''; });
  document.activeElement?.blur();
})()`;
const clickItem = (text) => `[...document.querySelectorAll('aside button')].find(b => b.innerText.includes(${JSON.stringify(text)})).click()`;

const jobs = [
  { out: 'desktop-workspace.png', width: 1280, height: 860, mobile: false, steps: [] },
  { out: 'desktop-feedback.png', width: 1280, height: 1000, mobile: false, steps: [clickItem('Please come and sit')],
    element: '.contributor-editor', crop: 470 },
  { out: 'phone-list.png', width: 390, height: 844, mobile: true, steps: [] },
  { out: 'phone-editor.png', width: 390, height: 844, mobile: true, steps: [clickItem('May your journey')], scrollTo: '.contributor-back' },
];

const browser = spawn(chrome, ['--headless=new', `--remote-debugging-port=${port}`,
  `--user-data-dir=${mkdtempSync(join(tmpdir(), 'iw-contrib-'))}`, '--hide-scrollbars'], { stdio: 'ignore' });
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
  for (const job of jobs) {
    await send('Emulation.setDeviceMetricsOverride', {
      width: job.width, height: job.height, deviceScaleFactor: 2, mobile: job.mobile,
    });
    await send('Page.navigate', { url });
    for (let wait = 0; wait < 100; wait += 1) {
      const { result } = await send('Runtime.evaluate', { expression: 'Boolean(document.querySelector("aside button"))' });
      if (result.value === true) break;
      await sleep(150);
    }
    await run('document.fonts.ready');
    for (const step of job.steps) { await run(step); await sleep(400); }
    await run(tidy);
    // Scroll for real so sticky controls sit where a reader would see them; clips are in document coordinates.
    const { result: top } = await send('Runtime.evaluate', { returnByValue: true, expression: job.scrollTo
      ? `Math.max(0, document.querySelector(${JSON.stringify(job.scrollTo)}).getBoundingClientRect().top + scrollY - 16)` : '0' });
    await run(`window.scrollTo(0, ${top.value})`);
    await sleep(400);
    // An element job clips to that element, cut to `crop` pixels tall.
    const { result: box } = await send('Runtime.evaluate', { returnByValue: true, expression: job.element
      ? `(() => { const r = document.querySelector(${JSON.stringify(job.element)}).getBoundingClientRect(); return { x: r.x, y: r.y + scrollY, width: r.width, height: ${job.crop} }; })()`
      : `({ x: 0, y: ${top.value}, width: ${job.width}, height: ${job.height} })` });
    const shot = await send('Page.captureScreenshot', {
      format: 'png',
      clip: { ...box.value, scale: 1 },
    });
    writeFileSync(join(here, '../screens', job.out), Buffer.from(shot.data, 'base64'));
    console.log('captured', job.out);
  }
  socket.close();
} finally {
  browser.kill();
}
