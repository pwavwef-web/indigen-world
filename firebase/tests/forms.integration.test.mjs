import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { after, before, beforeEach, test } from 'node:test';
import { deleteApp, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { deleteApp as deleteClient, initializeApp as clientApp } from 'firebase/app';
import { connectAuthEmulator, getAuth as clientAuth, signInWithCustomToken } from 'firebase/auth';
import { connectStorageEmulator, getBytes, getStorage as clientStorage, ref as storageRef, uploadBytes } from 'firebase/storage';
import { ANSWERS_BYTE_BUDGET, answersByteSize, emptyDefinition, largestAnswers } from '../../packages/contracts/forms.mjs';
import { OWNER_UID, verifiedStaff } from './fixtures/staffSession.mjs';

/**
 * Indigen Forms end to end against the Auth, Firestore and Storage emulators,
 * calling the compiled callables directly (the Functions emulator does not
 * load on Node 24 here). Run through `npm run test:forms`, which builds the
 * functions and starts the emulators from .forms-test.firebase.json.
 */

process.env.FUNCTIONS_EMULATOR = 'true';
const projectId = process.env.GCLOUD_PROJECT ?? 'demo-indigen-forms';
const bucketName = `${projectId}.appspot.com`;

const ALICE = 'forms-alice';
const BOB = 'forms-bob';
const CAROL = 'forms-carol';
const DAVE = 'forms-dave';
const ADMIN = 'forms-admin';
const PUBLISHER = 'forms-publisher';
const KASEM = 'test-ʋ̀ʋ́ test-ɩ́ɔ̀ à́';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const DAY = 24 * 60 * 60 * 1000;
const EXE = Buffer.concat([Buffer.from('MZ\x90\x00\x03\x00\x00\x00', 'latin1'), Buffer.alloc(120, 0x41)]);

let app;
let db;
let formsAdmin;
let formsContributor;
let uploadsModule;

const rid = () => crypto.randomUUID();
const bytes = (value) => Buffer.from(value, 'utf8');
const hash = (value) => createHash('sha256').update(value).digest('hex');
const rejects = (promise, code, check) => assert.rejects(promise, (error) => {
  assert.equal(error.code, code, `${error.code}: ${error.message}`);
  if (check) check(error);
  return true;
});
const staffRequest = (uid, data, { role = 'admin', verified = true, claims = {} } = {}) => ({
  auth: { uid, token: { uid, role, ...(verified ? verifiedStaff() : { auth_time: Math.floor(Date.now() / 1000) - 60 }), ...claims } },
  data,
  rawRequest: { headers: {} },
});
const admin = (data, options) => formsAdmin.run(staffRequest(ADMIN, data, options));
const as = (uid, data, options) => formsAdmin.run(staffRequest(uid, data, options));
const owner = (data) => formsAdmin.run(staffRequest(OWNER_UID, data, { role: 'super_admin', claims: { superAdmin: true } }));
const contributor = (uid, data) => formsContributor.run({ auth: { uid, token: { uid } }, data, rawRequest: { headers: { origin: 'http://localhost:5173' } } });
const responseDoc = async (id) => (await db.doc(`indigenFormResponses/${id}`).get()).data();
const formDoc = async (id) => (await db.doc(`indigenForms/${id}`).get()).data();
const when = (fieldId, operator, value) => ({ match: 'all', conditions: [{ fieldId, operator, ...(value === undefined ? {} : { value }) }] });

/** A small Navrongo-only form with a conditional, a required conditional, an image upload and consent. */
const definitionV1 = () => ({
  ...emptyDefinition(),
  title: 'Navrongo word check',
  description: 'Synthetic test form.',
  category: 'word_collection',
  sections: [{
    id: 'main', title: 'Words', description: '', visibleWhen: null,
    fields: [
      { id: 'word', type: 'short_text', label: 'Kasem word', required: true, settings: { maxLength: 120, kasemKeyboard: true } },
      { id: 'has_source', type: 'single_choice', label: 'Do you have a written source?', required: true, settings: { options: [{ id: 'yes', label: 'Yes' }, { id: 'no', label: 'No' }] } },
      { id: 'source', type: 'short_text', label: 'Source', visibleWhen: when('has_source', 'equals', 'yes'), requiredWhen: when('has_source', 'equals', 'yes'), settings: {} },
      { id: 'photo', type: 'image', label: 'Photo', settings: { formats: ['png'], maxSizeMb: 1, maxFiles: 2 } },
      { id: 'consent_review', type: 'consent', label: 'Permission', required: true, settings: { consentPurpose: 'review', statement: 'Indigen World reviewers may assess this.' } },
    ],
  }],
  audience: { mode: 'groups', dialectIds: ['navrongo'], contributionTypes: [], cohortIds: [] },
  review: { required: true, reviewerGroup: 'reviewers', instructions: '', checks: [], points: 2 },
});

/** Version 2: a relabelled word, `source` removed, a new required `meaning`. */
const definitionV2 = () => {
  const definition = definitionV1();
  const fields = definition.sections[0].fields;
  fields[0].label = 'Kasem word (with tone marks)';
  definition.sections[0].fields = [fields[0], fields[1], { id: 'meaning', type: 'short_text', label: 'English meaning', required: true, settings: {} }, fields[3], fields[4]];
  return definition;
};

async function publishNew(definition, publisher = ADMIN) {
  const { formId } = await as(publisher, { action: 'create', title: definition.title });
  const { revision } = await as(publisher, { action: 'saveDraft', formId, definition, version: 1, expectedRevision: 1 });
  await as(publisher, { action: 'publish', formId, version: 1, expectedRevision: revision });
  return formId;
}

before(async () => {
  for (const name of ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST', 'FIREBASE_STORAGE_EMULATOR_HOST']) {
    assert.ok(process.env[name], `${name} must point at an emulator; never run this against production.`);
  }
  // The Storage client reads STORAGE_EMULATOR_HOST (with a scheme).
  process.env.STORAGE_EMULATOR_HOST ??= `http://${process.env.FIREBASE_STORAGE_EMULATOR_HOST}`;
  app = initializeApp({ projectId, storageBucket: bucketName });
  db = getFirestore(app);
  ({ formsAdmin } = await import('../../services/functions/lib/forms-admin.js'));
  ({ formsContributor } = await import('../../services/functions/lib/forms-contributor.js'));
  uploadsModule = await import('../../services/functions/lib/forms-uploads.js');
  const auth = getAuth(app);
  await auth.createUser({ uid: ALICE, email: 'alice@example.test', displayName: 'Alice Asaa' });
  await auth.createUser({ uid: PUBLISHER, email: 'publisher@example.test', displayName: 'Publishing Admin' });
  await auth.createUser({ uid: ADMIN, email: 'admin@example.test', displayName: 'Forms Admin' });
  for (const uid of [ALICE, BOB]) await db.doc(`contributorAccounts/${uid}`).set({ status: 'active', requiresPasswordChange: false });
  await db.doc(`contributorAccounts/${CAROL}`).set({ status: 'revoked' });
  await db.doc(`contributors/${ALICE}`).set({ public: { displayName: 'Alice Asaa' }, languageProfile: { dialect: 'Navrongo' }, contributionTypes: ['audio'] });
  await db.doc(`contributors/${BOB}`).set({ public: { displayName: 'Bob Bawa' }, languageProfile: { dialect: 'Paga' } });
});
beforeEach(async () => {
  // Rate limits are exercised by their own module; these scenarios submit more than ten times a minute.
  await db.recursiveDelete(db.collection('_rateLimits'));
});
after(async () => {
  if (app) await deleteApp(app);
});

const state = {};

test('only verified administrators reach formsAdmin', async () => {
  await rejects(formsAdmin.run({ auth: { uid: ALICE, token: { uid: ALICE } }, data: { action: 'overview' } }), 'permission-denied');
  await rejects(as('forms-reviewer', { action: 'overview' }, { role: 'validator' }), 'permission-denied');
  await rejects(admin({ action: 'overview' }, { verified: false }), 'failed-precondition', (error) => assert.equal(error.details.reason, 'staff-mfa-required'));
  await rejects(formsAdmin.run({ auth: null, data: { action: 'overview' } }), 'unauthenticated');
  await rejects(admin({ action: 'nonsense' }), 'invalid-argument');
});

test('an administrator creates a form from a template and publishes it without code', async () => {
  const { formId } = await admin({ action: 'create', templateId: 'kasem_word_collection' });
  const loaded = await admin({ action: 'get', formId });
  assert.equal(loaded.form.status, 'draft');
  assert.equal(loaded.draft.version, 1);
  assert.equal(loaded.draft.revision, 1);
  assert.deepEqual(loaded.draft.issues, []);
  assert.equal(loaded.current, null);
  const preview = await admin({ action: 'publishPreview', formId });
  assert.deepEqual(preview.issues, []);
  assert.equal(preview.summary.title, 'Kasem word collection');
  await rejects(admin({ action: 'publish', formId, version: 1, expectedRevision: 7 }), 'aborted', (error) => assert.equal(error.details.reason, 'conflict'));
  assert.deepEqual(await admin({ action: 'publish', formId, version: 1, expectedRevision: 1 }), { version: 1, status: 'published' });
  const published = await admin({ action: 'get', formId });
  assert.equal(published.form.status, 'published');
  assert.equal(published.form.currentVersion, 1);
  assert.equal(published.draft, null);
  assert.equal(published.current.version, 1);
  const version = (await db.doc(`indigenForms/${formId}/formVersions/1`).get()).data();
  assert.equal(version.state, 'published');
  assert.match(version.schemaHash, /^[a-f0-9]{64}$/);
  const audit = await db.collection('auditLogs').where('domain', '==', 'indigen-forms').get();
  const actions = audit.docs.filter((doc) => doc.get('metadata.formId') === formId).map((doc) => doc.get('action'));
  assert.ok(actions.includes('forms.create') && actions.includes('forms.publish'));
  await rejects(admin({ action: 'create', templateId: 'no_such_template' }), 'invalid-argument');
  state.templateForm = formId;
});

test('an eligible contributor lists, opens, saves and submits; tone marks are stored byte for byte', async () => {
  const formId = await publishNew(definitionV1());
  state.wordForm = formId;
  const listed = await contributor(ALICE, { action: 'list' });
  const entry = listed.forms.find((form) => form.id === formId);
  assert.ok(entry, 'the Navrongo form is listed for a Navrongo speaker');
  assert.equal(entry.open, true);
  assert.equal(entry.version, 1);
  const opened = await contributor(ALICE, { action: 'open', formId });
  assert.equal(opened.response, null);
  assert.equal(opened.canStartNew, true);
  assert.equal(opened.window.open, true);

  const requestId = rid();
  const first = await contributor(ALICE, { action: 'saveDraft', formId, version: 1, answers: { word: KASEM, has_source: 'yes', source: 'Grandmother' }, requestId });
  assert.equal(first.draftRevision, 1);
  assert.deepEqual(await contributor(ALICE, { action: 'saveDraft', formId, version: 1, answers: { word: KASEM, has_source: 'yes', source: 'Grandmother' }, requestId }), first, 'a retried save replays');
  const second = await contributor(ALICE, { action: 'saveDraft', formId, responseId: first.responseId, version: 1, expectedDraftRevision: 1, answers: { word: KASEM, has_source: 'no', source: 'Grandmother' }, requestId: rid() });
  assert.equal(second.draftRevision, 2);
  await rejects(contributor(ALICE, { action: 'saveDraft', formId, responseId: first.responseId, version: 1, expectedDraftRevision: 1, answers: {}, requestId: rid() }), 'aborted',
    (error) => assert.equal(error.details.reason, 'conflict'));
  await rejects(contributor(ALICE, { action: 'saveDraft', formId, responseId: first.responseId, version: 1, answers: { word: 'x', status: 'approved' }, requestId: rid() }), 'invalid-argument',
    (error) => assert.deepEqual(error.details.issues.map((issue) => issue.path), ['status']));
  const reopened = await contributor(ALICE, { action: 'open', formId });
  assert.equal(reopened.response.id, first.responseId);
  assert.equal(reopened.response.answers.source, 'Grandmother', 'a draft keeps hidden answers so a toggle restores them');

  // Required-when is enforced on the server, and unknown keys are refused.
  await rejects(contributor(ALICE, { action: 'submit', responseId: first.responseId, answers: { word: KASEM, has_source: 'yes', consent_review: true }, expectedDraftRevision: 2, requestId: rid() }),
    'failed-precondition', (error) => { assert.equal(error.details.reason, 'invalid'); assert.deepEqual(error.details.issues.map((issue) => issue.path), ['source']); });
  await rejects(contributor(ALICE, { action: 'submit', responseId: first.responseId, answers: { word: KASEM, has_source: 'no', consent_review: true, reviewerUid: ALICE }, expectedDraftRevision: 2, requestId: rid() }),
    'failed-precondition', (error) => assert.ok(error.details.issues.some((issue) => issue.path === 'reviewerUid')));

  const submitRequest = rid();
  const answers = { word: `  ${KASEM} `, has_source: 'no', source: 'Grandmother', consent_review: true };
  const submitted = await contributor(ALICE, { action: 'submit', responseId: first.responseId, answers, expectedDraftRevision: 2, requestId: submitRequest });
  assert.equal(submitted.status, 'submitted');
  assert.equal(submitted.revision, 1);
  assert.equal(submitted.replayed, false);
  assert.match(submitted.referenceId, /^IWF-[0-9A-Z]{4}-[0-9A-Z]{4}$/);
  const replay = await contributor(ALICE, { action: 'submit', responseId: first.responseId, answers, expectedDraftRevision: 2, requestId: submitRequest });
  assert.equal(replay.replayed, true);
  assert.equal(replay.referenceId, submitted.referenceId);
  await rejects(contributor(ALICE, { action: 'submit', responseId: first.responseId, answers, expectedDraftRevision: 3, requestId: rid() }), 'failed-precondition',
    (error) => assert.equal(error.details.reason, 'not-editable'));

  const stored = await responseDoc(first.responseId);
  assert.ok(bytes(stored.answers.word).equals(bytes(KASEM)), 'tone marks and combining characters are byte-identical');
  assert.equal('source' in stored.answers, false, 'the hidden conditional answer is stripped on the server');
  assert.equal(stored.workingAnswers, null);
  assert.equal(stored.formVersion, 1);
  assert.deepEqual(stored.grantedPurposes, ['review']);
  assert.equal(stored.consents[0].statement, 'Indigen World reviewers may assess this.');
  const revisions = await db.collection(`indigenFormResponses/${first.responseId}/formRevisions`).get();
  assert.equal(revisions.size, 1, 'double submits create exactly one revision');
  assert.ok(bytes(revisions.docs[0].get('answers.word')).equals(bytes(KASEM)));
  const own = await db.collection('indigenFormResponses').where('contributorUid', '==', ALICE).where('formId', '==', formId).get();
  assert.equal(own.size, 1, 'and exactly one response');
  const head = await formDoc(formId);
  assert.equal(head.counts.submitted, 1);
  assert.equal(head.counts.draft, 0);
  assert.equal(head.totalSubmitted, 1);

  const mine = await contributor(ALICE, { action: 'getMine', responseId: first.responseId });
  assert.equal(mine.status, 'submitted');
  assert.deepEqual(mine.allowedDecisions, []);
  assert.deepEqual(mine.history.map((event) => event.type), ['created', 'submitted']);
  assert.equal(mine.history[1].actorName, 'Alice Asaa');
  assert.equal(mine.revisions.length, 1);
  state.responseA = first.responseId;
});

test('audience, inactive accounts and direct requests are enforced on the server', async () => {
  const formId = state.wordForm;
  assert.equal((await contributor(BOB, { action: 'list' })).forms.some((form) => form.id === formId), false);
  await rejects(contributor(BOB, { action: 'open', formId }), 'permission-denied');
  await rejects(contributor(BOB, { action: 'saveDraft', formId, version: 1, answers: { word: 'x' }, requestId: rid() }), 'permission-denied');
  // Eligible when the draft was started, not any more when submitting directly.
  await db.doc(`contributors/${BOB}`).set({ languageProfile: { dialect: 'Navrongo' } }, { merge: true });
  const draft = await contributor(BOB, { action: 'saveDraft', formId, version: 1, answers: { word: 'bɔ' }, requestId: rid() });
  await db.doc(`contributors/${BOB}`).set({ languageProfile: { dialect: 'Paga' } }, { merge: true });
  await rejects(contributor(BOB, { action: 'submit', responseId: draft.responseId, answers: { word: 'bɔ', has_source: 'no', consent_review: true }, expectedDraftRevision: 1, requestId: rid() }), 'permission-denied');
  await rejects(contributor(BOB, { action: 'getMine', responseId: state.responseA }), 'not-found');
  await rejects(contributor(BOB, { action: 'submit', responseId: state.responseA, answers: {}, expectedDraftRevision: 0, requestId: rid() }), 'not-found');
  assert.deepEqual(await contributor(BOB, { action: 'discardDraft', responseId: draft.responseId }), { discarded: true });
  assert.equal(await responseDoc(draft.responseId), undefined);
  assert.equal((await formDoc(formId)).counts.draft, 0);
  await rejects(contributor(CAROL, { action: 'list' }), 'permission-denied');
  await rejects(contributor(DAVE, { action: 'list' }), 'permission-denied');
  await rejects(formsContributor.run({ auth: null, data: { action: 'list' } }), 'unauthenticated');
});

test('pausing and closing block submission on the server but keep drafts', async () => {
  const formId = state.wordForm;
  const draft = await contributor(ALICE, { action: 'saveDraft', formId, version: 1, answers: { word: 'tɩ', has_source: 'no', consent_review: true }, requestId: rid() });
  assert.deepEqual(await admin({ action: 'setStatus', formId, status: 'paused', reason: 'Checking wording' }), { status: 'paused' });
  await rejects(contributor(ALICE, { action: 'submit', responseId: draft.responseId, answers: { word: 'tɩ', has_source: 'no', consent_review: true }, expectedDraftRevision: 1, requestId: rid() }),
    'failed-precondition', (error) => assert.equal(error.details.reason, 'paused'));
  const kept = await contributor(ALICE, { action: 'saveDraft', formId, responseId: draft.responseId, version: 1, expectedDraftRevision: 1, answers: { word: 'tɩ', has_source: 'no', consent_review: true }, requestId: rid() });
  assert.equal(kept.draftRevision, 2, 'a paused form keeps its drafts editable');
  const listed = (await contributor(ALICE, { action: 'list' })).forms.find((form) => form.id === formId);
  assert.equal(listed.open, false);
  assert.equal(listed.closedReason, 'paused');
  await admin({ action: 'setStatus', formId, status: 'published' });
  await admin({ action: 'setStatus', formId, status: 'closed' });
  await rejects(contributor(ALICE, { action: 'submit', responseId: draft.responseId, answers: { word: 'tɩ', has_source: 'no', consent_review: true }, expectedDraftRevision: 2, requestId: rid() }),
    'failed-precondition', (error) => assert.equal(error.details.reason, 'closed'));
  assert.equal((await responseDoc(draft.responseId)).status, 'draft');
  await admin({ action: 'setStatus', formId, status: 'published' });
  await rejects(admin({ action: 'setStatus', formId, status: 'archived' }), 'failed-precondition');
  state.draftA = draft.responseId;
});

test('republishing creates version 2; version-1 responses and drafts keep their version until it is retired', async () => {
  const formId = state.wordForm;
  const draftB = await contributor(ALICE, { action: 'saveDraft', formId, version: 1, answers: { word: 'retire me', has_source: 'yes', source: 'A book', consent_review: true }, requestId: rid() });
  const revisionBefore = (await db.doc(`indigenFormResponses/${state.responseA}/formRevisions/1`).get()).data();
  const versionBefore = (await db.doc(`indigenForms/${formId}/formVersions/1`).get()).data();

  // Version 1 was published at revision 2; the new draft's revisions carry on from there.
  assert.deepEqual(await admin({ action: 'startDraft', formId }), { version: 2, revision: 3 });
  assert.deepEqual(await admin({ action: 'startDraft', formId }), { version: 2, revision: 3 }, 'an existing draft is reused');
  await rejects(admin({ action: 'saveDraft', formId, definition: definitionV2(), version: 2, expectedRevision: 0 }), 'aborted', (error) => {
    assert.equal(error.details.reason, 'conflict');
    assert.equal(error.details.revision, 3);
    assert.equal(error.details.version, 2);
    assert.equal(typeof error.details.updatedByName, 'string');
  });
  const saved = await admin({ action: 'saveDraft', formId, definition: definitionV2(), version: 2, expectedRevision: 3 });
  assert.equal(saved.revision, 4);
  assert.deepEqual(await admin({ action: 'publish', formId, version: 2, expectedRevision: 4 }), { version: 2, status: 'published' });

  const response = await responseDoc(state.responseA);
  assert.equal(response.formVersion, 1, 'the version-1 response keeps its version');
  assert.deepEqual((await db.doc(`indigenFormResponses/${state.responseA}/formRevisions/1`).get()).data(), revisionBefore, 'its snapshot is unchanged');
  assert.deepEqual((await db.doc(`indigenForms/${formId}/formVersions/1`).get()).data(), versionBefore, 'published versions are immutable');

  const opened = await contributor(ALICE, { action: 'open', formId, responseId: state.draftA });
  assert.equal(opened.version, 1);
  assert.equal(opened.newerVersion, 2);
  assert.equal(opened.window.open, true);
  const fromV1 = await contributor(ALICE, { action: 'submit', responseId: state.draftA, answers: { word: 'tɩ', has_source: 'no', consent_review: true }, expectedDraftRevision: 2, requestId: rid() });
  assert.equal(fromV1.status, 'submitted');
  assert.equal((await responseDoc(state.draftA)).formVersion, 1);
  await rejects(contributor(ALICE, { action: 'saveDraft', formId, version: 1, answers: { word: 'new on old' }, requestId: rid() }), 'failed-precondition',
    (error) => assert.equal(error.details.reason, 'version'));

  await rejects(admin({ action: 'retireVersion', formId, version: 2 }), 'failed-precondition');
  assert.deepEqual(await admin({ action: 'retireVersion', formId, version: 1 }), { version: 1, state: 'retired' });
  await rejects(contributor(ALICE, { action: 'submit', responseId: draftB.responseId, answers: { word: 'retire me', has_source: 'no', consent_review: true }, expectedDraftRevision: 1, requestId: rid() }),
    'failed-precondition', (error) => assert.equal(error.details.reason, 'retired'));
  const moved = await contributor(ALICE, { action: 'moveToLatest', responseId: draftB.responseId });
  assert.equal(moved.version, 2);
  assert.deepEqual([...moved.dropped].sort(), ['consent_review', 'source'], 'a permission is never carried to another version');
  const movedDoc = await responseDoc(draftB.responseId);
  assert.equal(movedDoc.formVersion, 2);
  assert.equal('source' in movedDoc.workingAnswers, false);
  assert.equal('consent_review' in movedDoc.workingAnswers, false);
  const fromV2 = await contributor(ALICE, { action: 'submit', responseId: draftB.responseId, answers: { word: 'retire me', has_source: 'no', meaning: 'a test word', consent_review: true }, expectedDraftRevision: 2, requestId: rid() });
  assert.equal(fromV2.revision, 1);
  assert.equal((await formDoc(formId)).retiredVersions.includes(1), true);

  // A later version may not reuse an answer key for another question type.
  const started3 = await admin({ action: 'startDraft', formId });
  assert.deepEqual(started3, { version: 3, revision: 5 });
  const retyped = definitionV2();
  retyped.sections[0].fields[0] = { ...retyped.sections[0].fields[0], type: 'long_text' };
  const draft3 = await admin({ action: 'saveDraft', formId, definition: retyped, version: 3, expectedRevision: started3.revision });
  assert.ok((await admin({ action: 'publishPreview', formId })).issues.some((issue) => issue.path === 'word'));
  await rejects(admin({ action: 'publish', formId, version: 3, expectedRevision: draft3.revision }), 'failed-precondition', (error) => assert.equal(error.details.reason, 'invalid'));
  assert.deepEqual(await admin({ action: 'discardDraft', formId, version: 3, expectedRevision: draft3.revision }), { discarded: true });
  assert.equal((await formDoc(formId)).latestVersion, 3, 'a discarded version number is never given out again');
  state.responseB = draftB.responseId;
});

test('a once-only form accepts one response per contributor', async () => {
  const formId = await publishNew({
    ...emptyDefinition(),
    title: 'One response each',
    sections: [{ id: 'main', title: '', description: '', visibleWhen: null, fields: [{ id: 'answer', type: 'long_text', label: 'Your answer', required: true, settings: {} }] }],
    submission: { policy: 'once', allowDrafts: true, allowAttachments: true, successMessage: 'Thank you.', nextSteps: '' },
  });
  const draft = await contributor(ALICE, { action: 'saveDraft', formId, version: 1, answers: { answer: KASEM }, requestId: rid() });
  assert.equal(draft.responseId, `${formId}_${hash(`once:${ALICE}`).slice(0, 24)}`);
  // A second blank start (another tab) meets the same draft instead of creating another response.
  await rejects(contributor(ALICE, { action: 'saveDraft', formId, version: 1, answers: { answer: 'second tab' }, requestId: rid() }), 'aborted');
  await contributor(ALICE, { action: 'submit', responseId: draft.responseId, answers: { answer: KASEM }, expectedDraftRevision: 1, requestId: rid() });
  await rejects(contributor(ALICE, { action: 'saveDraft', formId, version: 1, answers: { answer: 'again' }, requestId: rid() }), 'failed-precondition',
    (error) => assert.equal(error.details.reason, 'not-editable'));
  assert.equal((await contributor(ALICE, { action: 'open', formId })).canStartNew, false);
});

test('exports carry version ids, stable keys and exact tone marks; approved scope and permissions hold', async () => {
  const formId = state.wordForm;
  const csv = await admin({ action: 'export', formId, format: 'csv', scope: 'submitted' });
  assert.equal(csv.count, 3);
  assert.match(csv.filename, /^indigen-forms-navrongo-word-check-submitted-\d{4}-\d{2}-\d{2}\.csv$/);
  const [header, ...rows] = csv.content.replace(/^﻿/, '').trim().split('\r\n');
  const columns = header.split(',').map((cell) => cell.replace(/^"|"$/g, ''));
  for (const key of ['form_version', 'word', 'has_source', 'meaning', 'photo', 'consent_review', 'source']) assert.ok(columns.includes(key), key);
  const versionColumn = columns.indexOf('form_version');
  assert.deepEqual(rows.map((row) => row.split(',')[versionColumn]).sort(), ['1', '1', '2']);
  assert.ok(bytes(csv.content).includes(bytes(KASEM)));
  assert.equal(csv.content.includes('Grandmother'), false, 'hidden answers never reach an export');
  assert.equal(csv.content.includes('retire me') && !csv.content.includes('A book'), true, 'submitted answers only, never unsent edits');

  const json = JSON.parse((await admin({ action: 'export', formId, format: 'json', scope: 'submitted' })).content);
  assert.deepEqual(json.versions.map((version) => version.version), [1, 2]);
  const exportedA = json.responses.find((response) => response.id === state.responseA);
  assert.ok(bytes(exportedA.answers.word).equals(bytes(KASEM)));
  assert.equal(exportedA.formVersion, 1);

  assert.equal((await admin({ action: 'export', formId, format: 'csv', scope: 'approved' })).count, 0);
  await db.doc(`indigenFormResponses/${state.responseA}`).update({ status: 'approved', decidedAt: new Date().toISOString() });
  const approved = await admin({ action: 'export', formId, format: 'csv', scope: 'approved' });
  assert.equal(approved.count, 1);
  const audits = await db.collection('auditLogs').where('action', '==', 'forms.export').get();
  const latest = audits.docs.map((doc) => doc.data()).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))[0];
  assert.equal(latest.metadata.count, 1);
  assert.equal(latest.metadata.scope, 'approved');
  assert.equal(JSON.stringify(audits.docs.map((doc) => doc.data())).includes('test-ʋ̀ʋ́'), false, 'audit rows never carry answers');

  await db.doc('settings/indigenForms').set({ exporters: ['someone-else'] }, { merge: true });
  await rejects(admin({ action: 'export', formId, format: 'csv', scope: 'submitted' }), 'permission-denied');
  await db.doc('settings/indigenForms').set({ exporters: [] }, { merge: true });
});

test('publishing, access lists and points limits each have their own permission', async () => {
  await rejects(admin({ action: 'saveAccess', publishers: [], exporters: [] }), 'permission-denied');
  await rejects(owner({ action: 'saveAccess', publishers: ['nobody@example.test'], exporters: [] }), 'invalid-argument',
    (error) => assert.deepEqual(error.details.unknown, ['nobody@example.test']));
  const access = await owner({ action: 'saveAccess', publishers: ['publisher@example.test'], exporters: [] });
  assert.deepEqual(access.publishers, [{ uid: PUBLISHER, name: 'Publishing Admin' }]);
  assert.equal((await admin({ action: 'access' })).canPublish, false);

  const { formId } = await admin({ action: 'create', templateId: 'general_feedback' });
  await rejects(admin({ action: 'publish', formId, version: 1, expectedRevision: 1 }), 'permission-denied');
  assert.equal((await as(PUBLISHER, { action: 'publish', formId, version: 1, expectedRevision: 1 })).status, 'published');
  await admin({ action: 'setStatus', formId, status: 'paused' });
  await rejects(admin({ action: 'setStatus', formId, status: 'published' }), 'permission-denied'); // reopening is publishing
  await as(PUBLISHER, { action: 'setStatus', formId, status: 'published' });
  await owner({ action: 'saveAccess', publishers: [], exporters: [] });

  await rejects(admin({ action: 'saveRewardSettings', enabled: true, maxPointsPerResponse: 10, dailyCap: 50 }), 'permission-denied');
  const finance = (data) => formsAdmin.run(staffRequest('forms-finance', data, { claims: { finance: true } }));
  await rejects(finance({ action: 'saveRewardSettings', enabled: true, maxPointsPerResponse: 500, dailyCap: 50 }), 'invalid-argument');
  const rewards = await finance({ action: 'saveRewardSettings', enabled: true, maxPointsPerResponse: 1, dailyCap: 50 });
  assert.deepEqual(rewards.rewards, { enabled: true, maxPointsPerResponse: 1, dailyCap: 50 });
  // The word form awards 2 points: a new version above Finance's ceiling cannot be published.
  const { version } = await admin({ action: 'startDraft', formId: state.wordForm });
  const preview = await admin({ action: 'publishPreview', formId: state.wordForm });
  assert.ok(preview.issues.some((issue) => issue.path === 'review.points'));
  const { revision } = await admin({ action: 'get', formId: state.wordForm }).then((loaded) => loaded.draft);
  await admin({ action: 'discardDraft', formId: state.wordForm, version, expectedRevision: revision });
  assert.equal(version, 4, 'the discarded version 3 is not reused');
  await finance({ action: 'saveRewardSettings', enabled: true, maxPointsPerResponse: 20, dailyCap: 100 });
});

test('uploads: a real PNG is accepted after inspection, a renamed program is rejected and deleted', async (t) => {
  const formId = state.wordForm;
  const bucket = getStorage(app).bucket();
  const draft = await contributor(ALICE, { action: 'saveDraft', formId, version: 2, answers: { word: 'leaf' }, requestId: rid() });
  const begin = async (name, contentType, size) => {
    try {
      return await contributor(ALICE, { action: 'beginUpload', responseId: draft.responseId, fieldId: 'photo', name, contentType, size });
    } catch (error) {
      if (error.code !== 'internal') throw error;
      // The Storage emulator may not offer resumable sessions; register the upload the way beginUpload does.
      t.diagnostic(`createResumableUpload unavailable on the emulator (${error.message.slice(0, 80)}); registered the upload directly`);
      const uploadId = `up${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`;
      await db.doc(`indigenFormUploads/${uploadId}`).set({
        id: uploadId, ownerUid: ALICE, responseId: draft.responseId, formId, formVersion: 2, fieldId: 'photo', path: `form-uploads/${ALICE}/${uploadId}`,
        name, declaredType: contentType, declaredSize: size, status: 'pending', format: null, contentType: null, size: null, generation: null,
        sha256: null, rejectionReason: null, createdAt: new Date().toISOString(), confirmedAt: null,
      });
      return { uploadId, uploadUrl: null, maxBytes: 1024 * 1024 };
    }
  };
  /** Send the bytes the way the portal does (one PUT on the resumable session), or with the Admin SDK when there is no session. */
  const put = async (session, content, contentType) => {
    if (session.uploadUrl) {
      const response = await fetch(session.uploadUrl, { method: 'PUT', body: content, headers: { 'Content-Type': contentType, 'Content-Range': `bytes 0-${content.length - 1}/${content.length}` } });
      assert.ok(response.ok, `resumable PUT answered ${response.status}`);
    } else {
      await bucket.file(`form-uploads/${ALICE}/${session.uploadId}`).save(content, { contentType, resumable: false });
    }
  };

  await rejects(contributor(ALICE, { action: 'beginUpload', responseId: draft.responseId, fieldId: 'photo', name: 'leaf.exe', contentType: 'application/x-msdownload', size: 100 }), 'invalid-argument');
  await rejects(contributor(ALICE, { action: 'beginUpload', responseId: draft.responseId, fieldId: 'photo', name: 'leaf.png', contentType: 'image/png', size: 2 * 1024 * 1024 }), 'invalid-argument');
  await rejects(contributor(ALICE, { action: 'beginUpload', responseId: draft.responseId, fieldId: 'word', name: 'leaf.png', contentType: 'image/png', size: 100 }), 'invalid-argument');
  await rejects(contributor(BOB, { action: 'beginUpload', responseId: draft.responseId, fieldId: 'photo', name: 'leaf.png', contentType: 'image/png', size: 100 }), 'not-found');

  const good = await begin('leaf.png', 'image/png', PNG.length);
  assert.equal(good.maxBytes, 1024 * 1024);
  if (good.uploadUrl) assert.match(good.uploadUrl, /^https?:\/\//);
  await rejects(contributor(ALICE, { action: 'confirmUpload', uploadId: good.uploadId }), 'failed-precondition', (error) => assert.equal(error.details.reason, 'incomplete'));
  await put(good, PNG, 'image/png');
  await rejects(contributor(BOB, { action: 'confirmUpload', uploadId: good.uploadId }), 'not-found');
  const confirmed = await contributor(ALICE, { action: 'confirmUpload', uploadId: good.uploadId });
  assert.deepEqual(confirmed.attachment, { id: good.uploadId, name: 'leaf.png', contentType: 'image/png', size: PNG.length });
  assert.deepEqual(await contributor(ALICE, { action: 'confirmUpload', uploadId: good.uploadId }), confirmed, 'confirming twice is harmless');
  const ready = (await db.doc(`indigenFormUploads/${good.uploadId}`).get()).data();
  assert.equal(ready.status, 'ready');
  assert.equal(ready.format, 'png');
  assert.equal(ready.sha256, hash(PNG));
  assert.ok(ready.generation);

  const evil = await begin('holiday.png', 'image/png', EXE.length);
  await put(evil, EXE, 'image/png');
  await rejects(contributor(ALICE, { action: 'confirmUpload', uploadId: evil.uploadId }), 'invalid-argument', (error) => {
    assert.equal(error.details.reason, 'rejected-file');
    assert.match(error.message, /executable/i);
  });
  const rejected = (await db.doc(`indigenFormUploads/${evil.uploadId}`).get()).data();
  assert.equal(rejected.status, 'rejected');
  assert.equal((await bucket.file(`form-uploads/${ALICE}/${evil.uploadId}`).exists())[0], false, 'the rejected object is deleted');

  // The server's record of the file replaces whatever the client claims about it.
  await rejects(contributor(ALICE, { action: 'submit', responseId: draft.responseId, expectedDraftRevision: 1, requestId: rid(),
    answers: { word: 'leaf', has_source: 'no', meaning: 'leaf', consent_review: true, photo: [{ id: evil.uploadId, name: 'holiday.png', contentType: 'image/png', size: EXE.length }] } }), 'failed-precondition');
  const submitted = await contributor(ALICE, { action: 'submit', responseId: draft.responseId, expectedDraftRevision: 1, requestId: rid(),
    answers: { word: 'leaf', has_source: 'no', meaning: 'leaf', consent_review: true, photo: [{ id: good.uploadId, name: 'renamed.png', contentType: 'image/png', size: 1 }] } });
  const stored = await responseDoc(draft.responseId);
  assert.equal(submitted.status, 'submitted');
  assert.deepEqual(stored.answers.photo, [{ id: good.uploadId, name: 'leaf.png', contentType: 'image/png', size: PNG.length }]);
  assert.deepEqual(stored.attachmentIds, [good.uploadId]);
  const detail = await contributor(ALICE, { action: 'getMine', responseId: draft.responseId });
  assert.equal(detail.attachments[0].inspection, 'passed');

  // Another response cannot borrow this upload.
  const other = await contributor(ALICE, { action: 'saveDraft', formId, version: 2, answers: { word: 'borrow' }, requestId: rid() });
  await rejects(contributor(ALICE, { action: 'submit', responseId: other.responseId, expectedDraftRevision: 1, requestId: rid(),
    answers: { word: 'borrow', has_source: 'no', meaning: 'x', consent_review: true, photo: [confirmed.attachment] } }), 'invalid-argument');

  // A day later the rejected object is gone; the record waits for every upload session to expire.
  await bucket.file(`form-uploads/${ALICE}/${evil.uploadId}`).save(EXE, { contentType: 'image/png', resumable: false });
  await uploadsModule.sweepFormUploadsOnce(Date.now() + 2 * DAY);
  assert.equal((await bucket.file(`form-uploads/${ALICE}/${evil.uploadId}`).exists())[0], false, 'a late upload on a swept path is deleted');
  assert.equal((await db.doc(`indigenFormUploads/${evil.uploadId}`).get()).exists, true);
  const swept = await uploadsModule.sweepFormUploadsOnce(Date.now() + 9 * DAY);
  assert.ok(swept.deleted >= 1);
  assert.equal((await db.doc(`indigenFormUploads/${evil.uploadId}`).get()).exists, false);
  assert.equal((await db.doc(`indigenFormUploads/${good.uploadId}`).get()).exists, true, 'submitted attachments are never swept');
  assert.equal((await bucket.file(`form-uploads/${ALICE}/${good.uploadId}`).exists())[0], true);
  state.goodUpload = good.uploadId;
  state.draftOther = other.responseId;
});

test('clients cannot upload to or read form uploads directly', async () => {
  const client = clientApp({ apiKey: 'demo-key', projectId, storageBucket: bucketName }, 'forms-storage-client');
  try {
    connectAuthEmulator(clientAuth(client), `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, { disableWarnings: true });
    const [host, port] = process.env.FIREBASE_STORAGE_EMULATOR_HOST.split(':');
    connectStorageEmulator(clientStorage(client), host, Number(port));
    await signInWithCustomToken(clientAuth(client), await getAuth(app).createCustomToken(ALICE));
    await rejects(uploadBytes(storageRef(clientStorage(client), `form-uploads/${ALICE}/up_client_direct`), PNG, { contentType: 'image/png' }), 'storage/unauthorized');
    await rejects(getBytes(storageRef(clientStorage(client), `form-uploads/${ALICE}/${state.goodUpload}`)), 'storage/unauthorized');
  } finally {
    await deleteClient(client);
  }
});

test('the daily sweep removes abandoned responses of forms without drafts, never real drafts', async () => {
  const noDrafts = await publishNew({
    ...emptyDefinition(),
    title: 'Quick upload',
    sections: [{ id: 'main', title: '', description: '', visibleWhen: null, fields: [
      { id: 'note', type: 'short_text', label: 'Note', required: true, settings: {} },
      { id: 'scan', type: 'image', label: 'Scan', settings: { formats: ['png'], maxSizeMb: 1, maxFiles: 1 } },
    ] }],
    submission: { policy: 'multiple', allowDrafts: false, allowAttachments: true, successMessage: 'Thanks.', nextSteps: '' },
  });
  const abandoned = await contributor(ALICE, { action: 'saveDraft', formId: noDrafts, version: 1, answers: { note: 'left behind' }, requestId: rid() });
  const kept = await contributor(ALICE, { action: 'saveDraft', formId: state.wordForm, version: 2, answers: { word: 'still mine' }, requestId: rid() });
  const old = new Date(Date.now() - 31 * DAY).toISOString();
  await db.doc(`indigenFormResponses/${abandoned.responseId}`).update({ updatedAt: old });
  await db.doc(`indigenFormResponses/${kept.responseId}`).update({ updatedAt: old });
  const result = await uploadsModule.sweepFormUploadsOnce();
  assert.equal(result.draftsRemoved, 1);
  assert.equal(await responseDoc(abandoned.responseId), undefined);
  assert.equal((await formDoc(noDrafts)).counts.draft, 0);
  assert.equal((await responseDoc(kept.responseId)).status, 'draft', 'drafts the contributor can see are never swept');
  await contributor(ALICE, { action: 'discardDraft', responseId: kept.responseId });
});

test('administrators list, read and audit responses; drafts stay private', async () => {
  const formId = state.wordForm;
  const listed = await admin({ action: 'listResponses', filter: { formId } });
  assert.equal(listed.rows.length, 4);
  assert.ok(listed.rows.every((row) => row.status !== 'draft'));
  assert.ok(listed.rows.every((row) => row.contributorName === 'Alice Asaa'));
  assert.equal((await admin({ action: 'listResponses', filter: { formId, version: 1 } })).rows.length, 2);
  assert.equal((await admin({ action: 'listResponses', filter: { formId, status: 'approved' } })).rows.length, 1);
  assert.equal((await admin({ action: 'listResponses', filter: { formId, languageId: 'twi' } })).rows.length, 0);
  const page1 = await admin({ action: 'listResponses', filter: { formId }, limit: 1 });
  assert.equal(page1.rows.length, 1);
  assert.ok(page1.nextCursor);
  const page2 = await admin({ action: 'listResponses', filter: { formId }, limit: 1, cursor: page1.nextCursor });
  assert.notEqual(page2.rows[0].id, page1.rows[0].id);
  await rejects(admin({ action: 'listResponses', filter: { status: 'draft' } }), 'invalid-argument');

  const detail = await admin({ action: 'getResponse', responseId: state.responseB });
  assert.equal(detail.formVersion, 2);
  assert.equal(detail.history.find((event) => event.type === 'version_moved').actorName, 'Alice Asaa');
  assert.ok(detail.allowedDecisions.includes('approve') && detail.allowedDecisions.includes('start_review'));
  assert.equal(detail.expectedStatus, 'submitted');
  await rejects(admin({ action: 'getResponse', responseId: state.draftOther }), 'not-found');

  const activity = await admin({ action: 'activity', formId });
  const actions = new Set(activity.entries.map((entry) => entry.action));
  for (const action of ['forms.create', 'forms.save_draft', 'forms.publish', 'forms.status', 'forms.retire_version', 'forms.discard_draft', 'forms.export']) assert.ok(actions.has(action), action);
  assert.ok(activity.entries.every((entry) => entry.formId === formId));

  const overview = await admin({ action: 'overview' });
  assert.ok(overview.forms.some((form) => form.id === formId && form.totalSubmitted === 4));
  assert.equal(overview.access.canManage, true);

  const { cohort, unknown } = await admin({ action: 'saveCohort', name: 'Elders circle', description: 'Synthetic cohort', members: [ALICE, 'missing@example.test'] });
  assert.deepEqual(unknown, ['missing@example.test']);
  assert.match(cohort.id, /^[a-z][a-z0-9_]{0,39}$/);
  assert.deepEqual(cohort.members.map((member) => member.uid), [ALICE]);
  assert.equal((await admin({ action: 'listCohorts' })).cohorts[0].memberCount, 1);

  // Discarding a draft removes it and its uploads.
  assert.deepEqual(await contributor(ALICE, { action: 'discardDraft', responseId: state.draftOther }), { discarded: true });
  assert.equal(await responseDoc(state.draftOther), undefined);
  await rejects(contributor(ALICE, { action: 'discardDraft', responseId: state.responseB }), 'failed-precondition');
});

/** A small form open to every contributor, with no points, for the scenarios below. */
const plainForm = (title) => ({
  ...emptyDefinition(),
  title,
  sections: [{ id: 'main', title: '', description: '', visibleWhen: null, fields: [{ id: 'note', type: 'short_text', label: 'Note', required: true, settings: {} }] }],
});
const isConflictError = (error) => assert.equal(error.details.reason, 'conflict');

test('a stale builder can never save, publish or discard a later draft, and a discard is reported only when it happened', async () => {
  const formId = await publishNew(plainForm('Draft identity'));
  const definition = plainForm('Draft identity');
  // Builder A opens the draft; builder B discards it and starts another.
  const first = await admin({ action: 'startDraft', formId });
  assert.deepEqual(first, { version: 2, revision: 3 });
  assert.deepEqual(await admin({ action: 'discardDraft', formId, version: 2, expectedRevision: 3 }), { discarded: true });
  assert.deepEqual(await admin({ action: 'discardDraft', formId, version: 2, expectedRevision: 3 }), { discarded: true }, 'a retry of the same discard is still done');
  const second = await admin({ action: 'startDraft', formId });
  assert.equal(second.version, 3, 'the discarded number 2 is never reused');
  assert.equal(second.revision, 4, 'revisions only ever increase');
  // A's version-2 tokens match nothing, even where a revision number would.
  await rejects(admin({ action: 'saveDraft', formId, definition, version: 2, expectedRevision: 3 }), 'aborted', (error) => { isConflictError(error); assert.equal(error.details.version, 3); });
  await rejects(admin({ action: 'saveDraft', formId, definition, version: 2, expectedRevision: 4 }), 'aborted', isConflictError);
  await rejects(admin({ action: 'publish', formId, version: 2, expectedRevision: 4 }), 'aborted', isConflictError);
  await rejects(admin({ action: 'discardDraft', formId, version: 2, expectedRevision: 4 }), 'failed-precondition', (error) => assert.equal(error.details.reason, 'no-draft'));
  await rejects(admin({ action: 'publish', formId, expectedRevision: 4 }), 'invalid-argument');
  await rejects(admin({ action: 'saveDraft', formId, definition, expectedRevision: 4 }), 'invalid-argument');
  // B saves again: publishing the revision A looked at is refused rather than putting B's newer save live.
  const saved = await admin({ action: 'saveDraft', formId, definition: { ...definition, description: 'Saved by B' }, version: 3, expectedRevision: 4 });
  assert.equal(saved.revision, 5);
  await rejects(admin({ action: 'publish', formId, version: 3, expectedRevision: 4 }), 'aborted', isConflictError);
  assert.equal((await formDoc(formId)).draftVersion, 3, 'nothing was published');
  assert.deepEqual(await admin({ action: 'publish', formId, version: 3, expectedRevision: 5 }), { version: 3, status: 'published' });
  // Discarding a draft that went live meanwhile is refused, never reported as discarded.
  await rejects(admin({ action: 'discardDraft', formId, version: 3, expectedRevision: 5 }), 'failed-precondition', (error) => assert.equal(error.details.reason, 'no-draft'));
  assert.equal((await formDoc(formId)).currentVersion, 3);
});

test('a draft keeps rules and settings that do not validate, and publishing refuses until they are fixed', async () => {
  const { formId } = await admin({ action: 'create', title: 'Lossless draft' });
  const definition = {
    ...emptyDefinition(),
    title: 'Lossless draft',
    sections: [{ id: 'main', title: '', description: '', visibleWhen: null, fields: [
      // Depends on a question that comes after it.
      { id: 'why_not', type: 'long_text', label: 'Why is there no recording?', required: true, visibleWhen: when('has_audio', 'equals', 'no'), settings: {} },
      { id: 'has_audio', type: 'single_choice', label: 'Do you have a recording?', required: true, settings: { options: [{ id: 'yes', label: 'Yes' }, { id: 'no', label: 'No' }] } },
      // A rule whose value is still empty, as the builder's “Only when…” starts it.
      { id: 'details', type: 'short_text', label: 'Details', required: false, requiredWhen: when('has_audio', 'equals', ''), settings: {} },
      { id: 'clip', type: 'audio', label: 'Recording', settings: { formats: ['mp3'], maxSizeMb: 300, maxFiles: 30 } },
    ] }],
    review: { required: true, reviewerGroup: 'reviewers', instructions: '', checks: [], points: 150 },
  };
  const saved = await admin({ action: 'saveDraft', formId, definition, version: 1, expectedRevision: 1 });
  const problems = ['sections.0.fields.0.visibleWhen.conditions.0', 'sections.0.fields.2.requiredWhen.conditions.0.value', 'sections.0.fields.3.settings.maxSizeMb', 'sections.0.fields.3.settings.maxFiles', 'review.points'];
  for (const path of problems) assert.ok(saved.issues.some((issue) => issue.path === path), `save reports ${path}`);

  // Reloading shows what was entered, problems and all.
  const loaded = await admin({ action: 'get', formId });
  const fields = loaded.draft.definition.sections[0].fields;
  assert.deepEqual(fields[0].visibleWhen, when('has_audio', 'equals', 'no'));
  assert.equal(fields[0].required, true);
  assert.deepEqual(fields[2].requiredWhen, when('has_audio', 'equals', ''));
  assert.equal(fields[3].settings.maxFiles, 30);
  assert.equal(fields[3].settings.maxSizeMb, 300);
  assert.equal(loaded.draft.definition.review.points, 150);
  for (const path of problems) assert.ok(loaded.draft.issues.some((issue) => issue.path === path), `the reloaded draft still reports ${path}`);
  const stored = (await db.doc(`indigenForms/${formId}/formVersions/1`).get()).data();
  assert.equal(stored.definition.sections[0].fields[0].visibleWhen, null, 'the validated copy alone would have lost the rule');

  // Publishing checks what was entered, not the validated copy.
  const preview = await admin({ action: 'publishPreview', formId });
  for (const path of problems) assert.ok(preview.issues.some((issue) => issue.path === path), `publishing is blocked by ${path}`);
  await rejects(admin({ action: 'publish', formId, version: 1, expectedRevision: saved.revision }), 'failed-precondition', (error) => assert.equal(error.details.reason, 'invalid'));
  const copy = await admin({ action: 'duplicate', formId });
  assert.deepEqual((await admin({ action: 'get', formId: copy.formId })).draft.definition.sections[0].fields[0].visibleWhen, when('has_audio', 'equals', 'no'), 'a copy keeps the entry too');

  // Fixed: the entry is cleared and the validated definition is what goes live.
  const fixed = structuredClone(definition);
  const [whyNot, hasAudio, details, clip] = fixed.sections[0].fields;
  details.requiredWhen = when('has_audio', 'equals', 'yes');
  clip.settings = { formats: ['mp3'], maxSizeMb: 10, maxFiles: 2 };
  fixed.sections[0].fields = [hasAudio, whyNot, details, clip];
  fixed.review.points = 0;
  const clean = await admin({ action: 'saveDraft', formId, definition: fixed, version: 1, expectedRevision: saved.revision });
  assert.deepEqual(clean.issues, []);
  assert.equal((await db.doc(`indigenForms/${formId}/formVersions/1`).get()).get('draftInput'), null);
  await admin({ action: 'publish', formId, version: 1, expectedRevision: clean.revision });
  const published = (await db.doc(`indigenForms/${formId}/formVersions/1`).get()).data();
  assert.equal('draftInput' in published, false);
  assert.deepEqual(published.definition.sections[0].fields[1].visibleWhen, when('has_audio', 'equals', 'no'));
  assert.equal(published.definition.sections[0].fields[1].required, true);
  assert.equal(published.definition.sections[0].fields[3].settings.maxFiles, 2);

  // Lists inside lists cannot be stored, so they are refused rather than failing the write.
  await rejects(admin({ action: 'create', title: 'Nested' }).then(({ formId: nested }) => admin({ action: 'saveDraft', formId: nested, version: 1, expectedRevision: 1, definition: { ...definition, audience: { mode: 'groups', cohortIds: [['x']] } } })), 'invalid-argument');
});

test('publishing a new version keeps a paused or closed form paused or closed', async () => {
  const formId = await publishNew(plainForm('Stays paused'));
  await admin({ action: 'setStatus', formId, status: 'paused' });
  const draft = await admin({ action: 'startDraft', formId });
  assert.deepEqual(await admin({ action: 'publish', formId, version: draft.version, expectedRevision: draft.revision }), { version: 2, status: 'paused' });
  let head = await formDoc(formId);
  assert.equal(head.status, 'paused');
  assert.equal(head.currentVersion, 2);
  await admin({ action: 'setStatus', formId, status: 'closed' });
  const next = await admin({ action: 'startDraft', formId });
  assert.equal((await admin({ action: 'publish', formId, version: next.version, expectedRevision: next.revision })).status, 'closed');
  head = await formDoc(formId);
  assert.equal(head.status, 'closed');
  assert.equal(head.currentVersion, 3);
});

test('a cohort edit starts from the stored members, and a concurrent edit is refused', async () => {
  const { cohort } = await admin({ action: 'saveCohort', name: 'Zeta circle', description: 'Synthetic cohort', members: [ALICE] });
  await rejects(admin({ action: 'saveCohort', cohortId: cohort.id, name: 'Zeta circle', description: '', members: [] }), 'invalid-argument', undefined);
  const loaded = (await admin({ action: 'getCohort', cohortId: cohort.id })).cohort;
  assert.equal(loaded.updatedAt, cohort.updatedAt);
  const first = await admin({ action: 'saveCohort', cohortId: cohort.id, name: 'Zeta circle', description: '', members: [ALICE, 'publisher@example.test'], expectedUpdatedAt: loaded.updatedAt });
  assert.equal(first.cohort.memberCount, 2);
  await rejects(admin({ action: 'saveCohort', cohortId: cohort.id, name: 'Zeta circle', description: '', members: [], expectedUpdatedAt: loaded.updatedAt }), 'aborted', (error) => {
    assert.equal(error.details.reason, 'conflict');
    assert.equal(error.details.updatedAt, first.cohort.updatedAt);
  });
  assert.deepEqual((await admin({ action: 'getCohort', cohortId: cohort.id })).cohort.members.map((member) => member.uid).sort(), [ALICE, PUBLISHER].sort(), 'the other edit is kept');
});

test('starting a review never sends the feedback box to the contributor', async () => {
  const { formsReview } = await import('../../services/functions/lib/forms-review.js');
  const formId = await publishNew(plainForm('Review start'));
  const draft = await contributor(ALICE, { action: 'saveDraft', formId, version: 1, answers: { note: 'test-ɔ́' }, requestId: rid() });
  await contributor(ALICE, { action: 'submit', responseId: draft.responseId, answers: { note: 'test-ɔ́' }, expectedDraftRevision: 1, requestId: rid() });
  const decided = await formsReview.run(staffRequest(ADMIN, {
    action: 'decide', responseId: draft.responseId, decision: 'start_review', feedback: 'A note drafted for a later decision',
    expectedStatus: 'submitted', expectedRevision: 1, requestId: rid(),
  }));
  assert.equal(decided.status, 'under_review');
  const history = await db.collection(`indigenFormResponses/${draft.responseId}/formHistory`).get();
  const started = history.docs.map((doc) => doc.data()).find((event) => event.type === 'review_started');
  assert.ok(started);
  assert.equal('feedback' in started, false);
  assert.equal((await responseDoc(draft.responseId)).feedback ?? null, null);
  const mine = await contributor(ALICE, { action: 'getMine', responseId: draft.responseId });
  assert.equal(JSON.stringify(mine).includes('A note drafted'), false);
});

/* -- Contributor drafts across versions, schedules, uploads, size and the submit gate ---------------- */

/** Publish `definition` as the next version of an existing form; returns its number. */
async function publishVersion(formId, definition) {
  const draft = await admin({ action: 'startDraft', formId });
  const saved = await admin({ action: 'saveDraft', formId, definition, version: draft.version, expectedRevision: draft.revision });
  await admin({ action: 'publish', formId, version: draft.version, expectedRevision: saved.revision });
  return draft.version;
}

/** A form with a repeatable group of words and one permission. */
const wordsForm = (title, { statement = 'Indigen World may publish these words after review.', purpose = 'public', subs } = {}) => ({
  ...emptyDefinition(),
  title,
  sections: [{ id: 'main', title: '', description: '', visibleWhen: null, fields: [
    { id: 'topic', type: 'short_text', label: 'Topic', required: true, settings: {} },
    { id: 'entries', type: 'group', label: 'Words', settings: { minItems: 0, maxItems: 3, itemLabel: 'Word' }, fields: subs ?? [
      { id: 'term', type: 'short_text', label: 'Word', settings: {} },
      { id: 'note', type: 'short_text', label: 'Note', settings: {} },
      { id: 'kind', type: 'single_choice', label: 'Kind', settings: { options: [{ id: 'noun', label: 'Noun' }, { id: 'verb', label: 'Verb' }] } },
    ] },
    { id: 'consent_public', type: 'consent', label: 'Permission to publish', settings: { consentPurpose: purpose, statement } },
  ] }],
});

/** A form with a note, an optional one-file image question and a group with an image per entry. */
const uploadsForm = (title, extra = {}) => ({
  ...emptyDefinition(),
  title,
  sections: [{ id: 'main', title: '', description: '', visibleWhen: null, fields: [
    { id: 'note', type: 'short_text', label: 'Note', required: true, settings: {} },
    { id: 'scan', type: 'image', label: 'Scan', settings: { formats: ['png'], maxSizeMb: 1, maxFiles: 1 } },
    { id: 'words', type: 'group', label: 'Words', settings: { minItems: 0, maxItems: 3, itemLabel: 'Word' }, fields: [
      { id: 'term', type: 'short_text', label: 'Word', settings: {} },
      { id: 'picture', type: 'image', label: 'Picture', settings: { formats: ['png'], maxSizeMb: 1, maxFiles: 1 } },
    ] },
  ] }],
  ...extra,
});

/** Register an upload the way beginUpload does, optionally with its object stored and confirmed. */
async function registerUpload(input) {
  const { uid = ALICE, responseId, formId, fieldId, status = 'pending', createdAt = new Date().toISOString() } = input;
  const id = `up${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`;
  const path = `form-uploads/${uid}/${id}`;
  await db.doc(`indigenFormUploads/${id}`).set({
    id, ownerUid: uid, responseId, formId, formVersion: 1, fieldId, path, name: `${fieldId}.png`, declaredType: 'image/png', declaredSize: PNG.length,
    status, format: status === 'ready' ? 'png' : null, contentType: status === 'ready' ? 'image/png' : null, size: status === 'ready' ? PNG.length : null,
    generation: null, sha256: status === 'ready' ? hash(PNG) : null, rejectionReason: null, createdAt, confirmedAt: status === 'ready' ? createdAt : null,
  });
  if (status === 'ready') await getStorage(app).bucket().file(path).save(PNG, { contentType: 'image/png', resumable: false });
  return { id, path, attachment: { id, name: `${fieldId}.png`, contentType: 'image/png', size: PNG.length } };
}

const uploadDoc = async (id) => (await db.doc(`indigenFormUploads/${id}`).get()).data();
const objectExists = async (path) => (await getStorage(app).bucket().file(path).exists())[0];

test('moving a draft never carries a permission and lists every lost answer, group sub-answers included', async () => {
  const formId = await publishNew(wordsForm('Version move'));
  const answers = {
    topic: 'test-ɔ́',
    entries: [{ term: 'na', note: 'first note', kind: 'verb' }, { term: 'kunkwolo', note: 'second note', kind: 'noun' }],
    consent_public: true,
  };
  const draft = await contributor(ALICE, { action: 'saveDraft', formId, version: 1, answers, requestId: rid() });
  // Version 2 drops the note, no longer offers "verb", and asks the permission in new words for a new purpose.
  await publishVersion(formId, wordsForm('Version move', {
    statement: 'These words may be used to build language datasets, including AI training.',
    purpose: 'training',
    subs: [
      { id: 'term', type: 'short_text', label: 'Word', settings: {} },
      { id: 'kind', type: 'single_choice', label: 'Kind', settings: { options: [{ id: 'noun', label: 'Noun' }] } },
    ],
  }));
  const moved = await contributor(ALICE, { action: 'moveToLatest', responseId: draft.responseId });
  assert.equal(moved.version, 2);
  assert.deepEqual([...moved.dropped].sort(), ['consent_public', 'entries.kind', 'entries.note'], 'each lost sub-answer is listed once');
  const stored = await responseDoc(draft.responseId);
  assert.equal(stored.formVersion, 2);
  assert.ok(bytes(stored.workingAnswers.topic).equals(bytes('test-ɔ́')));
  assert.deepEqual(stored.workingAnswers.entries, [{ term: 'na' }, { term: 'kunkwolo', kind: 'noun' }]);
  assert.equal('consent_public' in stored.workingAnswers, false, 'the permission is asked again under the wording that will be recorded');

  // Even a permission whose wording did not change is asked again: one rule, every time.
  const same = await publishNew(wordsForm('Same wording'));
  const sameDraft = await contributor(ALICE, { action: 'saveDraft', formId: same, version: 1, answers: { topic: 'test-ɔ́', consent_public: true }, requestId: rid() });
  await publishVersion(same, wordsForm('Same wording'));
  assert.deepEqual((await contributor(ALICE, { action: 'moveToLatest', responseId: sameDraft.responseId })).dropped, ['consent_public']);
  assert.deepEqual((await responseDoc(sameDraft.responseId)).workingAnswers, { topic: 'test-ɔ́' });
});

test('a draft on an older version keeps to the deadline the form has now', async () => {
  const formId = await publishNew(plainForm('Deadline moves'));
  const draft = await contributor(ALICE, { action: 'saveDraft', formId, version: 1, answers: { note: 'test-ɔ́' }, requestId: rid() });
  // Publishing a version with a deadline is how an administrator ends collection.
  const closesAt = new Date(Date.now() + 6000).toISOString();
  await publishVersion(formId, { ...plainForm('Deadline moves'), schedule: { opensAt: null, closesAt } });
  assert.equal((await contributor(ALICE, { action: 'open', formId, responseId: draft.responseId })).window.open, true, 'open until the new deadline');
  await new Promise((resolve) => setTimeout(resolve, Math.max(0, Date.parse(closesAt) - Date.now()) + 300));
  const opened = await contributor(ALICE, { action: 'open', formId, responseId: draft.responseId });
  assert.equal(opened.version, 1);
  assert.equal(opened.window.open, false);
  assert.equal(opened.window.reason, 'past_deadline');
  assert.equal((await contributor(ALICE, { action: 'list' })).forms.find((form) => form.id === formId).closedReason, 'past_deadline');
  await rejects(contributor(ALICE, { action: 'submit', responseId: draft.responseId, answers: { note: 'test-ɔ́' }, expectedDraftRevision: 1, requestId: rid() }),
    'failed-precondition', (error) => assert.equal(error.details.reason, 'past_deadline'));
  assert.equal((await responseDoc(draft.responseId)).status, 'draft', 'the draft is kept');
});

test('a once-only form already answered opens with no blank response, and a blank save names the response it meets', async () => {
  const formId = await publishNew({ ...plainForm('Once again'), submission: { policy: 'once', allowDrafts: true, allowAttachments: true, successMessage: 'Thank you.', nextSteps: '' } });
  const draft = await contributor(ALICE, { action: 'saveDraft', formId, version: 1, answers: { note: 'test-ɔ́' }, requestId: rid() });
  await contributor(ALICE, { action: 'submit', responseId: draft.responseId, answers: { note: 'test-ɔ́' }, expectedDraftRevision: 1, requestId: rid() });
  const opened = await contributor(ALICE, { action: 'open', formId });
  assert.equal(opened.response, null);
  assert.equal(opened.canStartNew, false);
  assert.equal(opened.window.open, true, 'the form itself is open; the portal must not offer a blank form here');
  await rejects(contributor(ALICE, { action: 'saveDraft', formId, version: 1, answers: { note: 'again' }, requestId: rid() }), 'failed-precondition', (error) => {
    assert.equal(error.details.reason, 'not-editable');
    assert.equal(error.details.responseId, draft.responseId, 'the portal links to the response already sent');
  });
});

test('abandoned uploads stop holding a question’s slots, and an upload question in a group has room for every entry', async () => {
  const formId = await publishNew(uploadsForm('Upload room'));
  const draft = await contributor(ALICE, { action: 'saveDraft', formId, version: 1, answers: { note: 'test-ɔ́' }, requestId: rid() });
  const begin = (fieldId) => contributor(ALICE, { action: 'beginUpload', responseId: draft.responseId, fieldId, name: 'scan.png', contentType: 'image/png', size: PNG.length });
  const hoursAgo = (hours) => new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  // Three interrupted attempts at a one-file question used to refuse every new attempt for a day or two.
  for (let i = 0; i < 3; i += 1) await registerUpload({ responseId: draft.responseId, formId, fieldId: 'scan', createdAt: hoursAgo(2) });
  const fresh = await begin('scan');
  assert.ok(fresh.uploadId, 'pending uploads older than an hour no longer count');
  for (let i = 0; i < 2; i += 1) await registerUpload({ responseId: draft.responseId, formId, fieldId: 'scan' });
  await rejects(begin('scan'), 'resource-exhausted');
  // What the portal now does in the background after a failed attempt frees the slot again.
  assert.deepEqual(await contributor(ALICE, { action: 'removeUpload', uploadId: fresh.uploadId }), { removed: true });
  assert.equal((await uploadDoc(fresh.uploadId)).status, 'removed');
  assert.ok((await begin('scan')).uploadId);

  // A picture for each of three words: five may be in flight, not three.
  for (let i = 0; i < 4; i += 1) await registerUpload({ responseId: draft.responseId, formId, fieldId: 'picture' });
  assert.ok((await begin('picture')).uploadId, 'the bound grows with the entries the group allows');
  await rejects(begin('picture'), 'resource-exhausted');
});

test('removing a file keeps it while the saved draft lists it, and a removal racing a submit never loses a submitted file', async () => {
  const formId = await publishNew(uploadsForm('Remove races'));
  const draft = await contributor(ALICE, { action: 'saveDraft', formId, version: 1, answers: { note: 'test-ɔ́' }, requestId: rid() });
  const listed = await registerUpload({ responseId: draft.responseId, formId, fieldId: 'scan', status: 'ready' });
  const saved = await contributor(ALICE, { action: 'saveDraft', formId, responseId: draft.responseId, version: 1, expectedDraftRevision: 1, answers: { note: 'test-ɔ́', scan: [listed.attachment] }, requestId: rid() });
  // Remove on the page, then leave without saving: the saved draft still lists the file, so it stays.
  assert.deepEqual(await contributor(ALICE, { action: 'removeUpload', uploadId: listed.id }), { removed: true });
  assert.equal((await uploadDoc(listed.id)).status, 'ready');
  assert.equal(await objectExists(listed.path), true);
  // Once a save no longer lists it, removing it deletes it.
  await contributor(ALICE, { action: 'saveDraft', formId, responseId: draft.responseId, version: 1, expectedDraftRevision: saved.draftRevision, answers: { note: 'test-ɔ́' }, requestId: rid() });
  await contributor(ALICE, { action: 'removeUpload', uploadId: listed.id });
  assert.equal((await uploadDoc(listed.id)).status, 'removed');
  assert.equal(await objectExists(listed.path), false);

  // Submit and remove at the same moment (two tabs): whichever wins, a submitted file is never deleted.
  for (let round = 0; round < 4; round += 1) {
    const next = await contributor(ALICE, { action: 'saveDraft', formId, version: 1, answers: { note: `race ${round}` }, requestId: rid() });
    const file = await registerUpload({ responseId: next.responseId, formId, fieldId: 'scan', status: 'ready' });
    const [submitted, removed] = await Promise.allSettled([
      contributor(ALICE, { action: 'submit', responseId: next.responseId, answers: { note: `race ${round}`, scan: [file.attachment] }, expectedDraftRevision: 1, requestId: rid() }),
      contributor(ALICE, { action: 'removeUpload', uploadId: file.id }),
    ]);
    assert.equal(removed.status, 'fulfilled');
    const upload = await uploadDoc(file.id);
    if (submitted.status === 'fulfilled') {
      assert.deepEqual((await responseDoc(next.responseId)).attachmentIds, [file.id]);
      assert.equal(upload.status, 'ready', `round ${round}: the submitted file stays ready`);
      assert.equal(await objectExists(file.path), true, `round ${round}: the submitted file is kept`);
    } else {
      assert.equal(submitted.reason.code, 'failed-precondition');
      assert.equal(submitted.reason.details.reason, 'attachment');
      assert.equal(upload.status, 'removed');
      assert.equal((await responseDoc(next.responseId)).status, 'draft');
    }
  }
});

test('the answers budget is shared with the portal: just inside it saves, just over it is refused as too large', async () => {
  const formId = await publishNew({
    ...emptyDefinition(),
    title: 'Long answers',
    sections: [{ id: 'main', title: '', description: '', visibleWhen: null, fields: [
      { id: 'parts', type: 'group', label: 'Passages', settings: { minItems: 0, maxItems: 20, itemLabel: 'Passage' }, fields: [
        { id: 'text', type: 'long_text', label: 'Passage', settings: { maxLength: 20000 } },
      ] },
    ] }],
  });
  // Every passage keeps to its own limit; together they reach the budget. Tone marks take more bytes than letters.
  const chunk = 'test-ɔ́ ';
  const chunkBytes = Buffer.byteLength(chunk, 'utf8');
  const passage = (count) => ({ text: chunk.repeat(count) });
  const full = Math.floor(20000 / chunk.length);
  const parts = [];
  while (answersByteSize({ parts }) <= ANSWERS_BYTE_BUDGET) parts.push(passage(full));
  const last = parts.length - 1;
  parts[last] = passage(full - Math.ceil((answersByteSize({ parts }) - ANSWERS_BYTE_BUDGET) / chunkBytes));
  const inside = { parts };
  const over = { parts: [...parts.slice(0, last), passage(parts[last].text.length / chunk.length + 1)] };
  assert.ok(answersByteSize(inside) <= ANSWERS_BYTE_BUDGET && answersByteSize(over) > ANSWERS_BYTE_BUDGET);
  assert.equal(answersByteSize(over), Buffer.byteLength(JSON.stringify(over), 'utf8'), 'the portal measures what the server measures');

  const saved = await contributor(ALICE, { action: 'saveDraft', formId, version: 1, answers: inside, requestId: rid() });
  assert.equal(saved.draftRevision, 1);
  await rejects(contributor(ALICE, { action: 'saveDraft', formId, responseId: saved.responseId, version: 1, expectedDraftRevision: 1, answers: over, requestId: rid() }),
    'invalid-argument', (error) => assert.equal(error.details.reason, 'too-large'));
  await rejects(contributor(ALICE, { action: 'submit', responseId: saved.responseId, answers: over, expectedDraftRevision: 1, requestId: rid() }),
    'invalid-argument', (error) => assert.equal(error.details.reason, 'too-large'));
  // What the portal points at: the longest answers, by the paths the renderer marks.
  const { definition } = await contributor(ALICE, { action: 'open', formId, responseId: saved.responseId });
  const longest = largestAnswers(definition, over, 2);
  assert.deepEqual(longest.map((row) => row.path), ['parts.0.text', 'parts.1.text'], 'the full passages, before the shorter last one');
  assert.equal(longest[0].label, 'Passages (Passage 1): Passage');
  assert.equal(longest[0].bytes, answersByteSize(over.parts[0].text));
});

test('a withdrawn submit permission or an inactive profile keeps read access but blocks saving, uploading and submitting', async () => {
  const ERIN = 'forms-erin';
  await db.doc(`contributorAccounts/${ERIN}`).set({ status: 'active', requiresPasswordChange: false });
  await db.doc(`contributors/${ERIN}`).set({ public: { displayName: 'Erin Test' }, languageProfile: { dialect: 'Navrongo' } });
  const formId = await publishNew(uploadsForm('Submit gate'));
  const first = await contributor(ERIN, { action: 'saveDraft', formId, version: 1, answers: { note: 'test-ɔ́' }, requestId: rid() });
  await contributor(ERIN, { action: 'submit', responseId: first.responseId, answers: { note: 'test-ɔ́' }, expectedDraftRevision: 1, requestId: rid() });
  const draft = await contributor(ERIN, { action: 'saveDraft', formId, version: 1, answers: { note: 'na' }, requestId: rid() });
  const pending = await registerUpload({ uid: ERIN, responseId: draft.responseId, formId, fieldId: 'scan' });
  const blocked = (error) => assert.equal(error.details.reason, 'submit-blocked');

  for (const [label, profile] of [['submit permission withdrawn', { permissions: { submit: false } }], ['inactive profile', { status: 'inactive' }]]) {
    await db.doc(`contributors/${ERIN}`).set(profile, { merge: true });
    await rejects(contributor(ERIN, { action: 'saveDraft', formId, version: 1, answers: { note: 'kunkwolo' }, requestId: rid() }), 'permission-denied', blocked);
    await rejects(contributor(ERIN, { action: 'saveDraft', formId, responseId: draft.responseId, version: 1, expectedDraftRevision: 1, answers: { note: 'kunkwolo' }, requestId: rid() }), 'permission-denied', blocked);
    await rejects(contributor(ERIN, { action: 'submit', responseId: draft.responseId, answers: { note: 'na' }, expectedDraftRevision: 1, requestId: rid() }), 'permission-denied', blocked);
    await rejects(contributor(ERIN, { action: 'beginUpload', responseId: draft.responseId, fieldId: 'scan', name: 'scan.png', contentType: 'image/png', size: PNG.length }), 'permission-denied', blocked);
    await rejects(contributor(ERIN, { action: 'confirmUpload', uploadId: pending.id }), 'permission-denied', blocked);
    await rejects(contributor(ERIN, { action: 'moveToLatest', responseId: draft.responseId }), 'permission-denied', blocked);

    // Reading their own work still works.
    assert.ok((await contributor(ERIN, { action: 'list' })).forms.some((form) => form.id === formId), `${label}: list`);
    const mine = await contributor(ERIN, { action: 'mine' });
    assert.deepEqual(mine.responses.map((response) => response.id).sort(), [first.responseId, draft.responseId].sort(), `${label}: mine`);
    assert.equal((await contributor(ERIN, { action: 'getMine', responseId: first.responseId })).status, 'submitted', `${label}: getMine`);
    assert.equal((await contributor(ERIN, { action: 'open', formId, responseId: draft.responseId })).response.id, draft.responseId, `${label}: open`);
    assert.equal((await responseDoc(draft.responseId)).draftRevision, 1, `${label}: nothing changed`);
    await db.doc(`contributors/${ERIN}`).set({ status: 'active', permissions: { submit: true } }, { merge: true });
  }
  const resumed = await contributor(ERIN, { action: 'saveDraft', formId, responseId: draft.responseId, version: 1, expectedDraftRevision: 1, answers: { note: 'kunkwolo' }, requestId: rid() });
  assert.equal(resumed.draftRevision, 2, 'restoring the profile restores saving');
});
