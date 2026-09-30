const test=require('node:test'),assert=require('node:assert/strict');
const S=require('./comparison-state.cjs');
const {resolveReview}=require('./round-3-resolution.cjs');
function fixture(){
  const rows=[['kuri','bottom','25'],['tega','earth','25'],['bwoŋi','called','both'],['woli','added','25'],
    ['jaana','fly','25'],['ŋwe','live','38'],['yi','reached','both'],['su','full','both'],['fɔge','carefully','25'],
    ['memaŋa','signs','38'],['nabiina','humankind','both'],['laŋa','expanse','none'],['naane','created','none'],['beera','roam','none']];
  const manifest={batchId:'batch',sampleSha256:'sample',engines:{gemini38:{id:'38'},gemini25:{id:'25'}},entries:rows.map(([headword,meaning])=>({entryId:headword,headword,meaning,dialect:'Ghana Kasem',candidates:['38','25'].map(n=>({entryId:headword,candidateId:`gemini${n}:${headword}`,engine:`gemini${n}`,status:'pending_review',audioSha256:`${headword}${n}`}))}))};
  const state={reviews:{}};
  for(const [w,,approved]of rows)for(const n of ['38','25'])state.reviews[`gemini${n}:${w}`]={decision:approved===n||approved==='both'?'acceptable':'needs_recording',reviewedAt:'2026-09-27',notes:''};
  state.reviews['gemini25:beera'].decision='pending';
  state.reviews['gemini38:memaŋa'].notes='Uncertain other meaning. private@example.com';
  state.reviews['gemini38:laŋa'].notes='Final vowel tone; do not change spelling';
  return {manifest,review:S.report(state,manifest)};
}
test('tone-dependent meanings receive separate approved takes',()=>{
  const {manifest,review}=fixture(),p=resolveReview(manifest,review);
  for(const [w,a,b]of [['bwoŋi','called','call'],['yi','reach','eye'],['su','full','shake']]){
    const entries=p.entries.filter(e=>e.headword===w);assert.equal(entries.length,2);
    assert.equal(entries.find(e=>e.meaning===a).candidates[0].engine,'gemini38');
    assert.equal(entries.find(e=>e.meaning===b).candidates[0].engine,'gemini25');
  }
  for(const [w,wrong,right]of [['kuri','bottom','choose'],['tega','earth','dead'],['ŋwe','live','pay']]){
    assert.ok(!p.entries.some(e=>e.headword===w&&e.meaning===wrong));
    assert.equal(p.entries.find(e=>e.headword===w&&e.meaning===right).candidates.length,1);
  }
});
test('explicit reuse, text forms, corrected spelling and uncertainty remain distinct',()=>{
  const {manifest,review}=fixture(),p=resolveReview(manifest,review);
  const get=(w,m)=>p.entries.find(e=>e.headword===w&&e.meaning===m);
  assert.equal(get('woli','help').candidates[0].audioSha256,get('woli','added').candidates[0].audioSha256);
  assert.equal(get('yi','reach').patch.forms.past,'yia');assert.equal(get('yi','eye').patch.forms.plural,'yia');
  assert.equal(get('su','shake').patch.forms.past,'suga');
  assert.equal(get('fɔŋe','carefully').candidates.length,0);assert.equal(get('jaane','to fly / fly').candidates.length,0);
  assert.equal(get('fɔge','plaster').patch.kasemExample,'');
  assert.ok(!p.entries.some(e=>e.meaning==='proverbs'));assert.equal(p.queue.meaning,'proverbs');
  assert.ok(!JSON.stringify(p).includes('private@example.com'));
  assert.ok(!p.entries.some(e=>['laŋa','beera','naane'].includes(e.headword)));
});
test('missing approval, changed recording and unknown notes fail closed',()=>{
  let {manifest,review}=fixture();review.reviews.find(r=>r.candidateId==='gemini25:yi').decision='needs_recording';
  assert.throws(()=>resolveReview(manifest,review),/Required approval missing/);
  ({manifest,review}=fixture());review.reviews[0].audioSha256='changed';assert.throws(()=>resolveReview(manifest,review));
  ({manifest,review}=fixture());review.reviews.find(r=>r.candidateId==='gemini38:su').notes='Unresolved meaning';assert.throws(()=>resolveReview(manifest,review),/Unresolved note/);
});
