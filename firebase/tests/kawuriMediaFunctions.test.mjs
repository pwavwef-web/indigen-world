// End-to-end tests of Kawuri's media callables against the Auth, Firestore,
// Storage and Functions emulators:
//
//   npm run test:kawuri-e2e   (from the repo root)
//
// The functions run exactly as deployed, with one difference: inside the
// emulator on a demo- project, `kawuri-vertex.ts` answers with its local
// stand-in instead of calling Vertex AI. Prompts carry `[fake:…]` markers to
// ask that stand-in for a refusal, a quota error or a safety block.
//
// Covers authentication, capabilities, duplicate-request prevention, the
// pre-generation screen, safety and quota outcomes, video operation
// persistence and recovery, English-only transcription, upload validation,
// analysis ownership and follow-ups, allowance exhaustion, task timeout,
// listing and deletion.

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { deleteApp as adminDelete, initializeApp as adminInit } from 'firebase-admin/app';
import { getAuth as adminAuth } from 'firebase-admin/auth';
import { getFirestore as adminFirestore } from 'firebase-admin/firestore';
import { getStorage as adminStorage } from 'firebase-admin/storage';
import { deleteApp, initializeApp as clientInit } from 'firebase/app';
import { connectAuthEmulator, getAuth as clientAuth, signInWithCustomToken } from 'firebase/auth';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { connectStorageEmulator, getStorage, ref, uploadBytes } from 'firebase/storage';

const PROJECT_ID = 'demo-indigen-world';
const BUCKET = `${PROJECT_ID}.appspot.com`;

let adminApp;
let db;
let bucket;
const apps = [];
const clients = {};

async function clientFor(uid, claims) {
  const app = clientInit({
    apiKey: 'demo-key',
    projectId: PROJECT_ID,
    authDomain: `${PROJECT_ID}.firebaseapp.com`,
    storageBucket: BUCKET,
  }, `kawuri-${uid ?? 'guest'}`);
  apps.push(app);
  connectAuthEmulator(clientAuth(app), 'http://127.0.0.1:9099', { disableWarnings: true });
  if (uid) {
    const token = await adminAuth(adminApp).createCustomToken(uid, claims ?? {});
    await signInWithCustomToken(clientAuth(app), token);
  }
  connectFunctionsEmulator(getFunctions(app), '127.0.0.1', 5001);
  connectStorageEmulator(getStorage(app), '127.0.0.1', 9199);
  return app;
}

const call = (app, name, data) => httpsCallable(getFunctions(app), name, { timeout: 120_000 })(data);
const reason = (error) => error?.details?.reason;
const rejectsWith = (promise, expected) =>
  assert.rejects(promise, (error) => {
    assert.equal(reason(error), expected, `${error?.code}: ${error?.message}`);
    return true;
  });

let counter = 0;
const requestId = (label) => `${label}_${Date.now().toString(36)}${(counter += 1)}`;

function wav(seconds) {
  const rate = 8000;
  const pcm = Buffer.alloc(rate * 2 * seconds);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(36 + pcm.length, 4); header.write('WAVE', 8);
  header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24); header.writeUInt32LE(rate * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
  header.write('data', 36); header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC', 'base64');

async function billableAttempts(taskId) {
  const audits = await db.collection('auditLogs').where('target.id', '==', taskId).get();
  return audits.docs.filter((doc) => String(doc.get('action')).startsWith('kawuri.') && doc.get('action') !== 'kawuri.delete').length;
}

before(async () => {
  adminApp = adminInit({ projectId: PROJECT_ID, storageBucket: BUCKET });
  db = adminFirestore(adminApp);
  bucket = adminStorage(adminApp).bucket(BUCKET);
  clients.guest = await clientFor(null);
  clients.member = await clientFor('kawuri-member');
  clients.other = await clientFor('kawuri-other');
  clients.creator = await clientFor('kawuri-creator', { role: 'creator' });
  clients.limited = await clientFor('kawuri-limited');
});

after(async () => {
  await Promise.all(apps.map((app) => deleteApp(app)));
  if (adminApp) await adminDelete(adminApp);
});

test('authentication is enforced and capabilities follow the caller', async () => {
  const guestCaps = (await call(clients.guest, 'getKawuriCapabilities', {})).data;
  assert.equal(guestCaps.chat, true);
  assert.equal(guestCaps.imageGeneration, false);
  assert.equal(guestCaps.unavailableReasons.imageGeneration, 'sign_in_required');

  for (const name of ['createKawuriImage', 'createKawuriVideo', 'transcribeKawuriAudio', 'analyseKawuriMedia', 'getKawuriTask', 'listKawuriCreations', 'deleteKawuriCreation', 'cancelKawuriTask']) {
    await rejectsWith(call(clients.guest, name, { requestId: 'guest_0000001' }), 'UNAUTHENTICATED');
  }

  const memberCaps = (await call(clients.member, 'getKawuriCapabilities', {})).data;
  assert.equal(memberCaps.imageGeneration, true);
  assert.equal(memberCaps.speechToText, true);
  assert.deepEqual(memberCaps.speechToTextLanguages, ['en']);
  assert.equal(memberCaps.videoGeneration, false);
  assert.equal(memberCaps.unavailableReasons.videoGeneration, 'not_eligible');

  const creatorCaps = (await call(clients.creator, 'getKawuriCapabilities', {})).data;
  assert.equal(creatorCaps.videoGeneration, true);
  assert.deepEqual(creatorCaps.videoDurations, [4, 6, 8]);
});

test('image generation stores the result privately and a repeated request buys nothing twice', async () => {
  const id = requestId('img');
  const payload = { requestId: id, prompt: 'A painted compound wall at dusk, no people.', aspectRatio: '3:4', conversationId: 'conv-1' };
  const first = (await call(clients.member, 'createKawuriImage', payload)).data;
  assert.equal(first.status, 'ready');
  assert.equal(first.type, 'image_generation');
  assert.equal(first.aiGenerated, true);
  assert.equal(first.outputMedia.length, 1);
  const media = first.outputMedia[0];
  assert.equal(media.storagePath, `kawuri-creations/kawuri-member/${first.id}/image-1.png`);
  assert.equal(media.mimeType, 'image/png');
  assert.deepEqual([media.width, media.height], [1, 1]);
  assert.ok(first.actions.includes('download') && first.actions.includes('use_as_reel_cover'));

  const [exists] = await bucket.file(media.storagePath).exists();
  assert.ok(exists, 'the image is in Storage, not in Firestore');
  const [metadata] = await bucket.file(media.storagePath).getMetadata();
  assert.equal(metadata.metadata.aiGenerated, 'true');
  const stored = await db.doc(`kawuriTasks/${first.id}`).get();
  assert.equal(JSON.stringify(stored.data()).includes('iVBOR'), false, 'no base64 in the task');
  assert.equal(await billableAttempts(first.id), 1);

  const again = (await call(clients.member, 'createKawuriImage', payload)).data;
  assert.equal(again.id, first.id);
  assert.equal(await billableAttempts(first.id), 1, 'a retried press is not a second generation');
});

test('simultaneous duplicate presses buy exactly one generation', async () => {
  const image = { requestId: requestId('dbl'), prompt: 'A clay pot on a woven mat.', aspectRatio: '1:1' };
  const results = await Promise.allSettled([
    call(clients.member, 'createKawuriImage', image),
    call(clients.member, 'createKawuriImage', image),
    call(clients.member, 'createKawuriImage', image),
  ]);
  const ids = new Set(results.filter((r) => r.status === 'fulfilled').map((r) => r.value.data.id));
  assert.equal(ids.size, 1, 'every press refers to the same task');
  const [taskId] = ids;
  assert.equal(await billableAttempts(taskId), 1, 'one bill for three taps arriving together');

  const video = {
    requestId: requestId('dblv'), prompt: 'A market at dawn, no people.', aspectRatio: '16:9',
    durationSeconds: 4, confirmSpend: true,
  };
  const videos = await Promise.allSettled([
    call(clients.creator, 'createKawuriVideo', video),
    call(clients.creator, 'createKawuriVideo', video),
  ]);
  const videoIds = new Set(videos.filter((r) => r.status === 'fulfilled').map((r) => r.value.data.id));
  assert.equal(videoIds.size, 1);
  const [videoId] = videoIds;
  assert.equal(await billableAttempts(videoId), 1, 'one Veo job for two taps arriving together');
});

test('the platform screen rejects before anything is billed, and Vertex safety and quota map to task states', async () => {
  const unsafe = (await call(clients.member, 'createKawuriImage', {
    requestId: requestId('unsafe'), prompt: 'Something violent [fake:unsafe]', aspectRatio: '1:1',
  })).data;
  assert.equal(unsafe.status, 'rejected');
  assert.equal(unsafe.errorCode, 'SAFETY_REJECTED');
  assert.equal(unsafe.moderationStatus, 'blocked');
  assert.equal(await billableAttempts(unsafe.id), 0, 'a refused request never reaches a generator');

  const blocked = (await call(clients.member, 'createKawuriImage', {
    requestId: requestId('vtxsafe'), prompt: 'Ambiguous [fake:image-safety]', aspectRatio: '1:1',
  })).data;
  assert.equal(blocked.status, 'rejected');
  assert.equal(blocked.errorCode, 'SAFETY_REJECTED');

  const quota = (await call(clients.member, 'createKawuriImage', {
    requestId: requestId('quota'), prompt: 'A basket [fake:quota]', aspectRatio: '1:1',
  })).data;
  assert.equal(quota.status, 'failed');
  assert.equal(quota.errorCode, 'QUOTA_EXCEEDED');
  assert.doesNotMatch(quota.errorMessage, /429|RESOURCE_EXHAUSTED/, 'no provider text reaches the member');
});

test('the daily allowance is enforced server-side before generation', async () => {
  await db.doc('_rateLimits/kawuriChatDaily_kawuri-limited').set({ startedAt: Date.now(), count: 20 });
  const id = requestId('limit');
  await rejectsWith(call(clients.limited, 'createKawuriImage', { requestId: id, prompt: 'A drum', aspectRatio: '1:1' }), 'ALLOWANCE_EXHAUSTED');
  const task = await db.doc(`kawuriTasks/kawuri-limited_${id}`).get();
  assert.equal(task.get('status'), 'failed');
  assert.equal(task.get('billed'), false);
});

test('video: eligibility and confirmation first, then the operation name is persisted and recovered', async () => {
  const request = {
    requestId: requestId('vid'), prompt: 'A slow pan across painted walls, no people.', aspectRatio: '9:16',
    durationSeconds: 4, resolution: '720p', confirmSpend: true,
  };
  await rejectsWith(call(clients.member, 'createKawuriVideo', request), 'NOT_ELIGIBLE');
  await rejectsWith(call(clients.creator, 'createKawuriVideo', { ...request, confirmSpend: false }), 'CONFIRMATION_REQUIRED');

  const created = (await call(clients.creator, 'createKawuriVideo', request)).data;
  assert.equal(created.status, 'generating');
  assert.equal(created.operationName, true, 'the app is told an operation exists, never its name');
  const persisted = await db.doc(`kawuriTasks/${created.id}`).get();
  assert.match(persisted.get('operationName'), /^projects\/demo\/locations\/us-central1\/.+\/operations\/fake-/);
  assert.equal(persisted.get('estimatedCostCents'), 60);

  const duplicate = (await call(clients.creator, 'createKawuriVideo', request)).data;
  assert.equal(duplicate.id, created.id);
  assert.equal(await billableAttempts(created.id), 1, 'one video per press');

  // First status check: still running. Nothing but the persisted name is used.
  const running = (await call(clients.creator, 'getKawuriTask', { taskId: created.id })).data;
  assert.equal(running.status, 'generating');
  assert.equal(running.progress, null, 'no invented percentage');

  // A later check, after the poll interval: finished and imported.
  await db.doc(`kawuriTasks/${created.id}`).update({ lastPolledAt: '2000-01-01T00:00:00.000Z' });
  const ready = (await call(clients.creator, 'getKawuriTask', { taskId: created.id })).data;
  assert.equal(ready.status, 'ready');
  assert.equal(ready.outputMedia[0].storagePath, `kawuri-creations/kawuri-creator/${created.id}/video-1.mp4`);
  assert.deepEqual([ready.outputMedia[0].width, ready.outputMedia[0].height], [720, 1280]);
  const [exists] = await bucket.file(ready.outputMedia[0].storagePath).exists();
  assert.ok(exists);
});

test('a job started before a restart is finished from its stored operation name alone', async () => {
  const taskId = 'kawuri-creator_recover_0000001';
  const createdAt = new Date(Date.now() - 3 * 60_000).toISOString();
  await db.doc(`kawuriTasks/${taskId}`).set({
    id: taskId, userId: 'kawuri-creator', type: 'video_generation', category: 'video', listed: true,
    status: 'generating', model: 'veo-3.1-fast-generate-001', provider: 'vertex', prompt: 'Recovered',
    operationName: 'projects/demo/locations/us-central1/publishers/google/models/veo-3.1-fast-generate-001/operations/started-elsewhere',
    aspectRatio: '16:9', duration: 4, resolution: '1080p', outputMedia: [], sourceMedia: [], billed: true,
    createdAt, updatedAt: createdAt, completedAt: null, lastPolledAt: null,
  });
  await call(clients.creator, 'getKawuriTask', { taskId });
  await db.doc(`kawuriTasks/${taskId}`).update({ lastPolledAt: '2000-01-01T00:00:00.000Z' });
  const done = (await call(clients.creator, 'getKawuriTask', { taskId })).data;
  assert.equal(done.status, 'ready');
  assert.deepEqual([done.outputMedia[0].width, done.outputMedia[0].height], [1920, 1080]);
});

test('an unfinished task past its limit is ended, never left generating', async () => {
  const taskId = 'kawuri-member_stale_0000001';
  const createdAt = new Date(Date.now() - 11 * 60_000).toISOString();
  await db.doc(`kawuriTasks/${taskId}`).set({
    id: taskId, userId: 'kawuri-member', type: 'image_generation', category: 'image', listed: true,
    status: 'generating', model: 'gemini-3.1-flash-image', provider: 'vertex', prompt: 'Lost',
    outputMedia: [], sourceMedia: [], billed: true, createdAt, updatedAt: createdAt,
  });
  const ended = (await call(clients.member, 'getKawuriTask', { taskId })).data;
  assert.equal(ended.status, 'failed');
  assert.equal(ended.errorCode, 'OPERATION_TIMEOUT');
});

test('English-only transcription: refused languages, real metadata checks and temporary audio deleted', async () => {
  const storage = getStorage(clients.member);
  const path = `kawuri-uploads/kawuri-member/audio/${requestId('rec')}/voice.wav`;
  await uploadBytes(ref(storage, path), wav(3), { contentType: 'audio/wav' });

  await rejectsWith(call(clients.member, 'transcribeKawuriAudio', {
    requestId: requestId('stt'), storagePath: path, language: 'xsm', durationSeconds: 3,
  }), 'UNSUPPORTED_LANGUAGE');

  const result = (await call(clients.member, 'transcribeKawuriAudio', {
    requestId: requestId('stt'), storagePath: path, language: 'en', durationSeconds: 3,
  })).data;
  assert.equal(result.language, 'en');
  assert.equal(result.transcript, 'Please add the painted walls to my reel.');
  assert.equal(result.durationSeconds, 3, 'measured from the file, not the request');
  const [stillThere] = await bucket.file(path).exists();
  assert.equal(stillThere, false, 'the temporary recording is gone');

  // The admin SDK bypasses rules, so this reaches the callable's own checks.
  const mislabelled = `kawuri-uploads/kawuri-member/audio/${requestId('bad')}/voice.wav`;
  await bucket.file(mislabelled).save(Buffer.from('not audio'), { contentType: 'application/octet-stream' });
  await rejectsWith(call(clients.member, 'transcribeKawuriAudio', {
    requestId: requestId('stt'), storagePath: mislabelled, language: 'en', durationSeconds: 3,
  }), 'INVALID_MEDIA');

  const tooLong = `kawuri-uploads/kawuri-member/audio/${requestId('long')}/voice.wav`;
  await bucket.file(tooLong).save(wav(125), { contentType: 'audio/wav' });
  await rejectsWith(call(clients.member, 'transcribeKawuriAudio', {
    requestId: requestId('stt'), storagePath: tooLong, language: 'en', durationSeconds: 60,
  }), 'INVALID_MEDIA');

  await rejectsWith(call(clients.member, 'transcribeKawuriAudio', {
    requestId: requestId('stt'), storagePath: `kawuri-uploads/kawuri-member/audio/${requestId('none')}/gone.wav`, language: 'en', durationSeconds: 3,
  }), 'UPLOAD_MISSING');
});

test('media analysis answers, continues, and belongs to its owner only', async () => {
  const storage = getStorage(clients.member);
  const path = `kawuri-uploads/kawuri-member/media/${requestId('img')}/photo.png`;
  await uploadBytes(ref(storage, path), PNG, { contentType: 'image/png' });

  const analysis = (await call(clients.member, 'analyseKawuriMedia', {
    requestId: requestId('ana'), intention: 'describe', question: 'What is this?', storagePath: path,
  })).data;
  assert.equal(analysis.type, 'image_analysis');
  assert.equal(analysis.status, 'ready');
  assert.equal(analysis.result.summary, 'A test image of a single pixel.');
  assert.equal(analysis.turns.length, 1);

  const followUp = (await call(clients.member, 'analyseKawuriMedia', {
    requestId: requestId('ana'), intention: 'check_quality', question: 'Is it sharp?', followUpTaskId: analysis.id,
  })).data;
  assert.equal(followUp.id, analysis.id);
  assert.equal(followUp.turns.length, 2);

  await rejectsWith(call(clients.other, 'analyseKawuriMedia', {
    requestId: requestId('ana'), intention: 'describe', followUpTaskId: analysis.id,
  }), 'PERMISSION_DENIED');
  await rejectsWith(call(clients.other, 'analyseKawuriMedia', {
    requestId: requestId('ana'), intention: 'describe', storagePath: path,
  }), 'PERMISSION_DENIED');
  await rejectsWith(call(clients.other, 'getKawuriTask', { taskId: analysis.id }), 'NOT_FOUND');
  await rejectsWith(call(clients.other, 'deleteKawuriCreation', { taskId: analysis.id }), 'NOT_FOUND');
});

test('recent creations are listed per member, filtered, and deletable', async () => {
  const all = (await call(clients.member, 'listKawuriCreations', { filter: 'all', limit: 30 })).data;
  assert.ok(all.tasks.length >= 2);
  assert.ok(all.tasks.every((task) => task.userId === 'kawuri-member'));
  assert.ok(all.tasks.every((task) => task.type !== 'speech_to_text'), 'dictation never appears in Recent');
  const sorted = [...all.tasks].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  assert.deepEqual(all.tasks.map((task) => task.id), sorted.map((task) => task.id), 'newest first');

  const images = (await call(clients.member, 'listKawuriCreations', { filter: 'image' })).data;
  assert.ok(images.tasks.length > 0 && images.tasks.every((task) => task.category === 'image'));
  const analyses = (await call(clients.member, 'listKawuriCreations', { filter: 'analysis' })).data;
  assert.ok(analyses.tasks.every((task) => task.category === 'analysis'));

  const target = images.tasks.find((task) => task.status === 'ready' && task.outputMedia.length > 0);
  assert.ok(target);
  const deleted = (await call(clients.member, 'deleteKawuriCreation', { taskId: target.id })).data;
  assert.equal(deleted.deleted, true);
  assert.equal((await db.doc(`kawuriTasks/${target.id}`).get()).exists, false);
  const [exists] = await bucket.file(target.outputMedia[0].storagePath).exists();
  assert.equal(exists, false);
  const audit = await db.collection('auditLogs').where('target.id', '==', target.id).where('action', '==', 'kawuri.image_generation').get();
  assert.equal(audit.size, 1, 'the billing record outlives the creation');
});

test('cancelling a video stops it being advanced', async () => {
  const created = (await call(clients.creator, 'createKawuriVideo', {
    requestId: requestId('cancel'), prompt: 'A market, no people.', aspectRatio: '16:9', durationSeconds: 6, confirmSpend: true,
  })).data;
  const cancelled = (await call(clients.creator, 'cancelKawuriTask', { taskId: created.id })).data;
  assert.equal(cancelled.status, 'cancelled');
  assert.match(cancelled.errorMessage, /still counts/);
  await db.doc(`kawuriTasks/${created.id}`).update({ lastPolledAt: '2000-01-01T00:00:00.000Z' });
  const after = (await call(clients.creator, 'getKawuriTask', { taskId: created.id })).data;
  assert.equal(after.status, 'cancelled');
  assert.deepEqual(after.outputMedia, []);
});
