import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { after, before, test } from 'node:test';
import { deleteApp, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const PROJECT_ID = 'demo-indigen-world';
const ENDPOINT = `http://127.0.0.1:5001/${PROJECT_ID}/us-central1/publicForms`;
const TEST_EMAIL = 'venacula-e2e@example.com';
const CONTACT_EMAIL = 'contact-form-e2e@example.com';
const INVOLVEMENT_CONTACT = 'involvement-form-e2e@example.com';
const TESTER_PLAY_EMAIL = 'tester-claim-e2e@example.com';
const subscriberId = createHash('sha256').update(TEST_EMAIL).digest('hex');
const testerClaimId = `tester-${createHash('sha256').update(TESTER_PLAY_EMAIL).digest('hex')}`;

let app;
let db;

async function deletePublicFormFixtures() {
  const [contacts, involvement] = await Promise.all([
    db.collection('publicFormSubmissions').where('payload.email', '==', CONTACT_EMAIL).get(),
    db.collection('publicFormSubmissions').where('payload.contact', '==', INVOLVEMENT_CONTACT).get(),
  ]);
  await Promise.all([...contacts.docs, ...involvement.docs].map((document) => document.ref.delete()));
}

before(async () => {
  app = initializeApp({ projectId: PROJECT_ID }, 'public-forms-e2e');
  db = getFirestore(app);
  await Promise.all([
    db.doc(`newsletterSubscribers/${subscriberId}`).delete(),
    db.doc(`publicFormSubmissions/${testerClaimId}`).delete(),
    deletePublicFormFixtures(),
  ]);
});

after(async () => {
  await Promise.all([
    db.doc(`newsletterSubscribers/${subscriberId}`).delete(),
    db.doc(`publicFormSubmissions/${testerClaimId}`).delete(),
    deletePublicFormFixtures(),
  ]);
  await deleteApp(app);
});

async function postForm(form, payload) {
  return fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ form, payload }),
  });
}

async function subscribe(overrides = {}) {
  return postForm('newsletter', {
    email: TEST_EMAIL,
    country: 'Ghana',
    consent: 'accepted',
    ...overrides,
  });
}

test('contact form validates and stores the submission', async () => {
  const invalid = await postForm('contact', {
    name: 'A',
    email: 'not-an-email',
    subject: '',
    message: '',
  });
  assert.equal(invalid.status, 400);

  const accepted = await postForm('contact', {
    name: 'Public Form Test',
    email: CONTACT_EMAIL,
    subject: 'General question',
    message: 'This is an automated Firebase emulator test.',
  });
  assert.equal(accepted.status, 200);
  assert.deepEqual(await accepted.json(), { accepted: true });

  const stored = await db.collection('publicFormSubmissions')
    .where('payload.email', '==', CONTACT_EMAIL)
    .get();
  assert.equal(stored.size, 1);
  assert.equal(stored.docs[0].get('form'), 'contact');
  assert.equal(stored.docs[0].get('status'), 'new');
  assert.equal(stored.docs[0].get('source'), 'website');
});

test('get-involved form validates and stores the submission', async () => {
  const invalid = await postForm('get-involved', {
    name: 'Public Form Test',
    contact: '',
    country: 'Ghana',
    organisation: '',
    route: '',
    note: '',
  });
  assert.equal(invalid.status, 400);

  const accepted = await postForm('get-involved', {
    name: 'Public Form Test',
    contact: INVOLVEMENT_CONTACT,
    country: 'Ghana',
    organisation: 'Indigen World test suite',
    route: 'Technical volunteer',
    note: 'This is an automated Firebase emulator test.',
  });
  assert.equal(accepted.status, 200);
  assert.deepEqual(await accepted.json(), { accepted: true });

  const stored = await db.collection('publicFormSubmissions')
    .where('payload.contact', '==', INVOLVEMENT_CONTACT)
    .get();
  assert.equal(stored.size, 1);
  assert.equal(stored.docs[0].get('form'), 'get-involved');
  assert.equal(stored.docs[0].get('payload.route'), 'Technical volunteer');
  assert.equal(stored.docs[0].get('status'), 'new');
});

test('tester reward claim validates confirmations, stores details and deduplicates by Play email', async () => {
  const claim = {
    certificateName: 'Founding Tester',
    cardName: 'Tester One',
    playEmail: TESTER_PLAY_EMAIL,
    contactEmail: 'tester-contact-e2e@example.com',
    country: 'Ghana',
    recognitionChoice: 'yes',
    recognitionName: 'Tester One',
    profileUrl: 'https://example.com/tester-one',
    testerConfirmation: 'confirmed',
    usageConfirmation: 'confirmed',
    feedbackConfirmation: 'confirmed',
    honestFeedbackConfirmation: 'confirmed',
    privacyConsent: 'accepted',
    note: 'Automated test claim.',
  };

  const invalid = await postForm('tester-reward-claim', { ...claim, feedbackConfirmation: '' });
  assert.equal(invalid.status, 400);

  const accepted = await postForm('tester-reward-claim', claim);
  assert.equal(accepted.status, 200);
  assert.deepEqual(await accepted.json(), { accepted: true });

  const stored = await db.doc(`publicFormSubmissions/${testerClaimId}`).get();
  assert.equal(stored.get('form'), 'tester-reward-claim');
  assert.equal(stored.get('payload.cardName'), 'Tester One');
  assert.equal(stored.get('payload.recognitionChoice'), 'yes');
  assert.equal(stored.get('status'), 'new');
  const originalReceivedAt = stored.get('receivedAt').toMillis();

  const corrected = await postForm('tester-reward-claim', { ...claim, cardName: 'Tester 01' });
  assert.equal(corrected.status, 200);
  const correctedClaim = await db.doc(`publicFormSubmissions/${testerClaimId}`).get();
  assert.equal(correctedClaim.get('payload.cardName'), 'Tester 01');
  assert.equal(correctedClaim.get('receivedAt').toMillis(), originalReceivedAt);
});

test('newsletter signup validates consent, stores a subscriber and deduplicates by email', async () => {
  const invalid = await subscribe({ consent: '' });
  assert.equal(invalid.status, 400);
  assert.equal((await db.doc(`newsletterSubscribers/${subscriberId}`).get()).exists, false);

  const accepted = await subscribe();
  assert.equal(accepted.status, 200);

  const subscriber = await db.doc(`newsletterSubscribers/${subscriberId}`).get();
  assert.equal(subscriber.get('email'), TEST_EMAIL);
  assert.equal(subscriber.get('status'), 'subscribed');
  assert.equal(subscriber.get('consent.granted'), true);
  assert.equal(subscriber.get('source'), 'website');

  const duplicate = await subscribe({ country: 'GH' });
  assert.equal(duplicate.status, 200);
  assert.equal((await db.collection('newsletterSubscribers').get()).docs.filter((doc) => doc.id === subscriberId).length, 1);
  assert.equal((await db.doc(`newsletterSubscribers/${subscriberId}`).get()).get('country'), 'GH');
});
