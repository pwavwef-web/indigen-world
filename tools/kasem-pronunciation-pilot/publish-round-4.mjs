/** Publish the exact fourth listening review after its meaning notes are resolved.
 * Dry run unless --commit. Immutable media and dictionary writes are bounded.
 */
import {createHash,randomUUID} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,relative,isAbsolute} from 'node:path';
import {initializeApp,applicationDefault} from 'firebase-admin/app';
import {FieldValue} from 'firebase-admin/firestore';
import resolution from './round-4-resolution.cjs';
import policy from './publish-policy.cjs';
import {downloadPublicAudio} from './public-audio.mjs';
import {firestoreRest} from './firestore-rest.mjs';
import {applyEntryPatch,parseEntryPatch,headwordKey,assignHomographIndex} from '../../.tooling/kasem-tts-alternatives/resolution-helpers.mjs';
const root=resolve(import.meta.dirname,'../..');
const pack=resolve(root,'exports/kasem-pronunciation-round-4-2026-09-28');
const out=resolve(root,'exports/kasem-pronunciation-publication-round-4-2026-09-28');
const commit=process.argv.includes('--commit');
const digest=b=>createHash('sha256').update(b).digest('hex');
const json=async p=>JSON.parse(await readFile(p,'utf8'));
const reviewBytes=await readFile(resolve(out,'review.json'));
if(digest(reviewBytes)!==resolution.reviewSha256)throw Error('Review changed; resolve notes again');
const manifest=await json(resolve(pack,'manifest.json'));
if(digest(await readFile(resolve(pack,'selected-words.json')))!==manifest.sampleSha256)throw Error('Sample hash mismatch');
const plan=resolution.resolveReview(manifest,JSON.parse(reviewBytes));
const planHash=digest(JSON.stringify(plan)),releaseId=`kasem-tts-${plan.reviewSha256.slice(0,24)}`;
const projectId=(await json(resolve(root,'.firebaserc'))).projects.default;
if(projectId!=='project-kassena-7e026'||manifest.source.projectId!==projectId||process.env.FIRESTORE_EMULATOR_HOST||process.env.FIREBASE_STORAGE_EMULATOR_HOST)throw Error('Unexpected target');
const app=initializeApp({credential:applicationDefault(),projectId}),db=firestoreRest(app,projectId);
await mkdir(out,{recursive:true});
const save=(name,data)=>writeFile(resolve(out,name),JSON.stringify(data,null,2));
const auditRef=db.doc(`auditLogs/${releaseId}`),audit=await auditRef.get();
if(audit.exists){
  if(audit.get('planHash')!==planHash)throw Error('Published resolution differs');
  const saved=await json(resolve(out,'publication-plan.json'));
  if(saved.planHash!==planHash)throw Error('Local resolution differs');
  const after=await db.getAll(...plan.entries.map(e=>db.doc(`dictionaryEntries/${e.entryId}`)));
  await save('after.json',after.map(s=>({path:s.ref.path,data:s.data()})));
  await save('publication-receipt.json',{...saved,status:'committed',publishedAt:audit.get('occurredAt'),publicAudioVerified:23});
  console.log(JSON.stringify({status:'already_published',releaseId,verify:'Run verify-round-4.mjs'}));process.exit(0);
}
const ids=[...new Set([...manifest.entries.map(e=>e.entryId),...plan.entries.map(e=>e.entryId)])];
const refs=ids.map(id=>db.doc(`dictionaryEntries/${id}`)),before=await db.getAll(...refs);
const byId=new Map(before.map(s=>[s.id,s]));
for(const e of manifest.entries)policy.assertCurrent({...e,candidates:[]},byId.get(e.entryId).data(),releaseId);
const newWords=[...new Set(plan.entries.filter(e=>e.create).map(e=>headwordKey(e.headword)))];
const peerQueries=['headwordKey','kasemText'].map(field=>db.collection('dictionaryEntries').where(field,'in',newWords));
const peerSnaps=await Promise.all(peerQueries.map(q=>q.get())),peers=new Map(peerSnaps.flatMap(q=>q.docs).map(s=>[s.id,s]));
for(const e of plan.entries.filter(e=>e.create)){
  if(byId.get(e.entryId).exists)throw Error(`Target exists: ${e.entryId}`);
  const siblings=[...peers.values()].filter(s=>headwordKey(s.get('kasemText'))===headwordKey(e.headword));
  if(siblings.some(s=>s.get('englishText')?.toLowerCase()===e.meaning.toLowerCase()))throw Error('Meaning already exists');
  if(siblings.some(s=>Number(s.get('homographIndex'))>=99))throw Error('Homograph limit');
  e.homographIndex=assignHomographIndex(e.entryId,siblings.map(s=>({id:s.id,kasem:s.get('kasemText'),homographIndex:s.get('homographIndex')||1})));
}
const assets=new Map();
for(const e of plan.entries)for(const c of e.candidates){
  if(assets.has(c.candidateId))throw Error('Unexpected recording reuse');
  const path=resolve(pack,c.audioFile),rel=relative(pack,path);
  if(rel.startsWith('..')||isAbsolute(rel))throw Error('Escaping asset');
  const bytes=await readFile(path);
  if(digest(bytes)!==c.audioSha256||bytes.toString('ascii',0,4)!=='RIFF'||bytes.toString('ascii',8,12)!=='WAVE')throw Error('Audio changed');
  assets.set(c.candidateId,{bytes,c,storagePath:`published-media/pronunciations/ai-reviewed/${c.entryId}/${c.audioSha256}.wav`});
}
if(assets.size!==23)throw Error('Unexpected asset count');
for(const e of plan.entries)applyEntryPatch(byId.get(e.entryId).data()||{kasemText:e.headword,englishText:e.meaning,partOfSpeech:'Word'},parseEntryPatch(e.patch||{}));
const summary={releaseId,projectId,planHash,mode:commit?'publish':'dry-run',...plan,audioAttachments:23};
await save('publication-plan.json',summary);
console.log(JSON.stringify({releaseId,mode:summary.mode,approvedDecisions:24,approvedClips:23,audioEntries:21,newEntries:1,withdrawnEntries:1,held:1}));
if(!commit)process.exit(0);
const preserve=async(name,bytes)=>{
  try{await writeFile(resolve(out,name),bytes,{flag:'wx'});}
  catch(error){if(error.code!=='EEXIST')throw error;if(digest(await readFile(resolve(out,name)))!==digest(bytes))throw Error(`Existing backup differs: ${name}`);}
};
await preserve('before.json',JSON.stringify(before.map(s=>({path:s.ref.path,exists:s.exists,updateTime:s.updateTime||null,data:s.data()||null})),null,2));
await preserve('review.json',reviewBytes);
// Reads may retry through the public-audio helper; an ambiguous media upload or
// database commit is never resubmitted automatically. Re-run checks existing hashes.
const bucket=`${projectId}.firebasestorage.app`;
async function publishAsset(a){
  const token=(await app.options.credential.getAccessToken()).access_token;
  const headers={Authorization:`Bearer ${token}`,Connection:'close'};
  const address=`https://storage.googleapis.com/storage/v1/b/${bucket}/o/${encodeURIComponent(a.storagePath)}`;
  const check=await fetch(address,{headers,signal:AbortSignal.timeout(30000)});
  let metadata;
  if(check.status===404){
    const boundary=`kasem-${randomUUID()}`;
    const data={name:a.storagePath,contentType:'audio/wav',cacheControl:'public,max-age=31536000,immutable',metadata:{
      firebaseStorageDownloadTokens:randomUUID(),sha256:a.c.audioSha256,aiGenerated:'true',provider:'google',
      model:manifest.engines[a.c.engine].id,reviewSha256:plan.reviewSha256,releaseId}};
    const body=Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(data)}\r\n--${boundary}\r\nContent-Type: audio/wav\r\n\r\n`),a.bytes,Buffer.from(`\r\n--${boundary}--\r\n`)]);
    const upload=await fetch(`https://storage.googleapis.com/upload/storage/v1/b/${bucket}/o?uploadType=multipart&name=${encodeURIComponent(a.storagePath)}&ifGenerationMatch=0`,{
      method:'POST',headers:{...headers,'Content-Type':`multipart/related; boundary=${boundary}`},body,signal:AbortSignal.timeout(30000)});
    metadata=await upload.json();if(!upload.ok)throw Error(`Media upload ${upload.status}`);
  }else{metadata=await check.json();if(!check.ok)throw Error(`Media metadata ${check.status}`);}
  if(metadata.metadata?.sha256!==a.c.audioSha256||Number(metadata.size)!==a.bytes.length)throw Error('Stored audio differs');
  const downloadToken=metadata.metadata.firebaseStorageDownloadTokens?.split(',')[0];
  if(!downloadToken)throw Error('Missing public download token');
  a.url=`https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(a.storagePath)}?alt=media&token=${encodeURIComponent(downloadToken)}`;
  if(digest(await downloadPublicAudio(a.url))!==a.c.audioSha256)throw Error('Public audio mismatch');
  console.log(`Verified ${a.c.candidateId}`);
}
const assetQueue=[...assets.values()];
const uploads=await Promise.allSettled(Array.from({length:4},async()=>{while(assetQueue.length)await publishAsset(assetQueue.shift());}));
for(const r of uploads)if(r.status==='rejected')throw r.reason;
const now=new Date().toISOString();
const sourceLabel='Dictionary owner listening review, 2026-09-28; additional meaning supplied in the review notes.';
const updates=new Map();
for(const e of plan.entries){
  const old=byId.get(e.entryId).data();
  const base=e.create?{kasemText:e.headword,headwordKey:headwordKey(e.headword),homographIndex:e.homographIndex,
    englishText:e.meaning,englishTranslations:[e.meaning],translations:[e.headword],dialect:e.dialect,
    lexicalKind:'word',partOfSpeech:'Word',partOfSpeechId:'unknown',category:'Community vocabulary',
    isPublished:true,audioUrl:'',kasemExample:'',englishExample:'',source:sourceLabel,
    authenticationStatus:'community',relatedEntryId:e.sourceEntryId,schemaVersion:1,createdAt:FieldValue.serverTimestamp()}:old;
  const patch=applyEntryPatch(base,parseEntryPatch(e.patch||{})).update;
  const update={...(e.create?base:{}),...patch,updatedAt:FieldValue.serverTimestamp()};
  if(e.create||e.withdraw)update.ownerReviewCorrection={releaseId,reviewSha256:plan.reviewSha256,reviewedAt:now,
    authority:'explicit_owner_instruction',independentExpertReview:false,...(e.withdraw?{action:'unpublished',reason:e.reason}:{})};
  if(e.candidates.length){
    const variants=e.candidates.map((c,i)=>({candidateId:c.candidateId,sourceEntryId:c.entryId,sourceMeaning:c.sourceMeaning,
      audioUrl:assets.get(c.candidateId).url,storagePath:assets.get(c.candidateId).storagePath,audioSha256:c.audioSha256,
      provider:'google',model:manifest.engines[c.engine].id,voice:manifest.engines[c.engine].voice,durationMs:Math.round(c.durationSeconds*1000),
      aiGenerated:true,isPrimary:i===0,reviewedAt:c.reviewedAt,reviewNotes:c.reviewNotes,approvedBy:'dictionary owner (uploaded listening review)',
      approvalSource:'explicit_owner_instruction',reviewedHeadword:e.headword,reviewedMeaning:e.meaning,reviewedDialect:e.dialect,
      releaseId,batchId:manifest.batchId,reviewSha256:plan.reviewSha256,publishedAt:now}));
    Object.assign(update,{audioUrl:variants[0].audioUrl,pronunciationAudioVariants:variants,
      pronunciationAudioProvenance:{...variants[0],inputText:e.candidates[0].inputText,termsUrl:'https://ai.google.dev/gemini-api/terms'},
      attribution:policy.attributionWithAudioNotice(base,'the dictionary owner through the uploaded listening review')});
  }
  updates.set(e.entryId,update);
}
await db.runTransaction(async tx=>{
  const current=await tx.getAll(...refs,auditRef);
  for(let i=0;i<before.length;i++)if(current[i].exists!==before[i].exists||(current[i].exists&&!current[i].updateTime.isEqual(before[i].updateTime)))throw Error(`Concurrent change: ${current[i].id}`);
  if(current.at(-1).exists)throw Error('Release already exists');
  for(let i=0;i<peerQueries.length;i++){
    const q=await tx.get(peerQueries[i]);
    if(q.size!==peerSnaps[i].size||q.docs.some(s=>!peers.get(s.id)?.updateTime.isEqual(s.updateTime)))throw Error('Homograph peers changed');
  }
  for(const e of plan.entries){const ref=db.doc(`dictionaryEntries/${e.entryId}`);e.create?tx.create(ref,updates.get(e.entryId)):tx.update(ref,updates.get(e.entryId));}
  tx.create(auditRef,{action:'dictionary.publish_note_resolved_pronunciations',actorSource:'explicit_owner_instruction',
    authorizationNote:'Continuing the owner-authorized listening and publication workflow: add approved clips, resolve sense notes, unpublish the specified Dian entry reversibly. Fruit take held pending its English name.',
    planHash,reviewSha256:plan.reviewSha256,batchId:manifest.batchId,occurredAt:now,approvedDecisions:24,approvedClips:23,audioEntries:21,
    entryIds:plan.entries.map(e=>e.entryId),heldCandidateIds:plan.held.map(c=>c.candidateId),
    corrections:plan.entries.filter(e=>e.create||e.withdraw).map(e=>({entryId:e.entryId,create:e.create,headword:e.headword,meaning:e.meaning,patch:e.patch}))});
});
const after=await db.getAll(...plan.entries.map(e=>db.doc(`dictionaryEntries/${e.entryId}`)));
await save('after.json',after.map(s=>({path:s.ref.path,data:s.data()})));
await save('publication-receipt.json',{...summary,status:'committed',publishedAt:now,publicAudioVerified:23});
console.log(JSON.stringify({status:'committed',releaseId,publishedAt:now}));
process.exit(0);
