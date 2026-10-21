// Security Rules for staff security: verified admin-console sessions and the
// owner-managed super administrator.
//
//   npm run test:staff-security

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { OWNER_UID, verifiedStaff } from './fixtures/staffSession.mjs';

let env;
before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-staff-security-rules',
    firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') },
  });
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'auditLogs/a1'), { action: 'identity.set_role' });
    await setDoc(doc(db, 'payouts/p1'), { amount: 1 });
    await setDoc(doc(db, 'staffMfa/admin-1'), { status: 'enrolled' });
    await setDoc(doc(db, 'campaigns/c1'), { id: 'c1', visibility: 'private' });
  });
});
after(async () => { await env?.cleanup(); });

const as = (uid, claims) => env.authenticatedContext(uid, claims).firestore();
const now = () => Math.floor(Date.now() / 1000);

test('console-only staff data needs this sign-in to be two-step verified', async () => {
  await assertSucceeds(getDoc(doc(as('admin-1', { role: 'admin', ...verifiedStaff() }), 'auditLogs/a1')));
  await assertFails(getDoc(doc(as('admin-1', { role: 'admin' }), 'auditLogs/a1')), 'not verified');
  const old = now() - 13 * 3600;
  await assertFails(getDoc(doc(as('admin-1', { role: 'admin', auth_time: old, staffMfa: [old] }), 'auditLogs/a1')), 'older than twelve hours');
  await assertFails(getDoc(doc(as('admin-1', { role: 'admin', auth_time: now() - 10, staffMfa: [now() - 500] }), 'auditLogs/a1')), 'another sign-in was verified');
});

test('mobile and studio staff work is unchanged without the console', async () => {
  await assertSucceeds(getDoc(doc(as('admin-1', { role: 'admin' }), 'campaigns/c1')));
  await assertSucceeds(getDoc(doc(as('validator-1', { role: 'validator' }), 'campaigns/c1')));
});

test('only the owner account is a super administrator', async () => {
  await assertSucceeds(getDoc(doc(as(OWNER_UID, { role: 'super_admin', ...verifiedStaff() }), 'payouts/p1')));
  await assertFails(getDoc(doc(as('promoted', { role: 'super_admin', ...verifiedStaff() }), 'auditLogs/a1')), 'a super_admin claim elsewhere grants nothing');
  await assertFails(getDoc(doc(as('promoted', { role: 'admin', superAdmin: true, ...verifiedStaff() }), 'auditLogs/a1')), 'a stray superAdmin claim voids the role');
  await assertFails(getDoc(doc(as('promoted', { role: 'super_admin' }), 'campaigns/c1')));
});

test('payout detail needs finance on an admin, verified', async () => {
  await assertSucceeds(getDoc(doc(as('fin-1', { role: 'admin', finance: true, ...verifiedStaff() }), 'payouts/p1')));
  await assertFails(getDoc(doc(as('fin-1', { role: 'admin', finance: true }), 'payouts/p1')));
  await assertFails(getDoc(doc(as('admin-1', { role: 'admin', ...verifiedStaff() }), 'payouts/p1')));
  await assertFails(getDoc(doc(as('fin-2', { finance: true, ...verifiedStaff() }), 'payouts/p1')), 'finance without an admin role');
});

test('two-step verification secrets are closed to every client', async () => {
  for (const [uid, claims] of [['admin-1', { role: 'admin', ...verifiedStaff() }], [OWNER_UID, { role: 'super_admin', ...verifiedStaff() }]]) {
    await assertFails(getDoc(doc(as(uid, claims), 'staffMfa/admin-1')));
    await assertFails(setDoc(doc(as(uid, claims), 'staffMfa/admin-1'), { status: 'none' }));
  }
  assert.ok(true);
});
