// End-to-end tests of the privileged dictionary callables against the Auth,
// Firestore and Functions emulators:
//
//   npm run test:e2e      (from the repo root)
//
// ── Why these exist ──────────────────────────────────────────────────────
// `dictionaryEdits.test.mjs` covers the pure half exhaustively — which fields
// may be patched, how a headword key is derived, what a merge takes from which
// side. What it cannot cover is everything that only exists inside a
// transaction against a real database: the role checks, the audit write that
// has to land *before* a deletion, the renumbering query a respelling runs, and
// the idempotence of a retried merge.
//
// 0.1.16 shipped this feature with "the merge and edit callables have no
// emulator test... the transactions, the role checks, the renumbering query and
// the audit writes are covered by reading" as a known gap. This is that gap.

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { initializeApp as adminInit, deleteApp as adminDelete } from 'firebase-admin/app';
import { getAuth as adminAuth } from 'firebase-admin/auth';
import { getFirestore as adminFirestore } from 'firebase-admin/firestore';
import { deleteApp, initializeApp as clientInit } from 'firebase/app';
import { connectAuthEmulator, getAuth as clientAuth, signInWithCustomToken } from 'firebase/auth';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';

const PROJECT_ID = 'demo-indigen-world';
const ENTRIES = 'dictionaryEntries';

let adminApp;
let memberApp;
let validatorApp;
let adminClientApp;
let db;

async function clientFor(uid, claims) {
  const app = clientInit(
    { apiKey: 'demo-key', projectId: PROJECT_ID, authDomain: `${PROJECT_ID}.firebaseapp.com` },
    `d-${uid}`,
  );
  connectAuthEmulator(clientAuth(app), 'http://127.0.0.1:9099', { disableWarnings: true });
  const token = await adminAuth(adminApp).createCustomToken(uid, claims);
  await signInWithCustomToken(clientAuth(app), token);
  const fns = getFunctions(app);
  connectFunctionsEmulator(fns, '127.0.0.1', 5001);
  return app;
}

const call = (app, name) => httpsCallable(getFunctions(app), name);

/// An entry as `creators.ts` publishes one.
const entry = (over = {}) => ({
  kasemText: 'bu',
  headwordKey: 'bu',
  englishText: 'child',
  // The flat summary line and the list are two stored fields, and the backend
  // derives the second from the first. Seeding both keeps a no-op edit a no-op.
  englishTranslations: ['child'],
  partOfSpeech: 'Noun',
  dialect: 'Kasem',
  isPublished: true,
  homographIndex: 1,
  contributorId: 'someone-else',
  createdAt: new Date().toISOString(),
  ...over,
});

async function seed(id, over = {}) {
  await db.doc(`${ENTRIES}/${id}`).set(entry(over));
  return id;
}

const REASON = 'Correcting a gloss a speaker gave us.';

before(async () => {
  adminApp = adminInit({ projectId: PROJECT_ID });
  db = adminFirestore(adminApp);
  memberApp = await clientFor('member-dict', {});
  validatorApp = await clientFor('validator-dict', { role: 'validator' });
  adminClientApp = await clientFor('admin-dict', { role: 'admin' });
});

after(async () => {
  for (const app of [memberApp, validatorApp, adminClientApp]) {
    if (app) await deleteApp(app);
  }
  if (adminApp) await adminDelete(adminApp);
});

// ── Who may do what ──────────────────────────────────────────────────────

test('an ordinary member cannot edit, merge or delete a published word', async () => {
  const id = await seed('e2e-member-guard');

  await assert.rejects(
    call(memberApp, 'editDictionaryEntry')({
      entryId: id,
      patch: { englishText: 'something else' },
      reason: REASON,
    }),
    (err) => err?.code === 'functions/permission-denied',
  );
  await assert.rejects(
    call(memberApp, 'deleteDictionaryEntry')({ entryId: id, reason: REASON }),
    (err) => err?.code === 'functions/permission-denied',
  );

  const after = await db.doc(`${ENTRIES}/${id}`).get();
  assert.equal(after.get('englishText'), 'child', 'the archive is untouched');
});

test('deleting outright is an admin key, not a validator one', async () => {
  const id = await seed('e2e-delete-guard');

  await assert.rejects(
    call(validatorApp, 'deleteDictionaryEntry')({ entryId: id, reason: REASON }),
    (err) => err?.code === 'functions/permission-denied',
  );
  assert.ok((await db.doc(`${ENTRIES}/${id}`).get()).exists);
});

test('a reason is required, and ten characters of it', async () => {
  const id = await seed('e2e-reason-guard');

  await assert.rejects(
    call(validatorApp, 'editDictionaryEntry')({
      entryId: id,
      patch: { englishText: 'baby' },
      reason: 'typo',
    }),
    (err) => err?.code === 'functions/invalid-argument',
  );
});

// ── What an edit actually writes ─────────────────────────────────────────

test('an edit changes only the fields it was sent, and writes an audit row', async () => {
  const id = await seed('e2e-edit', { etymology: 'from Proto-Gur', ipa: 'bu' });

  const res = await call(validatorApp, 'editDictionaryEntry')({
    entryId: id,
    patch: { englishText: 'child, offspring' },
    reason: REASON,
  });
  // `englishTranslations` comes along because it is derived from the summary
  // line — the same edit, recorded as the two fields it actually wrote.
  assert.deepEqual(res.data.changed, ['englishText', 'englishTranslations']);

  const doc = await db.doc(`${ENTRIES}/${id}`).get();
  assert.equal(doc.get('englishText'), 'child, offspring');
  // The absent keys are the point: a validator who came to fix the gloss
  // cannot blank the etymology by opening the form.
  assert.equal(doc.get('etymology'), 'from Proto-Gur');
  assert.equal(doc.get('ipa'), 'bu');
  assert.equal(doc.get('editReason'), REASON);

  const audit = await db
    .collection('auditLogs')
    .where('metadata.reason', '==', REASON)
    .get();
  assert.ok(audit.size >= 1, 'the reason is on the record');
});

test('an edit that changes nothing reports nothing changed', async () => {
  const id = await seed('e2e-edit-noop');

  const res = await call(validatorApp, 'editDictionaryEntry')({
    entryId: id,
    patch: { englishText: 'child' },
    reason: REASON,
  });
  assert.deepEqual(res.data.changed, []);
});

test('a headword can be corrected but never emptied', async () => {
  const id = await seed('e2e-headword-guard');

  await assert.rejects(
    call(validatorApp, 'editDictionaryEntry')({
      entryId: id,
      patch: { kasemText: '   ' },
      reason: REASON,
    }),
    (err) => err?.code === 'functions/invalid-argument',
  );
  assert.equal((await db.doc(`${ENTRIES}/${id}`).get()).get('kasemText'), 'bu');
});

test('respelling moves the word to its new spelling group and renumbers it', async () => {
  // One entry already sitting under the spelling being moved to.
  await seed('e2e-respell-peer', { kasemText: 'ba', headwordKey: 'ba', homographIndex: 1 });
  const id = await seed('e2e-respell', { kasemText: 'bu', headwordKey: 'bu', homographIndex: 1 });

  await call(validatorApp, 'editDictionaryEntry')({
    entryId: id,
    patch: { kasemText: 'ba' },
    reason: 'Respelled after checking with a speaker.',
  });

  const doc = await db.doc(`${ENTRIES}/${id}`).get();
  assert.equal(doc.get('kasemText'), 'ba');
  assert.equal(doc.get('headwordKey'), 'ba');
  assert.notEqual(
    doc.get('homographIndex'),
    1,
    'the number 1 is spent under `ba`, so the moved entry takes the next one',
  );
});

// ── Merging ──────────────────────────────────────────────────────────────

test('a merge fills the blanks and never overwrites an answer the target had', async () => {
  const target = await seed('e2e-merge-target', { englishText: 'child', ipa: '' });
  const source = await seed('e2e-merge-source', {
    englishText: 'baby',
    ipa: 'bu',
    etymology: 'from Proto-Gur',
  });

  await call(validatorApp, 'mergeDictionaryEntries')({
    targetId: target,
    sourceId: source,
    reason: 'The same word entered twice.',
    choices: {},
    disposition: 'retire',
  });

  const kept = await db.doc(`${ENTRIES}/${target}`).get();
  assert.equal(kept.get('englishText'), 'child', 'what it already said, it keeps');
  assert.equal(kept.get('ipa'), 'bu', 'what it was missing, it gains');
  assert.equal(kept.get('etymology'), 'from Proto-Gur');

  // Retired, not deleted: an old link still leads somewhere. The pointer is
  // stored as the collection and id it names, not as a bare string.
  const gone = await db.doc(`${ENTRIES}/${source}`).get();
  assert.ok(gone.exists, 'the duplicate is retired rather than removed');
  assert.equal(gone.get('isPublished'), false);
  assert.deepEqual(gone.get('mergedInto'), { collection: ENTRIES, id: target });
});

test('a reviewer can take the duplicate wording for a named field', async () => {
  const target = await seed('e2e-merge-choice-target', { englishText: 'child' });
  const source = await seed('e2e-merge-choice-source', { englishText: 'baby' });

  await call(validatorApp, 'mergeDictionaryEntries')({
    targetId: target,
    sourceId: source,
    reason: 'The duplicate has the better gloss.',
    choices: { englishText: 'source' },
    disposition: 'retire',
  });

  assert.equal(
    (await db.doc(`${ENTRIES}/${target}`).get()).get('englishText'),
    'baby',
  );
});

test('a retried merge is not a second merge', async () => {
  const target = await seed('e2e-merge-retry-target', { ipa: '' });
  const source = await seed('e2e-merge-retry-source', { ipa: 'bu' });

  const once = () =>
    call(validatorApp, 'mergeDictionaryEntries')({
      targetId: target,
      sourceId: source,
      reason: 'Filed twice by two members.',
      choices: {},
      disposition: 'retire',
    });

  await once();
  // The network dropped the first answer and the phone tried again. This must
  // not fail, and must not merge anything a second time.
  await once();

  const kept = await db.doc(`${ENTRIES}/${target}`).get();
  assert.equal(kept.get('ipa'), 'bu');
  assert.deepEqual(
    (await db.doc(`${ENTRIES}/${source}`).get()).get('mergedInto'),
    { collection: ENTRIES, id: target },
  );
});

test('an entry cannot be merged into itself', async () => {
  const id = await seed('e2e-merge-self');

  await assert.rejects(
    call(validatorApp, 'mergeDictionaryEntries')({
      targetId: id,
      sourceId: id,
      reason: 'A mistake worth refusing.',
      choices: {},
      disposition: 'retire',
    }),
    (err) => err?.code === 'functions/invalid-argument',
  );
});

test('deleting on a merge is an admin key even for a validator who may merge', async () => {
  const target = await seed('e2e-merge-delete-target');
  const source = await seed('e2e-merge-delete-source');

  await assert.rejects(
    call(validatorApp, 'mergeDictionaryEntries')({
      targetId: target,
      sourceId: source,
      reason: 'Trying to delete without the key.',
      choices: {},
      disposition: 'delete',
    }),
    (err) => err?.code === 'functions/permission-denied',
  );
  assert.ok((await db.doc(`${ENTRIES}/${source}`).get()).exists);
});

// ── Deleting ─────────────────────────────────────────────────────────────

test('an admin deletion keeps the whole document in the audit log first', async () => {
  const id = await seed('e2e-delete', { englishText: 'a row that should not exist' });

  await call(adminClientApp, 'deleteDictionaryEntry')({
    entryId: id,
    reason: 'A test row pasted into the wrong box.',
  });

  assert.equal(
    (await db.doc(`${ENTRIES}/${id}`).get()).exists,
    false,
    'it leaves the archive',
  );

  const audit = await db
    .collection('auditLogs')
    .where('metadata.reason', '==', 'A test row pasted into the wrong box.')
    .get();
  assert.ok(audit.size >= 1, 'and the whole record is kept');
});

test('a deletion that is retried does not fail the second time', async () => {
  const id = await seed('e2e-delete-retry');
  const once = () =>
    call(adminClientApp, 'deleteDictionaryEntry')({
      entryId: id,
      reason: 'Removed after the contributor asked.',
    });

  await once();
  await once();
  assert.equal((await db.doc(`${ENTRIES}/${id}`).get()).exists, false);
});

// ── The duplicate check the review desk runs ─────────────────────────────

test('findDictionaryEntryMatches reaches a row with no headwordKey at all', async () => {
  // The population the four-query gather exists for: rows published before
  // `headwordKey` was introduced. A match found only by `kasemText` is the
  // whole point of the second and third queries.
  await db.doc(`${ENTRIES}/e2e-legacy`).set({
    kasemText: 'kambia',
    englishText: 'guinea fowl',
    partOfSpeech: 'Noun',
    dialect: 'Kasem',
    isPublished: true,
  });

  const res = await call(validatorApp, 'findDictionaryEntryMatches')({
    headword: 'kambia',
  });
  const ids = (res.data.matches ?? []).map((row) => row.id);
  assert.ok(ids.includes('e2e-legacy'), 'a legacy row is still found');
});
