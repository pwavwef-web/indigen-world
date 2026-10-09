/** Verify the released dictionary entries through the public, unauthenticated query. */
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
const folder=resolve(process.argv[2] || 'exports/kasem-pronunciation-publication-2026-09-27');
const receipt=JSON.parse(await readFile(resolve(folder,'publication-receipt.json'),'utf8'));
const response=await fetch(`https://firestore.googleapis.com/v1/projects/${receipt.projectId}/databases/(default)/documents:runQuery`,{
  method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({structuredQuery:{
    from:[{collectionId:'dictionaryEntries'}],where:{fieldFilter:{field:{fieldPath:'isPublished'},op:'EQUAL',value:{booleanValue:true}}},
    select:{fields:['kasemText','headword','englishText','translation','dialect','audioUrl','attribution','pronunciationAudioVariants','pronunciationAudioProvenance'].map(fieldPath=>({fieldPath}))},limit:2000,
  }}),
});
if(!response.ok)throw Error(`Public query failed: ${response.status}`);
const rows=await response.json();
function decode(v){if('stringValue'in v)return v.stringValue;if('booleanValue'in v)return v.booleanValue;if('nullValue'in v)return null;if('integerValue'in v)return Number(v.integerValue);if('doubleValue'in v)return v.doubleValue;if('mapValue'in v)return Object.fromEntries(Object.entries(v.mapValue.fields||{}).map(([k,x])=>[k,decode(x)]));if('arrayValue'in v)return(v.arrayValue.values||[]).map(decode);return v;}
const docs=new Map(rows.filter(r=>r.document).map(r=>[r.document.name.split('/').at(-1),Object.fromEntries(Object.entries(r.document.fields).map(([k,v])=>[k,decode(v)]))]));
if(docs.size>=2000)throw Error('Query limit reached');
const evidence=[];
for(const entry of receipt.entries){
  const live=docs.get(entry.entryId);
  if(!live || live.audioUrl!==entry.audioUrl || live.pronunciationAudioProvenance.releaseId!==receipt.releaseId ||
     (live.kasemText||live.headword)!==entry.headword || (live.englishText||live.translation)!==entry.meaning || live.dialect!==entry.dialect ||
     !live.attribution.includes('AI-generated with Google Gemini'))throw Error(`Public entry differs: ${entry.entryId}`);
  for(const variant of entry.pronunciationAudioVariants){
    const liveVariant=live.pronunciationAudioVariants.find(v=>v.candidateId===variant.candidateId);
    if(!liveVariant || liveVariant.audioSha256!==variant.audioSha256 || liveVariant.aiGenerated!==true)throw Error('Public alternate is missing');
  }
  evidence.push({entryId:entry.entryId,headword:entry.headword,publicMainAudio:true,approvedVariants:live.pronunciationAudioVariants.length,aiAttributionVisible:true});
}
const review=JSON.parse(await readFile(resolve(folder,'review.json'),'utf8'));
const approvedIds=new Set(receipt.entries.map(e=>e.entryId));
const unapprovedIds=[...new Set(review.reviews.map(r=>r.entryId))].filter(id=>!approvedIds.has(id));
for(const id of unapprovedIds)if(docs.get(id)?.pronunciationAudioProvenance?.releaseId===receipt.releaseId)throw Error('An unapproved word was included');
const sample=receipt.entries.find(e=>e.headword==='kaane')||receipt.entries[0];
const audio=await fetch(sample.audioUrl);const bytes=Buffer.from(await audio.arrayBuffer());
if(!audio.ok || createHash('sha256').update(bytes).digest('hex')!==sample.candidates.find(c=>c.candidateId===sample.primary).audioSha256)throw Error('Public playback sample mismatch');
const result={status:'passed',verifiedAt:new Date().toISOString(),publicEntries:docs.size,releasedEntries:evidence.length,
  approvedAudioVariants:evidence.reduce((sum,e)=>sum+e.approvedVariants,0),unapprovedWordsExcluded:unapprovedIds.length,
  publicPlaybackSample:sample.headword,entries:evidence};
await writeFile(resolve(folder,'public-verification.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify({...result,entries:undefined},null,2));
