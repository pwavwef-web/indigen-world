import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { verifiedStaff } from './fixtures/staffSession.mjs';
import { createHash } from 'node:crypto';
import { applySubmissionEdits } from '../../packages/contracts/submission-editing.mjs';

let app, db, decide, consoleDecide;
before(async () => {
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'Firestore emulator required; never run against production.');
  app = initializeApp({ projectId: 'demo-indigen-world' }); db = getFirestore(app);
  const module = await import('../../services/functions/lib/creators.js');
  decide = module.decideSubmission.run; consoleDecide = module.reviewSubmission.run;
});
after(async () => { if (app) await deleteApp(app); });
const req = (data, uid = 'editing-reviewer', role = 'validator', verified = true) => ({ data, auth: { uid, token: { role, ...(verified ? verifiedStaff() : {}) } } });
const reject = (promise, code) => assert.rejects(promise, e => { assert.equal(e.code, code, e.message); return true; });
async function fixture(kind = 'literature', extra = {}) {
  const id = `edit_${crypto.randomUUID()}`;
  const record = { id, authUid: 'editing-author', creator: { collection: 'creatorProfiles', id: 'editing-author' }, campaign: { collection: 'campaigns', id: 'collection' },
    collectionKind: kind, title: 'Synthetic story', body: 'Original content', sourceReferences: 'Synthetic author',
    status: 'SUBMITTED', permissions: { review: true, publication: true, aiTraining: false },
    lifecycle: { version: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, ...extra };
  if (kind !== 'creator') {
    record.collectionContribution = { collection: 'collectionContributions', id };
    await db.doc(`collectionContributions/${id}`).set({ ...record, submissionId: id, status: 'submitted' });
  } else delete record.collectionKind;
  await db.doc(`submissions/${id}`).set(record);
  return record;
}
const input = (s, decision, edits, version = s.lifecycle.version, status = s.status) => ({ submissionId: s.id, expectedVersion: version, expectedStatus: status, decision, ...(edits ? { edits } : {}) });

test('admin corrections save canonically, mirror the receipt and retain immutable before/after history', async () => {
  const s = await fixture();
  await consoleDecide(req(input(s, 'SAVE_EDITS', { body: 'vèi sɔ́ŋɔ̀', title: 'Corrected story' }), 'editing-admin', 'admin'));
  const saved = (await db.doc(`submissions/${s.id}`).get()).data();
  assert.equal(saved.body, 'vèi sɔ́ŋɔ̀'); assert.equal(saved.status, 'SUBMITTED'); assert.equal(saved.lifecycle.version, 2);
  assert.deepEqual(saved.permissions, s.permissions); assert.equal(saved.authUid, s.authUid);
  assert.equal((await db.doc(`collectionContributions/${s.id}`).get()).get('body'), saved.body);
  assert.equal((await db.doc(`publishedContent/pub_${s.id}`).get()).exists, false);
  const logs = await db.collection('auditLogs').where('target.id', '==', s.id).get();
  assert.equal(logs.size, 1); assert.equal(logs.docs[0].get('before.content.body'), s.body); assert.equal(logs.docs[0].get('after.content.body'), saved.body);
  await reject(decide(req(input(s, 'APPROVE_AND_PUBLISH', { body: 'Stale overwrite' }))), 'aborted');
});

test('validator edits and publishes pending work atomically with original credit and a single public identity', async () => {
  const s = await fixture('creator');
  await db.doc('creatorProfiles/editing-author').set({ public: { displayName: 'Synthetic Author' } });
  await decide(req(input(s, 'APPROVE_AND_PUBLISH', { title: 'Reviewed story', body: 'Corrected text' })));
  const saved = (await db.doc(`submissions/${s.id}`).get()).data();
  const pub = (await db.doc(`publishedContent/pub_${s.id}`).get()).data();
  assert.equal(saved.status, 'PUBLISHED'); assert.equal(saved.lifecycle.version, 2);
  assert.equal(pub.title, 'Reviewed story'); assert.equal(pub.body, 'Corrected text');
  assert.equal(pub.creatorAttribution.creatorId, 'editing-author'); assert.equal(pub.publicationStatus, 'published');
  await reject(decide(req(input(s, 'APPROVE_AND_PUBLISH', { title: 'Retry' }))), 'aborted');
  await decide(req(input(saved, 'PUBLISH', { body: 'Corrected live text' })));
  assert.equal((await db.doc(`publishedContent/pub_${s.id}`).get()).get('body'), 'Corrected live text');
  assert.equal((await db.collection('publishedContent').where('submission.id', '==', s.id).get()).size, 1);
});

test('expression edits update nested public fields and receipt without changing consent or source identity', async () => {
  const s = await fixture('expressions', { body: 'Old phrase', title: 'Old meaning', expression: { phrase: 'Old phrase', meaning: 'Old meaning', dialect: 'Navrongo', kind: 'phrase', alternatives: [], context: 'A greeting', source: { type: 'self', detail: 'Synthetic source' }, consent: { source: 'Recorded statement', everyday: 'Recorded everyday statement' } } });
  await decide(req(input(s, 'APPROVE_AND_PUBLISH', { body: 'vèi sɔ́ŋɔ̀', title: 'Correct meaning', usageContext: 'When greeting a visitor', sourceReferences: 'Corrected attribution', alternativeExpressions: 'Alternative one\nAlternative two' })));
  const pub = (await db.doc(`expressionEntries/expr_${s.id}`).get()).data();
  assert.equal(pub.phrase, 'vèi sɔ́ŋɔ̀'); assert.equal(pub.meaning, 'Correct meaning'); assert.equal(pub.context, 'When greeting a visitor');
  assert.equal(pub.source.detail, 'Corrected attribution'); assert.equal(pub.source.type, 'self'); assert.equal(pub.isPublished, true);
  const saved = (await db.doc(`submissions/${s.id}`).get()).data(); assert.deepEqual(saved.expression.consent, s.expression.consent);
  assert.deepEqual((await db.doc(`collectionContributions/${s.id}`).get()).get('expression'), saved.expression);
});

test('dictionary corrections publish edited spelling, meanings, examples and forms', async () => {
  const s = await fixture('dictionary', { title: 'Old meaning', body: 'old', translations: ['old'], format: 'noun', senses: [{ definition: 'Old meaning', examples: [{ kasem: 'Old example', english: 'Old translation' }] }], forms: { definite: 'old kam', plural: 'old plural' } });
  await decide(req(input(s, 'APPROVE_AND_PUBLISH', { body: 'bakeira', 'senses.0.definition': 'Correct meaning', 'senses.0.examples.0.kasem': 'New example', 'forms.definite': 'bakeira kam' })));
  const pub = (await db.doc(`dictionaryEntries/collection_${s.id}`).get()).data();
  assert.equal(pub.kasemText, 'bakeira'); assert.equal(pub.englishText, 'Correct meaning'); assert.deepEqual(pub.translations, ['bakeira']);
  assert.equal(pub.senses[0].examples[0].kasem, 'New example'); assert.equal(pub.forms.definite, 'bakeira kam'); assert.equal(pub.forms.plural, 'old plural');
  assert.equal((await db.doc(`collectionContributions/${s.id}`).get()).get('spellingKey'), 'bakeira');
});

test('a corrected pending spelling updates duplicate checks and releases its old spelling reservation', async () => {
  const s = await fixture('dictionary', { body: 'reviewword', title: 'Synthetic word', lexicalKind: 'word', spellingKey: 'reviewword' });
  await db.doc(`dictionarySpellingRequests/${createHash('sha256').update('reviewword').digest('hex')}`).set({ contributionId: s.id });
  await decide(req(input(s, 'SAVE_EDITS', { body: 'correctword' })));
  const { dictionarySubmissionStatus } = await import('../../services/functions/lib/kasem-spelling.js');
  assert.equal(await dictionarySubmissionStatus('spelling-test-member', 'correctword'), 'pending');
  assert.equal(await dictionarySubmissionStatus('spelling-test-member', 'reviewword'), 'available');
  const { submitCollectionContribution } = await import('../../services/functions/lib/collection-contributions.js');
  const data = { collectionKind: 'dictionary', lexicalKind: 'word', title: 'Synthetic spelling test', body: 'reviewword', dialect: 'Navrongo', format: 'noun', source: 'Synthetic source', rightsConfirmed: true, publicationPermission: true, usesThirdPartyMaterial: false, participantConsentConfirmed: true, spellingAssistance: true };
  const receipt = await submitCollectionContribution.run(req(data, 'spelling-test-member', 'contributor'));
  assert.ok(receipt.submissionId);
  await reject(submitCollectionContribution.run(req({ ...data, body: 'correctword' }, 'other-spelling-member', 'contributor')), 'already-exists');
});

test('permissions, owner links, contributor consent and hidden fields cannot be changed', async () => {
  const s = await fixture();
  for (const edits of [{ 'permissions.publication': true }, { authUid: 'editing-reviewer' }, { status: 'PUBLISHED' }, { 'expression.consent.source': 'forged' }, { 'media.storagePath': 'somebody/else' }, { 'lifecycle.version': '9' }]) {
    await reject(decide(req(input(s, 'SAVE_EDITS', edits))), 'invalid-argument');
  }
  await reject(decide(req(input(s, 'SAVE_EDITS', { title: '' }))), 'invalid-argument');
  await reject(decide(req(input(s, 'SAVE_EDITS', { title: 'a'.repeat(181) }))), 'invalid-argument');
  assert.equal((await db.doc(`submissions/${s.id}`).get()).get('lifecycle.version'), 1);
});

test('no self review, ordinary-user edits, unverified admin writes, or publication without consent', async () => {
  const s = await fixture('literature', { permissions: { review: true, publication: false } });
  await reject(decide(req(input(s, 'SAVE_EDITS', { body: 'Own correction' }), s.authUid)), 'permission-denied');
  await reject(decide(req(input(s, 'SAVE_EDITS', { body: 'Unprivileged' }), 'outsider', 'contributor')), 'permission-denied');
  await reject(consoleDecide(req(input(s, 'SAVE_EDITS', { body: 'No MFA' }), 'editing-admin', 'admin', false)), 'failed-precondition');
  await reject(decide(req(input(s, 'APPROVE_AND_PUBLISH', { body: 'No consent' }))), 'failed-precondition');
  assert.equal((await db.doc(`submissions/${s.id}`).get()).get('body'), s.body);
  assert.equal((await db.doc(`publishedContent/pub_${s.id}`).get()).exists, false);
});

test('withdrawn and rejected records stay closed; edits require read guards; live edits must publish together', async () => {
  for (const status of ['WITHDRAWN', 'REJECTED', 'ARCHIVED', 'DRAFT']) {
    const s = await fixture('literature', { status }); await reject(decide(req(input(s, 'SAVE_EDITS', { body: 'Closed' }))), 'failed-precondition');
  }
  const s = await fixture();
  await reject(decide(req({ submissionId: s.id, decision: 'SAVE_EDITS', edits: { body: 'No version' } })), 'invalid-argument');
  const live = await fixture('literature', { status: 'PUBLISHED' });
  await reject(decide(req(input(live, 'SAVE_EDITS', { body: 'Hidden divergence' }))), 'failed-precondition');
});

test('two concurrent editors cannot overwrite each other', async () => {
  const s = await fixture();
  const results = await Promise.allSettled(['First', 'Second'].map(body => decide(req(input(s, 'SAVE_EDITS', { body })))));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.find(r => r.status === 'rejected').reason.code, 'aborted');
  assert.equal((await db.doc(`submissions/${s.id}`).get()).get('lifecycle.version'), 2);
});

test('editing preserves original data and untouched translation metadata', () => {
  const s = { title: 'A', body: 'B', translation: { sourceLanguage: 'en', translatedContent: 'Old' } };
  const result = applySubmissionEdits(s, { 'translation.translatedContent': 'vèi sɔ́ŋɔ̀' });
  assert.equal(result.submission.translation.sourceLanguage, 'en'); assert.equal(s.translation.translatedContent, 'Old');
  assert.throws(() => applySubmissionEdits(s, { '__proto__.polluted': 'yes' }), /Cannot edit/);
  const expression = { collectionKind: 'expressions', body: 'Phrase', title: 'Meaning', expression: { phrase: 'Phrase', meaning: 'Meaning', source: { type: 'self', detail: 'Source' } } };
  for (const field of ['usageContext', 'dialect', 'sourceReferences']) assert.throws(() => applySubmissionEdits(expression, { [field]: '' }), /required/);
  assert.throws(() => applySubmissionEdits(expression, { title: 'Phrase' }), /Kasem.*English/);
});
