// Renders this post's mockup pages to images with headless Chrome.
//
//   node apps/updates-blog/posts/2026-09-16-app-themes/mockups/render.mjs
//
// Each page is plain HTML that frames real app screenshots from ../screens in
// a phone. Chrome is driven over the DevTools protocol rather than with
// `--screenshot`, so each page can say when its images have decoded.
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const port = 9334;

const jobs = [
  { page: 'cover.html', out: '../cover.png', width: 1200, height: 630, format: 'png' },
  { page: 'six-themes.html', out: '../images/six-themes.jpg', width: 1600, height: 900 },
  { page: 'picker.html', out: '../images/theme-picker.jpg', width: 1600, height: 1150 },
  { page: 'green.html', out: '../images/heritage-green.jpg', width: 1600, height: 1150 },
  { page: 'supporters.html', out: '../images/supporter-themes-at-night.jpg', width: 1600, height: 1150 },
  { page: 'kawuri.html', out: '../images/kawuri-in-every-theme.jpg', width: 1600, height: 1150 },
];

const browser = spawn(chrome, [
  '--headless=new',
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${mkdtempSync(join(tmpdir(), 'iw-mockups-'))}`,
  '--hide-scrollbars',
  '--allow-file-access-from-files',
  '--autoplay-policy=no-user-gesture-required',
], { stdio: 'ignore' });

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

  await send('Page.enable');
  await send('Runtime.enable');
  for (const job of jobs) {
    await send('Emulation.setDeviceMetricsOverride', {
      width: job.width, height: job.height, deviceScaleFactor: 1, mobile: false,
    });
    await send('Page.navigate', { url: pathToFileURL(join(here, job.page)).href });
    // Pages set window.__ready once fonts, images and any video frame are in.
    for (let wait = 0; wait < 100; wait += 1) {
      const { result } = await send('Runtime.evaluate', { expression: 'window.__ready === true' });
      if (result.value === true) break;
      await sleep(150);
    }
    await sleep(300);
    const shot = await send('Page.captureScreenshot', {
      format: job.format ?? 'jpeg',
      quality: job.format === 'png' ? undefined : 90,
      clip: { x: 0, y: 0, width: job.width, height: job.height, scale: 1 },
    });
    writeFileSync(join(here, job.out), Buffer.from(shot.data, 'base64'));
    console.log('rendered', job.out);
  }
  socket.close();
} finally {
  browser.kill();
}
