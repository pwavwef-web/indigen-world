import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {downloadPublicAudio} from './public-audio.mjs';
const root=resolve(import.meta.dirname,'../..'),folder=resolve(root,'exports/kasem-pronunciation-publication-round-3-2026-09-27');
const json=async p=>JSON.parse(await readFile(p,'utf8'));
const receipt=await json(resolve(folder,'publication-receipt.json'));
const res=await fetch(`https://firestore.googleapis.com/v1/projects/${receipt.projectId}/databases/(default)/documents:runQuery`,{
  method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({structuredQuery:{from:[{collectionId:'dictionaryEntries'}],where:{fieldFilter:{field:{fieldPath:'isPublished'},op:'EQUAL',value:{booleanValue:true}}},limit:2000}})});
if(!res.ok)throw Error(`Public query: ${res.status}`);
function decode(v){for(const k of ['stringValue','booleanValue','timestampValue'])if(k in v)return v[k];if('nullValue'in v)return null;if('integerValue'in v)return Number(v.integerValue);if('doubleValue'in v)return v.doubleValue;if('mapValue'in v)return Object.fromEntries(Object.entries(v.mapValue.fields||{}).map(([k,x])=>[k,decode(x)]));if('arrayValue'in v)return(v.arrayValue.values||[]).map(decode);throw Error('Unknown field');}
const rows=await res.json();const docs=new Map(rows.filter(r=>r.document).map(r=>[r.document.name.split('/').at(-1),Object.fromEntries(Object.entries(r.document.fields).map(([k,v])=>[k,decode(v)]))]));
assert.ok(docs.size<2000);
const evidence=[],publicAssets=new Map();
for(const e of receipt.entries){
  const d=docs.get(e.entryId);assert.ok(d,e.entryId);assert.equal(d.kasemText,e.headword);assert.equal(d.englishText,e.meaning);assert.equal(d.dialect,e.dialect);
  if(e.create)assert.equal(d.homographIndex,e.homographIndex);
  for(const [k,v]of Object.entries(e.patch||{})){
    if(k==='senses')assert.deepEqual(d.senses||[],v);
    else if(k==='forms')for(const [slot,form]of Object.entries(v))assert.equal(d.forms?.[slot],form);
    else assert.equal(d[k]||'',v);
  }
  assert.equal((d.pronunciationAudioVariants||[]).length,e.candidates.length);
  if(e.candidates.length){
    assert.equal(d.pronunciationAudioProvenance.releaseId,receipt.releaseId);
    assert.equal(d.pronunciationAudioProvenance.reviewedMeaning,e.meaning);
    assert.equal(d.audioUrl,d.pronunciationAudioVariants[0].audioUrl);
    assert.ok(d.attribution.includes('AI-generated with Google Gemini'));
    for(let i=0;i<e.candidates.length;i++){
      const c=e.candidates[i],v=d.pronunciationAudioVariants[i];
      assert.equal(v.candidateId,c.candidateId);assert.equal(v.audioSha256,c.audioSha256);assert.equal(v.reviewedMeaning,e.meaning);
      assert.equal(v.aiGenerated,true);assert.equal(v.isPrimary,i===0);publicAssets.set(v.audioUrl,v.audioSha256);
    }
  }else assert.ok(!d.audioUrl);
  assert.ok(!JSON.stringify(d).includes('@gmail.com'));
  evidence.push({entryId:e.entryId,headword:e.headword,meaning:e.meaning,approvedTakes:e.candidates.length});
}
const review=await json(resolve(folder,'review.json'));
const assigned=new Set(receipt.entries.filter(e=>e.candidates.length).map(e=>e.entryId));
for(const id of new Set(review.reviews.map(r=>r.entryId)))if(!assigned.has(id))assert.ok(!docs.get(id)?.audioUrl,`Unapproved source has audio: ${id}`);
assert.ok(![...docs.values()].some(d=>d.kasemText==='memaŋa'&&/proverb/i.test(d.englishText)));
// The publisher already downloaded all 26 immutable files and checked their
// hashes. Recheck the two distinct yi takes after publication as playback samples.
const playbackSamples=receipt.entries.filter(e=>e.headword==='yi');
for(const e of playbackSamples){const url=docs.get(e.entryId).audioUrl;assert.equal(createHash('sha256').update(await downloadPublicAudio(url)).digest('hex'),publicAssets.get(url));}
let previousEntries=0,previousClips=0;
for(const name of ['kasem-pronunciation-publication-2026-09-27','kasem-pronunciation-publication-round-2-2026-09-27']){
  const p=await json(resolve(root,'exports',name,'publication-receipt.json'));
  for(const e of p.entries){const d=docs.get(e.entryId);assert.equal(d.audioUrl,e.audioUrl);assert.deepEqual(d.pronunciationAudioVariants,e.pronunciationAudioVariants);previousEntries++;previousClips+=e.candidates.length;}
}
const after=await json(resolve(folder,'after.json'));
const queue=after.find(s=>s.path===`submissions/${receipt.queueId}`).data;
const copy=after.find(s=>s.path===`collectionContributions/${receipt.queueId}`).data;
assert.equal(queue.status,'SUBMITTED');assert.equal(queue.authUid,receipt.queue.accountUid);assert.equal(queue.body,'memaŋa');assert.equal(queue.title,'proverbs');assert.equal(queue.permissions.publication,false);assert.equal(queue.moderation.reviewer,null);assert.equal(copy.status,'submitted');assert.equal(copy.authUid,queue.authUid);
const result={status:'passed',verifiedAt:new Date().toISOString(),publicEntries:docs.size,approvedRecordings:publicAssets.size,
  audioEntries:evidence.filter(e=>e.approvedTakes).length,newEntries:receipt.newEntries,previousEntriesPreserved:previousEntries,
  combinedAudioEntries:previousEntries+25,combinedUniqueApprovedRecordings:previousClips+publicAssets.size,
  publicPlaybackSamples:playbackSamples.map(e=>({headword:e.headword,meaning:e.meaning})),
  queue:{id:receipt.queueId,status:queue.status,accountName:receipt.queue.accountName,publicationPermission:false},entries:evidence};
await writeFile(resolve(folder,'public-verification.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify({...result,entries:undefined},null,2));
