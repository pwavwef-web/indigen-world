const test = require('node:test');
const assert = require('node:assert/strict');
const {approvedPlan, assertCurrent, attributionWithAudioNotice} = require('./publish-policy.cjs');
const S = require('./comparison-state.cjs');
const manifest = {batchId:'batch',sampleSha256:'sample',engines:{gemini38:{id:'3.8'},gemini25:{id:'2.5'}},entries:[
  {entryId:'word',headword:'Vei',meaning:'go',dialect:'Ghana',candidates:[
    {candidateId:'gemini25:word',entryId:'word',engine:'gemini25',status:'pending_review',audioSha256:'25',audioFile:'25.wav'},
    {candidateId:'gemini38:word',entryId:'word',engine:'gemini38',status:'pending_review',audioSha256:'38',audioFile:'38.wav'},
  ]},
]};
function review(decisions) {
  const state={reviewer:'',variety:'',reviews:{}};
  for (const [engine,decision] of Object.entries(decisions)) state.reviews[`${engine}:word`]={decision,notes:'',reviewedAt:'2026-09-27'};
  return S.report(state,manifest);
}
test('publishes only acceptable clips, never pending or rejected clips',()=>{
  for(const other of ['pending','needs_recording','unsure']) {
    const plan=approvedPlan(manifest,review({gemini38:'acceptable',gemini25:other}));
    assert.equal(plan.approvedClips,1);assert.equal(plan.entries[0].candidates[0].engine,'gemini38');
  }
});
test('both approvals keep one primary and the other alternate, independent of source ordering',()=>{
  const plan=approvedPlan(manifest,review({gemini38:'acceptable',gemini25:'acceptable'}));
  assert.equal(plan.entries.length,1);assert.equal(plan.approvedClips,2);
  assert.deepEqual(plan.entries[0].candidates.map(c=>c.engine),['gemini38','gemini25']);
});
test('refuses incomplete review and changed approval identity',()=>{
  const r=review({gemini38:'acceptable'});r.reviews.pop();assert.throws(()=>approvedPlan(manifest,r));
  const changed=review({gemini38:'acceptable'});changed.reviews[1].audioSha256='other';assert.throws(()=>approvedPlan(manifest,changed));
});
test('current dictionary guards reject stale text, unpublished/merged entries and any existing audio',()=>{
  const entry=approvedPlan(manifest,review({gemini38:'acceptable'})).entries[0];
  const data={isPublished:true,kasemText:'Vei',englishText:'go',dialect:'Ghana'};
  assert.equal(assertCurrent(entry,data,'release'),'attach');
  for(const change of [{kasemText:'Véi'},{englishText:'command'},{dialect:'Burkina'},{isPublished:false},
    {mergedIntoId:'another'},{audioUrl:'human.wav'},{pronunciationAudioUrl:'other.wav'},
    {pronunciationAudioVariants:[{audioUrl:'human.wav'}]}]) assert.throws(()=>assertCurrent(entry,{...data,...change},'release'));
});
test('idempotence requires exact main and alternate hashes and matching published URL',()=>{
  const entry=approvedPlan(manifest,review({gemini38:'acceptable',gemini25:'acceptable'})).entries[0];
  const data={isPublished:true,kasemText:'Vei',englishText:'go',dialect:'Ghana',audioUrl:'38.wav',
    pronunciationAudioProvenance:{releaseId:'release',audioSha256:'38'},
    pronunciationAudioVariants:[{audioSha256:'38',audioUrl:'38.wav',isPrimary:true},{audioSha256:'25',audioUrl:'25.wav',isPrimary:false}]};
  assert.equal(assertCurrent(entry,data,'release'),'already_published');
  assert.throws(()=>assertCurrent(entry,{...data,audioUrl:'replaced.wav'},'release'));
});
test('audio attribution preserves existing visible source or contributor fallback',()=>{
  for (const data of [{attribution:'Original source'}, {source:'Original source'},
    {source:{id:'internal'},contributorName:'Original source'}]) {
    assert.ok(attributionWithAudioNotice(data,'Chinedum').startsWith('Original source\n\n'));
  }
  assert.ok(!attributionWithAudioNotice({source:{id:'internal'}},'Chinedum').includes('[object Object]'));
});
