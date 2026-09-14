/** Publish the reviewed Kasem story and immutable reader assets.
 * node firebase/seed/seed-sky-folktale.mjs                # local validation
 * node firebase/seed/seed-sky-folktale.mjs --commit       # publish to configured project
 * Uses Application Default Credentials. Does not modify rules or other content.
 */
import { createHash, randomUUID } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage, getDownloadURL } from 'firebase-admin/storage';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const folder = resolve(root, 'output/pdf/sky-folktale');
const projectId = JSON.parse(await readFile(resolve(root, '.firebaserc'), 'utf8')).projects.default;
const publication = JSON.parse(await readFile(resolve(folder, 'publication.json'), 'utf8'));
const pages = (await readdir(resolve(folder, 'pages'))).filter(p => /^page-\d{2}\.jpg$/.test(p)).sort();
if (pages.length !== publication.pageCount || pages.length !== 9) throw Error('Expected cover and eight story pages');
if (publication.id !== 'kasem-sky-far-away' || !publication.body || !publication.title || publication.collectionKind !== 'literature') {
  throw Error('Unexpected or incomplete story record');
}
const assetNames = ['sky-folktale-kasem.pdf', 'cover.jpg', ...pages.map(p => `pages/${p}`)];
const assets = await Promise.all(assetNames.map(async name => ({ name, bytes: await readFile(resolve(folder, name)) })));
if (!assets[0].bytes.subarray(0,5).equals(Buffer.from('%PDF-'))) throw Error('PDF missing');
const hash = createHash('sha256');
for (const asset of assets) hash.update(asset.name).update(asset.bytes);
const version = hash.digest('hex').slice(0,20);
const prefix = `published-media/folktales/sky-far-away/${version}`;
console.log(JSON.stringify({ projectId, document: `publishedContent/${publication.id}`, version,
  assets: assets.length, pageCount: pages.length, bytes: assets.reduce((sum,a)=>sum+a.bytes.length,0),
  mode: process.argv.includes('--commit') ? 'publish' : 'dry-run' }, null, 2));
if (!process.argv.includes('--commit')) process.exit(0);
if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_STORAGE_EMULATOR_HOST) throw Error('Live publication must not target an emulator');
initializeApp({ credential: applicationDefault(), projectId, storageBucket: `${projectId}.firebasestorage.app` });
const db = getFirestore();
const target = db.doc(`publishedContent/${publication.id}`);
const previous = await target.get();
const origin = 'sky-folktale-reviewed-navrongo-v1';
if (previous.exists && previous.data().seedOrigin !== origin) throw Error('Refusing to replace an unrelated existing publication');
const bucket = getStorage().bucket();
const urls = new Map();
for (const asset of assets) {
  const file = bucket.file(`${prefix}/${asset.name}`);
  const [exists] = await file.exists();
  if (!exists) {
    await file.save(asset.bytes, { resumable: false, preconditionOpts: { ifGenerationMatch: 0 },
      metadata: { contentType: asset.name.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg',
        cacheControl: 'public,max-age=31536000,immutable',
        metadata: { firebaseStorageDownloadTokens: randomUUID(), storyVersion: version } } });
  }
  const url = await getDownloadURL(file);
  const response = await fetch(url, { method: 'HEAD' });
  if (!response.ok || Number(response.headers.get('content-length')) !== asset.bytes.length) {
    throw Error(`Public asset verification failed: ${asset.name} (${response.status})`);
  }
  urls.set(asset.name,url);
  console.log(`Verified ${asset.name}`);
}
const now = new Date().toISOString();
await db.runTransaction(async tx => {
  const current = await tx.get(target);
  if (current.exists && current.data().seedOrigin !== origin) throw Error('Publication changed during upload');
  tx.set(target, { ...publication, seedOrigin: origin, assetVersion: version,
    mediaUrl: urls.get('sky-folktale-kasem.pdf'), thumbnailUrl: urls.get('cover.jpg'),
    documentPageUrls: pages.map(p=>urls.get(`pages/${p}`)),
    publishedAt: current.data()?.publishedAt ?? now, updatedAt: now });
});
const saved = (await target.get()).data();
if (saved?.assetVersion !== version || saved?.documentPageUrls?.length !== 9 || saved?.publicationStatus !== 'published') throw Error('Published record verification failed');
const receipt={ projectId, documentPath: target.path, assetVersion: version, verifiedAt: now,
  mediaUrl: saved.mediaUrl, thumbnailUrl: saved.thumbnailUrl, pageCount: saved.documentPageUrls.length };
await writeFile(resolve(folder,'publication-receipt.json'),JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify(receipt,null,2));
