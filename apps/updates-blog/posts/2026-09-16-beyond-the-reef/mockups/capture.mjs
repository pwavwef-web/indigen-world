// Captures this post's screens from the live Beyond the Reef page with headless Chrome.
//
//   node apps/updates-blog/posts/2026-09-16-beyond-the-reef/mockups/capture.mjs [url]
//
// Each moment is reached by seeking the song, waiting until that scene's picture has
// loaded, then letting it play for a moment so the lyric glide and the clip settle.
// Computer frames are taken after the controls have faded (or just after a mouse move
// when the controls should show); phone frames always show them, as a phone does.
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
  { file: 'desktop-city.jpg', device: desktop, at: 43.4 },
  { file: 'desktop-reef.jpg', device: desktop, at: 68.3 },
  { file: 'desktop-storm.jpg', device: desktop, at: 201.6 },
  { file: 'desktop-island.jpg', device: desktop, at: 238.8 },
  { file: 'desktop-reef-controls.jpg', device: desktop, at: 65.6, controls: true },
  { file: 'phone-intro.jpg', device: phone, intro: true },
  { file: 'phone-storm.jpg', device: phone, at: 201.6 },
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
    await sleep(5000);

    if (!shot.intro) {
      await evaluate(`document.querySelector('.btr-begin').click()`);
      await sleep(2500);
      const seekTo = shot.end ? 'a.duration - 2.2' : String(shot.at - 7);
      await evaluate(`(async () => {
        const a = document.querySelector('audio');
        a.pause();
        a.currentTime = ${seekTo};
        const loaded = () => [...document.querySelectorAll('.btr-shot img')].every((img) => img.complete && img.naturalWidth > 0);
        for (let i = 0; i < 100 && !loaded(); i++) await new Promise((r) => setTimeout(r, 150));
        await a.play();
      })()`);
      await sleep(shot.end ? 7000 : 7000);
      if (shot.controls) {
        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 700, y: 500 });
        await sleep(900);
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
