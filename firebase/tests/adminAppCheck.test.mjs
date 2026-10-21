import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import express from 'express';
import { test } from 'node:test';
import { onStaffCall } from '../../services/functions/lib/auth.js';

test('admin App Check cannot be disabled with the shared optional flag', () => {
  const moduleUrl = new URL('../../services/functions/lib/admin-app-check.js', import.meta.url).href;
  for (const [emulator, optional, expected] of [['', '', true], ['', 'false', true], ['', 'true', true], ['true', '', false]]) {
    const result = execFileSync(process.execPath, ['--input-type=module', '-e', `const m=await import(${JSON.stringify(moduleUrl)}); console.log(m.ADMIN_APP_CHECK_OPTIONS.enforceAppCheck)`], {
      env: { ...process.env, FUNCTIONS_EMULATOR: emulator, ENFORCE_APP_CHECK: optional }, encoding: 'utf8', windowsHide: true,
    }).trim();
    assert.equal(result, String(expected));
  }
});

test('admin callable transport rejects missing and invalid attestation before its handler', async (t) => {
  let called = false;
  // Even an options object copied from an optional/shared callable cannot
  // accidentally opt an admin endpoint out of enforcement.
  const callable = onStaffCall({ enforceAppCheck: false }, () => { called = true; return { ok: true }; });
  const app = express();
  app.use(express.json());
  app.post('/', callable);
  const server = createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  for (const token of [null, 'invalid-attestation']) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Firebase-AppCheck': token } : {}) }, body: '{"data":{}}',
    });
    assert.equal(response.status, 401);
    const error = (await response.json()).error;
    assert.equal(error.status, 'UNAUTHENTICATED');
    assert.equal(error.message, 'Unauthenticated', 'transport rejects before the staff/auth gate');
  }
  assert.equal(called, false);
});
