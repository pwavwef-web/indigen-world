import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {downloadPublicAudio} from './public-audio.mjs';
const root=resolve(import.meta.dirname,'../..'),folder=resolve(root,'exports/kasem-pronunciation-publication-round-4-2026-09-28');
const json=async p=>JSON.parse(await readFile(p,'utf8'));
const receipt=await json(resolve(folder,'publication-receipt.json'));
assert.equal(receipt.status,'committed');
const res=await fetch(`https://firestore.googleapis.com/v1/projects/${receipt.projectId}/databases/(default)/documents:runQuery`,{
  method:'POST',headers:{'Content-Type':'application/json',Connection:'close'},signal:AbortSignal.timeout(30000),
  body:JSON.stringify({structuredQuery:{from:[{collectionId:'dictionaryEntries'}],where:{fieldFilter:{field:{fieldPath:'isPublished'},op:'EQUAL',value:{booleanValue:true}}},limit:2000}})});
if(!res.ok)throw Error(`Public query ${res.status}`);
function decode(v){for(const k of ['stringValue','booleanValue','timestampValue'])if(k in v)return v[k];if('nullValue'in v)return null;if('integerValue'in v)return Number(v.integerValue);if('doubleValue'in v)return v.doubleValue;if('mapValue'in v)return Object.fromEntries(Object.entries(v.mapValue.fields||{}).map(([k,x])=>[k,decode(x)]));if('arrayValue'in v)return(v.arrayValue.values||[]).map(decode);throw Error('Unknown field');}
const rows=await res.json(),docs=new Map(rows.filter(r=>r.document).map(r=>[r.document.name.split('/').at(-1),Object.fromEntries(Object.entries(r.document.fields).map(([k,v])=>[k,decode(v)]))]));
assert.ok(docs.size<2000);
const before=await json(resolve(folder,'before.json')),after=await json(resolve(folder,'after.json'));
const evidence=[],publicAssets=new Map(),assigned=new Set();
for(const e of receipt.entries){
  if(e.withdraw){
    assert.ok(!docs.has(e.entryId),'Dian must be absent from published query');
    const saved=after.find(s=>s.path===`dictionaryEntries/${e.entryId}`).data;
    const old=before.find(s=>s.path===`dictionaryEntries/${e.entryId}`).data;
    assert.equal(saved.isPublished,false);assert.equal(saved.kasemText,'Dian');assert.equal(saved.englishText,'food');
    for(const [k,v]of Object.entries(old))if(!['isPublished','updatedAt','ownerReviewCorrection'].includes(k))assert.deepEqual(saved[k],v,`Withdrawn entry lost ${k}`);
    evidence.push({entryId:e.entryId,headword:e.headword,action:'unpublished_document_preserved'});continue;
  }
  const d=docs.get(e.entryId);assert.ok(d,e.entryId);assert.equal(d.isPublished,true);
  assert.equal(d.kasemText,e.headword);assert.equal(d.englishText,e.meaning);assert.equal(d.dialect,e.dialect);
  if(e.create){assert.equal(d.homographIndex,e.homographIndex);assert.deepEqual(d.translations,[e.headword]);assert.deepEqual(d.englishTranslations,[e.meaning]);assert.equal(d.partOfSpeech,'Verb');assert.equal(d.kasemExample,'');assert.equal(d.englishExample,'');assert.ok(d.source.includes('owner listening review'));}
  assert.equal(d.pronunciationAudioVariants.length,e.candidates.length);
  assert.equal(d.pronunciationAudioProvenance.releaseId,receipt.releaseId);assert.equal(d.pronunciationAudioProvenance.reviewedMeaning,e.meaning);
  assert.equal(d.audioUrl,d.pronunciationAudioVariants[0].audioUrl);assert.ok(d.attribution.includes('AI-generated with Google Gemini'));
  for(let i=0;i<e.candidates.length;i++){
    const c=e.candidates[i],v=d.pronunciationAudioVariants[i];assert.equal(v.candidateId,c.candidateId);
    assert.equal(v.audioSha256,c.audioSha256);assert.equal(v.reviewedHeadword,e.headword);assert.equal(v.reviewedMeaning,e.meaning);
    assert.equal(v.reviewSha256,receipt.reviewSha256);assert.equal(v.aiGenerated,true);assert.equal(v.isPrimary,i===0);
    assert.ok(!v.reviewNotes.includes('email emma'));publicAssets.set(v.audioUrl,v.audioSha256);
  }
  assigned.add(e.entryId);evidence.push({entryId:e.entryId,headword:e.headword,meaning:e.meaning,approvedTakes:e.candidates.length});
}
assert.equal(publicAssets.size,23);
const review=await json(resolve(folder,'review.json'));
for(const id of new Set(review.reviews.map(r=>r.entryId)))if(!assigned.has(id))assert.ok(!docs.get(id)?.audioUrl,`Unapproved source has audio: ${id}`);
for(const held of receipt.held)assert.ok(![...docs.values()].some(d=>(d.pronunciationAudioVariants||[]).some(v=>v.candidateId===held.candidateId)),'Fruit take was published');
let previousEntries=0;const previousHashes=new Set();
for(const name of ['kasem-pronunciation-publication-2026-09-27','kasem-pronunciation-publication-round-2-2026-09-27','kasem-pronunciation-publication-round-3-2026-09-27']){
  const p=await json(resolve(root,'exports',name,'publication-receipt.json'));
  const previousAfter=p.entries.some(e=>!e.audioUrl)?await json(resolve(root,'exports',name,'after.json')):null;
  for(const e of p.entries.filter(e=>e.candidates.length)){
    const d=docs.get(e.entryId),saved=previousAfter?previousAfter.find(s=>s.path===`dictionaryEntries/${e.entryId}`).data:e;
    assert.equal(d.audioUrl,saved.audioUrl);assert.deepEqual(d.pronunciationAudioVariants,saved.pronunciationAudioVariants);
    previousEntries++;for(const c of e.candidates)previousHashes.add(c.audioSha256);
  }
}
const samples=receipt.entries.filter(e=>e.headword==='gaale'||e.headword==='swɛ'||e.headword==='fɔŋe');
const plays=await Promise.allSettled(samples.map(async e=>{const url=docs.get(e.entryId).audioUrl;assert.equal(createHash('sha256').update(await downloadPublicAudio(url)).digest('hex'),publicAssets.get(url));}));
for(const r of plays)if(r.status==='rejected')throw r.reason;
const result={status:'passed',verifiedAt:new Date().toISOString(),publicEntries:docs.size,approvedDecisions:24,
  publishedRecordings:publicAssets.size,audioEntries:21,newEntries:1,withdrawnEntries:1,heldRecordings:receipt.held.length,
  previousEntriesPreserved:previousEntries,combinedAudioEntries:previousEntries+21,
  combinedUniqueApprovedRecordings:new Set([...previousHashes,...publicAssets.values()]).size,
  playbackSamples:samples.map(e=>({headword:e.headword,meaning:e.meaning})),entries:evidence};
await writeFile(resolve(folder,'public-verification.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify({...result,entries:undefined},null,2));
