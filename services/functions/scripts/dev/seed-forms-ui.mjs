// Seeds the local emulators with a realistic Indigen Forms state by driving the
// REAL compiled callables (formsAdmin, formsContributor, formsReview): an admin
// builds and publishes forms from the starter templates, contributors save
// drafts and submit, and reviewers request changes, approve and reject.
//
// Emulators only (demo project). People are "Local test · …". Kasem is limited
// to verified entries (na "water", its example "na bam zura mo", kunkwolo
// "bottle", Paga) or obvious placeholders: nothing here is invented Kasem.
//
//   npx firebase emulators:start --only auth,firestore,storage --project demo-indigen-world
//   npm run build:functions
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
//     (any localhost emulator ports are accepted; the project must be a demo- project)
//     FIREBASE_STORAGE_EMULATOR_HOST=127.0.0.1:9199 node services/functions/scripts/dev/seed-forms-ui.mjs
//
// Test password (emulator accounts only): exported as FORMS_TEST_PASSWORD.

process.env.GCLOUD_PROJECT ??= 'demo-indigen-world';
const local = (host) => /^127\.0\.0\.1:\d+$/.test(host ?? '');
if (!local(process.env.FIRESTORE_EMULATOR_HOST) || !local(process.env.FIREBASE_AUTH_EMULATOR_HOST) || !process.env.GCLOUD_PROJECT.startsWith('demo-')) {
  throw new Error('Only the isolated localhost emulators are allowed.');
}
process.env.FUNCTIONS_EMULATOR = 'true';
export const FORMS_TEST_PASSWORD = 'FormsTest123!';

// lib/index.js initialises the default app itself (project from GCLOUD_PROJECT).
const lib = await import('../../lib/index.js');
const { getAuth } = await import('firebase-admin/auth');
const { getFirestore } = await import('firebase-admin/firestore');
const db = getFirestore();
const auth = getAuth();
const now = new Date().toISOString();
const authTime = Math.floor(Date.now() / 1000);
// A verified staff session: staffMfa lists this sign-in's auth_time (see firebase/tests/fixtures/staffSession.mjs).
const staff = (role) => ({ role, auth_time: authTime, staffMfa: [authTime] });
const run = (fn, uid, data, token = {}) => lib[fn].run({ auth: { uid, token: { uid, ...token } }, data, rawRequest: { headers: { origin: 'http://127.0.0.1:5199' }, ip: '127.0.0.1' } });
const requestId = (label) => `seed-${label}-${'x'.repeat(24)}`.slice(0, 60);

const ADMIN = 'ui-forms-admin';
const REVIEWER = 'ui-forms-reviewer';
const people = [
  [ADMIN, 'admin@forms.test', 'Local test · Forms admin', { role: 'admin', finance: true }, null],
  [REVIEWER, 'reviewer@forms.test', 'Local test · Reviewer', { role: 'validator' }, null],
  ['ui-forms-ama', 'ama@forms.test', 'Local test · Contributor A', null, 'Paga'],
  ['ui-forms-kofi', 'kofi@forms.test', 'Local test · Contributor B', null, 'Navrongo'],
  ['ui-forms-esi', 'esi@forms.test', 'Local test · Contributor C', null, 'Chiana'],
];
for (const [uid, email, name, claims, dialect] of people) {
  try { await auth.createUser({ uid, email, password: FORMS_TEST_PASSWORD, displayName: name }); }
  catch (error) { if (!['auth/uid-already-exists', 'auth/email-already-exists'].includes(error.code)) throw error; }
  if (claims) await auth.setCustomUserClaims(uid, claims);
  if (dialect) {
    await db.doc(`contributorAccounts/${uid}`).set({ status: 'active', requiresPasswordChange: false, phoneNumber: '+233200000001',
      trainingAgreement: { version: 'contributor-training-v2', acceptedAt: now } });
    await db.doc(`contributors/${uid}`).set({ id: uid, authUid: uid, status: 'active', publicVisibility: 'hidden', public: { displayName: name },
      private: { email }, permissions: { edit: true, submit: true, review: false, publish: false }, roles: ['translator'],
      contributionTypes: ['expressions', 'audio'], languageProfile: { dialect, otherLanguages: 'English' } });
  }
}

const admin = (data) => run('formsAdmin', ADMIN, data, staff('admin'));
const contributor = (uid, data) => run('formsContributor', uid, data, { role: 'contributor' });
const review = (data) => run('formsReview', REVIEWER, data, staff('validator'));

/** Create a form from a template, apply edits to its draft, publish it. */
async function publishTemplate(templateId, edit = (definition) => definition) {
  const { formId } = await admin({ action: 'create', templateId });
  const { draft } = await admin({ action: 'get', formId });
  const definition = edit(structuredClone(draft.definition));
  const saved = await admin({ action: 'saveDraft', formId, definition, version: draft.version, expectedRevision: draft.revision });
  await admin({ action: 'publish', formId, version: draft.version, expectedRevision: saved.revision });
  return formId;
}

const closes = new Date(Date.now() + 21 * 24 * 3600 * 1000).toISOString();
const words = await publishTemplate('kasem_word_collection', (d) => ({ ...d, title: 'Everyday words: home and water', schedule: { opensAt: null, closesAt: closes } }));
const feedback = await publishTemplate('general_feedback');
const oral = await publishTemplate('oral_history', (d) => ({ ...d, audience: { mode: 'groups', dialectIds: ['paga'], contributionTypes: [], cohortIds: [] } }));
// One draft form that has never been published, for the dashboard.
const { formId: research } = await admin({ action: 'create', templateId: 'research_documents' });
console.log('forms', { words, feedback, oral, research });

/** Save a draft then submit it, returning the response id. */
async function submit(uid, formId, answers, label) {
  const opened = await contributor(uid, { action: 'open', formId, startNew: true });
  const draft = await contributor(uid, { action: 'saveDraft', formId, version: opened.version, answers, requestId: requestId(`${label}-draft`) });
  const result = await contributor(uid, { action: 'submit', responseId: draft.responseId, answers, expectedDraftRevision: draft.draftRevision, requestId: requestId(`${label}-submit`) });
  return result.responseId;
}

const wordAnswers = (word, meaning, dialect, example) => ({
  word, meaning, dialect, part_of_speech: 'noun',
  examples: [{ example_kasem: example, example_english: 'Placeholder English translation for the local test.' }],
  source: 'own_knowledge', consent_review: true, consent_public: true,
});
const naId = await submit('ui-forms-ama', words, wordAnswers('na', 'water', 'paga', 'na bam zura mo'), 'na');
const bottleId = await submit('ui-forms-kofi', words, wordAnswers('kunkwolo', 'bottle', 'paga', 'test-example-ɛ́-ɔ̀-ʋ̀'), 'bottle');
const placeholderId = await submit('ui-forms-esi', words, wordAnswers('test-word-ɩ́ŋ', 'test meaning (placeholder)', 'chiana', 'test-example-placeholder'), 'placeholder');
const feedbackId = await submit('ui-forms-kofi', feedback, { topic: 'contributor_portal', feedback: 'Local test feedback: the forms list is easy to find.' }, 'feedback');

// Reviewer decisions: approve one (points), request changes on one, reject none yet.
const detail = async (responseId) => review({ action: 'get', responseId });
const decide = async (responseId, decision, extra = {}) => {
  const current = await detail(responseId);
  return review({ action: 'decide', responseId, decision, expectedStatus: current.expectedStatus, expectedRevision: current.expectedRevision, requestId: requestId(`${responseId}-${decision}`), ...extra });
};
await decide(naId, 'start_review');
await decide(naId, 'approve', { checks: ['spelling', 'meaning', 'example'] });
await decide(bottleId, 'request_changes', { feedback: 'Please add the variety you heard this in and a second example sentence.' });
await run('formsReview', ADMIN, { action: 'decide', responseId: feedbackId, decision: 'approve', checks: [], expectedStatus: 'submitted', expectedRevision: 1, requestId: requestId('feedback-approve') }, staff('admin'));

// A draft in progress on the oral-history form (Paga speakers only).
const oralOpen = await contributor('ui-forms-ama', { action: 'open', formId: oral, startNew: true });
await contributor('ui-forms-ama', { action: 'saveDraft', formId: oral, version: oralOpen.version,
  answers: { title: 'Local test · How the market day was announced', attribution: 'initials', language: 'kasem', format: 'written' }, requestId: requestId('oral-draft') });

console.log('responses', { naId, bottleId, placeholderId, feedbackId });
console.log(`Sign in with ${people.map(([, email]) => email).join(', ')} / ${FORMS_TEST_PASSWORD}`);
