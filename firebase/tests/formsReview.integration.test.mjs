import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { after, before, beforeEach, test } from 'node:test';
import { deleteApp, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { emptyDefinition } from '../../packages/contracts/forms.mjs';
import { FORM_TEMPLATES } from '../../packages/contracts/forms-templates.mjs';
import { verifiedStaff } from './fixtures/staffSession.mjs';

/**
 * Indigen Forms review, points and routing (formsReview, form-rewards.ts,
 * forms-destinations.ts) against the Auth, Firestore and Storage emulators,
 * calling the compiled callables directly (the Functions emulator does not
 * load on Node 24 here). Run through `npm run test:forms`, which builds the
 * functions and starts the emulators from .forms-test.firebase.json.
 *
 * Every Kasem-looking string here is an obvious placeholder with tone marks,
 * not invented Kasem.
 */

process.env.FUNCTIONS_EMULATOR = 'true';
const projectId = process.env.GCLOUD_PROJECT ?? 'demo-indigen-forms';
const bucketName = `${projectId}.appspot.com`;

const CONTRIB = 'rv-contrib';
const CAPPED = 'rv-capped';
const LAPSED = 'rv-lapsed';
const VALIDATOR = 'rv-validator';
const LINGUIST = 'rv-linguist';
const ADMIN = 'rv-admin';
const FINANCE = 'rv-finance';
const HEADWORD = 'test-headword-ɛ̀ɔ́ŋ ʋ̀ɩ́';
const WAV = Buffer.concat([Buffer.from('RIFF', 'latin1'), Buffer.from([36, 0, 0, 0]), Buffer.from('WAVEfmt ', 'latin1'), Buffer.alloc(40, 1)]);
const WEBP = Buffer.concat([Buffer.from('RIFF', 'latin1'), Buffer.from([36, 0, 0, 0]), Buffer.from('WEBPVP8 ', 'latin1'), Buffer.alloc(40, 2)]);
const NOTES = Buffer.from('Field notes for the routing test: test-notes-ɔ̀ only.\n', 'utf8');

let app;
let db;
let formsAdmin;
let formsContributor;
let formsReview;
let getContributorRewards;
let awardContributorPoints;
let processPortalMaterial;
let prepareFormAward;

const rid = () => crypto.randomUUID();
const bytes = (value) => Buffer.from(value, 'utf8');
const rejects = (promise, code, check) => assert.rejects(promise, (error) => {
  assert.equal(error.code, code, `${error.code}: ${error.message}`);
  if (check) check(error);
  return true;
});
const staffRequest = (uid, data, { role = 'validator', verified = true, claims = {} } = {}) => ({
  auth: { uid, token: { uid, role, ...(verified ? verifiedStaff() : { auth_time: Math.floor(Date.now() / 1000) - 60 }), ...claims } },
  data,
  rawRequest: { headers: {} },
});
const admin = (data, options) => formsAdmin.run(staffRequest(ADMIN, data, { role: 'admin', ...options }));
const review = (uid, data, options) => formsReview.run(staffRequest(uid, data, options));
const asAdmin = (data) => review(ADMIN, data, { role: 'admin' });
const contributor = (uid, data) => formsContributor.run({ auth: { uid, token: { uid } }, data, rawRequest: { headers: { origin: 'http://localhost:5173' } } });
const responseDoc = async (id) => (await db.doc(`indigenFormResponses/${id}`).get()).data();
const ledgerRow = async (responseId) => (await db.doc(`pointLedger/formaward_${responseId}`).get());

/** Decide on the response as it currently stands (its status and revision are the expectations). */
async function decide(uid, responseId, decision, extra = {}, options = {}) {
  const current = await responseDoc(responseId);
  return review(uid, {
    action: 'decide', responseId, decision, expectedStatus: current.status, expectedRevision: current.revision, requestId: rid(), ...extra,
  }, options);
}

const section = (fields) => [{ id: 'main', title: '', description: '', visibleWhen: null, fields }];
const consent = (id, purpose, required = false) => ({ id, type: 'consent', label: 'Permission', required, settings: { consentPurpose: purpose, statement: `Synthetic ${purpose} permission statement.` } });
const text = (id, label, extra = {}) => ({ id, type: 'short_text', label, required: false, settings: {}, ...extra });
const long = (id, label, extra = {}) => ({ id, type: 'long_text', label, required: false, settings: {}, ...extra });
const reviewConfig = (extra = {}) => ({ required: true, reviewerGroup: 'reviewers', instructions: '', checks: [], points: 0, ...extra });

const generalForm = (title, extra = {}) => ({
  ...emptyDefinition(),
  title,
  sections: section([long('answer', 'Your answer', { required: true, settings: { kasemKeyboard: true } }), consent('consent_review', 'review', true)]),
  review: reviewConfig(),
  ...extra,
});

/** `attestations: false` builds a form that never asks about rights or the people recorded. */
const dictionaryForm = (title, { reviewConsentRequired = true, attestations = true } = {}) => ({
  ...emptyDefinition(),
  title,
  category: 'word_collection',
  languageContext: { languageIds: ['kasem', 'english'], dialectIds: [], note: '' },
  sections: section([
    text('word', 'Kasem word', { required: true, settings: { maxLength: 120, kasemKeyboard: true } }),
    text('meaning', 'English meaning', { required: true }),
    { id: 'dialect', type: 'dialect', label: 'Kasem variety', required: false, settings: {} },
    { id: 'pos', type: 'dropdown', label: 'Kind of word', required: false, settings: { options: [{ id: 'noun', label: 'Noun' }, { id: 'adjective', label: 'Describing word' }] } },
    text('source_detail', 'Source'),
    { id: 'pronunciation', type: 'audio', label: 'Pronunciation', required: false, settings: { formats: ['wav'], maxSizeMb: 1, maxFiles: 1, allowRecording: true } },
    ...(attestations ? [
      { id: 'speaker_permission', type: 'checkbox', label: 'The people heard in the recording agreed to share it.', required: false, settings: {} },
      { id: 'rights_confirmed', type: 'checkbox', label: 'I have permission to share this word.', required: false, settings: {} },
    ] : []),
    consent('consent_review', 'review', reviewConsentRequired),
    consent('consent_storage', 'storage'),
    consent('consent_public', 'public'),
    consent('consent_training', 'training'),
  ]),
  review: reviewConfig({ checks: [{ id: 'spelling', label: 'Spelling and tone marks checked' }], points: 5 }),
  destination: {
    type: 'dictionary_candidate',
    mapping: {
      headword: 'word', meaning: 'meaning', partOfSpeech: 'pos', dialect: 'dialect', source: 'source_detail', pronunciation: 'pronunciation',
      ...(attestations ? { speakerPermission: 'speaker_permission', rightsConfirmed: 'rights_confirmed' } : {}),
    },
  },
});

const documentForm = (title) => ({
  ...emptyDefinition(),
  title,
  category: 'research',
  languageContext: { languageIds: ['kasem'], dialectIds: [], note: '' },
  sections: section([
    text('title', 'Title', { required: true }),
    long('description', 'Description'),
    { id: 'attachments', type: 'file', label: 'Documents', required: true, settings: { formats: ['txt', 'pdf', 'png', 'webp'], maxSizeMb: 1, maxFiles: 2 } },
    text('source', 'Source'),
    long('rights', 'Authorship or permission'),
    consent('consent_review', 'review', true),
    consent('consent_training', 'training'),
  ]),
  review: reviewConfig(),
  destination: { type: 'document_intake', mapping: { title: 'title', description: 'description', files: 'attachments', source: 'source', rights: 'rights' } },
});

const translationForm = (title) => ({
  ...emptyDefinition(),
  title,
  category: 'translation',
  languageContext: { languageIds: ['kasem', 'english'], dialectIds: [], note: '' },
  sections: section([
    long('source_sentence', 'Source sentence', { required: true }),
    long('translation', 'Translation', { required: true, settings: { kasemKeyboard: true } }),
    { id: 'source_language', type: 'language', label: 'Language of the source', required: true, settings: {} },
    { id: 'dialect', type: 'dialect', label: 'Kasem variety', required: false, settings: {} },
    long('notes', 'Notes'),
    consent('consent_review', 'review', true),
    consent('consent_public', 'public'),
  ]),
  review: reviewConfig(),
  destination: { type: 'translation_review', mapping: { sourceText: 'source_sentence', translation: 'translation', sourceLanguage: 'source_language', dialect: 'dialect', notes: 'notes' } },
});

async function publishNew(definition) {
  const { formId } = await admin({ action: 'create', title: definition.title });
  const { revision, issues } = await admin({ action: 'saveDraft', formId, definition, version: 1, expectedRevision: 1 });
  await admin({ action: 'publish', formId, version: 1, expectedRevision: revision }).catch((error) => {
    throw new Error(`${definition.title} did not publish: ${JSON.stringify(error.details?.issues ?? issues)}`);
  });
  return formId;
}

/** A draft, then a submission of exactly these answers; returns the response id. */
async function submitResponse(uid, formId, answers, { files } = {}) {
  const draft = await contributor(uid, { action: 'saveDraft', formId, version: 1, answers: {}, requestId: rid() });
  const attached = files ? await files(draft.responseId) : {};
  const result = await contributor(uid, { action: 'submit', responseId: draft.responseId, answers: { ...answers, ...attached }, expectedDraftRevision: draft.draftRevision, requestId: rid() });
  return result.responseId;
}

/** Upload through a real resumable session and the server's inspection, as the portal does. */
async function upload(uid, responseId, fieldId, name, contentType, content) {
  const session = await contributor(uid, { action: 'beginUpload', responseId, fieldId, name, contentType, size: content.length });
  const put = await fetch(session.uploadUrl, { method: 'PUT', body: content, headers: { 'Content-Type': contentType, 'Content-Range': `bytes 0-${content.length - 1}/${content.length}` } });
  assert.ok(put.ok, `resumable PUT answered ${put.status}`);
  return (await contributor(uid, { action: 'confirmUpload', uploadId: session.uploadId })).attachment;
}

before(async () => {
  for (const name of ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST', 'FIREBASE_STORAGE_EMULATOR_HOST']) {
    assert.ok(process.env[name], `${name} must point at an emulator; never run this against production.`);
  }
  process.env.STORAGE_EMULATOR_HOST ??= `http://${process.env.FIREBASE_STORAGE_EMULATOR_HOST}`;
  app = initializeApp({ projectId, storageBucket: bucketName });
  db = getFirestore(app);
  ({ formsAdmin } = await import('../../services/functions/lib/forms-admin.js'));
  ({ formsContributor } = await import('../../services/functions/lib/forms-contributor.js'));
  ({ formsReview } = await import('../../services/functions/lib/forms-review.js'));
  ({ getContributorRewards } = await import('../../services/functions/lib/contributor-rewards.js'));
  ({ awardContributorPoints } = await import('../../services/functions/lib/contributor-scores.js'));
  ({ processPortalMaterial } = await import('../../services/functions/lib/portal-materials.js'));
  ({ prepareFormAward } = await import('../../services/functions/lib/form-rewards.js'));
  for (const uid of [CONTRIB, CAPPED, LAPSED, VALIDATOR]) {
    await db.doc(`contributorAccounts/${uid}`).set({ status: 'active', requiresPasswordChange: false });
  }
  const names = { [CONTRIB]: 'Review Contributor', [CAPPED]: 'Capped Contributor', [LAPSED]: 'Lapsed Contributor', [VALIDATOR]: 'Vera Validator', [ADMIN]: 'Review Admin', [LINGUIST]: 'Lena Linguist' };
  for (const [uid, displayName] of Object.entries(names)) await db.doc(`contributors/${uid}`).set({ public: { displayName }, languageProfile: { dialect: 'Paga' } });
  // Reset only what these scenarios own, so a rerun against a kept emulator starts clean.
  await db.doc('settings/indigenForms').set({ rewards: { enabled: true, maxPointsPerResponse: 20, dailyCap: 100 } }, { merge: true });
});
beforeEach(async () => {
  // Rate limits have their own tests; these scenarios decide far more often than a person would.
  await db.recursiveDelete(db.collection('_rateLimits'));
});
after(async () => {
  await db?.doc('settings/indigenForms').set({ rewards: { enabled: true, maxPointsPerResponse: 20, dailyCap: 100 } }, { merge: true });
  if (app) await deleteApp(app);
});

const state = {};

test('only reviewers with a verified staff session reach formsReview', async () => {
  await rejects(formsReview.run({ auth: { uid: CONTRIB, token: { uid: CONTRIB } }, data: { action: 'queue' }, rawRequest: { headers: {} } }), 'permission-denied');
  await rejects(review(VALIDATOR, { action: 'queue' }, { verified: false }), 'failed-precondition', (error) => assert.equal(error.details.reason, 'staff-mfa-required'));
  await rejects(formsReview.run({ auth: null, data: { action: 'queue' }, rawRequest: { headers: {} } }), 'unauthenticated');
  await rejects(review(VALIDATOR, { action: 'nonsense' }), 'invalid-argument');
  await rejects(review(VALIDATOR, { action: 'queue', status: 'draft' }), 'invalid-argument');
});

test('changes requested, revised and resubmitted: every revision is kept and the history tells the story', async () => {
  const formId = await publishNew(generalForm('Review flow check'));
  state.generalForm = formId;
  const first = await submitResponse(CONTRIB, formId, { answer: `  ${HEADWORD} `, consent_review: true });
  const second = await submitResponse(CONTRIB, formId, { answer: 'second answer', consent_review: true });

  const queued = await review(VALIDATOR, { action: 'queue', formId });
  assert.deepEqual(queued.rows.map((row) => row.id), [first, second], 'waiting work is listed oldest first');
  assert.equal(queued.rows[0].contributorName, 'Review Contributor');
  assert.ok(queued.forms.some((form) => form.id === formId && form.title === 'Review flow check'));

  const detail = await review(VALIDATOR, { action: 'get', responseId: first });
  assert.deepEqual(detail.allowedDecisions.sort(), ['approve', 'reject', 'request_changes', 'start_review']);
  assert.equal(detail.expectedStatus, 'submitted');
  assert.equal(detail.expectedRevision, 1);
  assert.ok(bytes(detail.answers.answer).equals(bytes(HEADWORD)));

  const started = await decide(VALIDATOR, first, 'start_review');
  assert.equal(started.status, 'under_review');
  assert.equal(started.replayed, false);
  assert.equal((await review(VALIDATOR, { action: 'queue', formId })).rows.length, 2, 'under review stays in the open queue');

  await rejects(decide(VALIDATOR, first, 'request_changes', { feedback: 'abc' }), 'invalid-argument', (error) => assert.equal(error.details.reason, 'feedback'));
  // The contributor turned review emails off: the notice is in-app only.
  await db.doc(`contributorSettings/${CONTRIB}`).set({ notifications: { reviewEmail: false } });
  const feedback = 'Please add the tone marks to the second syllable.';
  const changes = await decide(VALIDATOR, first, 'request_changes', { feedback });
  assert.equal(changes.status, 'changes_requested');
  const askedFor = await responseDoc(first);
  assert.equal(askedFor.feedback, feedback);
  assert.equal(askedFor.lastDecision.decision, 'request_changes');
  const notices = (await db.collection('notifications').where('authUid', '==', CONTRIB).get()).docs.map((doc) => doc.data());
  const notice = notices.find((item) => item.title === 'Changes requested on your form response');
  assert.ok(notice, 'the contributor is notified');
  assert.equal(notice.link, `/contributor/forms/submissions/${first}`);
  assert.deepEqual(notice.channels, ['in_app']);
  assert.match(notice.body, /Review flow check/);
  assert.ok(notice.body.includes(askedFor.referenceId));
  assert.ok(notice.body.includes(feedback));
  await db.doc(`contributorSettings/${CONTRIB}`).delete();

  const revisionOne = (await db.doc(`indigenFormResponses/${first}/formRevisions/1`).get()).data();
  const resubmitted = await contributor(CONTRIB, { action: 'submit', responseId: first, answers: { answer: `${HEADWORD} (corrected)`, consent_review: true }, expectedDraftRevision: askedFor.draftRevision, requestId: rid() });
  assert.equal(resubmitted.revision, 2);
  assert.equal(resubmitted.status, 'submitted');
  assert.deepEqual((await db.doc(`indigenFormResponses/${first}/formRevisions/1`).get()).data(), revisionOne, 'revision 1 is untouched');
  const revisionTwo = (await db.doc(`indigenFormResponses/${first}/formRevisions/2`).get()).data();
  assert.ok(bytes(revisionTwo.answers.answer).equals(bytes(`${HEADWORD} (corrected)`)));

  const staffView = await review(VALIDATOR, { action: 'get', responseId: first });
  const types = staffView.history.map((event) => event.type);
  for (const [earlier, later] of [['created', 'submitted'], ['submitted', 'review_started'], ['review_started', 'changes_requested'], ['changes_requested', 'resubmitted']]) {
    assert.ok(types.indexOf(earlier) >= 0 && types.indexOf(earlier) < types.indexOf(later), `${earlier} before ${later}: ${types.join(', ')}`);
  }
  assert.equal(staffView.history.find((event) => event.type === 'changes_requested').actorName, 'Vera Validator');
  assert.equal(staffView.revisions.length, 2);
  const ownView = await contributor(CONTRIB, { action: 'getMine', responseId: first });
  const asked = ownView.history.find((event) => event.type === 'changes_requested');
  assert.equal(asked.actorName, 'Indigen World reviewer', 'contributors see reviewers by role only');
  assert.equal(asked.feedback, feedback);

  // A form that pays nothing and routes nowhere.
  const approved = await decide(VALIDATOR, first, 'approve');
  assert.equal(approved.status, 'approved');
  assert.equal(approved.reward.status, 'not_applicable');
  assert.equal(approved.routing.status, 'not_applicable');
  assert.equal(approved.routing.destination, 'general_intake');
  assert.equal((await ledgerRow(first)).exists, false);
  const head = (await db.doc(`indigenForms/${formId}`).get()).data();
  assert.equal(head.counts.approved, 1);
  assert.equal(head.counts.submitted, 1);
  assert.equal(head.counts.under_review, 0);
  assert.equal(head.counts.changes_requested, 0);
  const audits = await db.collection('auditLogs').where('domain', '==', 'indigen-forms').where('metadata.responseId', '==', first).get();
  const actions = audits.docs.map((doc) => doc.get('action'));
  for (const action of ['forms.review.start_review', 'forms.review.request_changes', 'forms.review.approve']) assert.ok(actions.includes(action), action);
  assert.equal(JSON.stringify(audits.docs.map((doc) => doc.data())).includes('test-headword'), false, 'audit rows never carry answers');
  await rejects(decide(VALIDATOR, second, 'approve', { expectedRevision: 2 }), 'aborted', (error) => {
    assert.equal(error.details.reason, 'stale');
    assert.equal(error.details.revision, 1);
  });
  state.second = second;
});

test('approval pays once through the existing ledger, whatever the retries and races', async () => {
  const formId = await publishNew(generalForm('Paid review check', { review: reviewConfig({ checks: [{ id: 'accurate', label: 'Answer is accurate' }], points: 5 }) }));
  const first = await submitResponse(CONTRIB, formId, { answer: 'paid answer one', consent_review: true });
  const second = await submitResponse(CONTRIB, formId, { answer: 'paid answer two', consent_review: true });

  await rejects(decide(VALIDATOR, first, 'approve'), 'failed-precondition', (error) => {
    assert.equal(error.details.reason, 'checks');
    assert.deepEqual(error.details.missing, ['accurate']);
  });
  await rejects(decide(VALIDATOR, first, 'approve', { checks: ['accurate', 'invented'] }), 'invalid-argument');
  await rejects(decide(VALIDATOR, first, 'approve', { checks: ['accurate'], expectedRevision: 3 }), 'aborted', (error) => assert.equal(error.details.reason, 'stale'));

  const current = await responseDoc(first);
  const request = { action: 'decide', responseId: first, decision: 'approve', checks: ['accurate'], feedback: 'Clear and accurate.', expectedStatus: 'submitted', expectedRevision: current.revision, requestId: rid() };
  const approved = await review(VALIDATOR, request);
  assert.equal(approved.status, 'approved');
  assert.equal(approved.replayed, false);
  assert.deepEqual(approved.reward, { points: 5, status: 'awarded', note: null });

  const entry = (await ledgerRow(first)).data();
  assert.equal(entry.type, 'award');
  assert.equal(entry.points, 5);
  assert.equal(entry.contributorId, CONTRIB);
  assert.deepEqual(entry.actor, { kind: 'validator', id: VALIDATOR });
  assert.deepEqual(entry.policy, { id: formId, version: 1 });
  assert.deepEqual(entry.refs, { source: 'form', formId, formVersion: 1, responseId: first });
  assert.equal(entry.reason, 'Approved form response: Paid review check');
  const marker = (await db.doc(`formAwards/${first}`).get()).data();
  assert.equal(marker.status, 'awarded');
  assert.equal(marker.points, 5);
  assert.equal(marker.entryId, `formaward_${first}`);
  assert.equal(marker.reviewerUid, VALIDATOR);
  assert.equal(marker.referenceId, current.referenceId);
  const stored = await responseDoc(first);
  assert.deepEqual(stored.reward, { points: 5, status: 'awarded', entryId: `formaward_${first}`, note: null });
  const finance = await db.collection('auditLogs').where('domain', '==', 'contributor-rewards').where('action', '==', 'contributor.reward.form.award').get();
  assert.ok(finance.docs.some((doc) => doc.get('target.id') === first), 'Finance sees the award in listRewardAudit');
  const approval = (await db.collection('notifications').where('authUid', '==', CONTRIB).get()).docs.map((doc) => doc.data())
    .find((item) => item.title === 'Your form response was approved' && item.link === `/contributor/forms/submissions/${first}`);
  assert.ok(approval);
  assert.deepEqual(approval.channels, ['in_app', 'email']);
  assert.match(approval.body, /You earned 5 points/);

  // A retried call with the same request replays; the same request id with other content is refused.
  const historyBefore = (await db.collection(`indigenFormResponses/${first}/formHistory`).get()).size;
  const replay = await review(VALIDATOR, request);
  assert.equal(replay.replayed, true);
  assert.equal(replay.status, 'approved');
  assert.equal(replay.reward.points, 5);
  assert.equal((await db.collection(`indigenFormResponses/${first}/formHistory`).get()).size, historyBefore);
  await rejects(review(VALIDATOR, { ...request, feedback: 'Different words.' }), 'already-exists');
  // A second approval is refused whatever it claims to have seen.
  await rejects(review(VALIDATOR, { ...request, requestId: rid() }), 'aborted', (error) => assert.equal(error.details.reason, 'stale'));
  await rejects(review(VALIDATOR, { ...request, requestId: rid(), expectedStatus: 'approved' }), 'failed-precondition', (error) => assert.equal(error.details.reason, 'decision'));
  // Whatever path reaches the award again (a re-approval, a replayed trigger), the marker stops it.
  const again = await db.runTransaction(async (tx) => {
    const prepared = await prepareFormAward(db, tx, { responseId: first, formId, formTitle: 'Paid review check', formVersion: 1, uid: CONTRIB, points: 5, reviewerUid: ADMIN, now: new Date().toISOString() });
    prepared.commit();
    return prepared.outcome;
  });
  assert.equal(again.status, 'not_applicable');
  assert.match(again.note, /already settled \(5 points\)/);

  // Two reviewers approving at the same moment: one decision, one ledger row.
  const latest = await responseDoc(second);
  const race = await Promise.allSettled([VALIDATOR, ADMIN].map((uid) => review(uid, {
    action: 'decide', responseId: second, decision: 'approve', checks: ['accurate'], expectedStatus: 'submitted', expectedRevision: latest.revision, requestId: rid(),
  }, { role: uid === ADMIN ? 'admin' : 'validator' })));
  assert.equal(race.filter((result) => result.status === 'fulfilled').length, 1, JSON.stringify(race.map((result) => result.reason?.message ?? 'ok')));
  assert.equal(race.find((result) => result.status === 'rejected').reason.code, 'aborted');
  const rows = await db.collection('pointLedger').where('contributorId', '==', CONTRIB).where('type', '==', 'award').get();
  assert.deepEqual(rows.docs.map((doc) => doc.id).sort(), [`formaward_${first}`, `formaward_${second}`].sort());
  const account = (await db.doc(`contributorPointAccounts/${CONTRIB}`).get()).data();
  assert.equal(account.available, 10);
  assert.equal(account.lifetimeEarned, 10);
  assert.equal((await db.collection(`contributorAccounts/${CONTRIB}/formRewardDays`).get()).docs[0].get('points'), 10);

  const rewards = await getContributorRewards.run({ auth: { uid: CONTRIB, token: { uid: CONTRIB } }, data: {}, rawRequest: { headers: {} } });
  assert.equal(rewards.balance.available, 10);
  assert.deepEqual(rewards.formAwards.map((item) => item.responseId).sort(), [first, second].sort());
  const listed = rewards.formAwards.find((item) => item.responseId === first);
  assert.deepEqual(listed, { responseId: first, formTitle: 'Paid review check', referenceId: current.referenceId, points: 5, awardedAt: marker.awardedAt });
  state.paidForm = formId;
});

test('Finance limits cap each award and the day; inactive accounts and paused points pay nothing', async () => {
  const finance = (data) => formsAdmin.run(staffRequest(FINANCE, data, { role: 'admin', claims: { finance: true } }));
  await finance({ action: 'saveRewardSettings', enabled: true, maxPointsPerResponse: 3, dailyCap: 4 });
  const formId = state.paidForm;
  const answers = { answer: 'capped answer', consent_review: true };
  const [one, two, three] = [await submitResponse(CAPPED, formId, answers), await submitResponse(CAPPED, formId, answers), await submitResponse(CAPPED, formId, answers)];

  const capped = await decide(VALIDATOR, one, 'approve', { checks: ['accurate'] });
  assert.equal(capped.reward.status, 'awarded');
  assert.equal(capped.reward.points, 3);
  assert.match(capped.reward.note, /Reduced from 5 to 3/);
  const rest = await decide(VALIDATOR, two, 'approve', { checks: ['accurate'] });
  assert.equal(rest.reward.points, 1, 'only what is left of the daily cap');
  const none = await decide(VALIDATOR, three, 'approve', { checks: ['accurate'] });
  assert.equal(none.status, 'approved', 'the approval itself stands');
  assert.equal(none.reward.status, 'not_applicable');
  assert.equal(none.reward.points, 0);
  assert.match(none.reward.note, /today’s limit/);
  assert.equal((await ledgerRow(three)).exists, false);
  assert.equal((await db.doc(`contributorPointAccounts/${CAPPED}`).get()).get('available'), 4);

  // Suspended between submitting and approval: the approval is recorded as unpaid, for Finance to see.
  const lapsed = await submitResponse(LAPSED, formId, answers);
  await db.doc(`contributorAccounts/${LAPSED}`).update({ status: 'suspended' });
  const failed = await decide(VALIDATOR, lapsed, 'approve', { checks: ['accurate'] });
  assert.equal(failed.status, 'approved');
  assert.equal(failed.reward.status, 'failed');
  assert.match(failed.reward.note, /not active/);
  assert.equal((await ledgerRow(lapsed)).exists, false, 'no ledger row');
  assert.equal((await db.doc(`contributorPointAccounts/${LAPSED}`).get()).exists, false);
  assert.equal((await db.doc(`formAwards/${lapsed}`).get()).get('status'), 'failed');
  const history = (await review(VALIDATOR, { action: 'get', responseId: lapsed })).history;
  assert.ok(history.some((event) => event.type === 'points_failed'));
  await db.doc(`contributorAccounts/${LAPSED}`).update({ status: 'active' });

  await finance({ action: 'saveRewardSettings', enabled: false, maxPointsPerResponse: 20, dailyCap: 100 });
  const paused = await submitResponse(LAPSED, formId, answers);
  const unpaid = await decide(VALIDATOR, paused, 'approve', { checks: ['accurate'] });
  assert.equal(unpaid.reward.status, 'not_applicable');
  assert.match(unpaid.reward.note, /paused/);
  assert.equal((await ledgerRow(paused)).exists, false);
  await finance({ action: 'saveRewardSettings', enabled: true, maxPointsPerResponse: 20, dailyCap: 100 });
});

test('reviewers stay inside their group and never review their own response', async () => {
  // A validator who also contributes.
  const own = await submitResponse(VALIDATOR, state.generalForm, { answer: 'my own answer', consent_review: true });
  await rejects(review(VALIDATOR, { action: 'get', responseId: own }), 'permission-denied');
  await rejects(decide(VALIDATOR, own, 'approve'), 'permission-denied');
  assert.equal((await review(VALIDATOR, { action: 'queue', formId: state.generalForm })).rows.some((row) => row.id === own), false);
  assert.equal((await decide(ADMIN, own, 'reject', { feedback: 'Not for this form.' }, { role: 'admin' })).status, 'rejected');

  const adminsOnly = await publishNew(generalForm('Administrators only check', { review: reviewConfig({ reviewerGroup: 'admins' }) }));
  const response = await submitResponse(CONTRIB, adminsOnly, { answer: 'for administrators', consent_review: true });
  assert.deepEqual((await review(VALIDATOR, { action: 'queue', formId: adminsOnly })).rows, []);
  assert.equal((await review(VALIDATOR, { action: 'queue' })).forms.some((form) => form.id === adminsOnly), false);
  await rejects(review(VALIDATOR, { action: 'get', responseId: response }), 'permission-denied', (error) => assert.equal(error.details.reason, 'group'));
  await rejects(decide(VALIDATOR, response, 'approve'), 'permission-denied');
  await rejects(review(VALIDATOR, { action: 'attachmentLink', responseId: response, attachmentId: 'up_anything_1234' }), 'permission-denied');
  assert.equal((await asAdmin({ action: 'queue', formId: adminsOnly })).rows[0].id, response);
  assert.equal((await decide(ADMIN, response, 'approve', {}, { role: 'admin' })).status, 'approved');

  // Qualified language reviewers need an active, unexpired grant.
  const scoped = await publishNew(generalForm('Language reviewers check', { review: reviewConfig({ reviewerGroup: 'language_reviewers' }) }));
  const scopedResponse = await submitResponse(CONTRIB, scoped, { answer: 'for linguists', consent_review: true });
  await rejects(review(LINGUIST, { action: 'get', responseId: scopedResponse }), 'permission-denied');
  await db.doc(`knowledgeRoleGrants/${LINGUIST}`).set({ active: true, scopes: ['language'], expiresAt: new Date(Date.now() + 86_400_000).toISOString(), qualificationReference: 'test-qualification' });
  assert.equal((await review(LINGUIST, { action: 'get', responseId: scopedResponse })).id, scopedResponse);

  // A form kept without review is not reviewed, and earns and routes nothing.
  const unreviewed = await publishNew(generalForm('No review check', { review: reviewConfig({ required: false }) }));
  const kept = await submitResponse(CONTRIB, unreviewed, { answer: 'kept as received', consent_review: true });
  assert.deepEqual((await review(VALIDATOR, { action: 'queue', formId: unreviewed })).rows, []);
  assert.deepEqual((await review(VALIDATOR, { action: 'get', responseId: kept })).allowedDecisions, []);
  await rejects(decide(VALIDATOR, kept, 'approve'), 'failed-precondition', (error) => assert.equal(error.details.reason, 'no-review'));
  await rejects(asAdmin({ action: 'retryRouting', responseId: kept }), 'failed-precondition');
  await rejects(review(VALIDATOR, { action: 'retryRouting', responseId: state.second }), 'permission-denied', undefined);
});

test('dictionary routing files a candidate in the review desk, with the campaign and form origin and no portal marker', async () => {
  const formId = await publishNew(dictionaryForm('Dictionary routing check'));
  const responseId = await submitResponse(CONTRIB, formId, {
    word: HEADWORD, meaning: 'test-meaning-water', dialect: 'paga', pos: 'adjective', speaker_permission: true, rights_confirmed: true,
    consent_review: true, consent_storage: true, consent_public: true, consent_training: false,
  }, { files: async (id) => ({ pronunciation: [await upload(CONTRIB, id, 'pronunciation', 'say-it.wav', 'audio/wav', WAV)] }) });
  const submitted = await responseDoc(responseId);

  const approved = await decide(VALIDATOR, responseId, 'approve', { checks: ['spelling'] });
  assert.equal(approved.reward.status, 'awarded');
  assert.equal(approved.routing.status, 'routed', approved.routing.note);
  assert.equal(approved.routing.targetCollection, 'submissions');
  const targetId = approved.routing.targetId;
  assert.match(targetId, /^form_[a-f0-9]{32}$/);

  const submission = (await db.doc(`submissions/${targetId}`).get()).data();
  assert.ok(submission, 'the canonical submission exists');
  assert.equal('contributorPortal' in submission, false, 'never a contributor-portal marker');
  assert.deepEqual(submission.campaign, { collection: 'campaigns', id: 'collection-contributions' });
  assert.equal(submission.status, 'SUBMITTED');
  assert.equal(submission.authUid, CONTRIB);
  assert.ok(bytes(submission.body).equals(bytes(HEADWORD)), 'the headword is byte-exact');
  assert.equal(submission.title, 'test-meaning-water');
  assert.equal(submission.format, 'Adjective');
  assert.equal(submission.dialect, 'Paga');
  assert.equal(submission.sourceReferences, `Indigen Forms: Dictionary routing check (${submitted.referenceId})`);
  assert.deepEqual(submission.formOrigin, { formId, formVersion: 1, responseId, revision: 1, referenceId: submitted.referenceId, routedBy: VALIDATOR });
  assert.equal(submission.permissions.publication, true);
  assert.equal(submission.permissions.aiTraining, false, 'training was not granted on the form');
  assert.equal(submission.permissions.consentVersion, `forms:${formId}@v1`);
  assert.equal(submission.permissions.statements.find((item) => item.purpose === 'public').statement, 'Synthetic public permission statement.');
  assert.match(submission.media.storagePath, new RegExp(`^creator-submissions/${CONTRIB}/collection-contributions/${targetId}/`));
  assert.equal(submission.media.mimeType, 'audio/wav');
  // Exactly what the contributor stated on the form; third-party material was never asked.
  assert.deepEqual(submission.attestations, { ownsOrHasRights: true, participantsConsented: true, noUnlawfulCopyright: true });
  assert.equal(submission.disclosures.usesThirdPartyMaterial, null);
  assert.equal(submission.disclosures.involvesMinors, null);

  const receipt = (await db.doc(`collectionContributions/${targetId}`).get()).data();
  assert.equal(receipt.status, 'submitted');
  assert.equal(receipt.submissionId, targetId);
  assert.equal('contributorPortal' in receipt, false);
  assert.ok(bytes(receipt.body).equals(bytes(HEADWORD)));
  assert.equal(receipt.publicationPermission, true);
  assert.equal(receipt.rightsConfirmed, true);
  assert.equal(receipt.participantConsentConfirmed, true);
  assert.equal(receipt.usesThirdPartyMaterial, null);
  assert.deepEqual(receipt.formOrigin, submission.formOrigin);
  assert.ok((await db.doc('campaigns/collection-contributions').get()).exists);

  const [copied] = await getStorage(app).bucket().file(submission.media.storagePath).download();
  assert.ok(copied.equals(WAV), 'the inspected recording is copied byte for byte');
  const route = (await db.doc(`indigenFormRoutes/${responseId}`).get()).data();
  assert.equal(route.targetId, targetId);
  assert.equal(route.files.length, 1);
  const stored = await responseDoc(responseId);
  const { routeKey, ...routing } = stored.routing;
  assert.deepEqual(routing, { destination: 'dictionary_candidate', status: 'routed', targetCollection: 'submissions', targetId, note: null });
  // The id derives from a key recorded with the approval, which no client sees.
  assert.match(routeKey, /^[a-f0-9]{32}$/);
  assert.equal(targetId, `form_${createHash('sha256').update(`forms:${responseId}:${routeKey}`).digest('hex').slice(0, 32)}`);
  assert.equal('routeKey' in approved.routing, false);
  assert.equal(JSON.stringify([submission, receipt]).includes(routeKey), false);
  assert.equal(JSON.stringify(await contributor(CONTRIB, { action: 'getMine', responseId })).includes(routeKey), false);
  const detail = await review(VALIDATOR, { action: 'get', responseId });
  assert.equal(JSON.stringify(detail).includes(routeKey), false);
  assert.ok(detail.history.some((event) => event.type === 'routed'));
  const audit = await db.collection('auditLogs').where('action', '==', 'forms.route').where('metadata.responseId', '==', responseId).get();
  assert.equal(audit.size, 1);
  // Routing again is a no-op and administrators cannot re-route a routed response.
  await rejects(asAdmin({ action: 'retryRouting', responseId }), 'failed-precondition');

  // The form approval paid; approving the routed candidate later pays no community points on top.
  const receiptRef = db.doc(`collectionContributions/${targetId}`);
  const beforeSnap = await receiptRef.get();
  await receiptRef.update({ status: 'approved' });
  const afterSnap = await receiptRef.get();
  await awardContributorPoints.run({ data: { before: beforeSnap, after: afterSnap }, params: { contributionId: targetId } });
  assert.equal((await db.doc(`contributorPointAwards/${targetId}`).get()).exists, false, 'no leaderboard award for a routed candidate');
  // The same event without the form origin would have paid: the guard is what stops it.
  const unmarked = { exists: true, id: afterSnap.id, ref: afterSnap.ref, get: (field) => (field === 'formOrigin' ? undefined : afterSnap.get(field)), data: () => ({ ...afterSnap.data(), formOrigin: undefined }) };
  await awardContributorPoints.run({ data: { before: beforeSnap, after: unmarked }, params: { contributionId: targetId } });
  assert.equal((await db.doc(`contributorPointAwards/${targetId}`).get()).exists, true);
});

test('routing waits for the consents its destination names; general intake goes nowhere', async () => {
  const formId = await publishNew(dictionaryForm('Dictionary consent check', { reviewConsentRequired: false }));
  const responseId = await submitResponse(CONTRIB, formId, { word: 'test-headword-two', meaning: 'test-meaning-two', consent_public: true });
  const approved = await decide(VALIDATOR, responseId, 'approve', { checks: ['spelling'] });
  assert.equal(approved.status, 'approved');
  assert.equal(approved.routing.status, 'blocked');
  assert.match(approved.routing.note, /Internal review/);
  assert.equal(approved.routing.targetId, null);
  const created = await db.collection('submissions').where('formOrigin.responseId', '==', responseId).get();
  assert.equal(created.size, 0, 'nothing is filed without the consent');
  const detail = await review(VALIDATOR, { action: 'get', responseId });
  assert.ok(detail.history.some((event) => event.type === 'routing_blocked'));
  await rejects(asAdmin({ action: 'retryRouting', responseId }), 'failed-precondition');
});

test('the shipped word template asks the people heard in a recording before it goes to the dictionary', async () => {
  const template = structuredClone(FORM_TEMPLATES.find((item) => item.id === 'kasem_word_collection').definition);
  const formId = await publishNew({ ...template, title: 'Word template routing check' });
  const answers = {
    word: HEADWORD, meaning: 'test-meaning-template', dialect: 'paga', part_of_speech: 'noun',
    examples: [{ example_kasem: `${HEADWORD} test-example`, example_english: 'test-example-english' }],
    source: 'own_knowledge', rights_confirmed: true, consent_review: true, consent_storage: true,
  };
  const draft = await contributor(CONTRIB, { action: 'saveDraft', formId, version: 1, answers: {}, requestId: rid() });
  const recording = await upload(CONTRIB, draft.responseId, 'pronunciation', 'say-it.wav', 'audio/wav', WAV);
  const send = (extra) => contributor(CONTRIB, { action: 'submit', responseId: draft.responseId, answers: { ...answers, pronunciation: [recording], ...extra }, expectedDraftRevision: draft.draftRevision, requestId: rid() });
  await rejects(send({}), 'failed-precondition', (error) => assert.ok(error.details.issues.some((issue) => issue.path === 'speaker_permission'), JSON.stringify(error.details)));
  await send({ speaker_permission: true });

  const approved = await decide(VALIDATOR, draft.responseId, 'approve', { checks: ['spelling', 'meaning', 'example'] });
  assert.equal(approved.routing.status, 'routed', approved.routing.note);
  const submission = (await db.doc(`submissions/${approved.routing.targetId}`).get()).data();
  assert.equal(submission.media.mediaType, 'audio');
  assert.deepEqual(submission.attestations, { ownsOrHasRights: true, participantsConsented: true, noUnlawfulCopyright: true });
  assert.equal(submission.disclosures.usesThirdPartyMaterial, null);
});

test('dictionary routing records only the statements the contributor made, and leaves a recording behind without the speakers’ agreement', async () => {
  // A form that never asks: the recording stays with the form and nothing is attested.
  const silent = await publishNew(dictionaryForm('Dictionary unasked check', { attestations: false }));
  const unasked = await submitResponse(CONTRIB, silent, { word: 'test-headword-unasked', meaning: 'test-meaning-unasked', consent_review: true, consent_storage: true },
    { files: async (id) => ({ pronunciation: [await upload(CONTRIB, id, 'pronunciation', 'say-it.wav', 'audio/wav', WAV)] }) });
  const filed = await decide(VALIDATOR, unasked, 'approve', { checks: ['spelling'] });
  assert.equal(filed.routing.status, 'routed', filed.routing.note);
  assert.match(filed.routing.note, /recording was not copied: this form does not ask whether the people heard in it agreed/);
  const submission = (await db.doc(`submissions/${filed.routing.targetId}`).get()).data();
  assert.equal('media' in submission, false);
  assert.deepEqual(submission.attestations, { ownsOrHasRights: null, participantsConsented: null, noUnlawfulCopyright: null });
  assert.equal(submission.disclosures.usesThirdPartyMaterial, null);
  const receipt = (await db.doc(`collectionContributions/${filed.routing.targetId}`).get()).data();
  assert.equal(receipt.rightsConfirmed, null);
  assert.equal(receipt.participantConsentConfirmed, null);
  assert.equal(receipt.usesThirdPartyMaterial, null);
  assert.equal(receipt.mediaStoragePath, null);
  assert.deepEqual((await db.doc(`indigenFormRoutes/${unasked}`).get()).get('files'), []);

  // Asked, and not confirmed: recorded as a "no", and the recording stays behind.
  const asking = await publishNew(dictionaryForm('Dictionary declined check'));
  const declined = await submitResponse(CONTRIB, asking, {
    word: 'test-headword-declined', meaning: 'test-meaning-declined', speaker_permission: false, rights_confirmed: false, consent_review: true, consent_storage: true,
  }, { files: async (id) => ({ pronunciation: [await upload(CONTRIB, id, 'pronunciation', 'say-it.wav', 'audio/wav', WAV)] }) });
  const kept = await decide(VALIDATOR, declined, 'approve', { checks: ['spelling'] });
  assert.equal(kept.routing.status, 'routed', kept.routing.note);
  assert.match(kept.routing.note, /recording was not copied: the contributor did not confirm that the people heard in it agreed/);
  const declinedSubmission = (await db.doc(`submissions/${kept.routing.targetId}`).get()).data();
  assert.equal('media' in declinedSubmission, false);
  assert.deepEqual(declinedSubmission.attestations, { ownsOrHasRights: false, participantsConsented: false, noUnlawfulCopyright: false });
});

test('routing refuses a record or a file it did not make, whatever they claim', async () => {
  const formId = await publishNew(dictionaryForm('Dictionary claim check'));
  let attachment;
  const responseId = await submitResponse(CONTRIB, formId, {
    word: 'test-headword-claim', meaning: 'test-meaning-claim', speaker_permission: true, rights_confirmed: true, consent_review: true, consent_storage: true,
  }, { files: async (id) => { attachment = await upload(CONTRIB, id, 'pronunciation', 'say-it.wav', 'audio/wav', WAV); return { pronunciation: [attachment] }; } });
  // A first attempt that fails (the upload is briefly not ready) keeps the approval's route key for the retries.
  const uploadRef = db.doc(`indigenFormUploads/${attachment.id}`);
  await uploadRef.update({ status: 'pending' });
  const first = await decide(VALIDATOR, responseId, 'approve', { checks: ['spelling'] });
  assert.equal(first.routing.status, 'failed');
  await uploadRef.update({ status: 'ready' });
  const { routeKey } = (await responseDoc(responseId)).routing;
  assert.match(routeKey, /^[a-f0-9]{32}$/);
  const targetId = `form_${createHash('sha256').update(`forms:${responseId}:${routeKey}`).digest('hex').slice(0, 32)}`;
  const path = `creator-submissions/${CONTRIB}/collection-contributions/${targetId}/pronunciation.wav`;
  const bucket = getStorage(app).bucket();

  // A different file at the destination, labelled with the upload and generation it claims to come from.
  const { generation } = (await uploadRef.get()).data();
  await bucket.file(path).save(Buffer.concat([WAV, Buffer.from('swapped')]), { contentType: 'audio/wav', metadata: { metadata: { formsUploadId: attachment.id, formsSourceGeneration: String(generation) } } });
  const swapped = await asAdmin({ action: 'retryRouting', responseId });
  assert.equal(swapped.routing.status, 'failed');
  assert.match(swapped.routing.note, /a different file already holds its place/);
  assert.equal((await db.doc(`submissions/${targetId}`).get()).exists, false);
  await bucket.file(path).delete();

  // A record at the destination id that says it belongs to this response.
  const claimed = { id: targetId, authUid: CONTRIB, status: 'SUBMITTED', title: 'claimed', formOrigin: { responseId } };
  await db.doc(`submissions/${targetId}`).set(claimed);
  const hijack = await asAdmin({ action: 'retryRouting', responseId });
  assert.equal(hijack.routing.status, 'failed');
  assert.match(hijack.routing.note, /A different record already uses this destination id/);
  assert.equal((await db.doc(`collectionContributions/${targetId}`).get()).exists, false);
  assert.equal((await db.doc(`indigenFormRoutes/${responseId}`).get()).exists, false, 'nothing records the claimed record as filed');
  assert.deepEqual((await db.doc(`submissions/${targetId}`).get()).data(), claimed, 'the claimed record is left as it was');
  await db.doc(`submissions/${targetId}`).delete();

  // With the places clear the retry files it, keeping the copy the refused attempt made from the inspected generation.
  const routed = await asAdmin({ action: 'retryRouting', responseId });
  assert.equal(routed.routing.status, 'routed', routed.routing.note);
  assert.equal(routed.routing.targetId, targetId);
  assert.equal((await db.doc(`submissions/${targetId}`).get()).get('media.storagePath'), path);
  const [copied] = await bucket.file(path).download();
  assert.ok(copied.equals(WAV));
  assert.equal((await responseDoc(responseId)).routing.routeKey, routeKey, 'one key for the whole approval');
});

test('materials desk routing: documents and translations become portal records with exact types and only the granted uses', async () => {
  const docsForm = await publishNew(documentForm('Documents routing check'));
  const responseId = await submitResponse(CONTRIB, docsForm, {
    title: 'Field notes', description: 'Notes from a test visit.', source: 'test-source-notebook', rights: 'I wrote these notes myself.',
    consent_review: true, consent_training: true,
  }, { files: async (id) => ({ attachments: [await upload(CONTRIB, id, 'attachments', 'notes.txt', 'text/plain', NOTES)] }) });
  const approved = await decide(VALIDATOR, responseId, 'approve');
  assert.equal(approved.routing.status, 'routed', approved.routing.note);
  assert.equal(approved.routing.targetCollection, 'portalContributions');
  const recordId = approved.routing.targetId;
  assert.match(recordId, /^PC-[a-f0-9]{32}$/);
  const record = (await db.doc(`portalContributions/${recordId}`).get()).data();
  assert.equal(record.type, 'documents');
  assert.equal(record.owner, CONTRIB);
  assert.equal(record.status, 'submitted');
  assert.equal(record.language, 'xsm');
  assert.equal(record.title, 'Field notes');
  assert.equal(record.content.text, 'Notes from a test visit.');
  assert.equal(record.content.source, 'test-source-notebook');
  assert.equal(record.content.restrictions, 'I wrote these notes myself.');
  assert.deepEqual(record.uses, { review: true, retrieval: false, training: true, public: false });
  assert.equal(record.consent.version, `forms:${docsForm}@v1`);
  assert.equal(record.rights.ownership, 'unclear');
  assert.equal(record.parent, undefined, 'form origin, never a portal parent');
  assert.equal(record.formOrigin.responseId, responseId);
  assert.equal(record.processing.state, 'queued');
  assert.equal(record.files.length, 1);
  const [file] = record.files;
  assert.match(file.path, new RegExp(`^portal-originals/${CONTRIB}/[\\w-]{8,150}/[\\w-]{8,150}$`));
  assert.equal(file.mime, 'text/plain');
  assert.equal(file.name, 'notes.txt');
  assert.ok((await db.doc(`portalContributions/${recordId}/versions/1`).get()).exists);
  const [metadata] = await getStorage(app).bucket().file(file.path).getMetadata();
  assert.equal(metadata.contentType, 'text/plain');
  // The copy passes the materials desk's own inspection, exactly as an upload there would.
  await processPortalMaterial(recordId, 1);
  const processed = (await db.doc(`portalContributions/${recordId}`).get()).data().processing;
  assert.equal(processed.state, 'extracted_unverified', JSON.stringify(processed.files));
  assert.ok(processed.files[0].text.includes('test-notes-ɔ̀'));

  // A format the materials desk does not take is a named failure, not a guess.
  const webpResponse = await submitResponse(CONTRIB, docsForm, { title: 'Picture', consent_review: true },
    { files: async (id) => ({ attachments: [await upload(CONTRIB, id, 'attachments', 'leaf.webp', 'image/webp', WEBP)] }) });
  const refused = await decide(VALIDATOR, webpResponse, 'approve');
  assert.equal(refused.status, 'approved');
  assert.equal(refused.routing.status, 'failed');
  assert.match(refused.routing.note, /leaf\.webp/);
  assert.equal((await db.collection('portalContributions').where('formOrigin.responseId', '==', webpResponse).get()).size, 0);
  const retried = await asAdmin({ action: 'retryRouting', responseId: webpResponse });
  assert.equal(retried.routing.status, 'failed');
  await rejects(review(VALIDATOR, { action: 'retryRouting', responseId: webpResponse }), 'permission-denied');

  const translationFormId = await publishNew(translationForm('Translation routing check'));
  const translated = await submitResponse(CONTRIB, translationFormId, {
    source_sentence: 'Where is the water?', translation: `${HEADWORD} test-translation`, source_language: 'english', dialect: 'navrongo',
    notes: 'Said at the well.', consent_review: true, consent_public: false,
  });
  const routed = await decide(VALIDATOR, translated, 'approve');
  assert.equal(routed.routing.status, 'routed', routed.routing.note);
  const translation = (await db.doc(`portalContributions/${routed.routing.targetId}`).get()).data();
  assert.equal(translation.type, 'translations');
  assert.equal(translation.provenance, 'translated');
  assert.equal(translation.content.sourceText, 'Where is the water?');
  assert.ok(bytes(translation.content.text).equals(bytes(`${HEADWORD} test-translation`)), 'Kasem text is kept byte for byte (no normalisation)');
  assert.equal(translation.content.sourceLanguage, 'English');
  assert.equal(translation.content.dialect, 'Navrongo');
  assert.equal(translation.content.context, 'Said at the well.');
  assert.deepEqual(translation.uses, { review: true, retrieval: false, training: false, public: false });
  assert.equal(translation.processing.state, 'not_required');
});
