import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addReview, allowed, exampleQuality, migrateLegacy, parseExample, parseNote, parseReview, publicSentences, stableStringify } from '../../services/functions/lib/kasem-evidence.js';
import { blindEvaluation, buildDataset, DEFAULT_CONFIG, evidenceGroups, evaluateJudgments, heldOutEvidenceIds, unblindJudgments } from '../../services/functions/lib/kasem-dataset.js';
import { corpusRecordFrom, matchCorpus } from '../../services/functions/lib/kawuri-corpus.js';

const now = '2026-09-05T00:00:00.000Z';
const permissions = { review: true, sourceConfirmed: true, publication: true, providerRetrieval: true, modelTraining: true, evaluation: true };
const example = { kasem: 'fíxture token', english: 'The dog followed the cat.', dialect: 'synthetic', context: { situation: 'Synthetic test context.' } };
const judgment = { meaning: 'faithful', grammar: 'acceptable', naturalness: 'natural', contextFit: 'fits', explanation: '', annotationApproved: false };
function note(id = 'n', overrides = {}) { return parseNote({ examples: [example], permissions, ...overrides }, id, 'author', now); }
function review(n, uid, judgments = n.examples.map(() => judgment), preference = 'cannot-judge') {
  return parseReview({ revision: n.revision, dialectCompetent: true, judgments, preference }, n, uid, now);
}
function approved(n = note()) { n = addReview(n, review(n, 'r1')); return addReview(n, review(n, 'r2')); }
const config = { ...DEFAULT_CONFIG, releaseId: 'synthetic-v2', asOf: now, trainPercent: 100, validationPercent: 0 };

test('only supported claims with eligible current evidence enter grammar exports', () => {
  const n = approved();
  const claim = {id:'claim',version:1,title:'Synthetic claim',summary:'Synthetic scope only.',scope:'Test context.',dialect:'synthetic',status:'supported',evidenceRevisions:{n:1}};
  const release = buildDataset([n], config, [claim]);
  assert.equal(JSON.parse(release.files['train-grammar.jsonl']).claim.title, claim.title);
  assert.equal(release.manifest.claimLineage[0].claimId, claim.id);
  assert.equal(buildDataset([n], config, [{...claim,status:'disputed'}]).files['train-grammar.jsonl'], '');
  assert.equal(buildDataset([n], config, [{...claim,evidenceRevisions:{n:2}}]).files['train-grammar.jsonl'], '');
  n.permissions.modelTraining = false;
  assert.equal(buildDataset([n], config, [claim]).files['train-grammar.jsonl'], '');
});

test('held-out items retain all independently accepted natural variants', () => {
  const a = approved(note('a')), b = approved(note('b', {examples:[{...example,kasem:'alternate natural target'}]}));
  a.reservedSplit = 'test';
  const release = buildDataset([a,b], config);
  const item = JSON.parse(release.files['test-evaluation.jsonl']);
  assert.deepEqual(item.acceptedTargets, ['alternate natural target', 'fíxture token']);
});

test('blinded review hides model identity and only the private key restores it', () => {
  const prediction = { id: 'evaluation-one', variant: 'baseline', input: { english: 'Synthetic meaning.', dialect: 'synthetic', context: example.context }, response: 'Synthetic output.', construction: 'focus' };
  const result = blindEvaluation([prediction, { ...prediction, variant: 'candidate' }], 'private-seed');
  assert.equal(result.tasks.length, 2);
  assert.doesNotMatch(JSON.stringify(result.tasks), /baseline|candidate|evaluation-one/);
  const row = { taskId: result.tasks[0].taskId, reviewer: 'speaker', meaning: true, grammar: true, naturalness: false, contextFit: true, appropriateAbstention: true };
  const judgments = unblindJudgments([row], result.key);
  assert.equal(judgments[0].variant, result.key[0].variant);
  assert.equal(evaluateJudgments(judgments)[result.key[0].variant + '/all'].naturalness, 0);
  assert.throws(() => unblindJudgments([{ ...row, taskId: 'missing' }], result.key), /Unknown/);
  assert.throws(() => blindEvaluation([prediction, prediction], 'seed'), /Duplicate/);
});

test('later releases preserve training partitions and reject bridges into held-out groups', () => {
  const a = approved(note('a')), b = approved(note('b'));
  a.datasetSplit = 'train';
  const release = buildDataset([a, b], { ...config, trainPercent: 0, validationPercent: 0 });
  assert.equal(release.manifest.reservations[1].split, 'train');
  b.reservedSplit = 'test';
  assert.throws(() => buildDataset([a, b], config), /conflicting split/);
  assert.deepEqual([...heldOutEvidenceIds([a, b])].sort(), ['a', 'b']);
});

test('preference provenance survives translation deduplication', () => {
  const a = approved(note('a'));
  let b = note('b', { mode: 'comparison', examples: [example, { ...example, kasem: 'other candidate' }] });
  const judgments = [judgment, { ...judgment, naturalness: 'awkward', explanation: 'Synthetic rejected version.' }];
  b = addReview(b, review(b, 'r1', judgments, 'first'));
  b = addReview(b, review(b, 'r2', judgments, 'first'));
  const release = buildDataset([a, b], config);
  const pair = JSON.parse(release.files['train-preference.jsonl']);
  assert.equal(release.manifest.lineage.find(row => row.id === pair.id).noteId, 'b');
});

test('original orthography survives normalization and unknown annotations can span phrases', () => {
  const e = parseExample({ ...example, kasem: '  fi\u0301xture token  ', annotations: [{ start: 0, end: 2, kind: 'unknown', hypotheses: ['unresolved'] }] });
  assert.equal(e.originalKasem, '  fi\u0301xture token  '); assert.equal(e.kasem, 'fíxture token');
  assert.equal(e.annotations[0].end, 2); assert.equal(e.annotations[0].gloss, '');
  assert.throws(() => parseExample({ ...example, annotations: [{ start: 0, end: 3, kind: 'unknown' }] }), /spans/);
});
test('overlong records and arrays are rejected without truncation', () => {
  assert.throws(() => parseExample({ ...example, kasem: 'x'.repeat(241) }), /240/);
  assert.throws(() => note('n', { examples: Array(7).fill(example) }), /six/);
});
test('no permission is inferred from legacy approval', () => {
  const old = migrateLegacy('old', { ...example, confirmations: 50, status: 'confirmed' }, now);
  assert.equal(allowed(old, 'modelTraining', now), false); assert.equal(old.reviews.length, 0);
  assert.deepEqual(publicSentences(old, now), []);
});
test('self reviews, stale revisions and repeated reviewers cannot form consensus', () => {
  const n = note();
  assert.throws(() => review(n, 'author'), /contributor/);
  assert.throws(() => parseReview({ revision: 9 }, n, 'r', now), /changed/);
  const one = addReview(n, review(n, 'r1'));
  assert.equal(exampleQuality(one, 0).approved, false);
  assert.throws(() => addReview(one, review(one, 'r1')), /already/);
});
test('new revisions invalidate previous judgments', () => {
  const n = approved(); n.revision++;
  assert.equal(exampleQuality(n, 0).approved, false);
});
test('disagreement is retained and no approved sentence is inferred from it', () => {
  let n = note(); n = addReview(n, review(n, 'r1'));
  n = addReview(n, review(n, 'r2', [{ ...judgment, naturalness: 'awkward', explanation: 'The context needs another form.' }]));
  assert.equal(n.status, 'disputed'); assert.equal(exampleQuality(n, 0).approved, false);
});
test('public projection contains no reviewer, source, or consent identities', () => {
  const n = approved(); const [row] = publicSentences(n, now);
  for (const key of ['authorUid', 'reviewerId', 'reviews', 'permissions', 'source', 'originalKasem']) assert.equal(key in row, false);
  assert.equal(row.note, ''); assert.deepEqual(row.gloss, []);
});
test('withdrawn and expired grants immediately block every use', () => {
  const n = approved(); n.permissions.status = 'withdrawn';
  assert.deepEqual(publicSentences(n, now), []); assert.equal(allowed(n, 'providerRetrieval', now), false);
  n.permissions.status = 'active'; n.permissions.expiresAt = now;
  assert.equal(allowed(n, 'modelTraining', now), false);
});
test('unordered vocabulary never establishes exact translation equivalence', () => {
  const record = corpusRecordFrom('x', { ...example, context: undefined });
  assert.equal(matchCorpus([record], 'The cat followed the dog.')[0].exact, false);
  assert.equal(matchCorpus([record], 'The dog followed the cat.')[0].exact, true);
});
test('context-specific translations stay related until the context is supplied', () => {
  const record = corpusRecordFrom('x', example);
  assert.equal(matchCorpus([record], example.english)[0].exact, false);
  assert.equal(matchCorpus([record], example.english, 4, { preceding: example.context.situation })[0].exact, true);
  assert.deepEqual(matchCorpus([record], example.english, 4, { dialect: 'different' }), []);
});
test('connected source, paraphrase, correction and comparison groups cannot leak across splits', () => {
  const a = approved(note('a', { groups: ['source:one'] }));
  const b = approved(note('b', { groups: ['source:one'], examples: [{ ...example, kasem: 'other fixture', english: 'A wholly different example.' }] }));
  const c = approved(note('c', { examples: [{ ...example, kasem: 'third fixture', english: 'The cat followed the dog.' }] }));
  const groups = evidenceGroups([a, b, c]); assert.equal(new Set(groups.values()).size, 1);
  b.reservedSplit = 'test';
  const release = buildDataset([a, b, c], config);
  assert.equal(Object.values(release.manifest.assignments)[0], 'test'); assert.equal(release.files['train-translation.jsonl'], '');
});
test('unknown grammatical analysis does not exclude a reviewed translation target', () => {
  const n = approved(); n.examples[0].annotations = [{ start: 0, end: 1, kind: 'unknown', gloss: '', senseId: '', role: '', hypotheses: [] }];
  const release = buildDataset([n], config);
  assert.ok(release.files['train-translation.jsonl']); assert.equal(release.files['train-grammar.jsonl'], '');
});
test('awkward comparison candidates are only preference negatives, never positive targets', () => {
  let n = note('pair', { mode: 'comparison', examples: [example, { ...example, kasem: 'fixture awkward' }] });
  const js = [judgment, { ...judgment, naturalness: 'awkward', explanation: 'This is understandable but awkward.' }];
  n = addReview(n, review(n, 'r1', js, 'first')); n = addReview(n, review(n, 'r2', js, 'first'));
  const release = buildDataset([n], config);
  assert.ok(release.files['train-preference.jsonl'].includes('fixture awkward'));
  assert.equal(release.files['train-translation.jsonl'].includes('fixture awkward'), false);
});
test('release bytes and manifests are reproducible independent of snapshot order', () => {
  const a = approved(note('a')), b = approved(note('b'));
  assert.equal(stableStringify(buildDataset([a, b], config)), stableStringify(buildDataset([b, a], config)));
});
test('evaluation does not collapse naturalness into meaning', () => {
  const rows = [{ id: 'x', variant: 'baseline', reviewer: 'r', dialect: 'synthetic', construction: 'focus', meaning: true, grammar: true, naturalness: false, contextFit: false, appropriateAbstention: false }];
  const report = evaluateJudgments(rows)['baseline/all'];
  assert.equal(report.meaning, 1); assert.equal(report.naturalness, 0);
  assert.throws(() => evaluateJudgments([...rows, ...rows]), /Duplicate/);
});
