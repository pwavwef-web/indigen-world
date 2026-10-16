import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onObjectFinalized } from 'firebase-functions/v2/storage';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { requireAuth, requireRole } from './auth.js';
import { probeMedia, runFfmpeg } from './video-editor/ffmpeg.js';
import { consumeRateLimit } from './rate-limit.js';
const options = { region: 'us-central1', enforceAppCheck: process.env.ENFORCE_APP_CHECK === 'true', invoker: 'public' as const };
const now = () => new Date().toISOString();
export function rasterMime(bytes: Buffer): string | null {
  if (bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))) return 'image/jpeg';
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}
/** Shared by the trigger and real decoder tests. Never follows remote URLs. */
export async function prepareCollectionRaster(input: string, declaredMime: string, dir: string) {
  const bytes = await readFile(input), mime = rasterMime(bytes);
  if (bytes.length > 10 * 1024 * 1024 || !mime || mime !== declaredMime) throw new Error('The file contents do not match a supported image type.');
  const probe = await probeMedia(input);
  if (!probe.width || !probe.height || probe.width * probe.height > 40_000_000 || probe.width < 32 || probe.height < 32) throw new Error('Choose an image between 32 pixels and 40 megapixels.');
  const outputs: Record<string, string> = {};
  for (const [name, width] of [['display', 1600], ['thumbnail', 480]] as const) {
    const output = path.join(dir, `${name}.jpg`);
    await runFfmpeg(['-hide_banner', '-nostdin', '-y', '-protocol_whitelist', 'file,pipe', '-i', input, '-frames:v', '1', '-vf', `scale='min(${width},iw)':-2`, '-map_metadata', '-1', '-q:v', '3', output], { timeoutMs: 45000 });
    outputs[name] = output;
  }
  return { width: probe.width, height: probe.height, mime, outputs };
}
export const collectionMedia = onCall(options, async (req) => {
  const uid = requireAuth(req); requireRole(req, 'admin');
  const data = req.data ?? {}, db = getFirestore(), bucket = getStorage().bucket();
  if (data.operation === 'content') {
    if (!['music', 'literature', 'audiobooks', 'video'].includes(data.kind)) throw new HttpsError('invalid-argument', 'Choose a collection.');
    let query = db.collection('publishedContent').where('collectionKind', '==', data.kind).orderBy('__name__').limit(40);
    if (data.cursor) query = query.startAfter(String(data.cursor));
    const page = await query.get();
    return { items: page.docs.map((d) => ({ id: d.id, title: d.get('title') ?? '', thumbnailUrl: d.get('thumbnailUrl') ?? '', coverAssetId: d.get('coverAssetId') ?? null, publicationStatus: d.get('publicationStatus') })), cursor: page.size === 40 ? page.docs.at(-1)!.id : null };
  }
  if (data.operation === 'setCover') {
    if (!/^[\w-]{1,128}$/.test(data.contentId)) throw new HttpsError('invalid-argument', 'Choose a collection record.');
    const content = db.collection('publishedContent').doc(data.contentId);
    const asset = data.assetId ? db.collection('collectionMediaAssets').doc(String(data.assetId)) : null;
    return db.runTransaction(async (tx) => {
      const record = await tx.get(content), image = asset ? await tx.get(asset) : null;
      if (!record.exists) throw new HttpsError('not-found', 'Collection record not found.');
      if (image && image.get('status') !== 'published') throw new HttpsError('failed-precondition', 'Finish processing and publishing the image first.');
      const url = image ? image.get('url') : String(data.url ?? '');
      if (url && (url.length > 3000 || !/^https:\/\//.test(url))) throw new HttpsError('invalid-argument', 'Use an HTTPS image link.');
      tx.update(content, { thumbnailUrl: url || null, coverAssetId: image?.id ?? null, thumbnailAlt: String(data.alt ?? '').slice(0, 500) });
      if (asset) tx.update(asset, { usage: FieldValue.arrayUnion(`publishedContent/${record.id}`) });
      tx.create(db.collection('auditLogs').doc(), { action: 'collection.cover', targetId: record.id, actorUid: uid, createdAt: now() });
      return { ok: true };
    });
  }
  if (data.operation === 'begin') {
    await consumeRateLimit('collectionMedia.begin', uid, 100, 60 * 60_000);
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(data.mime) || !Number.isInteger(data.bytes) || data.bytes < 1 || data.bytes > 10 * 1024 * 1024) throw new HttpsError('invalid-argument', 'Choose a JPG, PNG or WebP image up to 10 MB.');
    const id = randomUUID(), storagePath = `collectionMediaRaw/${uid}/${id}/original`;
    await db.collection('collectionMediaAssets').doc(id).create({ id, ownerUid: uid, storagePath, declaredMime: data.mime, expectedBytes: data.bytes, status: 'uploading', alt: '', credit: '', rights: '', usage: [], createdAt: now() });
    return { id, storagePath };
  }
  if (data.operation === 'library') {
    const page = await db.collection('collectionMediaAssets').where('status', '==', 'published').limit(60).get();
    return { items: page.docs.map((d) => ({ id: d.id, ...d.data() })) };
  }
  if (data.operation === 'pending') {
    const page = await db.collection('collectionMediaAssets').where('ownerUid', '==', uid).where('status', 'in', ['uploading', 'processing', 'ready', 'failed']).limit(30).get();
    return { items: page.docs.map((d) => ({ id: d.id, ...d.data() })) };
  }
  if (typeof data.id !== 'string' || !/^[a-f0-9-]{36}$/.test(data.id)) throw new HttpsError('invalid-argument', 'Choose an asset.');
  const ref = db.collection('collectionMediaAssets').doc(data.id), snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Image not found.');
  if (data.operation === 'status') return { id: snap.id, ...snap.data() };
  if (data.operation === 'publish') {
    if (!['ready', 'published'].includes(snap.get('status'))) throw new HttpsError('failed-precondition', 'This image is still processing or failed validation.');
    const alt = String(data.alt ?? '').trim().slice(0, 500), rights = String(data.rights ?? '').trim().slice(0, 500), credit = String(data.credit ?? '').trim().slice(0, 500);
    if (!alt || !rights) throw new HttpsError('invalid-argument', 'Describe the image and confirm its rights before using it.');
    const sizes = ['display', 'thumbnail'];
    const urls: Record<string, string> = {};
    for (const size of sizes) {
      const target = `public/collection-media/${snap.id}/${size}.jpg`, token = randomUUID();
      const file = bucket.file(target);
      const [exists] = await file.exists();
      if (!exists) {
        await bucket.file(`collectionMediaProcessed/${snap.id}/${size}.jpg`).copy(file);
        await file.setMetadata({ contentType: 'image/jpeg', cacheControl: 'public,max-age=31536000,immutable', metadata: { firebaseStorageDownloadTokens: token } });
      }
      const [metadata] = await file.getMetadata();
      urls[size] = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(target)}?alt=media&token=${metadata.metadata?.firebaseStorageDownloadTokens}`;
    }
    const value = { status: 'published', alt, rights, credit, focalX: Math.min(1, Math.max(0, Number(data.focalX) || 0.5)), focalY: Math.min(1, Math.max(0, Number(data.focalY) || 0.5)), url: urls.display, thumbnailUrl: urls.thumbnail, publishedAt: now() };
    await ref.update(value);
    return { id: snap.id, ...snap.data(), ...value };
  }
  throw new HttpsError('invalid-argument', 'Unsupported media operation.');
});
export const processCollectionImage = onObjectFinalized({ region: 'us-central1', timeoutSeconds: 120, memory: '1GiB', concurrency: 1, maxInstances: 4 }, async (event) => {
  const match = /^collectionMediaRaw\/([^/]+)\/([a-f0-9-]{36})\/original$/.exec(event.data.name);
  if (!match) return;
  const [, uid, id] = match, db = getFirestore(), ref = db.collection('collectionMediaAssets').doc(id), asset = await ref.get();
  if (!asset.exists || asset.get('ownerUid') !== uid || !['uploading', 'failed'].includes(asset.get('status'))) return;
  let dir: string | undefined;
  try {
    if (Number(event.data.size) > 10 * 1024 * 1024 || Number(event.data.size) !== asset.get('expectedBytes')) throw new Error('The uploaded image size does not match the selected file.');
    await ref.update({ status: 'processing' });
    dir = await mkdtemp(path.join(tmpdir(), 'collection-image-'));
    const input = path.join(dir, 'original'), bucket = getStorage().bucket(event.data.bucket);
    await bucket.file(event.data.name).download({ destination: input });
    const prepared = await prepareCollectionRaster(input, asset.get('declaredMime'), dir);
    for (const [name, output] of Object.entries(prepared.outputs)) {
      await bucket.upload(output, { destination: `collectionMediaProcessed/${id}/${name}.jpg`, metadata: { contentType: 'image/jpeg' } });
    }
    await ref.update({ status: 'ready', width: prepared.width, height: prepared.height, mime: prepared.mime, processedAt: now() });
  } catch (error) {
    await ref.update({ status: 'failed', error: error instanceof Error ? error.message : 'Image processing failed. Upload the image again.' });
  } finally { if (dir) await rm(dir, { recursive: true, force: true }); }
});
export const cleanupCollectionUploads = onSchedule({ schedule: 'every 24 hours', region: 'us-central1' }, async () => {
  const cutoff = new Date(Date.now() - 7 * 86400000).toISOString(), db = getFirestore();
  const page = await db.collection('collectionMediaAssets').where('status', 'in', ['uploading', 'processing', 'ready', 'failed']).where('createdAt', '<', cutoff).limit(100).get();
  for (const asset of page.docs) {
    // Published assets may be shared or referenced by legacy URL fields. Never
    // delete them based on draft deletion or an incomplete usage index.
    if (asset.get('status') === 'published' || asset.get('usage')?.length) continue;
    await getStorage().bucket().deleteFiles({ prefix: `collectionMediaRaw/${asset.get('ownerUid')}/${asset.id}/` });
    await getStorage().bucket().deleteFiles({ prefix: `collectionMediaProcessed/${asset.id}/` });
    await asset.ref.delete();
  }
});
