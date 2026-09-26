import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';

const root = resolve(import.meta.dirname, '..');
const read = (file) => readFileSync(resolve(root, file), 'utf8');

test('install metadata and all declared icons are present', () => {
  const html = read('index.html');
  const manifest = JSON.parse(read('public/manifest.webmanifest'));
  assert.match(html, /rel="manifest" href="\/manifest\.webmanifest"/);
  assert.match(html, /rel="apple-touch-icon"/);
  assert.equal(manifest.start_url, '/studio');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.scope, '/');
  for (const icon of [...manifest.icons, { src: '/icons/apple-touch-icon.png', sizes: '180x180' }]) {
    const png = readFileSync(resolve(root, 'public', icon.src.slice(1)));
    const [width, height] = icon.sizes.split('x').map(Number);
    assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', icon.src);
    assert.equal(png.readUInt32BE(16), width, icon.src);
    assert.equal(png.readUInt32BE(20), height, icon.src);
  }
});

test('Hosting revalidates SPA routes without slowing fingerprinted assets', () => {
  const hosting = JSON.parse(readFileSync(resolve(root, '../../firebase.json'), 'utf8')).hosting;
  const rules = hosting.find((site) => site.site === 'tribestudio').headers;
  const rootRule = rules.find((rule) => rule.source === '/');
  const routeRule = rules.find((rule) => rule.regex?.includes('studio'));
  assert.match(rootRule.headers[0].value, /no-cache, no-store/);
  assert.match(routeRule.headers[0].value, /no-cache, no-store/);
  const route = new RegExp(routeRule.regex);
  for (const path of ['/studio', '/studio/profile', '/workspace', '/creators', '/creators/join', '/contributor', '/contributor/assignments', '/contributor/account/payments', '/contributor/invited-user/work-id']) {
    assert.ok(route.test(path), path);
  }
  for (const path of ['/assets/main-hash.js', '/icons/icon-512.png']) {
    assert.ok(!route.test(path), path);
  }
});

test('offline launches are branded; private URLs never enter Cache Storage', async () => {
  const listeners = new Map();
  const stored = new Map();
  const offline = { label: 'offline page' };
  const cache = {
    addAll: async (urls) => { for (const url of urls) stored.set(url, url === '/offline.html' ? offline : { label: url }); },
    match: async (request) => stored.get(typeof request === 'string' ? request : request.url),
    put: async (request, response) => { stored.set(request.url, response); },
  };
  const caches = {
    open: async () => cache,
    keys: async () => ['tribestudio-static-old', 'other-app-cache'],
    delete: async (key) => key === 'tribestudio-static-old',
  };
  let network = async () => { throw new Error('offline'); };
  runInNewContext(read('public/sw.js'), {
    self: {
      location: { origin: 'https://tribestudio.indigenworld.com' },
      clients: { claim: async () => {} },
      skipWaiting: async () => {},
      addEventListener: (name, handler) => listeners.set(name, handler),
    },
    caches,
    URL,
    Response,
    fetch: (...args) => network(...args),
  });
  const dispatch = (name, request) => {
    let response;
    const pending = [];
    listeners.get(name)({
      request,
      waitUntil: (promise) => pending.push(promise),
      respondWith: (promise) => { response = promise; },
    });
    return { response, pending };
  };

  await Promise.all(dispatch('install').pending);
  for (const url of [
    'https://firestore.googleapis.com/private',
    'https://tribestudio.indigenworld.com/api/account',
    'https://tribestudio.indigenworld.com/studio/profile.json',
  ]) {
    assert.equal(dispatch('fetch', { method: 'GET', mode: 'cors', url }).response, undefined, url);
  }
  assert.equal(dispatch('fetch', {
    method: 'POST', mode: 'cors', url: 'https://tribestudio.indigenworld.com/assets/upload',
  }).response, undefined);

  const navigation = dispatch('fetch', {
    method: 'GET', mode: 'navigate', url: 'https://tribestudio.indigenworld.com/studio',
  });
  assert.equal(await navigation.response, offline);

  const asset = { ok: true, type: 'basic', clone() { return this; } };
  network = async () => asset;
  const request = { method: 'GET', mode: 'cors', url: 'https://tribestudio.indigenworld.com/assets/main-hash.js' };
  const fetched = dispatch('fetch', request);
  assert.equal(await fetched.response, asset);
  await Promise.all(fetched.pending);
  assert.equal(stored.get(request.url), asset);
  assert.equal(stored.has('https://tribestudio.indigenworld.com/api/account'), false);
});
