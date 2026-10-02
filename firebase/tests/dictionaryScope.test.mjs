import assert from 'node:assert/strict';
import { test } from 'node:test';
import { expressionCopyPlan } from '../../services/functions/scripts/retire-dictionary-expressions.mjs';

test('only explicit expression copies are retired, never inferred from spaces or example sentences', () => {
  for (const fields of [{ contentKind: 'expression' }, { collectionKind: 'expressions' },
    { lexicalKind: 'phrase' }, { lexicalKind: 'idiom' }, { lexicalKind: 'proverb' }]) {
    assert.ok(expressionCopyPlan('copy', { isPublished: true, ...fields }));
    assert.equal(expressionCopyPlan('copy', { isPublished: false, ...fields }), null);
  }
  assert.equal(expressionCopyPlan('word', { isPublished: true, kasemText: 'compound word', kasemExample: 'A sentence.' }), null);
  assert.equal(expressionCopyPlan('word', { isPublished: true, lexicalKind: 'word' }), null);
});

test('source lineage identifies old expressions without rewriting original training permissions', () => {
  const source = { collectionKind: 'dictionary', lexicalKind: 'phrase', status: 'PUBLISHED',
    authUid: 'speaker', contributorPortal: { contributorId: 'speaker' },
    permissions: { aiTraining: true, publication: true } };
  const plan = expressionCopyPlan('old', { isPublished: true }, source);
  assert.equal(plan.preserveTraining, true);
  for (const overrides of [{ status: 'WITHDRAWN' }, { status: 'SUBMITTED' },
    { permissions: { aiTraining: false, publication: true } },
    { permissions: { aiTraining: true, publication: false } }, { authUid: 'someone-else' }]) {
    assert.equal(expressionCopyPlan('old', { isPublished: true }, { ...source, ...overrides }).preserveTraining, false);
  }
  assert.equal(source.permissions.aiTraining, true);
});
