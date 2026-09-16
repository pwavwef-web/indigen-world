/** Export reviewed, consented contributor expressions as JSONL. No provider upload. */
import { initializeApp } from 'firebase-admin/app';
import { FieldPath, getFirestore } from 'firebase-admin/firestore';

if (process.argv.includes('--help') || !process.argv.includes('--project')) {
  console.log('Usage: node services/functions/scripts/export-contributor-training.mjs --project PROJECT_ID > expressions.jsonl');
  console.log('Uses Application Default Credentials. Rechecks current review status and training consent before export.');
  process.exit(0);
}
const projectId = process.argv[process.argv.indexOf('--project') + 1];
if (!projectId || projectId.startsWith('--')) throw new Error('Provide a project ID.');
initializeApp({ projectId });
const db = getFirestore();
let cursor;
for (;;) {
  let query = db.collection('contributorTrainingPairs').orderBy(FieldPath.documentId()).limit(100);
  if (cursor) query = query.startAfter(cursor);
  const page = await query.get();
  if (page.empty) break;
  for (const row of page.docs) {
    const source = await db.doc(`submissions/${row.id}`).get();
    const s = source.data();
    if (!s?.contributorPortal || !['APPROVED', 'PUBLISHED'].includes(s.status)
      || s.permissions?.aiTraining !== true || s.permissions?.publication !== true) continue;
    const dictionary = await db.doc(`dictionaryEntries/collection_${row.id}`).get();
    if (dictionary.get('isPublished') !== true) continue;
    // Preserve each expression, punctuation and alternatives as complete utterances.
    console.log(JSON.stringify({ sourceSubmission: row.id, contributorId: s.authUid,
      language: 'xsm', kind: 'expression', english: s.title, kasem: s.body,
      alternatives: s.alternativeExpressions ?? [], consentVersion: s.permissions.consentVersion,
      reviewedAt: s.moderation?.decidedAt, exportedAt: new Date().toISOString() }));
  }
  cursor = page.docs.at(-1);
}
