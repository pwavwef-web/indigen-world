// Staff security end to end: the real `staffMfa`, `setUserRole` and
// `setContributorAccess` callables against the Auth and Firestore emulators.
//
//   npm run test:staff-security

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { deleteApp, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { OWNER_UID } from './fixtures/staffSession.mjs';

process.env.GCLOUD_PROJECT ??= 'demo-indigen-world';
process.env.STAFF_MFA_KEY = Buffer.alloc(32, 42).toString('base64');
const PROJECT = process.env.GCLOUD_PROJECT;
assert.ok(process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_AUTH_EMULATOR_HOST, 'Run under the Auth and Firestore emulators.');

let app, mfa, identity, portal, policy;
before(async () => {
  app = initializeApp({ projectId: PROJECT });
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
  mfa = await import('../../services/functions/lib/staff-mfa.js');
  identity = await import('../../services/functions/lib/identity.js');
  portal = await import('../../services/functions/lib/contributor-portal.js');
  policy = await import('../../services/functions/lib/staff-mfa-policy.js');
});
after(async () => { await deleteApp(app); });

const now = () => Math.floor(Date.now() / 1000);
/** The token a callable sees: the account's current claims plus this sign-in's auth_time. */
async function token(uid, authTime) {
  const user = await getAuth().getUser(uid);
  return { ...(user.customClaims ?? {}), uid, email: user.email, auth_time: authTime };
}
const call = async (fn, uid, authTime, data) => fn.run({ auth: { uid, token: await token(uid, authTime) }, data, rawRequest: {} });
const code = (pattern) => (error) => { assert.match(`${error.code} ${error.message}`, pattern); return true; };

async function person(uid, claims) {
  await getAuth().createUser({ uid, email: `${uid.toLowerCase()}@example.test` });
  await getAuth().setCustomUserClaims(uid, claims);
}

/** Enrol `uid` on sign-in `authTime`; returns the shared secret and recovery codes. */
async function enrol(uid, authTime) {
  const { secret } = await call(mfa.staffMfa, uid, authTime, { action: 'enroll' });
  const { recoveryCodes } = await call(mfa.staffMfa, uid, authTime, { action: 'confirm', code: policy.totpAt(secret, policy.timeStep()) });
  return { secret, recoveryCodes };
}

test('setup, verification, replay, recovery codes and the verified-session claim', async () => {
  await person('admin-1', { role: 'admin' });
  const first = now() - 120;
  assert.deepEqual(
    { ...(await call(mfa.staffMfa, 'admin-1', first, { action: 'status' })), sessionExpiresAt: null },
    { enrolled: false, verified: false, sessionExpiresAt: null, recoveryCodesLeft: 0, lockedUntil: null },
  );
  const { secret } = await call(mfa.staffMfa, 'admin-1', first, { action: 'enroll' });
  assert.match(secret, /^[A-Z2-7]{32}$/);
  await assert.rejects(call(mfa.staffMfa, 'admin-1', first, { action: 'confirm', code: '000000' }), code(/permission-denied.*not right/));
  const step = policy.timeStep();
  const confirmed = await call(mfa.staffMfa, 'admin-1', first, { action: 'confirm', code: policy.totpAt(secret, step) });
  assert.equal(confirmed.recoveryCodes.length, 10);
  assert.deepEqual((await getAuth().getUser('admin-1')).customClaims.staffMfa, [first]);

  const stored = (await getFirestore().doc('staffMfa/admin-1').get()).data();
  assert.equal(stored.status, 'enrolled');
  assert.equal(JSON.stringify(stored).includes(secret), false, 'the secret is sealed at rest');
  assert.equal(JSON.stringify(stored).includes(confirmed.recoveryCodes[0]), false, 'recovery codes are hashed');

  // A new sign-in must verify again; the code already used cannot be replayed.
  const second = now() - 30;
  assert.equal((await call(mfa.staffMfa, 'admin-1', second, { action: 'status' })).verified, false);
  await assert.rejects(call(mfa.staffMfa, 'admin-1', second, { action: 'verify', code: policy.totpAt(secret, step) }), code(/not right/));
  const recovered = await call(mfa.staffMfa, 'admin-1', second, { action: 'verify', recoveryCode: confirmed.recoveryCodes[0].toLowerCase() });
  assert.equal(recovered.recoveryCodesLeft, 9);
  await assert.rejects(call(mfa.staffMfa, 'admin-1', second, { action: 'verify', recoveryCode: confirmed.recoveryCodes[0] }), code(/not right/), 'each recovery code works once');
  assert.deepEqual((await getAuth().getUser('admin-1')).customClaims.staffMfa, [first, second]);
  assert.equal((await call(mfa.staffMfa, 'admin-1', second, { action: 'status' })).verified, true);

  // Re-enrolment from an unverified sign-in is refused.
  await assert.rejects(call(mfa.staffMfa, 'admin-1', now() - 5, { action: 'enroll' }), code(/already set up/));
  // A sign-in older than twelve hours is refused outright.
  await assert.rejects(call(mfa.staffMfa, 'admin-1', now() - 13 * 3600, { action: 'status' }), code(/failed-precondition.*expired/));
});

test('five wrong codes lock verification for fifteen minutes', async () => {
  await person('admin-lock', { role: 'admin' });
  const { secret } = await enrol('admin-lock', now() - 300);
  const signIn = now() - 10;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    await assert.rejects(call(mfa.staffMfa, 'admin-lock', signIn, { action: 'verify', code: '000000' }), code(/not right/));
  }
  await assert.rejects(call(mfa.staffMfa, 'admin-lock', signIn, { action: 'verify', code: '000000' }), code(/locked/));
  await assert.rejects(call(mfa.staffMfa, 'admin-lock', signIn, { action: 'verify', code: policy.totpAt(secret, policy.timeStep() + 1) }), code(/locked/), 'even a right code waits');
  const audit = await getFirestore().collection('auditLogs').where('action', '==', 'staff_mfa.locked').get();
  assert.equal(audit.size, 1);
});

test('admin-console callables refuse a staff sign-in that has not verified', async () => {
  await person('admin-2', { role: 'admin' });
  await person('member-1', { role: 'contributor' });
  await assert.rejects(call(identity.setUserRole, 'admin-2', now() - 10, { uid: 'member-1', role: 'validator' }), (error) => error.code === 'failed-precondition' && error.details?.reason === 'staff-mfa-required');
  await assert.rejects(call(mfa.staffMfa, 'member-1', now() - 10, { action: 'status' }), code(/permission-denied.*no staff role/));
});

// Shared by the remaining tests, which run in order.
let ownerSignIn = 0;
let adminSignIn = 0;

test('nobody can be promoted to super administrator, and the owner cannot be touched', async () => {
  await person(OWNER_UID, { role: 'super_admin' });
  await person('admin-3', { role: 'admin' });
  await person('admin-4', { role: 'admin' });
  await person('member-2', { role: 'contributor' });
  await person('rogue', { role: 'super_admin' });
  ownerSignIn = now() - 60;
  await enrol(OWNER_UID, ownerSignIn);
  adminSignIn = now() - 50;
  await enrol('admin-3', adminSignIn);

  for (const [uid, signIn] of [[OWNER_UID, ownerSignIn], ['admin-3', adminSignIn]]) {
    await assert.rejects(call(identity.setUserRole, uid, signIn, { uid: 'member-2', role: 'super_admin' }), code(/permission-denied.*owner-managed/));
  }
  await assert.rejects(call(identity.setUserRole, 'admin-3', adminSignIn, { uid: OWNER_UID, role: 'contributor' }), code(/owner-managed/), 'an admin cannot demote the owner');
  await assert.rejects(call(identity.setUserRole, 'admin-3', adminSignIn, { uid: 'admin-4', role: 'contributor' }), code(/Super administrator access/), 'an admin cannot demote another admin');
  await assert.rejects(call(identity.setUserRole, 'admin-3', adminSignIn, { uid: 'member-2', role: 'admin' }), code(/Super administrator access/));
  await assert.rejects(call(identity.setUserRole, 'admin-3', adminSignIn, { uid: 'admin-3', role: 'validator' }), code(/your own role/));
  await call(identity.setUserRole, 'admin-3', adminSignIn, { uid: 'member-2', role: 'validator' });
  await call(identity.setUserRole, OWNER_UID, ownerSignIn, { uid: 'member-2', role: 'admin' });
  assert.equal((await getAuth().getUser('member-2')).customClaims.role, 'admin');

  // A super_admin claim on any other account carries no power at all.
  await assert.rejects(call(identity.setUserRole, 'rogue', now() - 10, { uid: 'member-2', role: 'contributor' }), code(/permission-denied.*admin access/));
});

test('sign-in access: no self-lockout, admins only by the owner, the owner never', async () => {
  const db = getFirestore();
  for (const uid of [OWNER_UID, 'admin-4', 'admin-3']) {
    await db.doc(`contributors/${uid}`).set({ status: 'active' });
    await db.doc(`contributorAccounts/${uid}`).set({ status: 'active' });
  }
  const suspend = (uid) => ({ contributorId: uid, accountStatus: 'suspended', reason: 'Synthetic test' });
  await assert.rejects(call(portal.setContributorAccess, 'admin-3', adminSignIn, suspend(OWNER_UID)), code(/owner-managed/));
  await assert.rejects(call(portal.setContributorAccess, 'admin-3', adminSignIn, suspend('admin-4')), code(/Only the super administrator/));
  await assert.rejects(call(portal.setContributorAccess, 'admin-3', adminSignIn, suspend('admin-3')), code(/your own sign-in/));
  assert.equal((await getAuth().getUser(OWNER_UID)).disabled, false);
  assert.equal((await getAuth().getUser('admin-4')).disabled, false);
  await call(portal.setContributorAccess, OWNER_UID, ownerSignIn, suspend('admin-4'));
  assert.equal((await getAuth().getUser('admin-4')).disabled, true, 'the owner can');
});

test('only the super administrator resets someone else’s two-step verification', async () => {
  await assert.rejects(call(mfa.staffMfa, 'admin-3', adminSignIn, { action: 'reset', uid: 'admin-1' }), code(/Only the super administrator/));
  const roster = await call(mfa.staffMfa, OWNER_UID, ownerSignIn, { action: 'roster' });
  assert.ok(roster.people.some((row) => row.uid === 'admin-3' && row.enrolled));
  assert.equal(roster.people.some((row) => row.uid === 'rogue'), false, 'a non-owner super_admin has no staff standing');
  await call(mfa.staffMfa, OWNER_UID, ownerSignIn, { action: 'reset', uid: 'admin-3' });
  assert.equal((await getFirestore().doc('staffMfa/admin-3').get()).exists, false);
  const claims = (await getAuth().getUser('admin-3')).customClaims;
  assert.equal(claims.staffMfa, undefined);
  assert.equal(claims.role, 'admin', 'other claims survive');
  await assert.rejects(call(mfa.staffMfa, OWNER_UID, ownerSignIn, { action: 'reset', uid: OWNER_UID }), code(/recovery codes/));
  const audit = await getFirestore().collection('auditLogs').where('action', '==', 'staff_mfa.reset').get();
  assert.equal(audit.size, 1);
});
