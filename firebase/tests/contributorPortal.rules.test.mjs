import { after, before, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
let env;
before(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-contributor-portal', firestore: {
    host: '127.0.0.1', port: 8080, rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'),
  } });
  await env.withSecurityRulesDisabled(async ctx => {
    await setDoc(doc(ctx.firestore(), 'contributorAccounts/alice'), { status: 'active' });
    await setDoc(doc(ctx.firestore(), 'contributorAccounts/alice/works/work/items/item'), { expression: 'Hello' });
    await setDoc(doc(ctx.firestore(), 'contributorTrainingPairs/entry'), { kasem: 'private' });
  });
});
after(async () => env?.cleanup());
test('drafts are owner-readable and never client writable', async () => {
  const path = 'contributorAccounts/alice/works/work/items/item';
  await assertSucceeds(getDoc(doc(env.authenticatedContext('alice').firestore(), path)));
  await assertFails(getDoc(doc(env.authenticatedContext('bob').firestore(), path)));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), path)));
  await assertFails(setDoc(doc(env.authenticatedContext('alice').firestore(), path), { status: 'verified' }));
});
test('training pairs are private to administrators', async () => {
  await assertFails(getDoc(doc(env.authenticatedContext('alice').firestore(), 'contributorTrainingPairs/entry')));
  await assertSucceeds(getDoc(doc(env.authenticatedContext('admin', { role: 'admin' }).firestore(), 'contributorTrainingPairs/entry')));
});
test('revoked invitations lose access to assigned work', async () => {
  await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), 'contributorAccounts/alice'), { status: 'revoked' }));
  await assertFails(getDoc(doc(env.authenticatedContext('alice').firestore(), 'contributorAccounts/alice/works/work/items/item')));
});

test('contributor profiles are admin-managed: owners cannot read internal notes or switch permissions on', async () => {
  await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), 'contributors/carol'), {
    authUid: 'carol', status: 'active', roles: ['translator'], permissions: { edit: false, submit: false },
    public: { displayName: 'Carol' }, private: { email: 'carol@example.com', notes: 'Internal editorial note' },
  }));
  const carol = env.authenticatedContext('carol').firestore();
  await assertFails(getDoc(doc(carol, 'contributors/carol')));
  await assertFails(setDoc(doc(carol, 'contributors/carol'), { permissions: { edit: true, submit: true } }, { merge: true }));
  await assertSucceeds(getDoc(doc(env.authenticatedContext('validator', { role: 'validator' }).firestore(), 'contributors/carol')));
  await assertSucceeds(setDoc(doc(env.authenticatedContext('admin', { role: 'admin' }).firestore(), 'contributors/carol'), { publicVisibility: 'hidden' }, { merge: true }));
  const dave = env.authenticatedContext('dave').firestore();
  await assertFails(setDoc(doc(dave, 'contributors/dave'), { authUid: 'dave', status: 'pending', points: 0, permissions: { submit: true } }));
  await assertSucceeds(setDoc(doc(dave, 'contributors/dave'), { authUid: 'dave', status: 'pending', points: 0, roles: ['contributor'] }));
});

test('contributor settings are owner-readable and written only by the backend', async () => {
  await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), 'contributorSettings/erin'), { activityVisibility: 'hidden' }));
  await assertSucceeds(getDoc(doc(env.authenticatedContext('erin').firestore(), 'contributorSettings/erin')));
  await assertFails(getDoc(doc(env.authenticatedContext('frank').firestore(), 'contributorSettings/erin')));
  await assertFails(setDoc(doc(env.authenticatedContext('erin').firestore(), 'contributorSettings/erin'), { activityVisibility: 'name' }));
});

test('the community pulse is for active contributors and staff, and nobody writes it from a client', async () => {
  await env.withSecurityRulesDisabled(async ctx => {
    await setDoc(doc(ctx.firestore(), 'contributorAccounts/gina'), { status: 'active' });
    await setDoc(doc(ctx.firestore(), 'contributorAccounts/hank'), { status: 'suspended' });
    await setDoc(doc(ctx.firestore(), 'contributorPulse/entry'), { day: '2026-09-23', label: null, submitted: ['t1'] });
    await setDoc(doc(ctx.firestore(), 'contributorPulseTotals/2026-09-23'), { submitted: ['t1'], contributors: ['c1'] });
  });
  await assertSucceeds(getDoc(doc(env.authenticatedContext('gina').firestore(), 'contributorPulse/entry')));
  await assertSucceeds(getDoc(doc(env.authenticatedContext('gina').firestore(), 'contributorPulseTotals/2026-09-23')));
  await assertFails(getDoc(doc(env.authenticatedContext('hank').firestore(), 'contributorPulse/entry')));
  await assertFails(getDoc(doc(env.authenticatedContext('stranger').firestore(), 'contributorPulse/entry')));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'contributorPulseTotals/2026-09-23')));
  await assertSucceeds(getDoc(doc(env.authenticatedContext('reviewer', { role: 'validator' }).firestore(), 'contributorPulse/entry')));
  await assertFails(setDoc(doc(env.authenticatedContext('gina').firestore(), 'contributorPulse/entry'), { label: 'Me' }));
});

test('the key the pulse hashes account ids with is readable by no client, staff included', async () => {
  await env.withSecurityRulesDisabled(async ctx => {
    await setDoc(doc(ctx.firestore(), 'contributorAccounts/gina'), { status: 'active' });
    await setDoc(doc(ctx.firestore(), 'contributorPulseKeys/current'), { key: 'k'.repeat(64) });
  });
  await assertFails(getDoc(doc(env.authenticatedContext('gina').firestore(), 'contributorPulseKeys/current')));
  await assertFails(getDoc(doc(env.authenticatedContext('boss', { role: 'super_admin', superAdmin: true }).firestore(), 'contributorPulseKeys/current')));
  await assertFails(setDoc(doc(env.authenticatedContext('gina').firestore(), 'contributorPulseKeys/current'), { key: 'mine' }));
});

test('payout details, pending codes and payment requests are server-only, even for admins', async () => {
  await env.withSecurityRulesDisabled(async ctx => {
    await setDoc(doc(ctx.firestore(), 'contributorPayoutProfiles/gina'), { bank: { accountNumber: '1441000123456' } });
    await setDoc(doc(ctx.firestore(), 'contributorMomoChallenges/gina'), { codeHash: 'x' });
    await setDoc(doc(ctx.firestore(), 'contributorPaymentRequests/r1'), { contributorId: 'gina' });
  });
  for (const path of ['contributorPayoutProfiles/gina', 'contributorMomoChallenges/gina', 'contributorPaymentRequests/r1']) {
    await assertFails(getDoc(doc(env.authenticatedContext('gina').firestore(), path)));
    await assertFails(getDoc(doc(env.authenticatedContext('finance', { role: 'admin', finance: true }).firestore(), path)));
    await assertFails(setDoc(doc(env.authenticatedContext('gina').firestore(), path), { tampered: true }));
  }
});
