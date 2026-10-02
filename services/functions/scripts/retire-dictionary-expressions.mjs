/** Soft-retire expression copies; keep source data and original permissions. */
import { initializeApp } from 'firebase-admin/app';
import { FieldPath, getFirestore } from 'firebase-admin/firestore';
import { pathToFileURL } from 'node:url';
import { isExpressionSubmission } from '../lib/publication.js';

export function expressionCopyPlan(entryId, entry, source) {
  const expression = entry.contentKind === 'expression' || entry.collectionKind === 'expressions'
    || ['phrase', 'idiom', 'proverb'].includes(entry.lexicalKind)
    || (source && isExpressionSubmission(source));
  if (!expression || entry.isPublished !== true) return null;
  return {
    entryId,
    preserveTraining: Boolean(source?.contributorPortal && source.contributorPortal.contributorId === source.authUid
      && ['APPROVED', 'PUBLISHED'].includes(source.status)
      && source.permissions?.aiTraining === true && source.permissions?.publication === true),
  };
}

export async function retireDictionaryExpressions(db, { apply = false, report = console.log } = {}) {
  let cursor, retired = 0;
  for (;;) {
    let query = db.collection('dictionaryEntries').orderBy(FieldPath.documentId()).limit(100);
    if (cursor) query = query.startAfter(cursor);
    const page = await query.get();
    if (page.empty) break;
    for (const row of page.docs) {
      if (row.get('isPublished') !== true) continue;
      const pointer = row.get('sourceContribution');
      const submissionId = pointer?.collection === 'collectionContributions' && typeof pointer.id === 'string'
        ? pointer.id : row.id.startsWith('collection_') ? row.id.slice(11) : '';
      if (submissionId.includes('/')) throw new Error(`Invalid source pointer on ${row.id}`);
      if (!submissionId && !expressionCopyPlan(row.id, row.data())) continue;
      const sourceRef = submissionId ? db.doc(`submissions/${submissionId}`) : null;
      // Re-read classification and permissions in the transaction before writes.
      const plan = await db.runTransaction(async tx => {
        const [entry, source] = await Promise.all([tx.get(row.ref), sourceRef ? tx.get(sourceRef) : null]);
        const sourceData = source?.data();
        const plan = expressionCopyPlan(row.id, entry.data() ?? {}, sourceData);
        if (!plan || !apply) return plan;
        const now = new Date().toISOString();
        tx.update(row.ref, { isPublished: false, updatedAt: now,
          dictionaryScopeMigration: { version: 1, retiredAt: now, previousIsPublished: true,
            reason: 'Expression retained as source data; dictionary contains words.' } });
        if (plan.preserveTraining) {
          tx.set(db.doc(`contributorTrainingPairs/${submissionId}`), {
            id: submissionId, language: 'xsm', kind: 'expression', sourceSubmission: submissionId,
            contributorId: sourceData.authUid, english: sourceData.title, kasem: sourceData.body,
            alternatives: sourceData.alternativeExpressions ?? [], consentVersion: sourceData.permissions.consentVersion,
            context: sourceData.usageContext ?? '', dialect: sourceData.dialect ?? '', literalTranslation: sourceData.literalTranslation ?? '',
            reviewedAt: sourceData.moderation?.decidedAt ?? null,
          });
        }
        tx.set(db.doc(`auditLogs/dictionary_scope_${row.id}`), {
          id: `dictionary_scope_${row.id}`, action: 'dictionary.expression.retire', source: 'migration',
          target: { collection: 'dictionaryEntries', id: row.id }, outcome: 'success',
          metadata: { sourceSubmission: submissionId || null, preservedTraining: plan.preserveTraining }, createdAt: now,
        });
        return plan;
      });
      if (plan) { retired++; report(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', ...plan })); }
    }
    cursor = page.docs.at(-1);
  }
  return { mode: apply ? 'apply' : 'dry-run', expressionCopies: retired };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const projectId = process.argv[process.argv.indexOf('--project') + 1];
  if (process.argv.includes('--help') || !process.argv.includes('--project')) {
    console.log('Usage: node services/functions/scripts/retire-dictionary-expressions.mjs --project PROJECT_ID [--apply]');
    console.log('Defaults to dry-run. --apply soft-retires expression copies without deleting submissions or changing permission.');
  } else {
    if (!projectId || projectId.startsWith('--')) throw new Error('Provide a project ID.');
    initializeApp({ projectId });
    console.log(JSON.stringify(await retireDictionaryExpressions(getFirestore(), { apply: process.argv.includes('--apply') })));
  }
}
