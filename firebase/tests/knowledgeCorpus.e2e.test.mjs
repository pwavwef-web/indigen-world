import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { input, policy, grant, review } from './knowledgeCorpus.test.mjs';
import { saveKnowledgeRecord, getKnowledgeRecord, listKnowledgeRecords, reviewKnowledgeRecord, withdrawKnowledgeRecord, getKnowledgeProgress } from '../../services/functions/lib/knowledge-workspace.js';
import { releaseKnowledgeRecord, resolveKnowledgeRecords, revokeKnowledgeRelease, exportKnowledgeRecords } from '../../services/functions/lib/knowledge-release.js';
import { configureKnowledgeGovernance } from '../../services/functions/lib/knowledge-governance.js';

const projectId = 'demo-knowledge-corpus';
let app, db, env;
const invoke = (fn, uid, data = {}, role = 'contributor') => fn.run({ auth: { uid, token: { role } }, data, rawRequest: { headers: {} } });
const failure = (fn, code) => assert.rejects(fn, error => error.code === code);
let n = 0;
const create = async (r = input(), submit = true) => (await invoke(saveKnowledgeRecord, 'owner', { requestId: `fixture-request-${++n}`, submit, record: r })).record;
const authenticate = async r => {
  let result;
  for (const uid of ['reviewer-a', 'reviewer-b']) result = await invoke(reviewKnowledgeRecord, uid, { ...review(uid), id: r.id, revision: r.revision });
  return result.record;
};
const release = (r, destination = 'venacula', uid = 'manager') => invoke(releaseKnowledgeRecord, uid, { id: r.id, revision: r.revision, destination, requestId: `release-request-${++n}` });
before(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Run only against the Firestore emulator.');
  app = initializeApp({ projectId }); db = getFirestore(app);
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
  env = await initializeTestEnvironment({ projectId, firestore: { host, port: Number(port), rules: readFileSync('firebase/firestore.rules', 'utf8') } });
  await env.clearFirestore();
  await db.doc('knowledgePolicies/current').set(policy);
  for (const uid of ['reviewer-a', 'reviewer-b', 'manager']) await db.doc(`knowledgeRoleGrants/${uid}`).set(grant);
});
after(async () => { await env?.cleanup(); if (app) await deleteApp(app); });

test('durable idempotent receipts, uniqueness and immutable revisions survive retries', async () => {
  const data = { requestId: 'duplicate-request-123', submit: true, record: input() };
  const [a, b] = await Promise.all([invoke(saveKnowledgeRecord, 'owner', data), invoke(saveKnowledgeRecord, 'owner', data)]);
  assert.equal(a.receiptId, b.receiptId); assert.match(a.record.displayId, /^KSM-EXP-\d{6}$/);
  await failure(() => invoke(saveKnowledgeRecord, 'owner', { ...data, record: { ...input(), title: 'Changed' } }), 'already-exists');
  const c = await create(); assert.notEqual(c.displayId, a.record.displayId);
  const edit = { id: a.record.id, revision: 1, requestId: 'revision-request-123', submit: true, record: { ...input(), title: 'New revision' } };
  const newer = await invoke(saveKnowledgeRecord, 'owner', edit); assert.equal(newer.record.revision, 2);
  assert.equal((await db.doc(`knowledgeRecords/${a.record.id}/revisions/1`).get()).get('title'), input().title);
  const historic = await invoke(getKnowledgeRecord, 'owner', { id: a.record.id, revision: 1 });
  assert.equal(historic.historical, true); assert.equal(historic.currentVersion, 2); assert.equal(historic.record.title, input().title);
  await failure(() => invoke(saveKnowledgeRecord, 'owner', { ...edit, requestId: 'stale-request-123' }), 'failed-precondition');
});
test('private drafts and all corpus collections reject direct client privilege escalation', async () => {
  const r = await create(input(), false);
  await failure(() => invoke(getKnowledgeRecord, 'other', { id: r.id }), 'permission-denied');
  await failure(() => invoke(getKnowledgeRecord, 'unqualified-admin', { id: r.id }, 'admin'), 'permission-denied');
  const adminClient = env.authenticatedContext('unqualified-admin', { role: 'admin' }).firestore();
  for (const path of [`knowledgeRecords/${r.id}`, 'knowledgePolicies/current', 'knowledgeRoleGrants/owner', 'knowledgeReleases/fake', 'knowledgeExports/fake', 'knowledgeRevocations/fake']) {
    await assertFails(getDoc(doc(adminClient, path)));
    await assertFails(setDoc(doc(adminClient, path), { authentication: 'gold', active: true }));
  }
  await failure(() => invoke(saveKnowledgeRecord, 'owner', { requestId: 'protected-request', submit: false, record: { ...input(), authentication: 'gold' } }), 'invalid-argument');
});
test('unapproved policy allows drafts but blocks sentence submission, review and publication', async () => {
  await db.doc('knowledgePolicies/current').set({ approved: false });
  const sentence = await create(input('sentences'), false); assert.equal(sentence.workflow, 'draft'); assert.equal(sentence.displayId, undefined);
  await failure(() => create(input('sentences')), 'failed-precondition');
  await failure(() => invoke(listKnowledgeRecords, 'reviewer-a', { scope: 'review' }), 'permission-denied');
  await failure(() => release(sentence), 'permission-denied');
  await db.doc('knowledgePolicies/current').set(policy);
});
test('scoped reviewers authenticate exact revisions and releases retain expression type', async () => {
  const r = await create();
  await failure(() => invoke(reviewKnowledgeRecord, 'unqualified-admin', { ...review(), id: r.id }, 'admin'), 'permission-denied');
  const gold = await authenticate(r); assert.equal(gold.authentication, 'gold'); assert.equal(gold.workflow, 'review_complete');
  const published = await release(gold); assert.equal(published.manifest.revision, r.revision);
  const references = await invoke(resolveKnowledgeRecords, 'reader', { destination: 'venacula' });
  const found = references.records.find(x => x.recordId === r.id); assert.equal(found.category, 'expressions'); assert.equal(found.revision, 1);
  assert.equal('authorUid' in found, false); assert.equal('rights' in found, false);
  assert.equal((await db.collection('dictionaryEntries').get()).size, 0);
  const latest = await invoke(saveKnowledgeRecord, 'owner', { id: r.id, revision: r.revision, requestId: 'gold-edited-123', submit: true, record: input() });
  assert.equal(latest.record.authentication, 'community');
  assert.equal((await invoke(resolveKnowledgeRecords, 'reader', { destination: 'venacula' })).records.some(x => x.recordId === r.id), false);
});
test('rights withdrawal, release revocation and reviewer-grant revocation remove references', async () => {
  const r = await authenticate(await create()); await release(r);
  await invoke(revokeKnowledgeRelease, 'owner', { id: r.id, destination: 'venacula', reason: 'Test owner withdrew public permission.' });
  assert.equal((await invoke(resolveKnowledgeRecords, 'reader')).records.some(x => x.recordId === r.id), false);
  await release(r);
  await db.doc('knowledgeRoleGrants/reviewer-b').update({ active: false });
  assert.equal((await invoke(resolveKnowledgeRecords, 'reader')).records.some(x => x.recordId === r.id), false);
  await db.doc('knowledgeRoleGrants/reviewer-b').set(grant);
  await invoke(withdrawKnowledgeRecord, 'owner', { id: r.id, revision: 1 });
  assert.equal((await db.doc(`knowledgeReleases/${r.id}-venacula`).get()).exists, false);
  assert.equal((await db.doc(`knowledgeRevocations/${r.id}`).get()).get('status'), 'future_use_blocked');
  assert.equal((await invoke(resolveKnowledgeRecords, 'reader')).records.some(x => x.recordId === r.id), false);
});
test('rights and related records are checked before release', async () => {
  const r = input(); r.rights.state = 'unresolved'; r.permissions.sourceConfirmed = false;
  const gold = await authenticate(await create(r)); await failure(() => release(gold), 'failed-precondition');
  const bad = input(); bad.relations = [{ type: 'supports', recordId: 'KSM-lexicon-123456789012', revision: 1 }];
  await failure(() => create(bad), 'invalid-argument');
  const target = await authenticate(await create()); await release(target);
  const linked = input(); linked.relations = [{ type: 'supports', recordId: target.id, revision: 1 }];
  const source = await authenticate(await create(linked)); await release(source);
  await invoke(withdrawKnowledgeRecord, 'owner', { id: target.id, revision: 1 });
  assert.equal((await invoke(resolveKnowledgeRecords, 'reader')).records.some(x => x.recordId === source.id), false);
});
test('held-out source families cannot leak into retrieval or training exports', async () => {
  const heldout = input('qa'); heldout.split = 'evaluation'; heldout.sourceFamily = 'same-test-family';
  const r = await authenticate(await create(heldout)); await release(r, 'evaluation');
  await failure(() => release(r, 'kawuri'), 'failed-precondition');
  const train = input(); train.split = 'train'; train.sourceFamily = heldout.sourceFamily;
  const t = await authenticate(await create(train)); await failure(() => release(t, 'training'), 'failed-precondition');
  await failure(() => invoke(exportKnowledgeRecords, 'owner', { destination: 'evaluation' }), 'permission-denied');
  const exported = await invoke(exportKnowledgeRecords, 'manager', { destination: 'evaluation' });
  assert.equal(exported.records.some(x => x.recordId === r.id), true); assert.ok(exported.manifest.id);
  await invoke(withdrawKnowledgeRecord, 'owner', { id: r.id, revision: 1 });
  assert.equal((await invoke(exportKnowledgeRecords, 'manager', { destination: 'evaluation' })).records.some(x => x.recordId === r.id), false);
});
test('history metrics count submitted objects once and use server timestamps', async () => {
  const progress = await invoke(getKnowledgeProgress, 'owner');
  assert.equal(progress.timezone, 'UTC'); assert.ok(Date.parse(progress.refreshedAt));
  const all = await db.collection('knowledgeRecords').where('authorUid', '==', 'owner').get();
  assert.equal(progress.submitted, all.docs.filter(d => d.get('submittedAt')).length);
  assert.equal(Object.values(progress.counts).reduce((a, b) => a + b, 0), all.size);
});

test('governance changes are scoped, audited and immutable by policy version', async () => {
  await failure(() => invoke(configureKnowledgeGovernance, 'admin', { action: 'policy', policy, reason: 'Synthetic governance test' }, 'admin'), 'permission-denied');
  const next = { ...policy, version: 'test-policy-v2' };
  await invoke(configureKnowledgeGovernance, 'super', { action: 'policy', policy: next, reason: 'Synthetic governance test' }, 'super_admin');
  await failure(() => invoke(configureKnowledgeGovernance, 'super', { action: 'policy', policy: { ...next, reviewerQuorum: 1 }, reason: 'Attempted version overwrite' }, 'super_admin'), 'already-exists');
  assert.equal((await db.doc('knowledgePolicyVersions/test-policy-v2').get()).get('policy.reviewerQuorum'), 2);
  await invoke(configureKnowledgeGovernance, 'super', { action: 'grant', uid: 'new-reviewer', grant, reason: 'Synthetic qualification decision' }, 'super_admin');
  assert.equal((await db.doc('knowledgeRoleGrants/new-reviewer').get()).get('policyVersion'), next.version);
  assert.ok((await db.collection('knowledgeGovernanceEvents').get()).size >= 2);
  await db.doc('knowledgePolicies/current').set(policy);
});
