/** Read-only guest check for the published Music collection query. */
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp, deleteApp } from 'firebase/app';
import { getFirestore, collection, getDocs, orderBy, query, where } from 'firebase/firestore';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const options = await readFile(resolve(root, 'apps/mobile/lib/firebase_options_production.dart'), 'utf8');
const android = options.match(/static const FirebaseOptions android = FirebaseOptions\(([^]*?)\);/);
if (!android) throw Error('Production Android Firebase options missing');
const option = name => android[1].match(new RegExp(`${name}: '([^']+)'`))?.[1];
const projectId = option('projectId');
const apiKey = option('apiKey');
const appId = option('appId');
if (!projectId || !apiKey || !appId) throw Error('Incomplete Firebase options');
const app = initializeApp({ projectId, apiKey, appId }, `verify-de-n-lei-${Date.now()}`);
try {
  const db = getFirestore(app);
  const snapshot = await getDocs(query(
    collection(db, 'publishedContent'),
    where('publicationStatus', '==', 'published'),
    where('collectionKind', '==', 'music'),
    orderBy('publishedAt', 'desc'),
  ));
  const doc = snapshot.docs.find(doc => doc.id === 'de-n-lei-come-learn-kasem');
  if (!doc) throw Error('Song is missing from the anonymous Music query');
  const data = doc.data();
  if (data.mediaType !== 'audio' || !data.mediaUrl || !data.thumbnailUrl
      || !data.body?.includes('ko ye tε?')
      || data.creatorAttribution?.displayName !== 'Indigen World') {
    throw Error('Published song is missing audio, artwork, lyrics, or credit');
  }
  console.log(JSON.stringify({ projectId, visibleAsGuest: true, document: doc.ref.path,
    title: data.title, artist: data.creatorAttribution.displayName,
    audio: true, cover: true, lyricsCharacters: data.body.length,
    publishedAt: data.publishedAt }, null, 2));
} finally {
  await deleteApp(app);
}
