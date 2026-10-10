// Seeds the local emulators with a realistic points-and-rewards state by
// driving the REAL handlers: contributors submit through saveExpressionAnswer,
// assessments open through onSubmissionForReward, the Python worker runs each
// job from Firestore, validators decide through decideRewardAssessment, and
// redemptions go through quote → redeem → Finance decisions.
//
// Emulators only (demo project). Names are "Local test · …" and Kasem is a
// bracketed placeholder: nothing here is real or invented Kasem.
//
//   npx firebase emulators:start --only auth,firestore --project demo-indigen-world
//   npm run build:functions
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 node services/functions/scripts/dev/seed-rewards-ui.mjs
//
// Test password (emulator accounts only): exported as REWARDS_TEST_PASSWORD.

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

process.env.GCLOUD_PROJECT ??= 'demo-indigen-world';
if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080' || process.env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:9099' || !process.env.GCLOUD_PROJECT.startsWith('demo-')) {
  throw new Error('Only the isolated localhost emulators are allowed.');
}
export const REWARDS_TEST_PASSWORD = 'RewardsTest123!';

// lib/index.js initialises the default app itself (project from GCLOUD_PROJECT).
const lib = await import('../../lib/index.js');
const { getAuth } = await import('firebase-admin/auth');
const { getFirestore } = await import('firebase-admin/firestore');
const db = getFirestore();
const auth = getAuth();
const now = new Date().toISOString();
const run = (fn, uid, data, token = {}) => lib[fn].run({ auth: { uid, token: { uid, ...token } }, data, rawRequest: { headers: {}, ip: '127.0.0.1' } });
const FIN = { role: 'admin', finance: true };
const VAL = { role: 'validator' };

const people = [
  ['ui-contributor', 'contributor@rewards.test', 'Local test · Contributor A', null, 2400, 2700],
  ['ui-contrib-b', 'contributor-b@rewards.test', 'Local test · Contributor B', null, 900, 900],
  ['ui-contrib-c', 'contributor-c@rewards.test', 'Local test · Contributor C', null, 300, 300],
  ['ui-validator', 'validator@rewards.test', 'Local test · Validator', VAL, null, null],
  ['ui-finance', 'finance@rewards.test', 'Local test · Finance', FIN, null, null],
];
for (const [uid, email, name, claims, balance, lifetime] of people) {
  try { await auth.createUser({ uid, email, password: REWARDS_TEST_PASSWORD, displayName: name }); }
  catch (error) { if (!['auth/uid-already-exists', 'auth/email-already-exists'].includes(error.code)) throw error; }
  if (claims) await auth.setCustomUserClaims(uid, claims);
  if (balance !== null) {
    await db.doc(`contributorAccounts/${uid}`).set({ status: 'active', requiresPasswordChange: false, defaultWork: 'ui-expressions', phoneNumber: '+233200000001',
      trainingAgreement: { version: 'contributor-training-v2', acceptedAt: now }, rewardBalance: balance, rewardLifetime: lifetime });
    await db.doc(`contributors/${uid}`).set({ id: uid, authUid: uid, status: 'active', publicVisibility: 'hidden', public: { displayName: name },
      private: { email, phone: '+233200000001' }, permissions: { edit: true, submit: true, review: false, publish: false }, roles: ['translator'], contributionTypes: ['expressions'] });
    await db.doc(`contributorAccounts/${uid}/works/ui-expressions`).set({ id: 'ui-expressions', title: 'Local test · everyday expressions',
      instructions: 'Browser test data only.', kind: 'expressions', language: 'xsm', createdAt: now });
  }
}

await run('setRewardSystemFlags', 'ui-finance', { flags: { awardMode: 'assessed', assessmentWorker: 'on' }, reason: 'Local browser check of assessed awards' }, FIN);
// A trusted reference so one assessment shows reference-backed accuracy and a duplicate flag.
await db.doc('expressionEntries/local-ref').set({ isPublished: true, phrase: '[Local test Kasem 5]', meaning: 'Please come and sit with us' });

const prompts = [
  ['one', 'Good morning (to an elder)', 'Said when greeting an elder at their home in the morning'],
  ['two', 'Thank you for your help', 'Said to a neighbour who helped carry water'],
  ['three', 'Safe journey', ''],
  ['four', 'We will meet tomorrow', 'Said at the end of a market day'],
  ['five', 'Please come and sit with us', 'Said to welcome a visitor to the compound'],
];
const venv = fileURLToPath(new URL(`../../../assessment-worker/venv/${process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python'}`, import.meta.url));
const workerDir = fileURLToPath(new URL('../../../assessment-worker/', import.meta.url));
const ids = {};
for (const [item, english, context] of prompts) {
  const path = `contributorAccounts/ui-contributor/works/ui-expressions/items/${item}`;
  await db.doc(path).set({ id: item, expression: english, translation: '', alternatives: [], revision: 0, status: 'draft', updatedAt: now });
  const { submissionId } = await run('saveExpressionAnswer', 'ui-contributor', { work: 'ui-expressions', item, revision: 0, translation: `[Local test Kasem ${prompts.findIndex(p => p[0] === item) + 1}]`,
    alternatives: [], context, submit: true, publicationPermission: true, aiTraining: true });
  ids[item] = submissionId;
  await lib.onSubmissionForReward.run({ params: { submissionId } });
  const jobId = (await db.doc(`contributionAssessments/${submissionId}`).get()).get('automated.jobId');
  if (jobId && existsSync(venv)) {
    execFileSync(venv, ['-m', 'assessment_worker.cli', 'run-job', jobId, '--project', process.env.GCLOUD_PROJECT],
      { cwd: workerDir, env: { ...process.env, ASSESSMENT_KAWURI: 'off', PYTHONIOENCODING: 'utf-8' }, stdio: 'ignore' });
    await lib.onAssessmentJobWritten.run({ data: { after: await db.doc(`contributionAssessmentJobs/${jobId}`).get() } });
  }
}
const decide = async (item, data) => {
  const current = (await db.doc(`contributionAssessments/${ids[item]}`).get()).data();
  return run('decideRewardAssessment', 'ui-validator', { assessmentId: ids[item], expectedRevision: current.revision, ...data }, VAL);
};
const all = s => ({ accuracy: s, completeness: s, technical: s, metadata: s });
await decide('one', { decision: 'confirm', scores: all(84), messageToContributor: 'Accurate, with a clear situation of use.' });
await decide('two', { decision: 'confirm', scores: { accuracy: 95, completeness: 95, technical: 92, metadata: 90 }, messageToContributor: 'Natural and complete.' });
await decide('three', { decision: 'confirm', scores: { accuracy: 75, completeness: 70, technical: 90, metadata: 80 }, messageToContributor: 'Correct. Adding when it is said would make it more useful.' });
await decide('four', { decision: 'clarify', messageToContributor: 'Is this said only at the market, or whenever people part for the day?' });

// Redemptions.
const redeem = async (uid, points, key) => {
  const quote = await run('quoteContributorRedemption', uid, { kind: 'airtime', network: 'MTN', points });
  return (await run('redeemContributorPoints', uid, { quoteId: quote.quoteId, phoneNumber: '0200000001', idempotencyKey: key })).requestId;
};
await db.doc('contributorRedemptions/local-legacy-delivered').set({ id: 'local-legacy-delivered', contributorId: 'ui-contributor', kind: 'airtime', network: 'MTN', phoneNumber: '+233200000001',
  points: 300, amountMinor: 500, currency: 'GHS', description: '300 points for airtime', status: 'fulfilled', createdAt: '2026-10-02T09:00:00.000Z', updatedAt: '2026-10-03T09:00:00.000Z', paymentReference: 'LOCAL-TEST-OLD' });
const delivered = await redeem('ui-contributor', 900, 'local-a-900');
await run('decideContributorRedemption', 'ui-finance', { requestId: delivered, action: 'approve', expectedStatus: 'submitted' }, FIN);
await run('decideContributorRedemption', 'ui-finance', { requestId: delivered, action: 'fulfill', paymentReference: 'LOCAL-TEST-REF-900' }, FIN);
await redeem('ui-contrib-b', 900, 'local-b-900');
const unclear = await redeem('ui-contrib-c', 300, 'local-c-300');
await run('decideContributorRedemption', 'ui-finance', { requestId: unclear, action: 'approve' }, FIN);
await run('decideContributorRedemption', 'ui-finance', { requestId: unclear, action: 'mark_ambiguous', note: 'Local test: top-up timed out without a receipt' }, FIN);

const balance = async uid => (await db.doc(`contributorPointAccounts/${uid}`).get()).data();
console.log(JSON.stringify({ seeded: true, contributorA: await balance('ui-contributor'), assessments: Object.keys(ids).length }, null, 1));
