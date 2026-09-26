/** Seed one supplied song into the mobile Music collection.
 * node firebase/seed/seed-de-n-lei.mjs          # local validation only
 * node firebase/seed/seed-de-n-lei.mjs --commit # publish to .firebaserc default
 * Uses Application Default Credentials. Re-running updates only this seed.
 */
import { createHash, randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getDownloadURL, getStorage } from 'firebase-admin/storage';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const folder = resolve(root, 'assets/music/de-n-lei');
const projectId = JSON.parse(await readFile(resolve(root, '.firebaserc'), 'utf8')).projects.default;
const id = 'de-n-lei-come-learn-kasem';
const origin = { collection: 'curatedSeeds', id };
const assets = [
  { name: 'de-n-lei-come-learn-kasem.mp3', contentType: 'audio/mpeg' },
  { name: 'cover.png', contentType: 'image/png' },
];
for (const asset of assets) {
  asset.bytes = await readFile(resolve(folder, asset.name));
  asset.sha256 = createHash('sha256').update(asset.bytes).digest('hex');
}
const lyrics = (await readFile(resolve(folder, 'lyrics.txt'), 'utf8')).trim();
if (!assets[0].bytes.subarray(0, 3).equals(Buffer.from('ID3'))
    && assets[0].bytes[0] !== 0xff) throw Error('Expected MP3 audio');
if (!assets[1].bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
  throw Error('Expected PNG cover');
}
for (const phrase of ['de n lei', 'de á lei', 'ko ye tε?', 'a lage se a ŋɔɔne kasem mo']) {
  if (!lyrics.includes(phrase)) throw Error(`Lyrics are missing ${phrase}`);
}
const version = createHash('sha256')
  .update(assets[0].sha256).update(assets[1].sha256).update(lyrics)
  .digest('hex').slice(0, 20);
const prefix = `published-media/music/${id}/${version}`;
const makeDocument = (previous, urls, now) => ({
  id,
  submission: origin,
  campaign: null,
  creatorAttribution: { creatorId: 'indigen-world', displayName: 'Indigen World', avatarUrl: null },
  language: 'xsm',
  dialect: '',
  category: 'Language learning song',
  collectionKind: 'music',
  corpusArea: 'culture',
  authenticationStatus: 'unspecified',
  title: 'De N Lei — Come Learn Kasem',
  description: 'A call-and-response song for practising Kasem greetings, introductions and polite words.',
  body: lyrics,
  englishSummary: 'Listen, repeat and sing along with Kasem greetings, introductions and polite words.',
  translations: [],
  mediaUrl: urls.get('de-n-lei-come-learn-kasem.mp3'),
  mediaType: 'audio',
  thumbnailUrl: urls.get('cover.png'),
  captionsUrl: null,
  culturalNotes: 'The supplied lyrics pair Kasem lines with English glosses. The language lines have not been independently reviewed in this seed.',
  ageRating: 'all',
  tags: ['Kasem', 'music', 'language learning', 'greetings'],
  publicationStatus: 'published',
  publishedAt: previous?.publishedAt ?? now,
  licenceDisplay: 'Shared by Indigen World',
  sourceAttribution: 'Audio metadata says made with Suno; recording and lyrics supplied by Indigen World.',
  publicationRoute: 'open',
  correctionState: 'none',
  schemaVersion: 1,
  lifecycle: {
    createdAt: previous?.lifecycle?.createdAt ?? now,
    updatedAt: now,
    version: Number(previous?.lifecycle?.version ?? 0) + 1,
  },
});
const schemaFolder = resolve(root, 'packages/contracts/schemas');
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
for (const name of (await readdir(schemaFolder)).filter(name => name.endsWith('.schema.json'))) {
  ajv.addSchema(JSON.parse(await readFile(resolve(schemaFolder, name), 'utf8')));
}
const validate = ajv.getSchema('https://schemas.indigen-world.org/v0/published-content.schema.json');
const validateDocument = document => {
  if (!validate(document)) throw Error(`Publication contract invalid: ${JSON.stringify(validate.errors)}`);
};
validateDocument(makeDocument(null, new Map(assets.map(asset => [asset.name,
  `https://example.invalid/${asset.name}`])), new Date().toISOString()));
const commit = process.argv.includes('--commit');
if (process.argv.slice(2).some(arg => arg !== '--commit')) throw Error('Unknown argument');
console.log(JSON.stringify({
  mode: commit ? 'publish' : 'dry-run', projectId,
  document: `publishedContent/${id}`, storagePrefix: prefix,
  assets: assets.map(({ name, bytes, sha256 }) => ({ name, bytes: bytes.length, sha256 })),
  lyricsCharacters: lyrics.length,
}, null, 2));
if (!commit) process.exit(0);
if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_STORAGE_EMULATOR_HOST) {
  throw Error('Live publication must not target an emulator');
}

initializeApp({ credential: applicationDefault(), projectId, storageBucket: `${projectId}.firebasestorage.app` });
const db = getFirestore();
const target = db.doc(`publishedContent/${id}`);
const belongsToSeed = data => data?.submission?.collection === origin.collection
  && data?.submission?.id === origin.id;
const before = await target.get();
if (before.exists && !belongsToSeed(before.data())) {
  throw Error('Refusing to replace an unrelated publication');
}

const urls = new Map();
const bucket = getStorage().bucket();
for (const asset of assets) {
  const file = bucket.file(`${prefix}/${asset.name}`);
  const [exists] = await file.exists();
  if (!exists) {
    await file.save(asset.bytes, {
      resumable: false,
      preconditionOpts: { ifGenerationMatch: 0 },
      metadata: {
        contentType: asset.contentType,
        cacheControl: 'public,max-age=31536000,immutable',
        metadata: { firebaseStorageDownloadTokens: randomUUID(), sha256: asset.sha256 },
      },
    });
  } else {
    const [metadata] = await file.getMetadata();
    if (metadata.metadata?.sha256 !== asset.sha256 || Number(metadata.size) !== asset.bytes.length) {
      throw Error(`Existing asset differs: ${asset.name}`);
    }
  }
  const url = await getDownloadURL(file);
  const response = await fetch(url, { method: 'HEAD' });
  if (!response.ok || Number(response.headers.get('content-length')) !== asset.bytes.length) {
    throw Error(`Public asset verification failed: ${asset.name} (${response.status})`);
  }
  urls.set(asset.name, url);
  console.log(`Verified ${asset.name}`);
}

const now = new Date().toISOString();
await db.runTransaction(async transaction => {
  const current = await transaction.get(target);
  const previous = current.data();
  if (current.exists && !belongsToSeed(previous)) throw Error('Publication changed during upload');
  const document = makeDocument(previous, urls, now);
  validateDocument(document);
  transaction.set(target, document);
});
const published = (await target.get()).data();
if (published?.publicationStatus !== 'published'
    || published?.collectionKind !== 'music'
    || published?.mediaUrl !== urls.get('de-n-lei-come-learn-kasem.mp3')
    || published?.thumbnailUrl !== urls.get('cover.png')
    || published?.body !== lyrics) {
  throw Error('Published record verification failed');
}
console.log(JSON.stringify({ projectId, document: target.path, publishedAt: published.publishedAt,
  verifiedAt: now, title: published.title, artist: published.creatorAttribution.displayName }, null, 2));
