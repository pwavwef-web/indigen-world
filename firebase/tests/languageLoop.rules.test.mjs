// Language-loop Security Rules, run against the Firestore emulator.
//
//   npm run test:rules        (from the repo root)
//
// `wordRequests` records who asked for a missing word: the asker and staff read
// it, nobody else. `languageResources` holds answers kept as examples and
// translation pairs: public once published, staff-only before. No client
// writes either; the queue itself is readable only while a word is open, and
// a topic page can list open words for its topic.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, limit, orderBy, query, setDoc, where } from 'firebase/firestore';

const PROJECT_ID = 'demo-indigen-world';
const rulesPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'firestore.rules');

let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { host: '127.0.0.1', port: 8080, rules: readFileSync(rulesPath, 'utf8') },
  });
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'wordRequests/asker_goat-abc123'), { uid: 'asker', wordId: 'goat-abc123', word: 'goat' });
    await setDoc(doc(db, 'languageResources/lr_live'), { id: 'lr_live', kind: 'example', isPublished: true, entryId: 'collection_e1', publishedAt: '2026-09-28T10:00:00.000Z' });
    await setDoc(doc(db, 'languageResources/lr_kept'), { id: 'lr_kept', kind: 'translation-pair', isPublished: false, entryId: null, publishedAt: null });
    await setDoc(doc(db, 'wordQueue/goat-abc123'), { word: 'goat', lookup: 'goat', status: 'open', rank: 150, topics: ['animals'] });
    await setDoc(doc(db, 'wordQueue/cow-abc123'), { word: 'cow', lookup: 'cow', status: 'translated', rank: 40, topics: ['animals'] });
  });
});

after(async () => {
  await env?.cleanup();
});

test('a member reads their own word requests, and nobody else’s', async () => {
  await assertSucceeds(getDoc(doc(env.authenticatedContext('asker').firestore(), 'wordRequests/asker_goat-abc123')));
  await assertFails(getDoc(doc(env.authenticatedContext('someone').firestore(), 'wordRequests/asker_goat-abc123')));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'wordRequests/asker_goat-abc123')));
  await assertSucceeds(getDoc(doc(env.authenticatedContext('staff', { role: 'validator' }).firestore(), 'wordRequests/asker_goat-abc123')));
});

test('nobody writes a word request or a language resource from a client', async () => {
  const db = env.authenticatedContext('asker').firestore();
  await assertFails(setDoc(doc(db, 'wordRequests/asker_other-abc123'), { uid: 'asker', wordId: 'other-abc123' }));
  await assertFails(setDoc(doc(db, 'languageResources/lr_forged'), { isPublished: true }));
  const staff = env.authenticatedContext('staff', { role: 'admin' }).firestore();
  await assertFails(setDoc(doc(staff, 'languageResources/lr_forged'), { isPublished: true }));
});

test('a published example is public, a kept one is for staff, and an entry lists its published examples', async () => {
  const guest = env.unauthenticatedContext().firestore();
  await assertSucceeds(getDoc(doc(guest, 'languageResources/lr_live')));
  await assertFails(getDoc(doc(guest, 'languageResources/lr_kept')));
  await assertSucceeds(getDoc(doc(env.authenticatedContext('staff', { role: 'validator' }).firestore(), 'languageResources/lr_kept')));
  await assertSucceeds(getDocs(query(
    collection(guest, 'languageResources'),
    where('entryId', '==', 'collection_e1'),
    where('isPublished', '==', true),
    orderBy('publishedAt', 'desc'),
    limit(5),
  )));
});

test('a topic page lists open words for its topic, and a search finds an open word by its English', async () => {
  const guest = env.unauthenticatedContext().firestore();
  await assertSucceeds(getDocs(query(
    collection(guest, 'wordQueue'),
    where('topics', 'array-contains', 'animals'),
    where('status', '==', 'open'),
    orderBy('rank'),
    limit(20),
  )));
  await assertSucceeds(getDocs(query(
    collection(guest, 'wordQueue'),
    where('lookup', '==', 'goat'),
    where('status', '==', 'open'),
    limit(1),
  )));
  // A translated word is not served to clients: its entry is in the dictionary.
  await assertFails(getDoc(doc(guest, 'wordQueue/cow-abc123')));
});
