// Derived lookup keys only; no text, review decisions, permissions or points change.
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { initializeApp } from 'firebase-admin/app';
import { Firestore, getFirestore } from 'firebase-admin/firestore';
import { spellingKey } from '@indigen-world/contracts/kasem-spelling';

export async function backfillSpellingKeys(db, apply = false) {
  let cursor, scanned = 0, changed = 0;
  const base = db.collection('collectionContributions').where('collectionKind', '==', 'dictionary').limit(300);
  while (true) {
    const page = await (cursor ? base.startAfter(cursor) : base).get();
    for (const doc of page.docs) {
      scanned++;
      const data = doc.data();
      if (data.lexicalKind && data.lexicalKind !== 'word' || typeof data.body !== 'string') continue;
      const key = spellingKey(data.body);
      if (key === data.spellingKey) continue;
      changed++;
      if (apply) for (let attempt = 0; ; attempt++) {
        try {
          await db.runTransaction(async tx => {
            const latest = (await tx.get(doc.ref)).data();
            if (latest && typeof latest.body === 'string' && (!latest.lexicalKind || latest.lexicalKind === 'word')) tx.update(doc.ref, { spellingKey: spellingKey(latest.body) });
          });
          break;
        } catch (error) {
          if (attempt >= 4 || !['ECONNRESET', 'ETIMEDOUT', 14, 'UNAVAILABLE'].includes(error.code)) throw error;
          await new Promise(resolve => setTimeout(resolve, 500 * 2 ** attempt));
        }
      }
    }
    if (page.size < 300) break;
    cursor = page.docs[page.docs.length - 1];
  }
  return { apply, scanned, changed };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2), index = args.indexOf('--project'), projectId = args[index + 1];
  if (index < 0 || !projectId || projectId.startsWith('--')) throw Error('Pass --project PROJECT_ID [--apply] [--firebase-login].');
  let db;
  if (args.includes('--firebase-login')) {
    const require = createRequire(import.meta.url), auth = require('firebase-tools/lib/auth.js');
    const account = auth.getGlobalDefaultAccount(); if (!account) throw Error('No Firebase CLI account available.');
    const token = await auth.getAccessToken(account.tokens.refresh_token, ['https://www.googleapis.com/auth/cloud-platform']);
    const { OAuth2Client } = require('google-auth-library'), authClient = new OAuth2Client();
    authClient.setCredentials({ access_token: token.access_token, expiry_date: Date.now() + 3_000_000 });
    db = new Firestore({ projectId, authClient, preferRest: true });
  } else { initializeApp({ projectId }); db = getFirestore(); }
  try { console.log(JSON.stringify(await backfillSpellingKeys(db, args.includes('--apply')))); }
  catch (error) { console.error(`Spelling-key backfill failed: ${error.code ?? error.name}`); process.exitCode = 1; }
}
