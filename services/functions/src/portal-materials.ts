import { createHash } from 'node:crypto';
import { FieldPath, FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { callerClaims, effectiveRole, onStaffCall, requireAuth, requireRole, requireVerifiedStaffSession } from './auth.js';
import { CONTRIBUTOR_CALL_OPTIONS, guarded, requireActiveContributor } from './contributor-common.js';
import { consumeRateLimit } from './rate-limit.js';
import { stableStringify } from './kasem-evidence.js';
import { PORTAL_TYPES, PORTAL_USES, PORTAL_LIMITS, PORTAL_CONSENT_VERSION, portalFileType, portalIssues, type PortalType, type PortalUse } from '@indigen-world/contracts/portal-contributions';

type Data = Record<string, any>;
export interface PortalRecord extends Data { id: string; owner: string; type: PortalType; title: string; language: string; version: number; status: string; uses: Record<PortalUse, boolean>; files: Data[]; content: Data; processing: Data; updatedAt: string }
const options = { ...CONTRIBUTOR_CALL_OPTIONS, timeoutSeconds: 120, memory: '512MiB' as const };
const hash = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');
const object = (x: any): Data => x && typeof x === 'object' && !Array.isArray(x) ? x : {};
function text(x: any, max = 2000): string { if (x == null) return ''; if (typeof x !== 'string' || x.length > max) throw new HttpsError('invalid-argument', `Use text of at most ${max} characters.`); return x.normalize('NFC').trim(); }
function key(x: any): string { const s = text(x, 150); if (!/^[\w-]{8,150}$/.test(s)) throw new HttpsError('invalid-argument', 'A stable request or record ID is required.'); return s; }
const collection = () => getFirestore().collection('portalContributions');
const stamp = () => new Date().toISOString();
async function ingestionSettings() {
  const raw = (await getFirestore().doc('portalIngestionSettings/current').get()).data() ?? {};
  return { uploadsEnabled: raw.uploadsEnabled !== false,
    maxFiles: Math.min(PORTAL_LIMITS.maxFiles, Math.max(1, Number(raw.maxFiles) || PORTAL_LIMITS.maxFiles)),
    maxFileBytes: Math.min(PORTAL_LIMITS.maxFileBytes, Math.max(1024, Number(raw.maxFileBytes) || PORTAL_LIMITS.maxFileBytes)),
    maxBatchBytes: Math.min(PORTAL_LIMITS.maxBatchBytes, Math.max(1024, Number(raw.maxBatchBytes) || PORTAL_LIMITS.maxBatchBytes)) };
}

export function parsePortalRecord(raw: any, uid: string): Data {
  const r = object(raw), content = object(r.content), rights = object(r.rights);
  if (!Object.hasOwn(PORTAL_TYPES, r.type)) throw new HttpsError('invalid-argument', 'Choose a contribution type.');
  const c: Data = {};
  for (const name of ['text', 'sourceText', 'meaning', 'example', 'context', 'source', 'sourceLanguage', 'originalRecord', 'reason', 'category', 'sourceUrl', 'date', 'attribution', 'restrictions', 'speaker', 'dialect', 'script', 'variants', 'transcript']) c[name] = text(content[name], ['text', 'sourceText', 'transcript'].includes(name) ? PORTAL_LIMITS.maxText : 2000);
  c.needsTranscription = content.needsTranscription === true;
  if (!['original', 'transcribed', 'translated', 'ai_assisted', 'ai_generated'].includes(r.provenance)) throw new HttpsError('invalid-argument', 'Choose how this material was created.');
  const files = Array.isArray(r.files) ? r.files : [];
  if (files.length > PORTAL_LIMITS.maxFiles) throw new HttpsError('invalid-argument', 'Use at most 10 files per batch.');
  const parsed = files.map((f: any) => {
    const name = text(f.name, 180), path = text(f.path, 400), kind = portalFileType(name);
    if (!kind || !new RegExp(`^portal-originals/${uid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/[\\w-]{8,150}/[\\w-]{8,150}$`).test(path)) throw new HttpsError('invalid-argument', 'Choose a supported file uploaded to your own private folder.');
    return { path, name, mime: kind.mime, title: text(f.title, 240), description: text(f.description), source: text(f.source), language: text(f.language, 80) };
  });
  if (new Set(parsed.map(f => f.path)).size !== parsed.length) throw new HttpsError('invalid-argument', 'Attach each file once.');
  const suppliedLanguage = text(r.language, 80), language = /^(kasem(?:\s*\(xsm\))?|xsm)$/i.test(suppliedLanguage) ? 'xsm' : suppliedLanguage;
  const parsedRecord = { type: r.type, title: text(r.title, 240), language, provenance: r.provenance,
    content: c, files: parsed, uses: Object.fromEntries(Object.keys(PORTAL_USES).map(k => [k, object(r.uses)[k] === true])),
    rights: { ownership: ['own', 'permission', 'unclear'].includes(rights.ownership) ? rights.ownership : '', speakers: rights.speakers === true, sensitive: rights.sensitive === true, confidential: rights.confidential === true, cultural: rights.cultural === true },
  };
  if (Buffer.byteLength(JSON.stringify(parsedRecord)) > 200000) throw new HttpsError('invalid-argument', 'Keep the combined metadata and content below 200 KB.');
  return parsedRecord;
}

async function ownerRecord(uid: string, id: string) {
  const r = (await collection().doc(id).get()).data() as PortalRecord | undefined;
  if (!r) throw new HttpsError('not-found', 'Contribution not found.');
  if (r.owner !== uid) throw new HttpsError('permission-denied', 'This contribution belongs to another account.');
  return r;
}
async function reviewer(req: CallableRequest<any>) { requireRole(req, 'validator'); requireVerifiedStaffSession(req); }
async function listRecords(uid: string, d: Data, review = false, restricted = false) {
  const size = 30;
  let q = collection().where(review ? 'status' : 'owner', review ? 'in' : '==', review ? ['submitted', 'changes_requested', 'disputed', 'approved', 'rejected'] : uid).orderBy(FieldPath.documentId());
  // Filtering occurs server-side before pagination. No composite index is needed.
  let cursor = d.cursor ? key(d.cursor) : '';
  const records: Data[] = [];
  let more = true;
  for (let scanned = 0; scanned < 10 && more && records.length < size; scanned++) {
    const page = await (cursor ? q.startAfter(cursor) : q).limit(60).get(); more = page.size === 60;
    for (const doc of page.docs) {
      cursor = doc.id;
      const r = doc.data();
      if (review && !restricted && (r.rights?.sensitive || r.rights?.confidential || r.rights?.cultural)) continue;
      if (d.attention && r.status !== 'changes_requested' && r.processing?.state !== 'failed') continue;
      if (d.feedback && !r.feedback) continue;
      if (d.type && r.type !== d.type || d.status && r.status !== d.status || d.query && !`${r.title} ${r.id} ${r.content?.text ?? ''}`.toLocaleLowerCase().includes(text(d.query, 200).toLocaleLowerCase())) continue;
      records.push(r);
      if (records.length === size) { more = true; break; }
    }
  }
  return { records, nextCursor: more ? cursor : null };
}
async function detail(r: PortalRecord) {
  const history = await collection().doc(r.id).collection('history').orderBy('at', 'desc').limit(60).get();
  return { record: r, history: history.docs.map(x => x.data()) };
}

async function save(uid: string, d: Data) {
  if (typeof d.submit !== 'boolean') throw new HttpsError('invalid-argument', 'Choose draft or submit.');
  const input = parsePortalRecord(d.record, uid), requestId = key(d.requestId), db = getFirestore();
  const profile = (await db.doc(`contributors/${uid}`).get()).data();
  if (profile?.permissions?.edit === false || d.submit && profile?.permissions?.submit === false) throw new HttpsError('permission-denied', 'Your contributor permissions do not allow this action.');
  const id = d.id ? key(d.id) : `PC-${hash(`${uid}:${requestId}`).slice(0, 32)}`;
  const ref = collection().doc(id), rr = db.collection('portalRequests').doc(hash(`${uid}:${requestId}`));
  const fingerprint = hash(stableStringify({ input, id: d.id ?? null, version: d.version ?? null, submit: d.submit }));
  if (d.submit) { const issues = portalIssues(input); if (issues.length) throw new HttpsError('invalid-argument', issues.join(' ')); }
  // Validate real immutable objects before recording a submission. Downloads remain closed until inspection.
  if (d.submit && !(await rr.get()).exists) {
    const limits = await ingestionSettings();
    if (input.files.length > limits.maxFiles || input.files.length && !limits.uploadsEnabled) throw new HttpsError('failed-precondition', 'Material uploads are paused or this batch exceeds the current file limit. Keep your draft.');
    let total = 0;
    for (const f of input.files) {
      const [m] = await getStorage().bucket().file(f.path).getMetadata();
      total += Number(m.size);
      if (Number(m.size) <= 0 || Number(m.size) > limits.maxFileBytes || m.contentType !== f.mime) throw new HttpsError('invalid-argument', `${f.name}: incomplete upload, wrong type, or over the configured size limit.`);
    }
    if (total > limits.maxBatchBytes) throw new HttpsError('invalid-argument', 'The batch exceeds the configured total size limit.');
  }
  return db.runTransaction(async tx => {
    const prior = await tx.get(rr);
    if (prior.exists) {
      if (prior.get('fingerprint') !== fingerprint) throw new HttpsError('already-exists', 'This request ID belongs to different content.');
      return { record: (await tx.get(ref.collection('versions').doc(String(prior.get('version'))))).data(), replayed: true };
    }
    const snap = await tx.get(ref), old = snap.data() as PortalRecord | undefined;
    if (d.id && !old) throw new HttpsError('not-found', 'Contribution not found.');
    if (old && (old.owner !== uid || old.version !== d.version)) throw new HttpsError('failed-precondition', 'Open the current version of your own contribution before saving.');
    if (old && !['draft', 'changes_requested', 'rejected'].includes(old.status)) throw new HttpsError('failed-precondition', 'This version is locked for review.');
    const at = stamp(), version = (old?.version ?? 0) + 1;
    if (old?.parent) {
      const parent = (await tx.get(collection().doc(old.parent.id))).data() as PortalRecord | undefined;
      if (!parent || parent.owner !== uid || parent.status !== 'approved' || parent.version !== old.parent.version) throw new HttpsError('failed-precondition', 'The exact source version is no longer eligible. Ask a reviewer to resolve its source before revising this candidate.');
      if (input.type !== old.type) throw new HttpsError('invalid-argument', 'Keep the task type of a derived candidate.');
      input.uses = Object.fromEntries(Object.keys(PORTAL_USES).map(k => [k, parent.uses[k as PortalUse] && input.uses[k]]));
      input.rights = parent.rights;
    }
    const record = { ...input, ...(old?.parent ? { parent: old.parent } : {}), id, owner: uid, version, status: d.submit ? 'submitted' : old?.status === 'changes_requested' ? 'changes_requested' : 'draft', createdAt: old?.createdAt ?? at, updatedAt: at,
      submittedAt: d.submit ? at : old?.submittedAt ?? null, feedback: old?.feedback ?? '',
      consent: { version: PORTAL_CONSENT_VERSION, text: PORTAL_USES, selected: input.uses, at },
      reward: 'Pending reward assessment', processing: { state: d.submit && input.files.length ? 'queued' : 'not_required', files: [], attempts: 0, scan: 'No external malware scanner configured' },
    };
    tx.set(ref, record); tx.create(ref.collection('versions').doc(String(version)), record);
    tx.create(ref.collection('history').doc(`save-${requestId}`), { action: d.submit ? 'submitted' : 'draft_saved', version, at, actor: uid });
    tx.create(rr, { fingerprint, version, recordId: id });
    return { record };
  });
}

/** Strict allowlist and content signatures. This is inspection, not a malware-scan claim. */
export function inspectPortalFile(name: string, buffer: Buffer): { method: string; text: string; state: string } {
  const kind = portalFileType(name);
  if (!kind || !buffer.length || buffer.length > PORTAL_LIMITS.maxFileBytes) throw new Error('Unsupported or oversized file.');
  const ext = kind.extension, head = buffer.subarray(0, 32), ascii = head.toString('ascii');
  if (buffer[0] === 0x4d && buffer[1] === 0x5a || ascii.startsWith('\x7fELF')) throw new Error('Executable content is prohibited.');
  if (['txt', 'md', 'csv', 'json', 'jsonl'].includes(ext)) {
    if (buffer.length > PORTAL_LIMITS.maxExtractBytes || buffer.includes(0)) throw new Error('Text extraction supports UTF-8 files up to 2 MB; use a smaller file.');
    const value = new TextDecoder('utf-8', { fatal: true }).decode(buffer).replace(/^\uFEFF/, '');
    if (/<\s*(script|iframe|html|svg)\b/i.test(value)) throw new Error('Active HTML or script content is prohibited. Upload plain text.');
    if (ext === 'json') JSON.parse(value);
    if (ext === 'jsonl') for (const line of value.split(/\r?\n/).filter(x => x.trim())) JSON.parse(line);
    return { method: `${ext}-utf8-v1`, text: value.normalize('NFC').slice(0, 60000), state: 'extracted_unverified' };
  }
  if (ext === 'pdf') {
    if (!ascii.startsWith('%PDF-') || /\/(JavaScript|JS|Launch|EmbeddedFile)\b/.test(buffer.toString('latin1'))) throw new Error('Invalid PDF or prohibited active/embedded content.');
  } else if (['docx', 'xlsx'].includes(ext)) {
    if (head.readUInt32LE(0) !== 0x04034b50) throw new Error('Invalid Office container.');
    // Inspect central-directory sizes before any expansion; never execute or extract archives.
    const raw = buffer.toString('latin1');
    if (!raw.includes('[Content_Types].xml') || !raw.includes(ext === 'docx' ? 'word/document.xml' : 'xl/workbook.xml') || /vbaProject|embeddings\/|externalLinks\/|\.exe\b|\.js\b/i.test(raw)) throw new Error('Invalid Office file, macros, embedded files or external links.');
    let entries = 0, expanded = 0;
    for (let i = 0; i <= buffer.length - 46; i++) if (buffer.readUInt32LE(i) === 0x02014b50) {
      entries++; expanded += buffer.readUInt32LE(i + 24);
      if (buffer.readUInt16LE(i + 8) & 1) throw new Error('Encrypted Office files are not supported.');
    }
    if (!entries || entries > 1000 || expanded > 50 * 1024 * 1024) throw new Error('Office container exceeds inspection limits.');
  } else if (['jpg', 'jpeg'].includes(ext)) { if (head[0] !== 255 || head[1] !== 216 || head[2] !== 255) throw new Error('Invalid JPEG.'); }
  else if (ext === 'png') { if (head.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('Invalid PNG.'); }
  else if (ext === 'wav') { if (!ascii.startsWith('RIFF') || ascii.slice(8, 12) !== 'WAVE') throw new Error('Invalid WAV.'); }
  else if (ext === 'mp3') { if (!ascii.startsWith('ID3') && !(head[0] === 255 && (head[1] & 224) === 224)) throw new Error('Invalid MP3.'); }
  else if (ext === 'webm') { if (head.subarray(0, 4).toString('hex') !== '1a45dfa3') throw new Error('Invalid WebM.'); }
  else if (['mp4', 'm4a'].includes(ext) && ascii.slice(4, 8) !== 'ftyp') throw new Error('Invalid MP4/M4A.');
  return { method: 'signature-inspection-v1', text: '', state: 'manual_review' };
}

export async function processPortalMaterial(id: string, version: number) {
  const db = getFirestore(), ref = collection().doc(id), token = crypto.randomUUID();
  const record = await db.runTransaction(async tx => {
    const snap = await tx.get(ref), r = snap.data() as PortalRecord | undefined;
    if (!r || r.version !== version || r.status === 'withdrawn' || r.processing.state !== 'queued') return null;
    tx.update(ref, { processing: { ...r.processing, state: 'processing', token, startedAt: stamp(), attempts: (r.processing.attempts ?? 0) + 1 } });
    return r;
  });
  if (!record) return;
  const files: Data[] = [];
  let extractedBytes = 0;
  for (const f of record.files) {
    try {
      const original = getStorage().bucket().file(f.path), [m] = await original.getMetadata();
      if (Number(m.size) > PORTAL_LIMITS.maxFileBytes || m.contentType !== f.mime) throw new Error('The stored type or size is invalid.');
      const pinned = getStorage().bucket().file(f.path, { generation: m.generation });
      const [bytes] = await pinned.download();
      const result = inspectPortalFile(f.name, bytes), checksum = hash(bytes);
      // Firebase-generated download tokens must never make originals public.
      if (m.metadata?.firebaseStorageDownloadTokens) await original.setMetadata({ metadata: { firebaseStorageDownloadTokens: '' } });
      const duplicates = await db.collection('portalChecksums').where('owner', '==', record.owner).where('checksum', '==', checksum).limit(5).get();
      const duplicateIds = [...new Set(duplicates.docs.map(x => x.get('recordId')).filter(x => x !== id))];
      await db.doc(`portalChecksums/${hash(`${id}:${version}:${f.path}`)}`).set({ owner: record.owner, checksum, recordId: id, version });
      const output = Buffer.from(result.text, 'utf8').subarray(0, Math.max(0, 200000 - extractedBytes));
      extractedBytes += output.length;
      files.push({ ...f, ...result, text: output.toString('utf8').replace(/\uFFFD$/, ''), truncated: output.length < Buffer.byteLength(result.text), size: bytes.length, checksum, generation: String(m.generation), duplicateIds });
    } catch (e) { files.push({ ...f, state: 'failed', error: e instanceof Error ? e.message.slice(0, 300) : 'Inspection failed. Retry or request manual handling.' }); }
  }
  await db.runTransaction(async tx => {
    const current = (await tx.get(ref)).data();
    if (current?.version !== version || current?.status === 'withdrawn' || current?.processing.token !== token) return;
    const processing = { state: files.some(f => f.state === 'failed') ? 'failed' : files.some(f => f.state === 'manual_review') ? 'manual_review' : 'extracted_unverified', files, attempts: current.processing.attempts, finishedAt: stamp(), scan: 'Basic type/signature inspection only. External malware scanning, OCR and transcription are not configured.' };
    tx.update(ref, { processing }); tx.update(ref.collection('versions').doc(String(version)), { processing });
    tx.set(ref.collection('history').doc(`processing-${version}-${current.processing.attempts}`), { action: 'processed', version, at: stamp(), state: processing.state });
  });
}
export const onPortalMaterialWritten = onDocumentWritten({ document: 'portalContributions/{id}', region: 'us-central1', timeoutSeconds: 300, memory: '512MiB', retry: true }, async event => {
  const r = event.data?.after.data();
  if (r?.processing?.state === 'queued') await processPortalMaterial(event.params.id, r.version);
});

async function download(r: PortalRecord, index: number, actor: string) {
  const f = r.processing.files?.[index];
  if (r.status === 'withdrawn' || !f?.generation || f.state === 'failed') throw new HttpsError('failed-precondition', 'This file is not available after inspection.');
  const file = getStorage().bucket().file(f.path, { generation: f.generation });
  const [url] = await file.getSignedUrl({ action: 'read', expires: Date.now() + 5 * 60000, responseDisposition: `attachment; filename="${f.name.replace(/[^\w. -]/g, '_')}"`, responseType: 'application/octet-stream' });
  await collection().doc(r.id).collection('history').add({ action: 'download_link_issued', version: r.version, at: stamp(), actor });
  return { url, expiresInSeconds: 300 };
}
async function withdraw(uid: string, d: Data) {
  const r = await ownerRecord(uid, key(d.id)), db = getFirestore();
  await db.runTransaction(async tx => {
    const ref = collection().doc(r.id), current = (await tx.get(ref)).data();
    if (current?.version !== d.version) throw new HttpsError('failed-precondition', 'Refresh the current version.');
    tx.update(ref, { status: 'withdrawn', withdrawnAt: stamp() });
    tx.set(ref.collection('history').doc(`withdraw-${r.version}`), { action: 'withdrawn', version: r.version, at: stamp(), actor: uid });
    tx.set(db.doc(`portalWithdrawals/${r.id}`), { id: r.id, at: stamp() });
  });
  let cursor = '';
  for (let page = 0; page < 10; page++) {
    let query = db.collection('portalDatasetVersions').where('sourceIds', 'array-contains', r.id).orderBy(FieldPath.documentId()).limit(100);
    if (cursor) query = query.startAfter(cursor);
    const versions = await query.get();
    if (versions.empty) break;
    const batch = db.batch(); versions.docs.forEach(v => batch.update(v.ref, { state: 'affected_by_withdrawal', withdrawnSourceIds: FieldValue.arrayUnion(r.id) })); await batch.commit();
    cursor = versions.docs.at(-1)!.id;
    if (versions.size < 100) break;
  }
  // Exports also recheck the live ancestor on every request, including request retries.
  return { record: await ownerRecord(uid, r.id), notice: 'Excluded from future exports. Existing manifests reference the live withdrawal registry. Withdrawal cannot reverse a completed training run.' };
}

export const portalContribution = onCall(options, guarded('portalContribution', async req => {
  const uid = requireAuth(req), d = object(req.data);
  await requireActiveContributor(uid, { activated: true });
  await consumeRateLimit('portalContribution', uid, 180, 3600000);
  if (d.action === 'capabilities') return ingestionSettings();
  if (d.action === 'beginUpload') {
    await consumeRateLimit('portalMaterialUpload', uid, 40, 3600000);
    const name = text(d.name, 180), kind = portalFileType(name), size = Number(d.size);
    const limits = await ingestionSettings(), profile = (await getFirestore().doc(`contributors/${uid}`).get()).data();
    if (!limits.uploadsEnabled || profile?.permissions?.edit === false) throw new HttpsError('permission-denied', 'Uploads are paused or your editing permission is disabled. Keep your draft.');
    if (!kind || !Number.isInteger(size) || size <= 0 || size > limits.maxFileBytes) throw new HttpsError('invalid-argument', 'Choose an accepted file within the displayed size limit.');
    const requestId = key(d.requestId), path = `portal-originals/${uid}/${key(d.batch)}/${requestId}`;
    const origin = String(req.rawRequest?.headers?.origin ?? '');
    const allowed = ['https://tribestudio.indigenworld.com', 'https://tribestudio.web.app', 'https://tribestudio.firebaseapp.com'];
    if (origin && !allowed.includes(origin) && !(process.env.STORAGE_EMULATOR_HOST && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin))) throw new HttpsError('permission-denied', 'Open the contributor portal to upload material.');
    const [url] = await getStorage().bucket().file(path).createResumableUpload({
      origin: origin || undefined, preconditionOpts: { ifGenerationMatch: 0 },
      metadata: { contentType: kind.mime, contentLength: size, metadata: { portalOwner: uid, originalName: name } },
    });
    return { url, file: { path, name, mime: kind.mime } };
  }
  if (d.action === 'save') return save(uid, d);
  if (d.action === 'summary') {
    const counts = await Promise.all(['draft', 'submitted', 'changes_requested', 'approved', 'rejected', 'disputed', 'withdrawn'].map(async status => [status, (await collection().where('owner', '==', uid).where('status', '==', status).count().get()).data().count]));
    const failed = (await collection().where('owner', '==', uid).where('processing.state', '==', 'failed').count().get()).data().count;
    const unread = (await dbForSummary().where('authUid', '==', uid).where('type', '==', 'portal_review').where('read', '==', false).count().get()).data().count;
    return { counts: Object.fromEntries(counts), failed, unread };
  }
  if (d.action === 'ack') {
    const notices = await dbForSummary().where('authUid', '==', uid).where('type', '==', 'portal_review').where('read', '==', false).limit(100).get();
    const batch = getFirestore().batch(); notices.docs.forEach(doc => batch.update(doc.ref, { read: true })); await batch.commit(); return { acknowledged: notices.size };
  }
  if (d.action === 'list') return listRecords(uid, d);
  if (d.action === 'get') return detail(await ownerRecord(uid, key(d.id)));
  if (d.action === 'withdraw') return withdraw(uid, d);
  if (d.action === 'repair') {
    const id = key(d.id), ref = collection().doc(id), profile = (await getFirestore().doc(`contributors/${uid}`).get()).data();
    if (profile?.permissions?.edit === false) throw new HttpsError('permission-denied', 'Editing is disabled for this contributor.');
    return getFirestore().runTransaction(async tx => {
      const r = (await tx.get(ref)).data() as PortalRecord | undefined;
      if (!r || r.owner !== uid) throw new HttpsError('permission-denied', 'Open your own contribution.');
      if (r.version !== d.version || r.processing.state !== 'failed' || r.status === 'withdrawn') throw new HttpsError('failed-precondition', 'Refresh the failed submission before repairing files.');
      const record = { ...r, version: r.version + 1, status: 'draft', updatedAt: stamp(), processing: { state: 'not_required', attempts: 0, files: [] } };
      tx.set(ref, record); tx.create(ref.collection('versions').doc(String(record.version)), record);
      tx.set(ref.collection('history').doc(`repair-${r.version}`), { action: 'returned_to_draft_after_processing_failure', version: record.version, previousVersion: r.version, at: stamp(), actor: uid });
      return { record };
    });
  }
  if (d.action === 'download') return download(await ownerRecord(uid, key(d.id)), Number(d.index), uid);
  if (d.action === 'retry') {
    const r = await ownerRecord(uid, key(d.id));
    if (r.status === 'withdrawn' || r.processing.attempts >= 5 || !['failed', 'processing'].includes(r.processing.state) || r.processing.state === 'processing' && Date.now() - Date.parse(r.processing.startedAt) < 6 * 60000) throw new HttpsError('failed-precondition', 'This job cannot be retried yet, or needs manual assistance after five attempts.');
    await collection().doc(r.id).update({ 'processing.state': 'queued' }); return { queued: true };
  }
  throw new HttpsError('invalid-argument', 'Unknown contribution action.');
}));

export function portalExportDenials(r: PortalRecord, use: PortalUse, parent?: PortalRecord): string[] {
  const reasons = [];
  if (r.type === 'documents') reasons.push('Source documents are not validated examples.');
  if (r.status !== 'approved' || !r.uses[use] || r.rights.ownership === 'unclear' || r.rights.sensitive || r.rights.confidential || r.rights.cultural) reasons.push('Review, rights, or privacy do not allow this use.');
  if (r.parent && (!parent || parent.status !== 'approved' || parent.version !== r.parent.version || !parent.uses[use] || parent.rights.ownership === 'unclear' || parent.rights.sensitive || parent.rights.confidential || parent.rights.cultural)) reasons.push('The source version is withdrawn, restricted, changed, or not approved for this use.');
  if (r.files.length && !['manual_review', 'extracted_unverified'].includes(r.processing.state)) reasons.push('Files have not completed inspection.');
  return reasons;
}

export const portalContributionReview = onStaffCall(options, guarded('portalContributionReview', async req => {
  const uid = requireAuth(req), d = object(req.data); await reviewer(req);
  await consumeRateLimit('portalContributionReview', uid, 180, 3600000);
  const staffRole = effectiveRole(callerClaims(req)), restricted = staffRole === 'admin' || staffRole === 'super_admin';
  if (d.action === 'settings') { requireRole(req, 'admin'); return ingestionSettings(); }
  if (d.action === 'configure') {
    requireRole(req, 'admin');
    const settings = object(d.settings);
    for (const [k, max] of [['maxFiles', PORTAL_LIMITS.maxFiles], ['maxFileBytes', PORTAL_LIMITS.maxFileBytes], ['maxBatchBytes', PORTAL_LIMITS.maxBatchBytes]] as const) if (!Number.isInteger(settings[k]) || settings[k] < 1 || settings[k] > max) throw new HttpsError('invalid-argument', 'Use upload limits within the published platform ceilings.');
    if (typeof settings.uploadsEnabled !== 'boolean') throw new HttpsError('invalid-argument', 'Choose whether uploads are open.');
    await getFirestore().doc('portalIngestionSettings/current').set({ ...settings, actor: uid, updatedAt: stamp() });
    return ingestionSettings();
  }
  if (d.action === 'list') return listRecords(uid, d, true, restricted);
  const db = getFirestore();
  if (d.action === 'export') {
    requireRole(req, 'admin');
    if (!['training', 'retrieval', 'public'].includes(d.use) || !Array.isArray(d.ids) || !d.ids.length || d.ids.length > 100) throw new HttpsError('invalid-argument', 'Choose a permitted use and 1–100 exact reviewed records.');
    const exportId = `PX-${hash(`${uid}:${key(d.requestId)}`).slice(0, 32)}`;
    const fingerprint = hash(stableStringify({ ids: [...new Set(d.ids)].sort(), use: d.use }));
    // A transaction prevents withdrawal or a review change racing export selection.
    return db.runTransaction(async tx => {
      const old = await tx.get(db.doc(`portalDatasetVersions/${exportId}`));
      if (old.exists && old.get('fingerprint') !== fingerprint) throw new HttpsError('already-exists', 'This export request has different selections.');
      const rows: Data[] = [], manifest: Data[] = [], groupAssignments = new Map<string, string>();
      for (const id of [...new Set(d.ids)] as string[]) {
        const r = (await tx.get(collection().doc(key(id)))).data() as PortalRecord | undefined;
        if (!r) throw new HttpsError('not-found', 'A selected record is unavailable.');
        if (old.exists && !old.get('records').some((entry: Data) => entry.id === r.id && entry.version === r.version)) throw new HttpsError('failed-precondition', 'A selected version changed. Start a new dataset version.');
        const parent = r.parent ? (await tx.get(collection().doc(r.parent.id))).data() as PortalRecord : undefined;
        if (portalExportDenials(r, d.use, parent).length) throw new HttpsError('failed-precondition', `${r.id}: not eligible for this use.`);
        const family = r.parent?.id ?? r.id, speaker = r.type === 'audio' ? r.content.speaker?.normalize('NFC').trim().toLocaleLowerCase('en') : '';
        if (r.type === 'audio' && !speaker) throw new HttpsError('failed-precondition', 'Speech export requires a pseudonymous speaker group.');
        if (r.type === 'audio' && d.use === 'training' && !r.content.transcript?.trim()) throw new HttpsError('failed-precondition', 'Transcribed-speech training exports require a reviewed transcript.');
        // Reserve group splits persistently; a source and a speaker can never cross a split.
        const groups = [family, ...(speaker ? [`speaker:${r.language}:${speaker}`] : [])].map(group => db.doc(`portalDatasetGroups/${hash(group)}`));
        const existing = await Promise.all(groups.map(ref => tx.get(ref)));
        const assigned = [...new Set([...existing.filter(x => x.exists).map(x => x.get('split')), ...groups.flatMap(g => groupAssignments.has(g.id) ? [groupAssignments.get(g.id)!] : [])])];
        if (assigned.length > 1) throw new HttpsError('failed-precondition', 'Source and speaker groups cross dataset splits; resolve the grouping before export.');
        const n = parseInt(hash(family).slice(0, 8), 16) % 100, split = assigned[0] ?? (n < 80 ? 'train' : n < 90 ? 'development' : 'test');
        groups.forEach(g => groupAssignments.set(g.id, split));
        const source = r.parent ? { id: r.parent.id, version: r.parent.version, locator: r.parent.locator, method: r.parent.method } : null;
        rows.push({ id: r.id, version: r.version, taskSchema: `${r.type}-v1`, language: r.language, content: r.content, files: r.processing.files.map((f: Data) => ({ checksum: f.checksum, mime: f.mime, size: f.size })), provenance: r.provenance, permittedUses: r.uses, source, split });
        manifest.push({ id: r.id, version: r.version, source, split, groups: groups.map(x => x.id), reviewerReference: hash(r.reviewer ?? ''), consentVersion: r.consent.version });
      }
      // All reads above precede writes. Store group reservations with the manifest atomically.
      for (const item of manifest) for (const group of item.groups) tx.set(db.doc(`portalDatasetGroups/${group}`), { split: item.split });
      const m = { id: exportId, schema: 'portal-task-manifest-v1', state: 'active', use: d.use, fingerprint, records: manifest, sourceIds: [...new Set(manifest.flatMap(r => [r.id, ...(r.source ? [r.source.id] : [])]))], createdAt: old.get('createdAt') ?? stamp(), withdrawalRegistry: 'portalWithdrawals', notice: 'Recheck current rights and withdrawal registry before using this version.' };
      if (!old.exists) tx.create(db.doc(`portalDatasetVersions/${exportId}`), m);
      const jsonl = rows.map(x => JSON.stringify(x)).join('\n');
      const cell = (x: any) => '"' + String(typeof x === 'object' ? JSON.stringify(x) : x).replace(/^[=+@-]/, "'$&").replace(/"/g, '""') + '"';
      const csv = ['id,version,taskSchema,language,content,provenance,permittedUses,source,split', ...rows.map(r => ['id', 'version', 'taskSchema', 'language', 'content', 'provenance', 'permittedUses', 'source', 'split'].map(k => cell(r[k])).join(','))].join('\r\n');
      return { manifest: m, jsonl, csv };
    });
  }
  const id = key(d.id), ref = collection().doc(id), r = (await ref.get()).data() as PortalRecord | undefined;
  if (!r || r.status === 'draft') throw new HttpsError('not-found', 'Submitted contribution not found.');
  if (!restricted && (r.rights.sensitive || r.rights.confidential || r.rights.cultural)) throw new HttpsError('permission-denied', 'Restricted material requires an authorised administrator and verified staff session.');
  if (d.action === 'get') return detail(r);
  if (d.action === 'download') return download(r, Number(d.index), uid);
  if (r.owner === uid) throw new HttpsError('permission-denied', 'You cannot review your own work.');
  if (d.action === 'candidate') {
    if (r.type !== 'documents' || r.status !== 'approved') throw new HttpsError('failed-precondition', 'Approve this source before creating a separately reviewed candidate.');
    const input = parsePortalRecord(d.record, r.owner);
    if (input.type === 'documents' || input.files.length) throw new HttpsError('invalid-argument', 'Create a text candidate, without copying source files.');
    const locator = text(d.locator, 500); if (!locator) throw new HttpsError('invalid-argument', 'Add a page, row, paragraph or time reference.');
    const cid = `PC-${hash(`${id}:${r.version}:${key(d.requestId)}`).slice(0, 32)}`;
    return db.runTransaction(async tx => {
      const source = (await tx.get(ref)).data() as PortalRecord;
      const prior = await tx.get(collection().doc(cid));
      if (source.status !== 'approved' || source.version !== d.version) throw new HttpsError('failed-precondition', 'Refresh the approved source.');
      if (prior.exists) return { record: prior.data() };
      const candidate = { ...input, id: cid, owner: r.owner, version: 1, status: 'submitted', createdAt: stamp(), updatedAt: stamp(), parent: { id, version: r.version, locator, method: 'reviewer-selected-v1', editor: uid },
        uses: Object.fromEntries(Object.keys(PORTAL_USES).map(k => [k, r.uses[k as PortalUse] && input.uses[k]])), rights: r.rights, consent: r.consent, reward: 'Pending reward assessment', processing: { state: 'not_required', files: [], attempts: 0 } };
      const missing = portalIssues(candidate); if (missing.length) throw new HttpsError('invalid-argument', missing.join(' '));
      tx.create(collection().doc(cid), candidate); tx.create(collection().doc(cid).collection('versions').doc('1'), candidate);
      tx.create(collection().doc(cid).collection('history').doc('derived'), { action: 'candidate_created', version: 1, at: stamp(), source: candidate.parent });
      return { record: candidate };
    });
  }
  if (!['assign', 'decide'].includes(d.action)) throw new HttpsError('invalid-argument', 'Unknown review action.');
  return db.runTransaction(async tx => {
    const current = (await tx.get(ref)).data() as PortalRecord;
    if (current.version !== d.version || current.status === 'withdrawn') throw new HttpsError('failed-precondition', 'Refresh the current version.');
    if (d.action === 'assign') { tx.update(ref, { assignment: uid }); return { assigned: true }; }
    if (!['approved', 'changes_requested', 'rejected', 'disputed'].includes(d.decision) || text(d.note).length < 5) throw new HttpsError('invalid-argument', 'Choose a decision and explain the review in at least five characters.');
    if (current.assignment && current.assignment !== uid) throw new HttpsError('permission-denied', 'This work is assigned to another reviewer.');
    if (d.decision === 'approved' && current.files.length && !['manual_review', 'extracted_unverified'].includes(current.processing.state)) throw new HttpsError('failed-precondition', 'Resolve file inspection failures before approval.');
    if (d.decision === 'approved' && current.parent?.editor === uid) throw new HttpsError('permission-denied', 'A different reviewer must approve a candidate you created.');
    const at = stamp(), eventId = key(d.requestId), historyRef = ref.collection('history').doc(eventId), prior = await tx.get(historyRef);
    if (prior.exists) return { record: current, replayed: true };
    if (current.status === 'disputed' && d.decision === 'approved') requireRole(req, 'admin');
    const record = { ...current, status: d.decision, feedback: text(d.note), reviewer: uid, reviewedAt: at, updatedAt: at };
    tx.set(ref, record); tx.create(historyRef, { action: 'reviewed', version: current.version, at, actor: uid, decision: d.decision, note: record.feedback });
    tx.set(db.doc(`notifications/${hash(`portal:${id}:${eventId}`)}`), { authUid: current.owner, title: 'Contribution review update', body: record.feedback, type: 'portal_review', read: false, createdAt: at, link: `/contributor?panel=submissions&record=${id}` });
    return { record };
  });
}));
function dbForSummary() { return getFirestore().collection('notifications'); }
