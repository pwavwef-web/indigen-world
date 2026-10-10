// Isolated, repeatable data for verifying the admin console in a browser.
// Runs only against the localhost emulators of the demo project — never
// production. Every record is titled "Local test ·" and any Kasem is a
// bracketed placeholder, so nothing here can be mistaken for real content.
//
//   npx firebase emulators:start --only auth,firestore,storage --project demo-indigen-world
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
//     FIREBASE_STORAGE_EMULATOR_HOST=127.0.0.1:9199 node apps/admin/scripts/dev/seed-admin-ui.mjs

import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const require = createRequire(new URL('../../../../services/functions/package.json', import.meta.url));
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');

if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080'
  || process.env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:9099'
  || process.env.FIREBASE_STORAGE_EMULATOR_HOST !== '127.0.0.1:9199') {
  throw new Error('Only the isolated localhost emulators are allowed.');
}

export const ADMIN_TEST_PASSWORD = 'AdminConsoleTest123!';
const app = initializeApp({ projectId: 'demo-indigen-world', storageBucket: 'demo-indigen-world.appspot.com' });
const db = getFirestore(app);
const auth = getAuth(app);
const bucket = getStorage(app).bucket();
const day = 86_400_000;
const at = (offsetDays, hour = 9) => new Date(Date.UTC(2026, 9, 10, hour) - offsetDays * day).toISOString();
const life = (offsetDays, version = 1) => ({ createdAt: at(offsetDays), updatedAt: at(offsetDays), version });

for (const [uid, email, claims, name] of [
  ['ui-admin', 'admin@admin.test', { role: 'admin', finance: true }, 'Local Admin'],
  ['ui-validator', 'validator@admin.test', { role: 'validator' }, 'Local Validator'],
  ['ui-nobody', 'nobody@admin.test', {}, 'Local No-role'],
]) {
  try { await auth.createUser({ uid, email, password: ADMIN_TEST_PASSWORD, displayName: name }); }
  catch (error) { if (error.code !== 'auth/uid-already-exists' && error.code !== 'auth/email-already-exists') throw error; }
  await auth.setCustomUserClaims(uid, claims);
}

// Uploads: a short tone for playback and a repository photograph as a cover.
const rate = 8000, samples = 16000, wav = Buffer.alloc(44 + samples * 2);
wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(samples * 2, 40);
for (let i = 0; i < samples; i++) wav.writeInt16LE(Math.round(Math.sin(i / rate * 440 * Math.PI * 2) * 1500), 44 + i * 2);
const tonePath = 'creator-submissions/ui-creator/ui-campaign/sub-audiobook/local-test-tone.wav';
await bucket.file(tonePath).save(wav, { contentType: 'audio/wav' });
const coverToken = randomUUID();
const coverPath = 'collection-audiobooks/local-test-cover/cover.jpg';
await bucket.file(coverPath).save(readFileSync(new URL('../../../website/public/images/hero-home.jpg', import.meta.url)), {
  contentType: 'image/jpeg', metadata: { metadata: { firebaseStorageDownloadTokens: coverToken } },
});
const coverUrl = `http://127.0.0.1:9199/v0/b/demo-indigen-world.appspot.com/o/${encodeURIComponent(coverPath)}?alt=media&token=${coverToken}`;

const base = (id, overrides) => ({
  id, authUid: 'ui-creator', creator: { collection: 'creatorProfiles', id: 'ui-creator' }, campaign: { collection: 'campaigns', id: 'ui-campaign' },
  title: 'Local test · untitled', status: 'SUBMITTED', dialect: 'Not specified',
  permissions: { review: true, publication: true, aiTraining: false },
  disclosures: { involvesMinors: false, usesThirdPartyMaterial: false },
  lifecycle: life(1), ...overrides,
});

const submissions = [
  base('sub-audiobook', { title: 'Local test · stories from home', studioType: 'audio', collectionKind: 'audiobooks', englishSummary: 'A short recording used to check playback in the review desk. Not a real submission.', sourceReferences: 'Contributor recording (local test)', media: { storagePath: tonePath, mimeType: 'audio/wav', mediaType: 'audio', sizeBytes: wav.length }, lifecycle: life(1), permissions: { review: true, publication: true } }),
  base('sub-expression', { title: 'Local test · everyday greeting', collectionKind: 'expressions', body: '[Kasem placeholder]', expression: { phrase: '[Kasem greeting placeholder]', alternatives: ['[Alternative placeholder]'], meaning: 'Good morning (local test)', literalTranslation: '[Word-for-word placeholder]', context: 'Said when greeting an elder in the morning (local test).', kind: 'phrase', dialect: 'Navrongo (test)', source: { type: 'self', detail: 'Local test source' } }, lifecycle: life(2), permissions: { review: true, publication: true, aiTraining: true } }),
  base('sub-word', { title: 'Local test · dictionary word', collectionKind: 'dictionary', body: '[Kasem headword placeholder]', englishSummary: 'A test noun with recorded forms.', forms: { definite: '[placeholder]kam', pronoun: 'ka', plural: '[plural placeholder]' }, dialect: 'Paga (test)', lifecycle: life(3), permissions: { review: true, publication: false, aiTraining: false }, disclosures: { involvesMinors: null, usesThirdPartyMaterial: false } }),
  base('sub-queue', { title: 'Local test · word queue answer', wordQueueId: 'queue-1', body: '[Kasem answer placeholder]', englishSummary: 'Answer to a queued English word.', lifecycle: life(4), permissions: { review: true, publication: true, aiTraining: true } }),
  base('sub-story', { title: 'Local test · oral history', studioType: 'writing', category: 'Stories', body: 'This is clearly labelled local test material for workflow verification. It is not a real cultural submission.', englishSummary: 'Test story from a community recording.', lifecycle: life(5), permissions: { review: true } }),
  base('sub-approved', { title: 'Local test · approved story', status: 'APPROVED', studioType: 'writing', body: 'Approved test text.', lifecycle: life(6, 2) }),
  base('sub-approved-private', { title: 'Local test · approved without permission', status: 'APPROVED', studioType: 'writing', body: 'No publication permission.', lifecycle: life(7, 2), permissions: { review: true, publication: false } }),
  base('sub-published', { title: 'Local test · published expression', status: 'PUBLISHED', collectionKind: 'expressions', expression: { phrase: '[Published placeholder]', meaning: 'Thank you (local test)', kind: 'phrase', dialect: 'Navrongo (test)', source: { type: 'family', detail: 'Local test' } }, lifecycle: life(8, 3) }),
  base('sub-revision', { title: 'Local test · needs revision', status: 'NEEDS_REVISION', studioType: 'writing', body: 'Returned test text.', moderation: { feedback: 'Please add the source of this story (local test feedback).', decidedAt: at(2) }, lifecycle: life(9, 2) }),
  base('sub-rejected', { title: 'Local test · rejected', status: 'REJECTED', studioType: 'writing', body: 'Rejected test text.', moderation: { feedback: 'Duplicate of an existing entry (local test).', decidedAt: at(3) }, lifecycle: life(10, 2) }),
  base('sub-archived', { title: 'Local test · archived', status: 'ARCHIVED', studioType: 'writing', body: 'Archived test text.', lifecycle: life(11, 3) }),
];
for (const submission of submissions) await db.doc(`submissions/${submission.id}`).set(submission);

await db.doc('communityProfiles/ui-creator').set({ displayName: 'Local Creator', username: 'local_creator', createdAt: at(30) });
await db.doc('campaigns/ui-campaign').set({ id: 'ui-campaign', slug: 'ui-campaign', title: 'Local test · creator campaign', status: 'SUBMISSIONS_OPEN', visibility: 'public', initiative: 'Project Kassena', categories: [], schemaVersion: 1, lifecycle: life(40) });
for (const [id, status] of [['app-1', 'SUBMITTED'], ['app-2', 'UNDER_REVIEW'], ['app-3', 'APPROVED']]) {
  await db.doc(`creatorApplications/${id}`).set({ id, reference: `LOCAL-${id.toUpperCase()}`, status, authUid: `applicant-${id}`, snapshot: { displayName: `Local test applicant ${id.slice(-1)}`, region: 'Upper East', country: 'Ghana' }, lifecycle: life(5) });
}
for (const [id, status] of [['report-1', 'open'], ['report-2', 'reviewing'], ['report-3', 'resolved']]) {
  await db.doc(`communityReports/${id}`).set({ id, status, reason: 'spam', details: 'Local test report.', reporterId: 'ui-validator', postId: 'post-1', targetType: 'post', createdAt: Timestamp.fromDate(new Date(at(2))) });
}
for (const [id, status, form] of [['form-1', 'new', 'contact'], ['form-2', 'new', 'get-involved'], ['form-3', 'contacted', 'contact']]) {
  const payload = form === 'contact'
    ? { name: `Local test person ${id.slice(-1)}`, email: `${id}@example.test`, subject: 'Local test subject', message: 'Local test message.' }
    : { name: `Local test person ${id.slice(-1)}`, contact: `${id}@example.test`, country: 'Ghana', route: 'Language contributor', note: 'Local test note.' };
  await db.doc(`publicFormSubmissions/${id}`).set({ id, status, form, source: 'website', payload, receivedAt: Timestamp.fromDate(new Date(at(1))) });
}
await db.doc('teamSiteRequests/team-1').set({ id: 'team-1', formVersion: 1, status: 'new', submittedAt: at(4), desiredPages: ['Home'], features: [], fields: { fullName: 'Local test requester', displayName: 'Local Test', siteName: 'Local test site', email: 'team@example.test' } });

for (const [id, title, published, withCover] of [['book-1', 'Local test · stories from home', true, true], ['book-2', 'Local test · a village remembers', false, false], ['book-3', 'Local test · tales by the fireside', true, false]]) {
  await db.doc(`publishedContent/${id}`).set({ collectionKind: 'audiobooks', title, description: 'Local test audiobook record.', sourceAttribution: 'Local test author · narrated by Local test narrator', tags: ['audiobook'], dialect: 'Not sure', language: 'xsm', publicationStatus: published ? 'published' : 'draft', publicationRoute: 'admin', mediaUrl: '', thumbnailUrl: withCover ? coverUrl : '', publishedAt: published ? at(2) : '' });
}

await db.doc('auditLogs/audit-1').set({ id: 'audit-1', action: 'contributor.redemption.approve', actor: { collection: 'staff', id: 'ui-admin' }, target: { collection: 'contributorRedemptions', id: 'red-approved' }, outcome: 'success', source: 'functions', occurredAt: at(1), metadata: { points: 600 } });
await db.doc('platformConfiguration/creators').set({ whatsappChannelUrl: 'https://example.test/whatsapp', supportEmail: 'support@example.test', dialects: [{ slug: 'navrongo', label: 'Navrongo (test)' }], contentCategories: [{ slug: 'stories', label: 'Stories' }], lifecycle: life(60) });

console.log('Seeded the admin console test data. Accounts: admin@admin.test (admin + finance), validator@admin.test, nobody@admin.test.');
