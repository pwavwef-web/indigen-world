// Staff security without emulators: two-step verification codes, verified
// sessions, the owner-managed super administrator, and the static guarantees
// that keep them wired up (every admin-console callable is an onStaffCall,
// the owner list is the same everywhere, the CSP hash matches index.html).
//
//   npm run test:staff-security

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import { verifiedStaff, OWNER_UID } from './fixtures/staffSession.mjs';

const root = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const policy = await import('../../services/functions/lib/staff-mfa-policy.js');
const auth = await import('../../services/functions/lib/auth.js');

/* -- RFC 6238 ------------------------------------------------------------------------- */

test('TOTP matches the RFC 6238 SHA-1 test vectors', () => {
  const secret = policy.base32Encode(Buffer.from('12345678901234567890'));
  assert.equal(secret, 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
  const vectors = [[59, '94287082'], [1111111109, '07081804'], [1111111111, '14050471'], [1234567890, '89005924'], [2000000000, '69279037'], [20000000000, '65353130']];
  for (const [seconds, expected] of vectors) assert.equal(policy.totpAt(secret, Math.floor(seconds / 30), 8), expected, `T=${seconds}`);
  assert.deepEqual(policy.base32Decode(secret), Buffer.from('12345678901234567890'));
});

test('a code is accepted once, within one step of drift, and never replayed', () => {
  const secret = policy.newTotpSecret();
  const nowMs = Date.UTC(2026, 9, 21, 12, 0, 10);
  const step = policy.timeStep(nowMs);
  assert.equal(policy.matchTotp(secret, policy.totpAt(secret, step), { nowMs }), step);
  assert.equal(policy.matchTotp(secret, policy.totpAt(secret, step - 1), { nowMs }), step - 1, 'previous period still accepted');
  assert.equal(policy.matchTotp(secret, policy.totpAt(secret, step - 2), { nowMs }), null, 'two periods old is refused');
  assert.equal(policy.matchTotp(secret, policy.totpAt(secret, step), { nowMs, lastUsedStep: step }), null, 'a used code is refused');
  assert.equal(policy.matchTotp(secret, policy.totpAt(secret, step + 1), { nowMs, lastUsedStep: step }), step + 1);
  assert.equal(policy.matchTotp(secret, '12345', { nowMs }), null);
  assert.equal(policy.matchTotp(secret, 'abcdef', { nowMs }), null);
});

test('the otpauth link names the issuer and the account', () => {
  const url = new URL(policy.otpauthUrl('ABCDEFGH', 'staff@example.com'));
  assert.equal(url.protocol, 'otpauth:');
  assert.equal(url.host, 'totp');
  assert.equal(decodeURIComponent(url.pathname), '/Indigen World Admin:staff@example.com');
  assert.equal(url.searchParams.get('issuer'), 'Indigen World Admin');
  assert.equal(url.searchParams.get('secret'), 'ABCDEFGH');
});

test('sealed secrets open only with the key and for the same account', () => {
  const key = policy.parseMfaKey(Buffer.alloc(32, 7).toString('base64'));
  const sealed = policy.sealSecret(key, 'uid-a', 'SECRETSECRET');
  assert.equal(policy.openSecret(key, 'uid-a', sealed), 'SECRETSECRET');
  assert.throws(() => policy.openSecret(key, 'uid-b', sealed), 'bound to the uid');
  assert.throws(() => policy.openSecret(Buffer.alloc(32, 8), 'uid-a', sealed), 'bound to the key');
  assert.throws(() => policy.parseMfaKey('short'), /32 random bytes/);
  assert.throws(() => policy.parseMfaKey(undefined), /32 random bytes/);
});

test('recovery codes are random, one-time shaped and hashed case-insensitively', () => {
  const codes = policy.newRecoveryCodes();
  assert.equal(codes.length, 10);
  assert.equal(new Set(codes).size, 10);
  for (const code of codes) assert.match(code, /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  const key = Buffer.alloc(32, 1);
  assert.equal(policy.recoveryCodeHash(key, 'u', codes[0]), policy.recoveryCodeHash(key, 'u', codes[0].toLowerCase().replace(/-/g, ' ')));
  assert.notEqual(policy.recoveryCodeHash(key, 'u', codes[0]), policy.recoveryCodeHash(key, 'v', codes[0]), 'bound to the uid');
});

test('verified sessions keep the newest five inside the window', () => {
  const now = 1_800_000_000;
  const window = 12 * 3600;
  assert.deepEqual(policy.nextVerifiedSessions(undefined, now - 10, now, window), [now - 10]);
  assert.deepEqual(policy.nextVerifiedSessions([now - window - 5, now - 100, 'x'], now - 10, now, window), [now - 100, now - 10], 'expired and junk dropped');
  assert.deepEqual(policy.nextVerifiedSessions([1, 2, 3, 4, 5, 6].map((n) => now - n), now - 7, now, window).length, 5);
  assert.deepEqual(policy.nextVerifiedSessions([now - 10], now - 10, now, window), [now - 10], 'no duplicates');
});

/* -- Owner-managed super administrator ------------------------------------------------ */

test('only the owner account is ever a super administrator', () => {
  assert.deepEqual([...auth.OWNER_SUPER_ADMIN_UIDS], [OWNER_UID]);
  assert.equal(auth.effectiveRole({ uid: OWNER_UID, role: 'super_admin' }), 'super_admin');
  assert.equal(auth.effectiveRole({ uid: OWNER_UID, role: 'admin', superAdmin: true }), 'super_admin');
  assert.equal(auth.effectiveRole({ uid: 'someone-else', role: 'super_admin' }), null, 'a promoted account gets nothing');
  assert.equal(auth.effectiveRole({ uid: 'someone-else', role: 'admin', superAdmin: true }), null, 'a stray superAdmin claim voids the role');
  assert.equal(auth.effectiveRole({ role: 'super_admin' }), null, 'claims without a uid are never the owner');
  assert.equal(auth.effectiveRole({ uid: 'x', role: 'admin' }), 'admin');
  assert.equal(auth.isOwnerSuperAdmin({ uid: OWNER_UID, role: 'contributor' }), false, 'the owner uid alone is not enough');
  const req = (uid, token) => ({ auth: { uid, token }, data: {} });
  assert.throws(() => auth.requireRole(req('someone-else', { role: 'super_admin' }), 'admin'), /admin access/);
  assert.equal(auth.requireRole(req(OWNER_UID, { role: 'super_admin' }), 'super_admin'), 'super_admin');
});

test('the owner list is the same in the backend, both rule files and the console', () => {
  const lists = {
    'firestore.rules': read('firebase/firestore.rules').match(/function isSuperAdmin\(\)[\s\S]*?request\.auth\.uid in (\[[^\]]*\])/)?.[1],
    'storage.rules': read('firebase/storage.rules').match(/function isSuperAdmin\(\)[\s\S]*?request\.auth\.uid in (\[[^\]]*\])/)?.[1],
    'admin staffSession.ts': read('apps/admin/src/security/staffSession.ts').match(/OWNER_SUPER_ADMIN_UIDS: readonly string\[\] = (\[[^\]]*\])/)?.[1],
    'functions auth.ts': read('services/functions/src/auth.ts').match(/OWNER_SUPER_ADMIN_UIDS: readonly string\[\] = (\[[^\]]*\])/)?.[1],
  };
  for (const [where, list] of Object.entries(lists)) {
    assert.ok(list, `${where} declares the owner list`);
    assert.deepEqual(JSON.parse(list.replace(/'/g, '"')), [OWNER_UID], `${where} lists only the owner`);
  }
});

test('no callable, script or rule can assign the super administrator role', () => {
  const identity = read('services/functions/src/identity.ts');
  const assignable = identity.match(/const ASSIGNABLE_ROLES[^=]*=\s*\[([\s\S]*?)\]/)[1];
  assert.doesNotMatch(assignable, /super_admin/);
  const setRole = read('firebase/seed/set-role.mjs');
  assert.doesNotMatch(setRole.match(/const ROLES = \[([^\]]*)\]/)[1], /super_admin/);
  const grant = read('firebase/seed/grant-admin.mjs');
  assert.match(grant, /OWNER_SUPER_ADMIN_UIDS/, 'grant-admin.mjs only re-asserts the owner');
  for (const file of readdirSync(new URL('services/functions/src/', root)).filter((name) => name.endsWith('.ts'))) {
    const source = read(`services/functions/src/${file}`);
    assert.doesNotMatch(source, /role:\s*'super_admin'|superAdmin:\s*true/, `${file} never writes a super-administrator claim`);
  }
});

/* -- Verified staff sessions ------------------------------------------------------------ */

test('a verified session is this sign-in, listed, and under twelve hours old', () => {
  const now = 1_800_000_000;
  assert.equal(auth.hasVerifiedStaffSession({ auth_time: now - 60, staffMfa: [now - 60] }, now), true);
  assert.equal(auth.hasVerifiedStaffSession({ auth_time: now - 60, staffMfa: [now - 120] }, now), false, 'another sign-in');
  assert.equal(auth.hasVerifiedStaffSession({ auth_time: now - 13 * 3600, staffMfa: [now - 13 * 3600] }, now), false, 'expired');
  assert.equal(auth.hasVerifiedStaffSession({ auth_time: now - 60 }, now), false);
  assert.equal(auth.hasVerifiedStaffSession({ auth_time: String(now - 60), staffMfa: [now - 60] }, now), true, 'auth_time may arrive as text');
});

test('staff callers need a verified session; everyone else reaches the handler', () => {
  const req = (token) => ({ auth: { uid: 'u1', token }, data: {} });
  assert.throws(() => auth.requireVerifiedStaffSession({ data: {} }), (error) => error.code === 'unauthenticated');
  for (const token of [{ role: 'admin' }, { role: 'validator' }, { role: 'reviewer' }, { financeRole: 'viewer' }, { finance: true }]) {
    assert.throws(() => auth.requireVerifiedStaffSession(req(token)), (error) => error.code === 'failed-precondition' && error.details?.reason === 'staff-mfa-required', JSON.stringify(token));
    assert.doesNotThrow(() => auth.requireVerifiedStaffSession(req({ ...token, ...verifiedStaff() })));
  }
  for (const token of [{}, { role: 'contributor' }, { role: 'creator' }, { role: 'super_admin' }]) {
    assert.doesNotThrow(() => auth.requireVerifiedStaffSession(req(token)), `${JSON.stringify(token)} has no staff standing`);
  }
});

test('every callable the admin console invokes requires a verified staff session', () => {
  const sources = [];
  const walk = (dir) => {
    for (const entry of readdirSync(new URL(dir, root), { withFileTypes: true })) {
      const path = `${dir}${entry.name}`;
      if (entry.isDirectory()) walk(`${path}/`);
      else if (/\.(ts|tsx)$/.test(entry.name)) sources.push(read(path));
    }
  };
  walk('apps/admin/src/');
  const called = new Set();
  for (const source of sources) {
    for (const match of source.matchAll(/httpsCallable(?:<[^(]*?>)?\(\s*functions\s*,\s*'([A-Za-z]+)'/g)) called.add(match[1]);
  }
  // Shared with the mobile app and TribeStudio's review desks, which have no
  // console sign-in; their rules and role checks are unchanged.
  const shared = new Set(['decideSubmission', 'staffMfa']);
  const backend = readdirSync(new URL('services/functions/src/', root)).filter((name) => name.endsWith('.ts')).map((name) => read(`services/functions/src/${name}`)).join('\n');
  assert.ok(called.size >= 40, `found ${called.size} console callables`);
  const missing = [...called].filter((name) => !shared.has(name) && !new RegExp(`export const ${name}\\s*=\\s*onStaffCall\\(`).test(backend));
  assert.deepEqual(missing, [], 'declare these with onStaffCall');
  assert.match(backend, /export const setUserRole\s*=\s*onStaffCall\(/);
  assert.match(backend, /export const staffMfa\s*=\s*onCall\(/, 'the verification callable itself cannot require verification');
});

test('the admin site CSP allows exactly the inline bootstrap script in index.html', async () => {
  const { createHash } = await import('node:crypto');
  const html = read('apps/admin/index.html');
  const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((match) => `'sha256-${createHash('sha256').update(match[1]).digest('base64')}'`);
  const site = JSON.parse(read('firebase.json')).hosting.find((entry) => entry.site === 'indigen-admin');
  const csp = site.headers.flatMap((rule) => rule.headers).find((header) => header.key === 'Content-Security-Policy')?.value ?? '';
  assert.ok(csp, 'the admin site sends a CSP');
  const allowed = csp.match(/script-src ([^;]*)/)[1].split(/\s+/).filter((token) => token.startsWith("'sha256-"));
  assert.deepEqual(allowed.sort(), inline.sort(), 'update the hash in firebase.json when the inline script changes');
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /object-src 'none'/);
  assert.doesNotMatch(csp.match(/script-src ([^;]*)/)[1], /'unsafe-inline'|'unsafe-eval'/);
});

test('rules require a verified session for console-only staff data', () => {
  const rules = read('firebase/firestore.rules');
  for (const collection of ['auditLogs', 'teamSiteRequests', 'publicFormSubmissions', 'newsletterSubscribers', 'payouts', 'platformConfiguration']) {
    const block = rules.match(new RegExp(`match /${collection}/\\{[^}]+\\} \\{([\\s\\S]*?)\\n    \\}`))?.[1] ?? '';
    for (const line of block.split('\n').filter((text) => /allow (read|update|delete|write)/.test(text) && !/if (true|false)/.test(text))) {
      assert.match(line, /hasVerifiedStaffSession\(\)/, `${collection}: ${line.trim()}`);
    }
  }
  assert.match(rules, /match \/staffMfa\/\{allPaths=\*\*\} \{ allow read, write: if false; \}/);
});
