// Development-only: serve the REAL compiled callables on the Functions
// emulator port, against the Auth and Firestore emulators.
//
// The Functions emulator cannot load this ESM bundle on Node 24 (it
// require()s a module graph with top-level await), so browser checks of
// callable-backed screens used fixture servers. This bridge instead imports
// services/functions/lib/index.js and runs each callable's own handler, so
// the screens talk to the code that will be deployed. Firestore triggers do
// not run here; seed scripts invoke them explicitly with `.run()`.
//
//   npm run build:functions
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
//     node services/functions/scripts/dev/callable-bridge.mjs
//
// It refuses to start unless both emulator hosts are set and the project is a
// demo- project, so it can never reach production.

import { createServer } from 'node:http';

const PORT = Number(process.env.BRIDGE_PORT ?? 5001);
process.env.GCLOUD_PROJECT ??= 'demo-indigen-world';
if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST || !process.env.GCLOUD_PROJECT.startsWith('demo-')) {
  throw new Error('The callable bridge runs only against the local emulators of a demo- project.');
}
process.env.FUNCTIONS_EMULATOR = 'true';

// lib/index.js initialises the default app itself (project from GCLOUD_PROJECT).
const exports = await import('../../lib/index.js');
const callables = Object.fromEntries(Object.entries(exports).filter(([, fn]) => fn?.__endpoint?.callableTrigger && typeof fn.run === 'function'));

/** Emulator ID tokens are unsigned JWTs; the payload carries uid and custom claims. */
function authFrom(header) {
  const token = /^Bearer (.+)$/.exec(header ?? '')?.[1];
  if (!token) return undefined;
  const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
  return { uid: payload.user_id ?? payload.sub, token: { ...payload, uid: payload.user_id ?? payload.sub } };
}

const HTTP = { INVALID_ARGUMENT: 400, FAILED_PRECONDITION: 400, OUT_OF_RANGE: 400, UNAUTHENTICATED: 401, PERMISSION_DENIED: 403, NOT_FOUND: 404,
  ALREADY_EXISTS: 409, ABORTED: 409, RESOURCE_EXHAUSTED: 429, UNIMPLEMENTED: 501, UNAVAILABLE: 503, DEADLINE_EXCEEDED: 504 };

createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin ?? '*');
  res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type, x-firebase-appcheck, x-firebase-gmpid, x-firebase-client');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  const name = req.url?.split('?')[0].split('/').pop() ?? '';
  let body = '';
  for await (const chunk of req) body += chunk;
  const reply = (status, payload) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(payload)); };
  const fn = callables[name];
  if (!fn) { console.log(`501 ${name}`); reply(501, { error: { status: 'UNIMPLEMENTED', message: `${name} is not a callable in this build.` } }); return; }
  try {
    const result = await fn.run({ auth: authFrom(req.headers.authorization), data: JSON.parse(body || '{}').data ?? {}, rawRequest: { headers: req.headers, ip: '127.0.0.1' } });
    console.log(`200 ${name}`);
    reply(200, { result: result ?? null });
  } catch (error) {
    const status = String(error?.code ?? 'internal').toUpperCase().replace(/-/g, '_');
    console.log(`${HTTP[status] ?? 500} ${name}: ${error?.message}`);
    reply(HTTP[status] ?? 500, { error: { status: HTTP[status] ? status : 'INTERNAL', message: error?.message ?? 'internal', details: error?.details } });
  }
}).listen(PORT, '127.0.0.1', () => console.log(`Callable bridge: ${Object.keys(callables).length} real callables on http://127.0.0.1:${PORT}`));
