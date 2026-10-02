import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { after, test } from 'node:test';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { retireDictionaryExpressions } from '../../services/functions/scripts/retire-dictionary-expressions.mjs';

if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Run against the Firestore emulator only.');
const app = initializeApp({ projectId: 'demo-indigen-world' }, 'dictionary-scope-test');
const db = getFirestore(app);
after(() => deleteApp(app));

test('cleanup is dry-run by default, repeatable, and leaves permitted training expressions exportable', async () => {
  const source = { collectionKind: 'dictionary', lexicalKind: 'phrase', status: 'PUBLISHED',
    authUid: 'scope-speaker', contributorPortal: { contributorId: 'scope-speaker', work: 'scope', item: 'item' },
    title: 'A complete English expression.', body: '[Sample Kasem expression], with a pause / intact',
    alternativeExpressions: ['[Sample complete alternative]'], usageContext: 'Said to family.',
    permissions: { aiTraining: true, publication: true, consentVersion: 'contributor-expression-v1' },
    moderation: { decidedAt: '2026-10-02T00:00:00Z' } };
  await db.doc('submissions/scope-expression').set(source);
  await db.doc('dictionaryEntries/collection_scope-expression').set({ isPublished: true, sourceContribution: { collection: 'collectionContributions', id: 'scope-expression' } });
  await db.doc('dictionaryEntries/scope-word').set({ isPublished: true, lexicalKind: 'word', kasemText: 'Na', kasemExample: 'A complete sentence.' });
  await db.doc('dictionaryEntries/scope-no-consent').set({ isPublished: true, contentKind: 'expression', sourceContribution: { collection: 'collectionContributions', id: 'scope-no-consent' } });
  await db.doc('submissions/scope-no-consent').set({ ...source, permissions: { ...source.permissions, aiTraining: false } });
  // A stale materialized pair must still be rejected by the exporter.
  await db.doc('contributorTrainingPairs/scope-no-consent').set({ sourceSubmission: 'scope-no-consent' });
  const report = [];
  const dry = await retireDictionaryExpressions(db, { report: row => report.push(row) });
  assert.equal(dry.expressionCopies, 2);
  assert.equal((await db.doc('dictionaryEntries/collection_scope-expression').get()).get('isPublished'), true);
  assert.equal((await db.doc('contributorTrainingPairs/scope-expression').get()).exists, false);
  const applied = await retireDictionaryExpressions(db, { apply: true, report: () => {} });
  assert.equal(applied.expressionCopies, 2);
  assert.equal((await db.doc('dictionaryEntries/collection_scope-expression').get()).get('isPublished'), false);
  assert.equal((await db.doc('dictionaryEntries/scope-word').get()).get('isPublished'), true);
  assert.deepEqual((await db.doc('submissions/scope-expression').get()).data(), source);
  assert.equal((await retireDictionaryExpressions(db, { apply: true })).expressionCopies, 0);
  const exported = () => execFileSync(process.execPath, ['services/functions/scripts/export-contributor-training.mjs', '--project', 'demo-indigen-world'], { encoding: 'utf8', timeout: 30000 }).trim().split('\n').filter(Boolean).map(JSON.parse);
  const rows = exported();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].sourceSubmission, 'scope-expression');
  assert.equal(rows[0].kasem, source.body);
  assert.equal(rows[0].context, source.usageContext);
  await db.doc('submissions/scope-expression').update({ status: 'WITHDRAWN' });
  assert.deepEqual(exported(), [], 'stale pairs cannot bypass withdrawal');
});
