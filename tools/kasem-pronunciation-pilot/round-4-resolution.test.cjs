const test=require('node:test'),assert=require('node:assert/strict');
const S=require('./comparison-state.cjs');
const {resolveReview}=require('./round-4-resolution.cjs');
const words=['swɛ','gaale','kam','yerebereno',...Array.from({length:16},(_,i)=>`other${i}`),'Nae','Dian'];
const meanings={'swɛ':'bathed',gaale:'exceeds',kam:'the / determiner',yerebereno:'determiner / article',Nae:'see',Dian:'food'};
const manifest={batchId:'fixture',sampleSha256:'fixture',engines:{gemini38:{id:'38'},gemini25:{id:'25'}},
  entries:words.map(headword=>({entryId:headword,headword,meaning:meanings[headword]||headword,dialect:'Ghana Kasem',
    candidates:['gemini38','gemini25'].map(engine=>({entryId:headword,candidateId:`${engine}:${headword}`,engine,status:'pending_review',audioSha256:`${headword}-${engine}`}))}))};
const state={reviewer:'',variety:'',reviews:{}};
for(const word of words)for(const engine of ['gemini38','gemini25'])state.reviews[`${engine}:${word}`]={
  decision:word==='Dian'||word==='Nae'&&engine==='gemini25'?'pending':word==='Nae'||word.startsWith('other')&&engine==='gemini25'?'needs_recording':'acceptable',
  reviewedAt:'2026-09-28T15:40:00Z',notes:''};
Object.assign(state.reviews['gemini25:swɛ'],{notes:'but this is a kinda fruit, email emma for the english name of it.'});
Object.assign(state.reviews['gemini38:gaale'],{notes:"right when you mean 'skip'"});
Object.assign(state.reviews['gemini25:gaale'],{notes:'right for exceed'});
Object.assign(state.reviews['gemini25:Nae'],{notes:'a is too prolonged'});
Object.assign(state.reviews['gemini38:Dian'],{notes:'remove this word\n'});
const review=S.report(state,manifest);
test('gaale meanings are distinct; swɛ fruit cannot become a bathed alternate',()=>{
  const p=resolveReview(manifest,review),get=(word,meaning)=>p.entries.find(e=>e.headword===word&&e.meaning===meaning);
  assert.equal(get('gaale','skip').create,true);assert.equal(get('gaale','skip').candidates[0].engine,'gemini38');
  assert.equal(get('gaale','exceeds').create,false);assert.equal(get('gaale','exceeds').candidates[0].engine,'gemini25');
  assert.equal(get('swɛ','bathed').candidates.length,1);assert.equal(get('swɛ','bathed').candidates[0].engine,'gemini38');
  assert.equal(p.held.length,1);assert.equal(p.held[0].engine,'gemini25');
  assert.ok(!p.entries.some(e=>e.candidates.some(c=>c.candidateId===p.held[0].candidateId)));
  for(const word of ['kam','yerebereno'])assert.deepEqual(p.entries.find(e=>e.headword===word).candidates.map(c=>c.engine),['gemini38','gemini25']);
});
test('withdrawal is reversible and every assigned recording is approved',()=>{
  const p=resolveReview(manifest,review),d=p.entries.find(e=>e.headword==='Dian');
  assert.equal(d.withdraw,true);assert.deepEqual(d.patch,{isPublished:false});assert.equal(d.candidates.length,0);
  const approved=new Set(review.reviews.filter(r=>r.decision==='acceptable').map(r=>r.candidateId));
  for(const e of p.entries)for(const c of e.candidates){assert.ok(approved.has(c.candidateId));assert.ok(!c.reviewNotes.includes('email emma'));}
  assert.equal(p.approvedClips,23);assert.equal(p.audioEntries,21);assert.ok(!p.entries.some(e=>e.headword==='Nae'));
});
test('missing decisions, changed audio and changed notes fail closed',()=>{
  let r=structuredClone(review);r.reviews.pop();assert.throws(()=>resolveReview(manifest,r),/Complete review/);
  r=structuredClone(review);r.reviews[0].audioSha256='changed';assert.throws(()=>resolveReview(manifest,r));
  r=structuredClone(review);r.reviews.find(x=>x.headword==='gaale'&&x.engine==='gemini38').decision='needs_recording';assert.throws(()=>resolveReview(manifest,r),/Resolution note changed/);
  r=structuredClone(review);r.reviews.find(x=>x.headword==='Nae'&&x.engine==='gemini25').notes='different';assert.throws(()=>resolveReview(manifest,r),/Resolution note changed/);
});
