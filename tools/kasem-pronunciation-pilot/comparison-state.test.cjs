const test = require('node:test');
const assert = require('node:assert/strict');
const state = require('./comparison-state.cjs');
const manifest = {batchId: 'trial-1', sampleSha256: 'sample', engines: {gemini38: {id: 'model'}}, entries: [
  {entryId: 'entry', headword: 'dɛ', meaning: 'take', dialect: 'Ghana Kasem', candidates: [
    {candidateId: 'gemini38:entry', entryId: 'entry', engine: 'gemini38', audioSha256: 'take-one', audioFile: 'audio/one.wav', status: 'pending_review'},
    {candidateId: 'mms:entry', entryId: 'entry', engine: 'mms', audioSha256: 'baseline', status: 'baseline_only'},
    {candidateId: 'failed:entry', entryId: 'entry', engine: 'failed', status: 'generation_failed'},
  ]},
]};
const initial = () => ({reviewer: 'Test speaker', variety: 'Navrongo', reviews: {}});
const accepted = () => ({...initial(), reviews: {'gemini38:entry': {decision: 'acceptable', notes: 'Sense checked', reviewedAt: '2026-09-27'}}});
test('fresh comparison has no inherited approval from the baseline and no failed takes to review', () => {
  const report = state.report(initial(), manifest);
  assert.equal(report.reviews.length, 1);
  assert.equal(report.summary.acceptable, 0);
  assert.equal(report.summary.pending, 1);
  assert.equal(report.published, false);
  assert.equal(report.submittedForReview, false);
});
test('saved reviews round-trip without trusting imported source text or model fields', () => {
  const report = state.report(accepted(), manifest);
  report.reviews[0].meaning = 'tampered meaning';
  report.reviews[0].model = 'another model';
  const rebuilt = state.report(state.clean(report, manifest), manifest);
  assert.equal(rebuilt.reviews[0].meaning, 'take');
  assert.equal(rebuilt.reviews[0].model, 'model');
  assert.equal(rebuilt.summary.acceptable, 1);
});
test('rejects a different batch, entry, recording, duplicate or invalid decision', () => {
  for (const mutate of [
    r => r.batchId = 'different', r => r.sampleSha256 = 'different',
    r => r.reviews[0].entryId = 'different', r => r.reviews[0].audioSha256 = 'new-take',
    r => r.reviews[0].candidateId = 'mms:entry', r => r.reviews.push(r.reviews[0]),
    r => r.reviews[0].decision = 'published',
  ]) {
    const report = state.report(accepted(), manifest); mutate(report);
    assert.throws(() => state.clean(report, manifest));
  }
});
test('shortlist requires a speaker, variety and acceptable exact recording, without submitting', () => {
  assert.throws(() => state.shortlist(initial(), manifest));
  assert.throws(() => state.shortlist({...accepted(), reviewer: ''}, manifest));
  assert.throws(() => state.shortlist({...accepted(), variety: ''}, manifest));
  const shortlist = state.shortlist(accepted(), manifest);
  assert.equal(shortlist.shortlistedCount, 1);
  assert.equal(shortlist.reviews[0].audioSha256, 'take-one');
  assert.equal(shortlist.status, 'not_submitted');
  assert.equal(shortlist.published, false);
});
