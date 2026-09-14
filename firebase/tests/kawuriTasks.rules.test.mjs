// Kawuri task Security Rules, run against the Firestore emulator.
//
//   npm run test:rules        (from the repo root)
//
// A task is a member's private draft or question: its owner reads it, nobody
// else does, and no client writes it — every change goes through a callable.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, limit, orderBy, query, setDoc, updateDoc, where } from 'firebase/firestore';

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
    await setDoc(doc(db, 'kawuriTasks/owner_req_00000001'), {
      id: 'owner_req_00000001', userId: 'owner', type: 'image_generation', category: 'image',
      listed: true, status: 'ready', createdAt: '2026-09-14T10:00:00.000Z',
    });
    await setDoc(doc(db, 'kawuriTasks/other_req_00000001'), {
      id: 'other_req_00000001', userId: 'other', type: 'video_generation', category: 'video',
      listed: true, status: 'generating', createdAt: '2026-09-14T10:00:00.000Z',
    });
  });
});

after(async () => {
  await env?.cleanup();
});

test('a member reads their own Kawuri tasks, and can query them for Recent', async () => {
  const db = env.authenticatedContext('owner').firestore();
  await assertSucceeds(getDoc(doc(db, 'kawuriTasks/owner_req_00000001')));
  await assertSucceeds(getDocs(query(
    collection(db, 'kawuriTasks'),
    where('userId', '==', 'owner'),
    where('listed', '==', true),
    orderBy('createdAt', 'desc'),
    limit(2),
  )));
});

test('nobody else reads a member’s tasks — not another member, not staff, not a guest', async () => {
  await assertFails(getDoc(doc(env.authenticatedContext('owner').firestore(), 'kawuriTasks/other_req_00000001')));
  await assertFails(getDoc(doc(env.authenticatedContext('staff', { role: 'admin' }).firestore(), 'kawuriTasks/owner_req_00000001')));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'kawuriTasks/owner_req_00000001')));
  await assertFails(getDocs(query(collection(env.authenticatedContext('owner').firestore(), 'kawuriTasks'), limit(5))));
});

test('no client creates, changes or deletes a task, even its owner', async () => {
  const db = env.authenticatedContext('owner').firestore();
  await assertFails(setDoc(doc(db, 'kawuriTasks/owner_req_00000009'), { userId: 'owner', status: 'ready' }));
  await assertFails(updateDoc(doc(db, 'kawuriTasks/owner_req_00000001'), { status: 'ready', outputMedia: [] }));
  await assertFails(deleteDoc(doc(db, 'kawuriTasks/owner_req_00000001')));
});
