/** One reviewed batch, with explicit sense routing. Dry run unless --commit.
 * Build resolution-helpers.ts with esbuild into .tooling/kasem-tts-alternatives first.
 */
import {createHash,randomUUID} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,relative,isAbsolute} from 'node:path';
import {initializeApp,applicationDefault} from 'firebase-admin/app';
import {FieldValue} from 'firebase-admin/firestore';
import {getStorage,getDownloadURL} from 'firebase-admin/storage';
import resolution from './round-3-resolution.cjs';
import policy from './publish-policy.cjs';
import {downloadPublicAudio} from './public-audio.mjs';
import {firestoreRest} from './firestore-rest.mjs';
import {applyEntryPatch,parseEntryPatch,headwordKey,assignHomographIndex,
  buildCollectionSubmissionDocument,buildCollectionContributionReceipt} from '../../.tooling/kasem-tts-alternatives/resolution-helpers.mjs';
const root=resolve(import.meta.dirname,'../..');
const pack=resolve(root,'exports/kasem-pronunciation-round-3-2026-09-27');
const out=resolve(root,'exports/kasem-pronunciation-publication-round-3-2026-09-27');
const commit=process.argv.includes('--commit');
const digest=b=>createHash('sha256').update(b).digest('hex');
const readJson=async p=>JSON.parse(await readFile(p,'utf8'));
const reviewBytes=await readFile(resolve(process.env.USERPROFILE,'Downloads/kasem-comparison-2026-09-27T111946-528936+0000-review.json'));
if(digest(reviewBytes)!==resolution.reviewSha256) throw Error('Review bytes changed; resolve notes again');
const manifest=await readJson(resolve(pack,'manifest.json'));
if(digest(await readFile(resolve(pack,'selected-words.json')))!==manifest.sampleSha256) throw Error('Sample hash mismatch');
const plan=resolution.resolveReview(manifest,JSON.parse(reviewBytes));
const planHash=digest(JSON.stringify(plan));
const releaseId=`kasem-tts-${plan.reviewSha256.slice(0,24)}`;
const projectId=JSON.parse(await readFile(resolve(root,'.firebaserc'),'utf8')).projects.default;
if(projectId!=='project-kassena-7e026'||manifest.source.projectId!==projectId||process.env.FIRESTORE_EMULATOR_HOST||process.env.FIREBASE_STORAGE_EMULATOR_HOST) throw Error('Unexpected target');
const app=initializeApp({credential:applicationDefault(),projectId,storageBucket:`${projectId}.firebasestorage.app`});
const db=firestoreRest(app,projectId);
const bucket=getStorage().bucket();
await mkdir(out,{recursive:true});
const save=(name,data)=>writeFile(resolve(out,name),JSON.stringify(data,null,2));
const auditRef=db.doc(`auditLogs/${releaseId}`);
const audit=await auditRef.get();
if(audit.exists) {
  if(audit.get('planHash')!==planHash) throw Error('Published resolution differs');
  // Recover evidence after a lost commit response or a failed read-back.
  const savedPlan=await readJson(resolve(out,'publication-plan.json'));
  if(savedPlan.planHash!==planHash)throw Error('Local publication plan differs');
  const queueId=audit.get('queueId');
  const after=await db.getAll(...plan.entries.map(e=>db.doc(`dictionaryEntries/${e.entryId}`)),db.doc(`submissions/${queueId}`),db.doc(`collectionContributions/${queueId}`));
  await save('after.json',after.map(s=>({path:s.ref.path,data:s.data()})));
  await save('publication-receipt.json',{...savedPlan,status:'committed',publishedAt:audit.get('occurredAt'),queueId,publicAudioVerified:26});
  console.log(JSON.stringify({status:'already_published',releaseId,verify:'Run verify-round-3.mjs'}));process.exit(0);
}
const ids=[...new Set([...manifest.entries.map(e=>e.entryId),...plan.entries.map(e=>e.entryId)])];
const refs=ids.map(id=>db.doc(`dictionaryEntries/${id}`));
const before=await db.getAll(...refs);
const byId=new Map(before.map(s=>[s.id,s]));
for(const e of manifest.entries) policy.assertCurrent({...e,candidates:[]},byId.get(e.entryId).data(),releaseId);
const jaane=byId.get('collection_4LbHGPSrpBz4n9hRNDry').data();
if(jaane?.kasemText!=='jaane'||jaane?.englishText!=='fly'||jaane?.audioUrl||jaane?.isPublished!==true) throw Error('Jaane changed');
const newWords=[...new Set(plan.entries.filter(e=>e.create).map(e=>headwordKey(e.headword)))];
const peerQueries=['headwordKey','kasemText'].map(field=>db.collection('dictionaryEntries').where(field,'in',newWords));
const peerSnaps=await Promise.all(peerQueries.map(q=>q.get()));
const peers=new Map(peerSnaps.flatMap(q=>q.docs).map(s=>[s.id,s]));
for(const e of plan.entries.filter(e=>e.create)) {
  if(byId.get(e.entryId).exists) throw Error(`Target exists: ${e.entryId}`);
  const siblings=[...peers.values()].filter(s=>headwordKey(s.get('kasemText'))===headwordKey(e.headword));
  if(siblings.some(s=>s.get('englishText')?.toLowerCase()===e.meaning.toLowerCase())) throw Error(`Meaning already exists: ${e.headword}/${e.meaning}`);
  if(siblings.some(s=>Number(s.get('homographIndex'))>=99)) throw Error('Homograph limit');
  e.homographIndex=assignHomographIndex(e.entryId,siblings.map(s=>({id:s.id,kasem:s.get('kasemText'),homographIndex:s.get('homographIndex')||1})));
}
const assets=new Map();
for(const e of plan.entries) for(const c of e.candidates) {
  if(assets.has(c.candidateId))continue;
  const path=resolve(pack,c.audioFile),rel=relative(pack,path);
  if(rel.startsWith('..')||isAbsolute(rel))throw Error('Escaping asset');
  const bytes=await readFile(path);
  if(digest(bytes)!==c.audioSha256||bytes.toString('ascii',0,4)!=='RIFF'||bytes.toString('ascii',8,12)!=='WAVE')throw Error('Changed audio');
  assets.set(c.candidateId,{bytes,c,storagePath:`published-media/pronunciations/ai-reviewed/${c.entryId}/${c.audioSha256}.wav`});
}
if(assets.size!==26||plan.entries.filter(e=>e.candidates.length).length!==25||plan.entries.filter(e=>e.create).length!==8)throw Error('Unexpected resolved counts');
const summary={releaseId,projectId,planHash,mode:commit?'publish':'dry-run',...plan,
  audioEntries:25,newEntries:8,audioAttachments:plan.entries.reduce((n,e)=>n+e.candidates.length,0)};
// Parse every content change before uploads or database writes.
for(const e of plan.entries) applyEntryPatch(byId.get(e.entryId).data()||{kasemText:e.headword,englishText:e.meaning,partOfSpeech:'Word'},parseEntryPatch(e.patch||{}));
await save('publication-plan.json',summary);
console.log(JSON.stringify({releaseId,mode:summary.mode,approvedClips:assets.size,audioEntries:25,newEntries:8,audioAttachments:summary.audioAttachments}));
if(!commit)process.exit(0);
const preserve=async(name,bytes)=>{
  try{await writeFile(resolve(out,name),bytes,{flag:'wx'});}
  catch(error){if(error.code!=='EEXIST')throw error;if(digest(await readFile(resolve(out,name)))!==digest(bytes))throw Error(`Existing backup differs: ${name}`);}
};
await preserve('before.json',JSON.stringify(before.map(s=>({path:s.ref.path,exists:s.exists,updateTime:s.updateTime||null,data:s.data()||null})),null,2));
await preserve('review.json',reviewBytes);
for(const a of assets.values()) {
  const file=bucket.file(a.storagePath),[exists]=await file.exists();
  if(!exists)await file.save(a.bytes,{resumable:false,preconditionOpts:{ifGenerationMatch:0},metadata:{contentType:'audio/wav',cacheControl:'public,max-age=31536000,immutable',metadata:{firebaseStorageDownloadTokens:randomUUID(),sha256:a.c.audioSha256,aiGenerated:'true',provider:'google',model:manifest.engines[a.c.engine].id,reviewSha256:plan.reviewSha256,releaseId}}});
  const [m]=await file.getMetadata();
  if(m.metadata?.sha256!==a.c.audioSha256||Number(m.size)!==a.bytes.length)throw Error('Storage asset differs');
  a.url=await getDownloadURL(file);
  if(digest(await downloadPublicAudio(a.url))!==a.c.audioSha256)throw Error('Public audio mismatch');
  console.log(`Verified ${a.c.candidateId}`);
}
const now=new Date().toISOString();
const queueId=`${releaseId}-memanga-proverbs`;
const queueRef=db.doc(`submissions/${queueId}`),receiptRef=db.doc(`collectionContributions/${queueId}`);
const campaignRef=db.doc('campaigns/collection-contributions');
const sourceLabel='Dictionary owner listening review, 2026-09-27; additional meaning supplied in the review notes.';
const input={collectionKind:'dictionary',lexicalKind:'word',title:'proverbs',body:'memaŋa',translations:['memaŋa'],
  format:'Noun',dialect:'Ghana Kasem',source:sourceLabel,notes:'Uncertain additional meaning: does memaŋa also mean proverbs? Please verify meaning and pronunciation. Submitted under the account explicitly requested in the owner’s review notes. Existing signs sense is separate and its audio approval does not approve this meaning.',
  relatedEntryId:plan.queue.sourceEntryId,forms:{},senses:[],alsoUsedAs:[],ipa:'',kasemDefinition:'',etymology:'',literalTranslation:'',usageContext:'',frenchTranslation:'',
  mediaUrl:'',media:null,cover:null,involvesMinors:null,usesThirdPartyMaterial:false,participantConsentConfirmed:false,kasemExample:'',englishExample:'',rightsConfirmed:true,publicationPermission:false};
const queued=buildCollectionSubmissionDocument(queueId,plan.queue.accountUid,input,now);
// No people or recording were submitted: do not manufacture a consent declaration.
queued.attestations.participantsConsented=null;
queued.importProvenance={releaseId,reviewSha256:plan.reviewSha256,actorSource:'explicit_owner_instruction',textOnly:true};
const contribution=buildCollectionContributionReceipt(queueId,queueId,plan.queue.accountUid,input);
contribution.participantConsentConfirmed=null;
const updates=new Map();
for(const e of plan.entries) {
  const old=byId.get(e.entryId).data();
  const base=e.create?{kasemText:e.headword,headwordKey:headwordKey(e.headword),homographIndex:e.homographIndex,
    englishText:e.meaning,englishTranslations:[e.meaning],translations:[e.headword],dialect:e.dialect,
    lexicalKind:'word',partOfSpeech:'Word',partOfSpeechId:'unknown',category:'Community vocabulary',
    isPublished:true,audioUrl:'',kasemExample:'',englishExample:'',source:sourceLabel,
    authenticationStatus:'community',relatedEntryId:e.sourceEntryId,schemaVersion:1,createdAt:FieldValue.serverTimestamp()}:old;
  const patch=applyEntryPatch(base,parseEntryPatch(e.patch||{})).update;
  const update={...(e.create?base:{}),...patch,updatedAt:FieldValue.serverTimestamp()};
  if(e.create||Object.keys(e.patch||{}).length)update.ownerReviewCorrection={releaseId,reviewSha256:plan.reviewSha256,reviewedAt:now,authority:'explicit_owner_instruction',independentExpertReview:false};
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
  if(!e.create&&Object.keys(e.patch||{}).length)update.attribution=[update.attribution||base.attribution||base.source,
    `Dictionary meaning/forms corrected from the owner's listening notes on 2026-09-27: ${e.headword} — ${e.meaning}.`].filter(Boolean).join('\n\n');
  if(JSON.stringify(update).includes('@gmail.com'))throw Error('Private contact in public entry');
  updates.set(e.entryId,update);
}
await db.runTransaction(async tx=>{
  const current=await tx.getAll(...refs,auditRef,queueRef,receiptRef,campaignRef);
  for(let i=0;i<before.length;i++){
    if(current[i].exists!==before[i].exists||(current[i].exists&&!current[i].updateTime.isEqual(before[i].updateTime)))throw Error(`Concurrent change: ${current[i].id}`);
  }
  if(current.slice(before.length,before.length+3).some(s=>s.exists))throw Error('Release or queue already exists');
  if(!current.at(-1).exists)throw Error('Collection campaign missing');
  for(let i=0;i<peerQueries.length;i++){
    const q=await tx.get(peerQueries[i]);
    const original=peerSnaps[i];
    if(q.size!==original.size||q.docs.some(s=>!peers.get(s.id)?.updateTime.isEqual(s.updateTime)))throw Error('Homograph peers changed');
  }
  for(const e of plan.entries){const ref=db.doc(`dictionaryEntries/${e.entryId}`);e.create?tx.create(ref,updates.get(e.entryId)):tx.update(ref,updates.get(e.entryId));}
  tx.create(queueRef,queued);tx.create(receiptRef,contribution);
  tx.create(auditRef,{action:'dictionary.publish_note_resolved_pronunciations',actorSource:'explicit_owner_instruction',
    authorizationNote:'Owner requested approved clips added, corrections from listening notes applied, and uncertain memaŋa/proverbs queued under the specified account. Jaane clarified as to fly / fly.',
    planHash,reviewSha256:plan.reviewSha256,batchId:manifest.batchId,occurredAt:now,approvedClips:26,audioEntries:25,
    entryIds:plan.entries.map(e=>e.entryId),queueId,corrections:plan.entries.filter(e=>e.create||Object.keys(e.patch||{}).length).map(e=>({entryId:e.entryId,create:e.create,headword:e.headword,meaning:e.meaning,patch:e.patch||{}}))});
});
const after=await db.getAll(...plan.entries.map(e=>db.doc(`dictionaryEntries/${e.entryId}`)),queueRef,receiptRef);
await save('after.json',after.map(s=>({path:s.ref.path,data:s.data()})));
await save('publication-receipt.json',{...summary,status:'committed',publishedAt:now,queueId,publicAudioVerified:assets.size});
console.log(JSON.stringify({status:'committed',releaseId,queueId,publishedAt:now}));
process.exit(0);
