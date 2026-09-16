import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { createHash } from 'node:crypto';
import { HttpsError } from 'firebase-functions/v2/https';
import { requireAuth, requireRole } from '../../services/functions/lib/auth.js';
import { COLLECTION_CAMPAIGN_ID, buildCollectionCampaignDocument, buildCollectionContributionReceipt,
  buildCollectionSubmissionDocument, parseCollectionContributionInput } from '../../services/functions/lib/collection-contributions.js';

async function harness() {
  const records = new Map();
  let generated = 0;
  const reference = path => ({ path, id: path.split('/').at(-1), collection: name => ({ doc: (id = `work-${++generated}`) => reference(`${path}/${name}/${id}`) }) });
  const db = { doc: reference, runTransaction: async fn => {
    const writes = [];
    const result = await fn({ get: async ref => ({ exists: records.has(ref.path), id: ref.id, ref,
      data: () => records.get(ref.path), get: key => key.split('.').reduce((o,k) => o?.[k], records.get(ref.path)) }),
      set: (ref, data) => writes.push(() => records.set(ref.path, data)),
      create: (ref, data) => { assert.ok(!records.has(ref.path)); writes.push(() => records.set(ref.path, data)); },
      update: (ref, data) => writes.push(() => { assert.ok(records.has(ref.path)); records.set(ref.path, { ...records.get(ref.path), ...data }); }),
      delete: ref => writes.push(() => records.delete(ref.path)),
    });
    writes.forEach(fn => fn()); return result;
  } };
  const path = new URL('../../services/functions/lib/contributor-portal.js', import.meta.url);
  const code = readFileSync(path, 'utf8');
  const executable = code.replace(/^import[\s\S]*?;\n/gm, '').replace(/\bexport (?=(?:async )?function|const)/g, '');
  const api = runInNewContext(executable + '\n;({saveExpressionAnswer,onContributorExpressionReviewed,parseExpressionAnswer,assignContributorExpressions})', {
    process, URL, createHash, HttpsError, requireAuth, requireRole, getFirestore: () => db,
    onCall: (_options, fn) => fn, onDocumentWritten: (_options, fn) => fn, consumeRateLimit: async () => {},
    COLLECTION_CAMPAIGN_ID, buildCollectionCampaignDocument, buildCollectionContributionReceipt,
    buildCollectionSubmissionDocument, parseCollectionContributionInput,
  });
  records.set('contributorAccounts/alice', { status: 'active' });
  const itemPath = 'contributorAccounts/alice/works/work/items/item';
  records.set(itemPath, { expression: 'How are you?', revision: 0, status: 'draft' });
  const request = (data = {}, uid = 'alice') => ({ auth: { uid }, data: { work: 'work', item: 'item', revision: 0,
    translation: 'Kasem expression', alternatives: ['Another expression'], ...data } });
  return { ...api, records, request, itemPath };
}

test('invitation ownership and active access are checked on draft writes', async () => {
  const h = await harness();
  await assert.rejects(h.saveExpressionAnswer(h.request({}, 'bob')), { code: 'permission-denied' });
  h.records.set('contributorAccounts/alice', { status: 'revoked' });
  await assert.rejects(h.saveExpressionAnswer(h.request()), { code: 'permission-denied' });
});
test('draft autosave persists alternatives and rejects stale revisions', async () => {
  const h = await harness();
  await h.saveExpressionAnswer(h.request());
  assert.equal(h.records.get(h.itemPath).revision, 1);
  await assert.rejects(h.saveExpressionAnswer(h.request()), { code: 'aborted' });
  assert.equal(h.records.get(h.itemPath).translation, 'Kasem expression');
  assert.equal([...h.records.keys()].some(k => k.startsWith('submissions/')), false);
});
test('submission is idempotent and uses the shared Contributions pipeline with Kasem alternatives', async () => {
  const h = await harness();
  const req = h.request({ submit: true, publicationPermission: true });
  const result = await h.saveExpressionAnswer(req);
  assert.equal((await h.saveExpressionAnswer(req)).submissionId, result.submissionId);
  const submission = h.records.get(`submissions/${result.submissionId}`);
  assert.equal(submission.status, 'SUBMITTED');
  assert.equal(submission.lexicalKind, 'phrase');
  assert.equal(submission.title, 'How are you?');
  assert.deepEqual(Array.from(submission.translations), ['Kasem expression', 'Another expression']);
  assert.equal(submission.permissions.aiTraining, false);
  assert.equal(submission.collectionContribution.id, result.submissionId);
  assert.ok(h.records.has(`collectionContributions/${result.submissionId}`));
  await assert.rejects(h.saveExpressionAnswer(h.request({ revision: 1 })), { code: 'failed-precondition' });
});
test('publication consent and nonempty translation are mandatory only when submitting', async () => {
  const h = await harness();
  await assert.rejects(h.saveExpressionAnswer(h.request({ submit: true })), { code: 'failed-precondition' });
  await assert.rejects(h.saveExpressionAnswer(h.request({ submit: true, publicationPermission: true, translation: '' })), { code: 'failed-precondition' });
  await h.saveExpressionAnswer(h.request({ translation: '' }));
});
test('training projection follows current reviewed state, consent and withdrawal, including repeated events', async () => {
  const h = await harness();
  const { submissionId } = await h.saveExpressionAnswer(h.request({ submit: true, publicationPermission: true, aiTraining: true }));
  const key = `submissions/${submissionId}`, training = `contributorTrainingPairs/${submissionId}`;
  const event = { params: { submissionId } };
  await h.onContributorExpressionReviewed(event);
  assert.equal(h.records.has(training), false);
  h.records.set(key, { ...h.records.get(key), status: 'APPROVED' });
  h.records.set(`dictionaryEntries/collection_${submissionId}`, { isPublished: true });
  await h.onContributorExpressionReviewed(event);
  await h.onContributorExpressionReviewed(event);
  assert.equal(h.records.get(training).english, 'How are you?');
  assert.equal(h.records.get(h.itemPath).status, 'verified');
  h.records.set(key, { ...h.records.get(key), status: 'WITHDRAWN' });
  await h.onContributorExpressionReviewed(event);
  assert.equal(h.records.has(training), false);
  assert.equal(h.records.get(h.itemPath).status, 'withdrawn');
});
test('approval without training consent never creates training data', async () => {
  const h = await harness();
  const { submissionId } = await h.saveExpressionAnswer(h.request({ submit: true, publicationPermission: true }));
  const key = `submissions/${submissionId}`;
  h.records.set(key, { ...h.records.get(key), status: 'APPROVED' });
  await h.onContributorExpressionReviewed({ params: { submissionId } });
  assert.equal(h.records.has(`contributorTrainingPairs/${submissionId}`), false);
});
test('invalid identifiers and oversized alternatives are rejected before writes', async () => {
  const h = await harness();
  await assert.rejects(h.saveExpressionAnswer(h.request({ work: '../other' })), { code: 'invalid-argument' });
  await assert.rejects(h.saveExpressionAnswer(h.request({ alternatives: Array(13).fill('word') })), { code: 'invalid-argument' });
  assert.equal(h.records.get(h.itemPath).revision, 0);
});

test('publication preserves long whole expressions and punctuation instead of word splitting', async () => {
  const { submissionTranslations } = await import('../../services/functions/lib/publication.js');
  const expression = 'A complete expression, with a second clause / and another part '.repeat(4);
  assert.deepEqual(submissionTranslations({ contributorPortal: { work: 'w' }, translations: [expression] }, 'dictionary'), [expression]);
});

test('admins assign independent sets to stable contributor IDs without replacing old work', async () => {
  const h = await harness();
  h.records.set('contributorAccounts/bob', { status: 'active' });
  const assign = (contributorId, expressions) => h.assignContributorExpressions({ auth: { uid: 'admin', token: { role: 'admin' } }, data: { contributorId, expressions, title: 'Greetings' } });
  const alice = await assign('alice', ['Hello there']);
  const bob = await assign('bob', ['See you tomorrow']);
  const more = await assign('alice', ['Please come in']);
  assert.notEqual(alice.work, bob.work); assert.notEqual(alice.work, more.work);
  assert.ok(h.records.has(h.itemPath), 'previous drafts survive');
  assert.ok(h.records.has(`contributorAccounts/alice/works/${alice.work}`));
  assert.ok(!h.records.has(`contributorAccounts/bob/works/${alice.work}`));
  assert.equal(h.records.get('contributorAccounts/alice').defaultWork, more.work);
  assert.equal(more.contributorId, 'alice');
  await assert.rejects(h.saveExpressionAnswer(h.request({ work: bob.work }, 'alice')), { code: 'permission-denied' });
});
test('assignment endpoint rejects non-admins and uninvited recipients', async () => {
  const h = await harness();
  await assert.rejects(h.assignContributorExpressions({ auth: { uid: 'alice', token: { role: 'contributor' } }, data: { contributorId: 'alice', expressions: ['Hello'] } }), { code: 'permission-denied' });
  await assert.rejects(h.assignContributorExpressions({ auth: { uid: 'admin', token: { role: 'admin' } }, data: { contributorId: 'outsider', expressions: ['Hello'] } }), { code: 'failed-precondition' });
});

test('returned expressions save revisions and resubmit as a linked review round', async () => {
  const h = await harness();
  const first = await h.saveExpressionAnswer(h.request({ submit: true, publicationPermission: true }));
  const firstPath = `submissions/${first.submissionId}`;
  h.records.set(firstPath, { ...h.records.get(firstPath), status: 'REJECTED', moderation: { feedback: 'Use a welcoming tone', decidedAt: '2026-09-16' } });
  await h.onContributorExpressionReviewed({ params: first });
  await h.saveExpressionAnswer(h.request({ revision: 1, translation: 'Revised wording' }));
  assert.equal(h.records.get(h.itemPath).feedback, 'Use a welcoming tone');
  await assert.rejects(h.saveExpressionAnswer(h.request({ revision: 1, submit: true, publicationPermission: true })), { code: 'aborted' });
  const request = h.request({ revision: 2, translation: 'Revised wording', submit: true, publicationPermission: true });
  h.records.set(`contributorTrainingPairs/${first.submissionId}`, { stale: true });
  const next = await h.saveExpressionAnswer(request);
  assert.equal(h.records.has(`contributorTrainingPairs/${first.submissionId}`), false);
  assert.notEqual(next.submissionId, first.submissionId);
  assert.equal((await h.saveExpressionAnswer(request)).submissionId, next.submissionId);
  assert.equal(h.records.get(firstPath).status, 'REJECTED');
  assert.equal(h.records.get(`submissions/${next.submissionId}`).revisionOf, first.submissionId);
  assert.equal(h.records.get(`submissions/${next.submissionId}`).previousReview.feedback, 'Use a welcoming tone');
  assert.equal(h.records.get(`submissions/${next.submissionId}`).body, 'Revised wording');
  await h.onContributorExpressionReviewed({ params: first });
  assert.equal(h.records.get(h.itemPath).status, 'submitted', 'late events from the old review do not reopen the new round');
  assert.equal(h.records.get(h.itemPath).feedback, '');
});

test('canonical approved state prevents editing even if the assignment still says rejected', async () => {
  const h = await harness();
  const first = await h.saveExpressionAnswer(h.request({ submit: true, publicationPermission: true }));
  h.records.set(h.itemPath, { ...h.records.get(h.itemPath), status: 'rejected' });
  const path = `submissions/${first.submissionId}`;
  h.records.set(path, { ...h.records.get(path), status: 'APPROVED' });
  await assert.rejects(h.saveExpressionAnswer(h.request({ revision: 1, translation: 'Late edit', submit: true, publicationPermission: true })), { code: 'failed-precondition' });
  await assert.rejects(h.saveExpressionAnswer(h.request({ revision: 1 })), { code: 'failed-precondition' });
});
