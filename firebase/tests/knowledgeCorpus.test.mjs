import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AUTHENTICATION_LABELS, DESTINATIONS, REVIEW_CHECKS, knowledgeState, submissionIssues } from '@indigen-world/contracts/knowledge';
import { KNOWLEDGE_CATALOG, applyKnowledgeReview, parseKnowledgeInput, parseKnowledgeReview } from '../../services/functions/lib/knowledge-records.js';
import { CLOSED_POLICY, authenticationFor, hasKnowledgeGrant, knowledgeProjection, policyFrom, releaseDenials } from '../../services/functions/lib/knowledge-policy.js';
import { supportedAudioHeader } from '../../services/functions/lib/knowledge-media.js';
import { rankKnowledge } from '../../services/functions/lib/knowledge-retrieval.js';
import { auditKnowledgeMigration } from '../../scripts/audit-knowledge-migration.mjs';

export const policy = { version: 'test-reviewed-policy', approved: true, approvedCategories: KNOWLEDGE_CATALOG.map(c => c.id), sentenceEnabled: true, sentencePrefix: 'KSM-TST', sentenceSchemaVersion: 'synthetic-test-only', reviewerQuorum: 2, requiredChecks: [...REVIEW_CHECKS], destinations: [...DESTINATIONS] };
export const grant = { active: true, policyVersion: policy.version, categories: policy.approvedCategories, scopes: ['language', 'culture', 'curation', 'release'], expiresAt: '2099-01-01T00:00:00Z', qualificationReference: 'test-qualification' };
export const input = (datasetType = 'expressions') => ({ datasetType, language: 'xsm', title: 'Synthetic test record', original: 'TEST ONLY ɛ ɔ ŋ', english: '', french: '', context: '', region: '', source: 'Synthetic source', sourceType: 'other', sourceReference: 'test-fixture:1', details: datasetType === 'qa' ? { question: 'Unknown test term?', answer: 'Verification is unavailable.' } : {}, variants: [], relatedRecordIds: [], audio: [],
  permissions: { review: true, sourceConfirmed: true, publication: true, providerRetrieval: true, modelTraining: true, evaluation: true, audio: false, licence: 'Synthetic test fixture only', culturalAccess: 'open' },
  rights: { state: 'documented', holder: 'fixture-owner', evidence: 'private-evidence-reference', version: 'test-consent-v1', publicAttribution: 'Synthetic test fixture', restrictions: '', expiresAt: '', preservation: true, derivedMedia: false, speechSynthesis: false }, valueStates: { english: 'not_yet_translated', french: 'no_direct_equivalent', region: 'unknown', context: 'not_applicable' }, structured: {}, relations: [], requestContext: '', split: 'unassigned', sourceFamily: '' });
export const record = (patch = {}) => ({ ...parseKnowledgeInput(input(), 'owner', true), id: 'KSM-expressions-123456789012', displayId: 'KSM-EXP-000001', schemaVersion: 2, revision: 1, authorUid: 'owner', createdAt: '2026-10-02T00:00:00Z', updatedAt: '2026-10-02T00:00:00Z', verifiedAt: '2026-10-02T00:00:00Z', status: 'gold', workflow: 'review_complete', authentication: 'gold', authenticationPolicy: policy.version, disputed: false, blockingIssues: [], approvalCount: 2, reviewCount: 2, warnings: [], ...patch });
export const review = (uid = 'reviewer-a', scope = 'language') => ({ reviewerUid: uid, revision: 1, decision: 'approve', scope, policyVersion: policy.version, qualificationReference: grant.qualificationReference, checklist: Object.fromEntries(REVIEW_CHECKS.map(c => [c, true])), languageCompetent: true, culturalCompetent: true, note: 'Synthetic evidence checked within the assigned scope.', createdAt: '2026-10-02T00:00:00Z' });

test('all ten category drafts preserve original Kasem and explicit unknown states', () => {
  assert.equal(KNOWLEDGE_CATALOG.length, 10);
  for (const category of KNOWLEDGE_CATALOG) {
    const parsed = parseKnowledgeInput(input(category.id), 'owner', false);
    assert.equal(parsed.original, 'TEST ONLY ɛ ɔ ŋ');
    assert.equal(parsed.french, '');
    assert.equal(parsed.valueStates.french, 'no_direct_equivalent');
    assert.equal(parsed.datasetType, category.id);
  }
});
test('submission minimum does not force French, morphology, translations or invented regions', () => {
  assert.doesNotThrow(() => parseKnowledgeInput(input('lexicon'), 'owner', true));
  assert.deepEqual(submissionIssues(input('qa')), []);
  assert.match(submissionIssues(input('sentences'))[0].message, /provisional/);
  assert.equal(submissionIssues(input('sentences'), { sentenceEnabled: true }).length, 0);
  const unresolved = input(); unresolved.rights.state = 'unresolved'; unresolved.permissions.sourceConfirmed = false;
  assert.doesNotThrow(() => parseKnowledgeInput(unresolved, 'owner', true));
  assert.ok(releaseDenials(record(unresolved), 'kawuri', policy).length);
});
test('server rejects privilege injection and unsupported category fields', () => {
  for (const protectedField of ['authentication', 'workflow', 'verifiedAt', 'authorUid', 'schemaVersion', 'reviewerUid', 'status', 'isPublished']) assert.throws(() => parseKnowledgeInput({ ...input(), [protectedField]: 'gold' }, 'owner', false), /protected/);
  assert.throws(() => parseKnowledgeInput({ ...input(), details: { gender: 'invented-field' } }, 'owner', false), /fields belonging/);
  assert.throws(() => parseKnowledgeInput({ ...input(), permissions: { ...input().permissions, gold: true } }, 'owner', false), /Unknown permission/);
});
test('structured turns retain order and distinct meanings without word extraction', () => {
  const r = input('dialogue'); r.structured.dialogueTurns = ['speaker-a', 'speaker-b'].map((speakerId, index) => ({ id: `turn-${index}`, original: `Synthetic turn ${index}`, english: '', french: '', speakerId, context: 'test', translator: '', translationState: 'not_yet_translated' }));
  const parsed = parseKnowledgeInput(r, 'owner', true);
  assert.deepEqual(parsed.structured.dialogueTurns.map(t => t.speakerId), ['speaker-a', 'speaker-b']);
  assert.equal(parsed.datasetType, 'dialogue');
  const p = knowledgeProjection(record({ ...parsed }), 'venacula');
  assert.equal(p.category, 'dialogue');
  assert.equal('authorUid' in p, false); assert.equal('rights' in p, false); assert.equal('audio' in p, false);
});
test('legacy Gold and two unqualified votes cannot authenticate a revision', () => {
  assert.equal(knowledgeState({ status: 'gold' }).authentication, 'community');
  assert.equal(AUTHENTICATION_LABELS.rejected_outdated, 'Rejected / outdated');
  assert.notEqual(applyKnowledgeReview(record({ status: 'submitted', approvalCount: 1 }), review()).authentication, 'gold');
  assert.equal(authenticationFor(record(), [review(), review('reviewer-b')], CLOSED_POLICY), 'reviewed');
  assert.ok(releaseDenials(record({ schemaVersion: 1 }), 'kawuri', policy).length);
});
test('authentication requires exact revision, distinct reviewers, scope and current policy', () => {
  assert.equal(authenticationFor(record(), [review(), review()], policy), 'reviewed');
  assert.equal(authenticationFor(record(), [review(), review('reviewer-b')], policy), 'gold');
  assert.equal(authenticationFor(record(), [review(), { ...review('reviewer-b'), revision: 2 }], policy), 'reviewed');
  assert.equal(authenticationFor(record({ datasetType: 'culture' }), [review(), review('reviewer-b')], policy), 'reviewed');
  assert.equal(authenticationFor(record({ datasetType: 'culture' }), [review(), review('reviewer-b'), review('reviewer-a', 'culture'), review('reviewer-b', 'culture')], policy), 'gold');
  assert.equal(authenticationFor(record({ disputed: true }), [review(), review('reviewer-b')], policy), 'reviewed');
  assert.equal(hasKnowledgeGrant({ role: 'admin' }, policy, 'lexicon', 'language'), false);
  assert.equal(hasKnowledgeGrant({ ...grant, expiresAt: '2000-01-01' }, policy, 'lexicon', 'language'), false);
  assert.equal(hasKnowledgeGrant(grant, policy, 'lexicon', 'language'), true);
  assert.equal(policyFrom({ ...policy, requiredChecks: [] }).approved, false);
});
test('self-authentication, empty rationale and unchecked approval are rejected', () => {
  assert.throws(() => parseKnowledgeReview(review('owner'), record(), 'owner', 'now'), /independent/);
  assert.throws(() => parseKnowledgeReview({ ...review(), note: '' }, record(), 'reviewer-a', 'now'), /explanation/);
  assert.throws(() => parseKnowledgeReview({ ...review(), checklist: {} }, record(), 'reviewer-a', 'now'), /checklist/);
});
test('rights, destination, disputes, held-out split and scope gate all projections', () => {
  assert.deepEqual(releaseDenials(record(), 'kawuri', policy), []);
  for (const patch of [{ authentication: 'community' }, { authentication: 'reviewed' }, { status: 'withdrawn', workflow: 'withdrawn' }, { disputed: true }, { blockingIssues: ['unresolved'] }, { verifiedAt: null }, { authenticationPolicy: 'old-policy' }]) assert.ok(releaseDenials(record(patch), 'kawuri', policy).length);
  for (const patch of [{ state: 'withdrawn' }, { expiresAt: '2000-01-01' }, { restrictions: 'Community only' }, { evidence: '' }]) assert.ok(releaseDenials(record({ rights: { ...input().rights, ...patch } }), 'kawuri', policy).length);
  assert.ok(releaseDenials(record({ split: 'evaluation' }), 'kawuri', policy).length);
  assert.ok(releaseDenials(record(), 'training', policy).length);
  assert.deepEqual(releaseDenials(record({ split: 'train', sourceFamily: 'fixture-family' }), 'training', policy), []);
  const phrase = knowledgeProjection(record(), 'venacula'); assert.equal(phrase.category, 'expressions');
});

test('audio container checks reject renamed text and preserve original format boundaries', () => {
  assert.equal(supportedAudioHeader(Buffer.from('RIFF0000WAVEfmt '), 'audio/wav'), true);
  assert.equal(supportedAudioHeader(Buffer.from('OggS0000'), 'audio/ogg'), true);
  assert.equal(supportedAudioHeader(Buffer.from('ID3test'), 'audio/mpeg'), true);
  assert.equal(supportedAudioHeader(Buffer.from('not an audio recording'), 'audio/mpeg'), false);
  assert.equal(supportedAudioHeader(Buffer.from('RIFF0000WAVEfmt '), 'audio/ogg'), false);
});
test('retrieval ranks scoped source evidence and unknown queries have no fabricated match', () => {
  const projection = knowledgeProjection(record({ english: 'A synthetic harvest expression', title: 'Harvest example' }), 'kawuri');
  assert.equal(rankKnowledge([projection], 'Explain the harvest expression')[0].record.recordId, projection.recordId);
  assert.equal(rankKnowledge([projection], 'Unknown polar submarine word').length, 0);
  assert.equal(rankKnowledge([projection], 'Explain the harvest expression')[0].exact, false);
});
test('migration accounts for each original and quarantines legacy authority without mutation', () => {
  const rows = [record({ schemaVersion: 1 }), record({ id: 'KSM-sentences-123456789012', datasetType: 'sentences', schemaVersion: 1, status: 'withdrawn' })];
  const before = JSON.stringify(rows), audit = auditKnowledgeMigration(rows);
  assert.equal(audit.inputCount, audit.accountedCount); assert.equal(audit.quarantineCount, 2);
  assert.equal(audit.releaseAction, 'none'); assert.equal(JSON.stringify(rows), before);
  assert.throws(() => auditKnowledgeMigration([rows[0], rows[0]]), /Duplicate source ID/);
});
