import { initializeApp } from 'firebase-admin/app';
import { FieldPath, getFirestore } from 'firebase-admin/firestore';
import { CANDIDATE_SOURCES, candidateDocument, refreshCandidate } from '../lib/kawuri-candidate-index.js';

const args = process.argv.slice(2);
const option = name => args[args.indexOf(name) + 1];
const project = args.includes('--project') ? option('--project') : '';
const collection = args.includes('--collection') ? option('--collection') : '';
const after = args.includes('--after') ? option('--after') : '';
const apply = args.includes('--apply');
const pages = args.includes('--pages') ? Number(option('--pages')) : 10;
if (!project || (!args.includes('--mark-ready') && !CANDIDATE_SOURCES.includes(collection))
  || !Number.isInteger(pages) || pages < 1 || pages > 100) {
  throw Error('Usage: --project PROJECT --collection SOURCE [--after DOC_ID] [--pages 1..100] [--apply]; or --project PROJECT --mark-ready [--apply]. Default is dry-run. Build functions first.');
}
initializeApp({ projectId: project });
const db = getFirestore();
if (args.includes('--mark-ready')) {
  const checkpoints = await db.getAll(...CANDIDATE_SOURCES.map(name => db.doc(`kawuriIndexState/backfill-${name}`)));
  if (checkpoints.some(doc => doc.get('schema') !== 1 || doc.get('complete') !== true)) throw Error('Every source must have a completed applied backfill before marking ready.');
  if (apply) await db.doc('kawuriIndexState/current').set({ schema: 1, ready: true, updatedAt: new Date().toISOString() });
  console.log(JSON.stringify({ dryRun: !apply, ready: true }));
} else {
  let cursor = after, scanned = 0, indexed = 0, complete = false;
  for (let page = 0; page < pages; page++) {
    let query = db.collection(collection).orderBy(FieldPath.documentId()).limit(101);
    if (cursor) query = query.startAfter(cursor);
    const snapshot = await query.get();
    const records = snapshot.docs.slice(0, 100);
    for (const record of records) {
      scanned++;
      if (candidateDocument(collection, record.id, record.data())) indexed++;
      if (apply) await refreshCandidate(collection, record.id);
      cursor = record.id;
    }
    complete = snapshot.size <= 100;
    if (complete) break;
  }
  // Never mark a manually skipped prefix complete. Resume only from the saved checkpoint.
  const checkpoint = db.doc(`kawuriIndexState/backfill-${collection}`);
  if (apply) {
    const previous = await checkpoint.get();
    const continuous = !after || (previous.get('cursor') === after && previous.get('continuous') === true);
    await checkpoint.set({ schema: 1, cursor, continuous, complete: complete && continuous, updatedAt: new Date().toISOString() });
  }
  console.log(JSON.stringify({ dryRun: !apply, collection, scanned, indexed, complete, nextCursor: complete ? null : cursor }));
}
