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

test('any signed-in account can upload raw media into its own prefix', async () => {
  // Publishing to Explore no longer requires approval, so neither does staging
  // the file. The path stays private to its owner and staff either way (see the
  // next test), and only the server-side publication workflow can make a file
  // world-readable.
  const newcomer = await clientFor('pending-storage', 'pending-creator');
  await uploadBytes(
    ref(newcomer, 'creator-submissions/pending-creator/open/sub-1/original'),
    bytes(),
    { contentType: 'video/mp4' },
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

test('an anonymous visitor cannot upload raw media at all', async () => {
  const anonymous = await clientFor('anon-storage', null);
  await assert.rejects(
    uploadBytes(
      ref(anonymous, 'creator-submissions/somebody/open/sub-1/original'),
      bytes(),
      { contentType: 'video/mp4' },
    ),
  );
});

test('a signed-in account cannot upload into somebody else prefix', async () => {
  const intruder = await clientFor('intruder-storage', 'intruder-creator');
  await assert.rejects(
    uploadBytes(
      ref(intruder, 'creator-submissions/approved-creator/open/sub-9/original'),
      bytes(),
      { contentType: 'video/mp4' },
    ),
  );
});

test('a suspended creator cannot upload raw media', async () => {
  // Moderation outcomes still hold: opening publication up must not open it up
  // to accounts that were removed from it.
  const suspended = await clientFor('suspended-storage', 'suspended-creator', {
    creatorStatus: 'suspended',
  });
  await assert.rejects(
    uploadBytes(
      ref(suspended, 'creator-submissions/suspended-creator/open/sub-1/original'),
      bytes(),
      { contentType: 'video/mp4' },
    ),
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

// ── Community feed media ────────────────────────────────────────────────────

test('community post media is owner-writable and world-readable', async () => {
  const author = await clientFor('community-author-storage', 'community-author');
  const path = 'community-media/community-author/post-1/0_photo.png';
  await uploadBytes(ref(author, path), imageBytes(), { contentType: 'image/png' });

  // The community feed is public, so anyone can read what was posted to it.
  const guest = await clientFor('community-guest-storage', null);
  await getBytes(ref(guest, path));
});

test('one member cannot write into another member media prefix', async () => {
  const stranger = await clientFor('community-stranger-storage', 'community-stranger');
  await assert.rejects(
    uploadBytes(
      ref(stranger, 'community-media/community-author/post-1/0_overwrite.png'),
      imageBytes(),
      { contentType: 'image/png' },
    ),
  );
});

test('guests cannot upload community media at all', async () => {
  const guest = await clientFor('community-anon-storage', null);
  await assert.rejects(
    uploadBytes(
      ref(guest, 'community-media/community-anon/post-1/0_photo.png'),
      imageBytes(),
      { contentType: 'image/png' },
    ),
  );
});

test('community voice notes are owner-writable and world-readable', async () => {
  const author = await clientFor('community-audio-storage', 'community-audio');
  const path = 'community-media/community-audio/post-1/0_voice.m4a';
  await uploadBytes(ref(author, path), new Blob(['voice'], { type: 'audio/mp4' }), {
    contentType: 'audio/mp4',
  });
  const guest = await clientFor('community-audio-guest-storage', null);
  await getBytes(ref(guest, path));
});

test('community post media rejects unsupported content types', async () => {
  const author = await clientFor('community-doc-storage', 'community-doc');
  await assert.rejects(
    uploadBytes(
      ref(author, 'community-media/community-doc/post-1/0_notes.pdf'),
      new Blob(['%PDF'], { type: 'application/pdf' }),
      { contentType: 'application/pdf' },
    ),
  );
});

test('community avatars and banners are owner-writable and public-readable', async () => {
  const owner = await clientFor('community-avatar-storage', 'community-avatar-owner');
  const avatarPath = 'community-avatars/community-avatar-owner/avatar.png';
  const bannerPath = 'community-banners/community-avatar-owner/banner.png';
  await uploadBytes(ref(owner, avatarPath), imageBytes(), { contentType: 'image/png' });
  await uploadBytes(ref(owner, bannerPath), imageBytes(), { contentType: 'image/png' });

  const guest = await clientFor('community-avatar-guest-storage', null);
  await getBytes(ref(guest, avatarPath));
  await getBytes(ref(guest, bannerPath));

  const stranger = await clientFor('community-avatar-stranger-storage', 'someone-else');
  await assert.rejects(
    uploadBytes(ref(stranger, avatarPath), imageBytes(), { contentType: 'image/png' }),
  );
});
