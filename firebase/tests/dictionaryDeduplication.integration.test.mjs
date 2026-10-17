import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { planDuplicates, applyDuplicatePlan } from '../../services/functions/scripts/deduplicate-dictionary.mjs';

test('Firestore cleanup preserves data and audit history, supports retries, and leaves other meanings intact',
  { skip: !process.env.FIRESTORE_EMULATOR_HOST }, async () => {
    const projectId = 'demo-dictionary-dedupe';
    initializeApp({ projectId });
    const db = getFirestore();
    try {
      const common = { kasemText: 'bakeira', englishText: 'boy', isPublished: true };
      const fixtures = [
        ['old', { ...common, createdAt: '2020-01-01', contributorId: 'first', homographIndex: 1,
          sourceRefs: ['Original source'], kasemExample: 'Original Kasem', englishExample: 'Original English' }],
        ['new', { ...common, createdAt: '2021-01-01', contributorId: 'second', homographIndex: 2,
          sourceRefs: ['Second source'], kasemExample: 'Second Kasem', englishExample: 'Second English' }],
        ['third', { ...common, createdAt: '2022-01-01', sourceRefs: ['Third source'] }],
        ['meaning', { ...common, englishText: 'bottle', homographIndex: 3 }],
        ['draft-a', { kasemText: 'draftword', englishText: 'draft', isPublished: false }],
        ['draft-b', { kasemText: 'draftword', englishText: 'draft', isPublished: false }],
      ];
      const batch = db.batch();
      for (const [id, data] of fixtures) batch.set(db.doc(`dictionaryEntries/${id}`), data);
      await batch.commit();
      const snapshot = await db.collection('dictionaryEntries').get();
      const plan = planDuplicates(snapshot.docs.map(doc => ({ id: doc.id, data: doc.data() })));
      const result = await applyDuplicatePlan(db, plan);
      assert.equal(result.length, 3);
      const target = (await db.doc('dictionaryEntries/old').get()).data();
      assert.equal(target.contributorId, 'first');
      assert.equal(target.homographIndex, 1);
      assert.deepEqual(target.sourceRefs, ['Original source', 'Second source', 'Third source']);
      assert.equal(target.senses[0].examples.length, 2);
      assert.equal(target.mergedFrom.length, 2);
      const retired = (await db.doc('dictionaryEntries/new').get()).data();
      assert.equal(retired.contributorId, 'second');
      assert.equal(retired.isPublished, false);
      assert.deepEqual(retired.mergedInto, { collection: 'dictionaryEntries', id: 'old' });
      assert.deepEqual((await db.doc('dictionaryEntries/meaning').get()).data(), fixtures[3][1]);
      const audits = await db.collection('auditLogs').get();
      assert.equal(audits.size, 3);
      const firstAudit = audits.docs.find(doc => doc.get('metadata.sourceId') === 'new').data();
      assert.deepEqual(firstAudit.before.source, fixtures[1][1]);
      const retry = await applyDuplicatePlan(db, plan);
      assert.ok(retry.every(item => item.alreadyMerged));
      assert.equal((await db.collection('auditLogs').get()).size, 3);
      const after = await db.collection('dictionaryEntries').get();
      assert.deepEqual(planDuplicates(after.docs.map(doc => ({ id: doc.id, data: doc.data() }))), []);
      assert.equal(after.docs.filter(doc => doc.get('isPublished') === true).length, 2);
      assert.equal((await db.doc('dictionaryEntries/draft-a').get()).get('isPublished'), false);
    } finally {
      await db.terminate();
    }
  });
