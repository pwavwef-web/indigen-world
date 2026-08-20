// Storage Security Rules tests, run against the Auth + Storage emulators.
//
//   firebase emulators:exec --project demo-indigen-world --only auth,storage \
//     "node --test firebase/tests/storage.rules.test.mjs"

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { initializeApp as adminInit, deleteApp as adminDelete } from 'firebase-admin/app';
import { getAuth as adminAuth } from 'firebase-admin/auth';
import { deleteApp, initializeApp as clientInit } from 'firebase/app';
import { connectAuthEmulator, getAuth as clientAuth, signInWithCustomToken } from 'firebase/auth';
import { connectStorageEmulator, getBytes, getStorage, ref, uploadBytes } from 'firebase/storage';

const PROJECT_ID = 'demo-indigen-world';
const BUCKET = `${PROJECT_ID}.appspot.com`;

let adminApp;
const clientApps = [];

async function clientFor(name, uid, claims = null) {
  const app = clientInit({
    apiKey: 'demo-key',
    projectId: PROJECT_ID,
    authDomain: `${PROJECT_ID}.firebaseapp.com`,
    storageBucket: BUCKET,
  }, name);
  clientApps.push(app);
  const auth = clientAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  if (uid) {
    const token = await adminAuth(adminApp).createCustomToken(uid, claims ?? {});
    await signInWithCustomToken(auth, token);
  }
  const storage = getStorage(app);
  connectStorageEmulator(storage, '127.0.0.1', 9199);
  return storage;
}

before(async () => {
  adminApp = adminInit({ projectId: PROJECT_ID });
});

after(async () => {
  await Promise.all(clientApps.map((app) => deleteApp(app)));
  if (adminApp) await adminDelete(adminApp);
});

const bytes = () => new Blob(['ok'], { type: 'video/mp4' });
const imageBytes = () => new Blob(['png'], { type: 'image/png' });

test('only approved creators can write raw submission media', async () => {
  const pending = await clientFor('pending-storage', 'pending-creator');
  await assert.rejects(
    uploadBytes(
      ref(pending, 'creator-submissions/pending-creator/kasem/sub-1/original'),
      bytes(),
      { contentType: 'video/mp4' },
    ),
  );

  const approved = await clientFor('approved-storage', 'approved-creator', {
    creatorStatus: 'approved',
    creatorRoles: ['creator'],
  });
  await uploadBytes(
    ref(approved, 'creator-submissions/approved-creator/kasem/sub-1/original'),
    bytes(),
    { contentType: 'video/mp4' },
  );
});

test('raw submission media is private to owner and staff', async () => {
  const owner = await clientFor('owner-storage', 'owner-creator', {
    creatorStatus: 'approved',
    creatorRoles: ['creator'],
  });
  const path = 'creator-submissions/owner-creator/kasem/sub-2/original';
  await uploadBytes(ref(owner, path), bytes(), { contentType: 'video/mp4' });
  await getBytes(ref(owner, path));

  const stranger = await clientFor('stranger-storage', 'stranger-creator', {
    creatorStatus: 'approved',
    creatorRoles: ['creator'],
  });
  await assert.rejects(getBytes(ref(stranger, path)));

  const reviewer = await clientFor('reviewer-storage', 'reviewer-1', { role: 'reviewer' });
  await getBytes(ref(reviewer, path));
});

test('blocked creators cannot update avatars while normal profile avatars are public-readable', async () => {
  const rejected = await clientFor('rejected-storage', 'rejected-creator', { creatorStatus: 'rejected' });
  await assert.rejects(
    uploadBytes(ref(rejected, 'creator-avatars/rejected-creator/avatar.png'), imageBytes(), { contentType: 'image/png' }),
  );

  const owner = await clientFor('avatar-owner-storage', 'avatar-owner');
  const avatarPath = 'creator-avatars/avatar-owner/avatar.png';
  await uploadBytes(ref(owner, avatarPath), imageBytes(), { contentType: 'image/png' });

  const guest = await clientFor('guest-storage', null);
  await getBytes(ref(guest, avatarPath));
});
