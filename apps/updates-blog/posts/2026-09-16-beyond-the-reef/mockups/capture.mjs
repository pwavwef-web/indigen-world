// Captures this post's screens from the live Beyond the Reef page with headless Chrome.
//
//   node apps/updates-blog/posts/2026-09-16-beyond-the-reef/mockups/capture.mjs [url]
//
// Each moment is reached by state, not by sleeping: wait for the page, start the song,
// seek a few seconds before the moment, wait for that scene's pictures and enough audio,
// play, and capture as the song reaches the moment. Moments sit in the middle of a sung
// line, so the lit line is the same on every run.
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const url = process.argv[2] ?? 'https://indigenworld.com/beyond-the-reef';
const out = join(here, '..', 'screens');
mkdirSync(out, { recursive: true });

const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const port = 9341;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const desktop = { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false };
const phone = { width: 390, height: 844, deviceScaleFactor: 3, mobile: true };

const shots = [
  { file: 'desktop-city.jpg', device: desktop, at: 41.0 },
  { file: 'desktop-reef.jpg', device: desktop, at: 68.2 },
  { file: 'desktop-storm.jpg', device: desktop, at: 202.0 },
  { file: 'desktop-island.jpg', device: desktop, at: 239.0 },
  { file: 'desktop-reef-controls.jpg', device: desktop, at: 65.8, controls: true },
  { file: 'phone-intro.jpg', device: phone, intro: true },
  { file: 'phone-storm.jpg', device: phone, at: 202.0 },
  { file: 'phone-finale.jpg', device: phone, end: true },
];

const browser = spawn(chrome, [
  '--headless=new',
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${mkdtempSync(join(tmpdir(), 'iw-btr-capture-'))}`,
  '--hide-scrollbars',
  '--mute-audio',
  '--autoplay-policy=no-user-gesture-required',
], { stdio: 'ignore' });

async function target() {
  for (let attempt = 0; attempt < 150; attempt += 1) {
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
  const evaluate = async (expression) =>
    (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result.value;

  await send('Page.enable');
  await send('Runtime.enable');

  for (const shot of shots) {
    await send('Emulation.setDeviceMetricsOverride', shot.device);
    await send('Emulation.setTouchEmulationEnabled', { enabled: shot.device.mobile, maxTouchPoints: 5 });
    await send('Page.navigate', { url });
    await evaluate(`(async () => {
      for (let i = 0; i < 200 && !document.querySelector('.btr-begin'); i++) await new Promise((r) => setTimeout(r, 150));
      await document.fonts.ready;
      const poster = document.querySelector('.btr-intro__media');
      for (let i = 0; i < 200 && poster && poster.readyState !== undefined && poster.readyState < 2; i++) await new Promise((r) => setTimeout(r, 150));
    })()`);
    await sleep(2500);

    if (!shot.intro) {
      await evaluate(`(async () => {
        const wait = async (check, tries = 300) => { for (let i = 0; i < tries && !check(); i++) await new Promise((r) => setTimeout(r, 100)); };
        const a = document.querySelector('audio');
        document.querySelector('.btr-begin').click();
        await wait(() => a.currentTime > 0.3);
        a.pause();
        a.currentTime = ${shot.end ? 'a.duration - 2.5' : shot.at - 6};
        await wait(() => !a.seeking && a.readyState >= 3);
        await wait(() => [...document.querySelectorAll('.btr-shot img')].every((img) => img.complete && img.naturalWidth > 0));
        await a.play();
        ${shot.end
          ? "await wait(() => document.querySelector('.btr-experience').dataset.ended === 'true', 600); await new Promise((r) => setTimeout(r, 3800));"
          : `await wait(() => a.currentTime >= ${shot.at}, 600);`}
      })()`);
      if (shot.controls) {
        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 700, y: 500 });
        await sleep(700);
      }
    }

    // The scripted click leaves keyboard focus on the play button; a visitor using a
    // mouse would not see its focus ring.
    await evaluate(`document.activeElement?.blur()`);
    await sleep(300);
    const { data } = await send('Page.captureScreenshot', { format: 'jpeg', quality: 92 });
    writeFileSync(join(out, shot.file), Buffer.from(data, 'base64'));
    const line = await evaluate(`document.querySelector('.btr-line[data-place="current"]')?.textContent ?? '(intro)'`);
    console.log('captured', shot.file, '—', line);
  }
  socket.close();
} finally {
  browser.kill();
}
