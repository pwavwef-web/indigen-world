import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getContributorJourney, saveContributorJourney, setContributorCollectionGoal, findContributorExpressionMatches } from '../../services/functions/lib/contributor-journey.js';
import { saveExpressionAnswer } from '../../services/functions/lib/contributor-portal.js';
import { EMPTY_DETAILS } from '@indigen-world/contracts/contributor-details';
assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'Run under the Firestore emulator.');
let app, db;
const call = (fn, uid, data = {}, role = 'contributor') => fn.run({ auth: { uid, token: { role } }, data, rawRequest: {} });
before(async () => {
  app = initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? 'demo-indigen-world' }); db = getFirestore();
  await db.doc('contributorAccounts/journey-owner').set({ status: 'active', requiresPasswordChange: false, journey: { participationDays: ['2026-10-12'] }, trainingAgreement: { version: 'contributor-training-v2' } });
  await db.doc('contributorAccounts/journey-suspended').set({ status: 'suspended' });
  await db.doc('contributorAccounts/journey-owner/works/work/items/item').set({ expression: 'A test expression', translation: '', alternatives: [], revision: 0, status: 'draft' });
  await db.doc('expressionEntries/journey-public').set({ phrase: '[Exact test phrase]', meaning: '[Public test meaning]', dialect: 'Navrongo', isPublished: true });
  await db.doc('expressionEntries/journey-hidden').set({ phrase: '[Exact test phrase]', meaning: 'HIDDEN TEST RECORD', isPublished: false });
});
after(async () => { if (app) await deleteApp(app); });

test('real transactions retain participation when preferences and a submission race', async () => {
  await Promise.all([
    call(saveContributorJourney, 'journey-owner', { weeklyGoal: 4, sessionSize: 5, celebrations: false, participationDays: ['2099-01-01'], practiceCompleted: true }),
    call(saveExpressionAnswer, 'journey-owner', { work: 'work', item: 'item', revision: 0, translation: '[Emulator test translation]', alternatives: ['[Alternate test translation]'], details: { ...EMPTY_DETAILS, variety: 'Navrongo', situation: 'Test setting', alternativeNotes: ['polite'] }, context: 'A test conversation', submit: true, publicationPermission: true }),
  ]);
  const result = await call(getContributorJourney, 'journey-owner');
  assert.equal(result.weeklyGoal, 4); assert.equal(result.sessionSize, 5); assert.equal(result.practiceCompleted, true);
  assert.ok(result.participationDays.includes(new Date().toISOString().slice(0, 10)));
  assert.equal(result.participationDays.includes('2099-01-01'), false);
  const item = await db.doc('contributorAccounts/journey-owner/works/work/items/item').get();
  const submission = await db.doc('submissions/' + item.get('submissionId')).get();
  assert.equal(submission.get('contributorDetails.alternativeNotes')[0], 'polite');
  assert.match(submission.get('usageContext'), /Test setting/);
  assert.equal(submission.get('dialect'), 'Navrongo');
});

test('suspended and foreign accounts cannot write journey state or discover hidden wording', async () => {
  const prefs = { weeklyGoal: 3, sessionSize: 3, celebrations: true };
  await assert.rejects(call(saveContributorJourney, 'journey-suspended', prefs), { code: 'permission-denied' });
  await assert.rejects(call(saveContributorJourney, 'journey-other', { ...prefs, uid: 'journey-owner' }), { code: 'permission-denied' });
  const result = await call(findContributorExpressionMatches, 'journey-owner', { phrase: '[Exact test phrase]' });
  assert.equal(result.matches.length, 1); assert.equal(JSON.stringify(result).includes('HIDDEN'), false);
  await assert.rejects(call(setContributorCollectionGoal, 'journey-owner', { enabled: true, target: 30, day: new Date().toISOString().slice(0, 10) }), { code: 'permission-denied' });
  await call(setContributorCollectionGoal, 'journey-admin', { enabled: true, target: 30, day: new Date().toISOString().slice(0, 10) }, 'admin');
  assert.equal((await call(getContributorJourney, 'journey-owner')).communityGoal.target, 30);
});
