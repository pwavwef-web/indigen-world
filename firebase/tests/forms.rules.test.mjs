import { after, before, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { OWNER_UID, verifiedStaff } from './fixtures/staffSession.mjs';

/**
 * Indigen Forms data is server-only (docs/architecture/indigen-forms.md): the
 * formsAdmin, formsContributor and formsReview callables are the only way in.
 * No client — contributor, reviewer, administrator, owner or anonymous — may
 * read or write any of it directly, not even a contributor's own response.
 */

const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':');
let env;
/** assertFails, naming who tried what when a rule unexpectedly allows it. */
const denied = (promise, label) => assertFails(promise).catch((error) => { throw new Error(`${label}: ${error.message}`); });

const OWN = 'forms-contributor';
const paths = [
  'indigenForms/form_a',
  'indigenForms/form_a/formVersions/1',
  `indigenFormResponses/resp_a`,
  'indigenFormResponses/resp_a/formRevisions/1',
  'indigenFormResponses/resp_a/formHistory/created',
  'indigenFormUploads/up_a',
  'indigenFormCohorts/elders',
  'indigenFormRequests/retry-a',
  'indigenFormRoutes/resp_a',
  'formAwards/resp_a',
  'settings/indigenForms',
];
const collections = ['indigenForms', 'indigenForms/form_a/formVersions', 'indigenFormResponses', 'indigenFormResponses/resp_a/formRevisions',
  'indigenFormResponses/resp_a/formHistory', 'indigenFormUploads', 'indigenFormCohorts', 'indigenFormRequests', 'indigenFormRoutes', 'formAwards'];

before(async () => {
  env = await initializeTestEnvironment({
    projectId: process.env.GCLOUD_PROJECT ?? 'demo-indigen-forms',
    firestore: { host, port: Number(port), rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') },
  });
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `contributorAccounts/${OWN}`), { status: 'active' });
    for (const path of paths) {
      await setDoc(doc(db, path), { contributorUid: OWN, ownerUid: OWN, uid: OWN, memberUids: [OWN], answers: { word: 'test-ʋ̀ʋ́' }, status: 'submitted' });
    }
  });
});
after(async () => env?.cleanup());

const contexts = () => ({
  'the contributor who owns the response': env.authenticatedContext(OWN, { role: 'contributor' }).firestore(),
  'another contributor': env.authenticatedContext('forms-other', { role: 'contributor' }).firestore(),
  'a verified reviewer': env.authenticatedContext('forms-reviewer', { role: 'validator', ...verifiedStaff() }).firestore(),
  'a verified administrator': env.authenticatedContext('forms-admin', { role: 'admin', ...verifiedStaff() }).firestore(),
  'the verified owner super administrator': env.authenticatedContext(OWNER_UID, { role: 'super_admin', superAdmin: true, ...verifiedStaff() }).firestore(),
  'an anonymous visitor': env.unauthenticatedContext().firestore(),
});

test('no client can read any Indigen Forms document or collection', async () => {
  for (const [who, db] of Object.entries(contexts())) {
    for (const path of paths) await denied(getDoc(doc(db, path)), `${who} read ${path}`);
    for (const path of collections) await denied(getDocs(collection(db, path)), `${who} listed ${path}`);
  }
});

test('no client can create, change or delete any Indigen Forms document', async () => {
  for (const [who, db] of Object.entries(contexts())) {
    for (const path of paths) {
      await denied(setDoc(doc(db, path), { status: 'approved', contributorUid: OWN }), `${who} wrote ${path}`);
      await denied(updateDoc(doc(db, path), { status: 'approved' }), `${who} updated ${path}`);
      await denied(deleteDoc(doc(db, path)), `${who} deleted ${path}`);
    }
    await denied(setDoc(doc(db, 'indigenFormResponses/new_response'), { contributorUid: OWN, status: 'submitted', answers: {} }), `${who} created a response`);
    await denied(setDoc(doc(db, 'indigenFormUploads/new_upload'), { ownerUid: OWN, status: 'ready' }), `${who} registered an upload`);
  }
});

test('no client can occupy a submission id that Indigen Forms routing files into', async () => {
  const db = contexts()['the contributor who owns the response'];
  const now = new Date().toISOString();
  // An everyday post (no campaign), which any signed-in account may create; it differs only in its id.
  const post = (id) => ({ id, authUid: OWN, creator: { collection: 'creatorProfiles', id: OWN }, status: 'SUBMITTED', title: 'Synthetic post', formOrigin: { responseId: 'resp_a' }, lifecycle: { createdAt: now, updatedAt: now, version: 1 } });
  const everyday = `forms-rules-post-${Date.now()}`;
  await assertSucceeds(setDoc(doc(db, `submissions/${everyday}`), post(everyday)));
  const routed = `form_${'a1'.repeat(16)}`;
  await denied(setDoc(doc(db, `submissions/${routed}`), post(routed)), 'the contributor pre-created a routed submission id');
  await denied(setDoc(doc(db, 'submissions/form_short'), post('form_short')), 'the contributor created a form_ submission id');
});

test('form review notices are read by their contributor, not by every member of staff', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'notifications/form-review-a'), { id: 'form-review-a', authUid: OWN, type: 'form_review', title: 'Changes requested on your form response', body: 'Reviewer feedback: synthetic feedback.', read: false });
    await setDoc(doc(db, 'notifications/other-notice-a'), { id: 'other-notice-a', authUid: OWN, type: 'application_update', title: 'Synthetic notice', read: false });
  });
  const all = contexts();
  const owner = all['the contributor who owns the response'];
  await assertSucceeds(getDoc(doc(owner, 'notifications/form-review-a')));
  await assertSucceeds(getDocs(query(collection(owner, 'notifications'), where('authUid', '==', OWN))));
  await assertSucceeds(updateDoc(doc(owner, 'notifications/form-review-a'), { read: true }));
  for (const who of ['a verified reviewer', 'a verified administrator', 'the verified owner super administrator']) {
    const db = all[who];
    await denied(getDoc(doc(db, 'notifications/form-review-a')), `${who} read a form review notice`);
    await denied(getDocs(query(collection(db, 'notifications'), where('type', '==', 'form_review'))), `${who} listed form review notices`);
    await assertSucceeds(getDoc(doc(db, 'notifications/other-notice-a')));
  }
  await denied(getDoc(doc(all['another contributor'], 'notifications/form-review-a')), 'another contributor read a form review notice');
  await denied(getDoc(doc(all['an anonymous visitor'], 'notifications/form-review-a')), 'an anonymous visitor read a form review notice');
});
