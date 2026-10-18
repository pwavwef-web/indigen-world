// Read-only production evidence. No callable, submission or dictionary writes.
import { createRequire } from 'node:module';
import { writeFileSync, mkdirSync } from 'node:fs';
import { Firestore } from '@google-cloud/firestore';
const require = createRequire(import.meta.url);
const auth = require('firebase-tools/lib/auth.js');
const account = auth.getGlobalDefaultAccount();
if (!account) throw Error('Firebase CLI sign-in required');
const token = await auth.getAccessToken(account.tokens.refresh_token, ['https://www.googleapis.com/auth/cloud-platform']);
const { OAuth2Client } = require('google-auth-library');
const authClient = new OAuth2Client();
authClient.setCredentials({ access_token: token.access_token, expiry_date: Date.now() + 3_000_000 });
const db = new Firestore({ projectId: 'project-kassena-7e026', authClient, preferRest: true });
const snapshot = await db.collection('dictionaryEntries').where('isPublished', '==', true).get();
const keys = ['isPublished', 'kasemText', 'headword', 'kasem', 'word', 'englishText', 'translation', 'english', 'definition', 'translations', 'forms', 'senses', 'partOfSpeech', 'wordClass', 'format', 'ipa', 'audioUrl', 'audio', 'pronunciation', 'lexicalKind', 'contentKind', 'mergedInto', 'mergedIntoId', 'culturalPermissionTier'];
const entries = snapshot.docs.map(doc => ({ id: doc.id, ...Object.fromEntries(keys.filter(key => doc.get(key) !== undefined).map(key => [key, doc.get(key)])),
  verified: Boolean(doc.get('approvedBy') || doc.get('verified') === true || doc.get('reviewStatus') === 'approved'),
  ...(doc.get('publicationMode') ? { publicationMode: doc.get('publicationMode') } : {}) }));
mkdirSync('data/private/translation-assistance', { recursive: true });
writeFileSync('data/private/translation-assistance/published-dictionary.json', JSON.stringify(entries, null, 2));
const marked = entries.filter(e => /[\u0300\u0301]/u.test(String(e.kasemText ?? e.headword ?? '').normalize('NFD')));
console.log(JSON.stringify({ published: entries.length, marked: marked.length, samples: marked.slice(0, 18).map(({ id, kasemText, englishText, verified, publicationMode }) => ({ id, kasemText, englishText, verified, publicationMode })), fields: Object.fromEntries(keys.map(key => [key, entries.filter(e => e[key] != null).length])) }, null, 2));
