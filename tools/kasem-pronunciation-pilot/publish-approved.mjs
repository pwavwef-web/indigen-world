/** Publish exact, owner-approved Gemini recordings. Dry run unless --commit.
 * Existing audio is never overwritten. All dictionary updates commit atomically.
 */
import {createHash, randomUUID} from 'node:crypto';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {resolve, relative, isAbsolute, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {applicationDefault, initializeApp} from 'firebase-admin/app';
import {getFirestore, FieldValue} from 'firebase-admin/firestore';
import {getDownloadURL, getStorage} from 'firebase-admin/storage';
import policy from './publish-policy.cjs';

const {values} = parseArgs({options: {
  pack: {type: 'string'}, review: {type: 'string'}, output: {type: 'string'},
  'approved-by': {type: 'string'}, 'authorization-note': {type: 'string'}, commit: {type: 'boolean', default: false},
}});
for (const field of ['pack', 'review', 'output', 'approved-by', 'authorization-note']) {
  if (!values[field]?.trim()) throw Error(`--${field} is required`);
}
if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_STORAGE_EMULATOR_HOST) throw Error('Live publication cannot target an emulator');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const projectId = JSON.parse(await readFile(resolve(root, '.firebaserc'), 'utf8')).projects.default;
if (projectId !== 'project-kassena-7e026') throw Error('Unexpected Firebase project');
const pack = resolve(values.pack), output = resolve(values.output);
const digest = data => createHash('sha256').update(data).digest('hex');
const json = async path => JSON.parse(await readFile(path, 'utf8'));
const manifest = await json(resolve(pack, 'manifest.json'));
const sample = await readFile(resolve(pack, 'selected-words.json'));
if (manifest.sampleSha256 !== digest(sample) || manifest.source.projectId !== projectId) throw Error('Source sample mismatch');
const reviewBytes = await readFile(resolve(values.review));
const review = JSON.parse(reviewBytes);
const reviewSha256 = digest(reviewBytes);
const releaseId = 'kasem-tts-' + reviewSha256.slice(0, 24);
const plan = policy.approvedPlan(manifest, review);
const assets = new Map();
for (const entry of plan.entries) for (const c of entry.candidates) {
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(entry.entryId)) throw Error('Invalid entry ID');
  const path = resolve(pack, c.audioFile), rel = relative(pack, path);
  if (rel.startsWith('..') || isAbsolute(rel)) throw Error('Audio path escapes its pack');
  const bytes = await readFile(path);
  if (digest(bytes) !== c.audioSha256 || bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WAVE') throw Error('Approved audio has changed');
  assets.set(c.candidateId, {bytes, storagePath: `published-media/pronunciations/ai-reviewed/${entry.entryId}/${c.audioSha256}.wav`});
}
initializeApp({credential: applicationDefault(), projectId, storageBucket: `${projectId}.firebasestorage.app`});
const db = getFirestore(), bucket = getStorage().bucket();
const refs = plan.entries.map(e => db.doc(`dictionaryEntries/${e.entryId}`));
const before = await db.getAll(...refs);
const states = before.map((snap, i) => policy.assertCurrent(plan.entries[i], snap.data(), releaseId));
await mkdir(output, {recursive: true});
const persist = (name, data) => writeFile(resolve(output, name), JSON.stringify(data, null, 2));
const summary = {releaseId, projectId, database: '(default)', batchId: manifest.batchId, reviewSha256,
  mode: values.commit ? 'publish' : 'dry-run', approvedBy: values['approved-by'],
  authorizationNote: values['authorization-note'], sourceReviewerField: review.reviewer || null,
  sourceReviewerVarietyField: review.variety || null,
  approvedClips: plan.approvedClips, uniqueEntries: plan.entries.length,
  primarySelection: 'Gemini 3.8 when both takes are approved; retain every approved alternate.',
  entries: plan.entries.map((e, i) => ({entryId: e.entryId, headword: e.headword, meaning: e.meaning,
    dialect: e.dialect, state: states[i], primary: e.candidates[0].candidateId,
    candidates: e.candidates.map(c => ({candidateId: c.candidateId, audioSha256: c.audioSha256, engine: c.engine}))}))};
await persist('publication-plan.json', summary);
console.log(JSON.stringify(summary, null, 2));
if (!values.commit) process.exit(0);

// Preserve the first pre-publication state on re-runs.
await writeFile(resolve(output, 'before.json'), JSON.stringify(before.map(s => ({path: s.ref.path,
  updateTime: s.updateTime.toDate().toISOString(), data: s.data()})), null, 2), {flag: 'wx'}).catch(e => {if (e.code !== 'EEXIST') throw e;});
await writeFile(resolve(output, 'review.json'), reviewBytes, {flag: 'wx'}).catch(e => {if (e.code !== 'EEXIST') throw e;});
for (const entry of plan.entries) for (const c of entry.candidates) {
  const asset = assets.get(c.candidateId), file = bucket.file(asset.storagePath);
  const [exists] = await file.exists();
  if (!exists) await file.save(asset.bytes, {resumable: false, preconditionOpts: {ifGenerationMatch: 0}, metadata: {
    contentType: 'audio/wav', cacheControl: 'public,max-age=31536000,immutable', metadata: {
      firebaseStorageDownloadTokens: randomUUID(), sha256: c.audioSha256, aiGenerated: 'true',
      provider: 'google', model: manifest.engines[c.engine].id, voice: manifest.engines[c.engine].voice,
      entryId: entry.entryId, reviewSha256, releaseId,
    },
  }});
  const [metadata] = await file.getMetadata();
  if (metadata.metadata?.sha256 !== c.audioSha256 || Number(metadata.size) !== asset.bytes.length) throw Error('Existing public asset differs');
  asset.url = await getDownloadURL(file);
  const publicResponse = await fetch(asset.url);
  if (!publicResponse.ok || digest(Buffer.from(await publicResponse.arrayBuffer())) !== c.audioSha256) throw Error('Public audio bytes do not match approved recording');
  console.log(`Public recording verified: ${entry.headword} / ${c.engine}`);
}

const releasedAt = new Date().toISOString();
const auditRef = db.doc(`auditLogs/${releaseId}`);
await db.runTransaction(async transaction => {
  const snapshots = await transaction.getAll(...refs, auditRef);
  const outcomes = plan.entries.map((entry, i) => policy.assertCurrent(entry, snapshots[i].data(), releaseId));
  for (let i = 0; i < plan.entries.length; i++) {
    if (outcomes[i] === 'already_published') continue;
    const entry = plan.entries[i], data = snapshots[i].data();
    const variants = entry.candidates.map((c, index) => ({
      candidateId: c.candidateId, audioUrl: assets.get(c.candidateId).url,
      storagePath: assets.get(c.candidateId).storagePath, audioSha256: c.audioSha256,
      provider: 'google', model: manifest.engines[c.engine].id, voice: manifest.engines[c.engine].voice,
      durationMs: Math.round(c.durationSeconds * 1000), aiGenerated: true, isPrimary: index === 0,
      reviewedAt: c.review.reviewedAt, reviewNotes: c.review.notes, approvalSource: 'explicit_owner_instruction',
      approvedBy: values['approved-by'], sourceReviewerVariety: review.variety || null,
      releaseId, batchId: manifest.batchId, reviewSha256, publishedAt: releasedAt,
    }));
    const primary = variants[0];
    const attribution = policy.attributionWithAudioNotice(data, values['approved-by']);
    transaction.update(refs[i], {
      audioUrl: primary.audioUrl, pronunciationAudioVariants: variants,
      pronunciationAudioProvenance: {...primary, inputText: entry.candidates[0].inputText,
        reviewedHeadword: entry.headword, reviewedMeaning: entry.meaning, reviewedDialect: entry.dialect,
        termsUrl: 'https://ai.google.dev/gemini-api/terms'},
      attribution, updatedAt: FieldValue.serverTimestamp(),
    });
  }
  if (!snapshots.at(-1).exists) transaction.create(auditRef, {
    action: 'dictionary.publish_reviewed_ai_pronunciations', actorName: values['approved-by'],
    actorSource: 'explicit_user_instruction', authorizationNote: values['authorization-note'],
    batchId: manifest.batchId, reviewSha256, entryIds: plan.entries.map(e => e.entryId),
    approvedClips: plan.approvedClips, dictionaryEntries: plan.entries.length,
    primarySelection: summary.primarySelection, occurredAt: releasedAt,
  });
});
const after = await db.getAll(...refs);
for (let i = 0; i < after.length; i++) {
  if (policy.assertCurrent(plan.entries[i], after[i].data(), releaseId) !== 'already_published') throw Error('Dictionary verification failed');
  if (after[i].get('audioUrl') !== assets.get(plan.entries[i].candidates[0].candidateId).url) throw Error('Published main recording differs');
}
const receipt = {...summary, status: 'published_and_verified', verifiedAt: new Date().toISOString(),
  publishedAt: (await auditRef.get()).get('occurredAt'), publicAudioVerified: assets.size,
  entries: plan.entries.map((e, i) => ({...summary.entries[i], audioUrl: after[i].get('audioUrl'),
    pronunciationAudioVariants: after[i].get('pronunciationAudioVariants')}))};
await persist('publication-receipt.json', receipt);
console.log(JSON.stringify({status: receipt.status, approvedClips: receipt.approvedClips,
  dictionaryEntries: receipt.uniqueEntries, auditDocument: auditRef.path, verifiedAt: receipt.verifiedAt}, null, 2));
