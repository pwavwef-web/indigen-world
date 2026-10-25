import { createHash } from 'node:crypto';
import { inflateRawSync, inflateSync } from 'node:zlib';
import { getFirestore, Timestamp, type QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { logger } from 'firebase-functions';
import { HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import {
  FORM_LIMITS, UPLOAD_FORMATS, attachmentsIn, matchUploadFormat, topLevelFields, uploadField,
  type AttachmentRef, type FormDefinition, type FormField,
} from '@indigen-world/contracts/forms';
import {
  FORMS_REGION, RESPONSES, UPLOAD_PREFIX, UPLOADS, countsDelta, docId, formRef, loadVersion, newDocId, nowIso, versionRef,
  type ResponseDoc, type UploadDoc, type VersionDoc,
} from './forms-common.js';

/**
 * Indigen Forms uploads: server-issued resumable sessions, signature
 * inspection and cleanup (docs/architecture/indigen-forms.md, "Uploads").
 *
 * Files go to `form-uploads/{uid}/{uploadId}`, which storage.rules close to
 * every client. The browser only ever holds a one-object resumable session
 * created here with `ifGenerationMatch: 0`, so it cannot overwrite anything,
 * and a file only becomes usable in an answer once confirmUpload has read its
 * real bytes and identified the format by signature. There is no malware
 * scanner in the platform; this is signature inspection and says so.
 */

/* -- Signature inspection (pure) ------------------------------------------------------- */

export type UploadInspection = { ok: true; format: string } | { ok: false; reason: string };

/** Media formats are identified from their leading bytes; documents are inspected whole. */
export const INSPECT_HEAD_BYTES = 64 * 1024;
const MAX_DOCX_EXPANDED = 50 * 1024 * 1024;
const MAX_DOCX_ENTRIES = 1000;
const MAX_PART_BYTES = 2 * 1024 * 1024;
const MAX_PDF_INFLATE = 50 * 1024 * 1024;

const refuse = (reason: string): UploadInspection => ({ ok: false, reason });
const latin1 = (bytes: Buffer, start: number, end: number) => bytes.subarray(start, end).toString('latin1');

/** Windows PE, ELF, Mach-O / Java class and script interpreters are refused whatever the name says. */
function isExecutable(bytes: Buffer): boolean {
  if (bytes.length >= 2 && bytes[0] === 0x4d && bytes[1] === 0x5a) return true;
  if (latin1(bytes, 0, 4) === '\x7fELF') return true;
  const magic = bytes.length >= 4 ? bytes.readUInt32BE(0) : 0;
  if ([0xfeedface, 0xfeedfacf, 0xcefaedfe, 0xcffaedfe, 0xcafebabe].includes(magic)) return true;
  return latin1(bytes, 0, 2) === '#!';
}

/** An MPEG-1/2 layer I–III frame header (not ADTS, whose layer bits are zero). */
function mpegAudioFrame(bytes: Buffer): boolean {
  if (bytes.length < 4 || bytes[0] !== 0xff || (bytes[1] & 0xe0) !== 0xe0) return false;
  const version = (bytes[1] >> 3) & 3;
  const layer = (bytes[1] >> 1) & 3;
  const bitrate = bytes[2] >> 4;
  const rate = (bytes[2] >> 2) & 3;
  return version !== 1 && layer !== 0 && bitrate !== 15 && rate !== 3;
}

/** An AAC ADTS frame header (the `.aac` extension of the m4a format). */
function adtsFrame(bytes: Buffer): boolean {
  return bytes.length >= 4 && bytes[0] === 0xff && (bytes[1] & 0xf6) === 0xf0 && ((bytes[2] >> 2) & 0x0f) < 13;
}

/** EBML variable-length integer at `offset`: its length in bytes and value. */
function ebmlVint(bytes: Buffer, offset: number): { length: number; value: number } | null {
  const first = bytes[offset];
  if (first === undefined || first === 0) return null;
  let length = 1;
  while (length <= 8 && !(first & (0x80 >> (length - 1)))) length += 1;
  if (length > 8 || offset + length > bytes.length) return null;
  let value = first & (0xff >> length);
  for (let i = 1; i < length; i += 1) value = value * 256 + bytes[offset + i];
  return { length, value };
}

/** The DocType of an EBML header ("webm", "matroska"), or null. */
function ebmlDocType(bytes: Buffer): string | null {
  const limit = Math.min(bytes.length - 2, 256);
  for (let i = 4; i < limit; i += 1) {
    if (bytes[i] !== 0x42 || bytes[i + 1] !== 0x82) continue;
    const size = ebmlVint(bytes, i + 2);
    if (!size || size.value > 32) continue;
    const start = i + 2 + size.length;
    return latin1(bytes, start, start + size.value).replace(/\0+$/, '');
  }
  return null;
}

const ISO_AUDIO_BRANDS = new Set(['M4A ', 'M4B ', 'M4P ', 'F4A ', 'F4B ']);
const ISO_VIDEO_BRANDS = new Set(['M4V ', 'M4VH', 'M4VP', 'F4V ', 'F4P ', 'avc1']);
const ISO_GENERIC_BRANDS = new Set([
  'isom', 'iso2', 'iso3', 'iso4', 'iso5', 'iso6', 'iso7', 'iso8', 'iso9', 'mp41', 'mp42', 'mp71',
  'dash', 'mmp4', 'MSNV', 'NDAS', '3gp4', '3gp5', '3gp6', '3gp7', '3g2a', '3g2b', '3g2c',
]);
const QUICKTIME_ATOMS = new Set(['moov', 'wide', 'mdat', 'free', 'skip', 'pnot']);

/** Candidate formats for an ISO base media (`ftyp`) file, from its major then compatible brands. */
function isoCandidates(bytes: Buffer): string[] {
  const boxSize = bytes.readUInt32BE(0);
  const brands = [latin1(bytes, 8, 12)];
  for (let offset = 16; offset + 4 <= Math.min(boxSize, bytes.length, 256); offset += 4) brands.push(latin1(bytes, offset, offset + 4));
  for (const brand of brands) {
    if (brand === 'qt  ') return ['mov'];
    if (ISO_AUDIO_BRANDS.has(brand)) return ['m4a'];
    if (ISO_VIDEO_BRANDS.has(brand)) return ['mp4'];
    if (ISO_GENERIC_BRANDS.has(brand)) return ['m4a', 'mp4'];
  }
  return [];
}

/** Every UPLOAD_FORMATS key these leading bytes are consistent with (empty: no binary signature). */
function signatureCandidates(bytes: Buffer): string[] {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return ['jpeg'];
  if (bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a') return ['png'];
  if (latin1(bytes, 0, 5) === '%PDF-') return ['pdf'];
  const four = latin1(bytes, 0, 4);
  if (four === 'RIFF') {
    const kind = latin1(bytes, 8, 12);
    if (kind === 'WEBP') return ['webp'];
    if (kind === 'WAVE') return ['wav'];
    return ['riff'];
  }
  if (four === 'OggS') return ['ogg'];
  if (four === 'fLaC') return ['flac'];
  if (bytes.subarray(0, 4).toString('hex') === '1a45dfa3') return ebmlDocType(bytes) === 'webm' ? ['webm_audio', 'webm_video'] : ['matroska'];
  if (bytes.length >= 12 && latin1(bytes, 4, 8) === 'ftyp') return isoCandidates(bytes);
  if (bytes.length >= 8 && QUICKTIME_ATOMS.has(latin1(bytes, 4, 8))) return ['mov'];
  if (latin1(bytes, 0, 3) === 'ID3' || mpegAudioFrame(bytes)) return ['mp3'];
  if (adtsFrame(bytes)) return ['m4a'];
  if (bytes.length >= 4 && bytes.readUInt32LE(0) === 0x04034b50) return ['docx'];
  return [];
}

const ACTIVE_PDF = /\/(JavaScript|JS|Launch|EmbeddedFiles?|RichMedia|XFA|GoToE|ImportData|SubmitForm)\b/;

/** PDF names may hide letters as `#xx` escapes (`/J#61vaScript`); decode them before matching. */
function pdfNames(text: string): string {
  return text.replace(/#([0-9A-Fa-f]{2})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
}

function pdfProblem(bytes: Buffer): string | null {
  const text = bytes.toString('latin1');
  const names = pdfNames(text);
  if (ACTIVE_PDF.test(names)) return 'PDFs with scripts, actions that open other programs or embedded files are not accepted.';
  if (/\/Encrypt\b/.test(names)) return 'Password-protected or encrypted PDFs are not accepted. Save an unprotected copy and upload that.';
  // Dictionaries can also sit compressed inside object streams; inflate those (bounded) and look again.
  let inflated = 0;
  const streams = /stream\r?\n/g;
  let match: RegExpExecArray | null;
  let checked = 0;
  while ((match = streams.exec(text)) && checked < 500) {
    if (text.slice(match.index - 3, match.index) === 'end') continue;
    const dictionaryStart = Math.max(text.lastIndexOf('obj', match.index), match.index - 2000);
    const dictionary = pdfNames(text.slice(dictionaryStart, match.index));
    if (!/\/ObjStm\b/.test(dictionary)) continue;
    checked += 1;
    const start = match.index + match[0].length;
    const end = text.indexOf('endstream', start);
    if (end < 0) break;
    if (!/\/FlateDecode\b/.test(dictionary)) continue;
    try {
      const decoded = inflateSync(bytes.subarray(start, end), { maxOutputLength: Math.max(1, Math.min(MAX_PART_BYTES * 10, MAX_PDF_INFLATE - inflated)) });
      inflated += decoded.length;
      if (ACTIVE_PDF.test(pdfNames(decoded.toString('latin1')))) return 'PDFs with scripts, actions that open other programs or embedded files are not accepted.';
    } catch {
      // A stream that does not inflate cannot hide a dictionary from a reader either.
    }
    if (inflated >= MAX_PDF_INFLATE) return 'This PDF is too complex to inspect. Save a simpler copy and upload that.';
  }
  return null;
}

interface ZipEntry { name: string; method: number; compressedSize: number; size: number; localOffset: number }

/** Central directory of a zip, read without extracting anything. */
function zipEntries(bytes: Buffer): ZipEntry[] | string {
  const invalid = 'This is not a valid Word document.';
  const floor = Math.max(0, bytes.length - 22 - 0xffff);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= floor; i -= 1) {
    if (bytes.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) return invalid;
  if (bytes.readUInt16LE(eocd + 4) !== 0 || bytes.readUInt16LE(eocd + 6) !== 0) return invalid;
  const total = bytes.readUInt16LE(eocd + 10);
  const directorySize = bytes.readUInt32LE(eocd + 12);
  const directoryOffset = bytes.readUInt32LE(eocd + 16);
  if (total === 0xffff || directoryOffset === 0xffffffff || directorySize === 0xffffffff) return 'Very large Word documents are not supported. Save a smaller copy.';
  if (!total || directoryOffset + directorySize > eocd) return invalid;
  if (total > MAX_DOCX_ENTRIES) return 'This Word document has too many parts to inspect.';
  const entries: ZipEntry[] = [];
  let position = directoryOffset;
  for (let n = 0; n < total; n += 1) {
    if (position + 46 > eocd || bytes.readUInt32LE(position) !== 0x02014b50) return invalid;
    if (bytes.readUInt16LE(position + 8) & 1) return 'Password-protected or encrypted Word documents are not accepted.';
    const nameLength = bytes.readUInt16LE(position + 28);
    const extraLength = bytes.readUInt16LE(position + 30);
    const commentLength = bytes.readUInt16LE(position + 32);
    entries.push({
      name: bytes.subarray(position + 46, position + 46 + nameLength).toString('utf8'),
      method: bytes.readUInt16LE(position + 10),
      compressedSize: bytes.readUInt32LE(position + 20),
      size: bytes.readUInt32LE(position + 24),
      localOffset: bytes.readUInt32LE(position + 42),
    });
    position += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function zipPart(bytes: Buffer, entry: ZipEntry): string | null {
  const local = entry.localOffset;
  if (local + 30 > bytes.length || bytes.readUInt32LE(local) !== 0x04034b50) return null;
  const start = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28);
  const data = bytes.subarray(start, start + entry.compressedSize);
  if (entry.method === 0) return data.subarray(0, MAX_PART_BYTES).toString('utf8');
  if (entry.method !== 8) return null;
  try {
    return inflateRawSync(data, { maxOutputLength: MAX_PART_BYTES }).toString('utf8');
  } catch {
    return null;
  }
}

/** Relationship types that pull in remote templates, OLE objects or other documents. */
const EXTERNAL_RELATIONSHIP = /(attachedTemplate|oleObject|frame|subDocument|externalLink|package|control)$/i;

function docxProblem(bytes: Buffer): string | null {
  const entries = zipEntries(bytes);
  if (typeof entries === 'string') return entries;
  const names = new Set(entries.map((entry) => entry.name));
  if (!names.has('[Content_Types].xml') || !names.has('word/document.xml')) return 'This is not a valid Word document.';
  let expanded = 0;
  for (const entry of entries) {
    expanded += entry.size;
    if (/(^|\/)\.\.(\/|$)|^\/|\\/.test(entry.name)) return 'This Word document is malformed.';
    if (/vbaProject|vbaData|\.bin$|activeX\/|embeddings\/|oleObject|externalLinks\//i.test(entry.name)) {
      return 'Word documents with macros, embedded objects or external links are not accepted. Save it as a plain .docx and upload that.';
    }
  }
  if (expanded > MAX_DOCX_EXPANDED) return 'This Word document is too large to inspect.';
  const contentTypes = zipPart(bytes, entries.find((entry) => entry.name === '[Content_Types].xml')!);
  if (contentTypes === null || !contentTypes.includes('wordprocessingml.document.main+xml')) return 'This is not a valid Word document (templates and macro-enabled documents are not accepted).';
  if (/macroEnabled|vbaProject|activeX|oleObject/i.test(contentTypes)) return 'Word documents with macros or embedded objects are not accepted.';
  for (const entry of entries.filter((item) => item.name.endsWith('.rels')).slice(0, 100)) {
    const rels = zipPart(bytes, entry);
    if (rels === null) return 'This Word document is malformed.';
    for (const [tag] of rels.matchAll(/<Relationship\b[^>]*>/g)) {
      const type = /\bType="([^"]*)"/.exec(tag)?.[1] ?? '';
      if (/\bTargetMode="External"/i.test(tag) && EXTERNAL_RELATIONSHIP.test(type)) {
        return 'Word documents that load remote templates or external content are not accepted.';
      }
    }
  }
  return null;
}

function textProblem(bytes: Buffer): string | null {
  if (bytes.includes(0)) return 'This does not look like a plain text file.';
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return 'Text files must be saved as UTF-8.';
  }
  if (/<\s*(script|iframe|html|svg|object|embed)\b|<!doctype\s+html|<\?php/i.test(text)) {
    return 'Web pages, scripts and SVG drawings are not accepted. Upload plain text.';
  }
  return null;
}

/**
 * Identify a file by its bytes and accept it only if the real format is one of
 * `allowedFormats` (UPLOAD_FORMATS keys). The name and declared type play no
 * part, so renaming a file never gets it past this check. Media formats need
 * only the leading bytes (INSPECT_HEAD_BYTES); PDF, Word and text files must
 * be passed whole, because their active content can sit anywhere.
 */
export function inspectFormUpload(bytes: Buffer, allowedFormats: readonly string[]): UploadInspection {
  const allowed = allowedFormats.filter((key) => Object.prototype.hasOwnProperty.call(UPLOAD_FORMATS, key));
  if (!bytes.length) return refuse('The file is empty.');
  if (isExecutable(bytes)) return refuse('Programs and executable files are not accepted.');
  const candidates = signatureCandidates(bytes);
  if (candidates.length) {
    const format = candidates.find((key) => allowed.includes(key));
    if (!format) {
      const label = UPLOAD_FORMATS[candidates[0]]?.label;
      return refuse(label ? `This file is a ${label}, which this question does not accept. Renaming a file does not change its format.` : 'This file’s format is not accepted for this question.');
    }
    const problem = format === 'pdf' ? pdfProblem(bytes) : format === 'docx' ? docxProblem(bytes) : null;
    return problem ? refuse(problem) : { ok: true, format };
  }
  if (allowed.includes('txt')) {
    const problem = textProblem(bytes);
    return problem ? refuse(problem) : { ok: true, format: 'txt' };
  }
  return refuse('The file’s contents do not match an accepted format. Renaming a file does not change its format.');
}

/* -- Upload sessions ------------------------------------------------------------------------ */

const ALLOWED_ORIGINS = ['https://tribestudio.indigenworld.com', 'https://tribestudio.web.app', 'https://tribestudio.firebaseapp.com'];
const MB = 1024 * 1024;

function uploadRef(uploadId: string) {
  return getFirestore().collection(UPLOADS).doc(uploadId);
}

function cleanName(value: unknown): string {
  if (typeof value !== 'string') throw new HttpsError('invalid-argument', 'The file needs a name.');
  const name = value.trim();
  if (!name || name.length > 200 || /[\u0000-\u001f\u007f/\\]/.test(name)) throw new HttpsError('invalid-argument', 'Use a file name of at most 200 characters.');
  return name;
}

function maxBytesFor(field: FormField): number {
  return Math.max(1, field.settings?.maxSizeMb ?? 1) * MB;
}

/** Whether the upload belongs to a document format, which is inspected whole. */
function isDocumentFormat(format: string): boolean {
  return UPLOAD_FORMATS[format]?.kind === 'document';
}

/** A pending upload this old was abandoned; it stops counting against its question's limits. */
const STALE_PENDING_MS = 60 * 60 * 1000;

/**
 * How many uploads one question may hold for a response: `pending` still
 * uploading, and `total` pending or ready (room for replacing files). A
 * question inside a repeatable group shares one count across every entry, so
 * its bounds grow with the entries the group allows.
 */
export function uploadBounds(definition: FormDefinition, field: FormField): { pending: number; total: number } {
  const group = topLevelFields(definition)
    .map(({ field: top }) => top)
    .find((top) => top.type === 'group' && (top.fields ?? []).some((sub) => sub.id === field.id));
  const entries = group ? Math.max(1, Math.min(group.settings?.maxItems ?? 5, FORM_LIMITS.maxGroupItems)) : 1;
  const capacity = Math.max(1, field.settings?.maxFiles ?? 1) * entries;
  return { pending: capacity + 2, total: Math.max(FORM_LIMITS.maxFilesPerField, capacity) * 2 };
}

/**
 * Register an upload for one upload question of a response the caller owns and
 * return a resumable session for exactly that object. The caller has already
 * checked the response is editable and the contributor may use the form.
 */
export async function beginFormUpload(input: {
  uid: string;
  response: ResponseDoc;
  definition: FormDefinition;
  data: Record<string, unknown>;
  origin: string;
}): Promise<{ uploadId: string; uploadUrl: string; maxBytes: number }> {
  const { uid, response, definition, data } = input;
  if (!definition.submission.allowAttachments) throw new HttpsError('failed-precondition', 'This form does not accept attachments.');
  const fieldId = typeof data.fieldId === 'string' ? data.fieldId : '';
  const field = uploadField(definition, fieldId);
  if (!field) throw new HttpsError('invalid-argument', 'This question does not take files.');
  const name = cleanName(data.name);
  const contentType = typeof data.contentType === 'string' ? data.contentType.split(';')[0].trim().toLowerCase() : '';
  const format = matchUploadFormat(field, name, contentType);
  if (!format) {
    const accepted = (field.settings?.formats ?? []).map((key) => UPLOAD_FORMATS[key]?.extensions[0]?.toUpperCase()).filter(Boolean).join(', ');
    throw new HttpsError('invalid-argument', `This file type is not accepted here. Accepted: ${accepted}.`, { reason: 'format' });
  }
  const maxBytes = maxBytesFor(field);
  const size = data.size as number;
  if (!Number.isInteger(size) || size <= 0 || size > maxBytes) {
    throw new HttpsError('invalid-argument', `Files for this question must be ${field.settings?.maxSizeMb} MB or smaller.`, { reason: 'size' });
  }
  const origin = input.origin;
  const local = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin) && (process.env.STORAGE_EMULATOR_HOST || process.env.FUNCTIONS_EMULATOR === 'true');
  if (origin && !ALLOWED_ORIGINS.includes(origin) && !local) throw new HttpsError('permission-denied', 'Open the contributor portal to upload files.');

  // Files still uploading for this question are bounded, so a client cannot mint unlimited sessions.
  // An upload still pending after an hour was abandoned (a dropped connection, a closed tab): it no
  // longer counts, so the contributor can start again; the daily sweep deletes it.
  const existing = await getFirestore().collection(UPLOADS).where('responseId', '==', response.id).limit(500).get();
  const staleBefore = new Date(Date.now() - STALE_PENDING_MS).toISOString();
  const forField = existing.docs.map((doc) => doc.data() as UploadDoc)
    .filter((upload) => upload.fieldId === field.id && upload.ownerUid === uid)
    .filter((upload) => upload.status === 'ready' || (upload.status === 'pending' && upload.createdAt >= staleBefore));
  const { pending, total } = uploadBounds(definition, field);
  if (forField.filter((upload) => upload.status === 'pending').length >= pending) {
    throw new HttpsError('resource-exhausted', 'Finish or remove the uploads already in progress for this question first.');
  }
  if (forField.length >= total) {
    throw new HttpsError('resource-exhausted', 'Too many files have been uploaded for this question. Remove some first.');
  }

  const uploadId = newDocId('up');
  const path = `${UPLOAD_PREFIX}/${uid}/${uploadId}`;
  const upload: UploadDoc = {
    id: uploadId,
    ownerUid: uid,
    responseId: response.id,
    formId: response.formId,
    formVersion: response.formVersion,
    fieldId: field.id,
    path,
    name,
    declaredType: contentType,
    declaredSize: size,
    status: 'pending',
    format: null,
    contentType: null,
    size: null,
    generation: null,
    sha256: null,
    rejectionReason: null,
    createdAt: nowIso(),
    confirmedAt: null,
  };
  await uploadRef(uploadId).create(upload);
  try {
    const [uploadUrl] = await getStorage().bucket().file(path).createResumableUpload({
      origin: origin || undefined,
      preconditionOpts: { ifGenerationMatch: 0 },
      metadata: { contentType, contentLength: size, metadata: { formsOwner: uid, uploadId, responseId: response.id } },
    });
    return { uploadId, uploadUrl, maxBytes };
  } catch (error) {
    await uploadRef(uploadId).delete().catch(() => undefined);
    throw error;
  }
}

/** Streams the object once: hashes all of it and keeps the head (or all of a document). */
async function readObject(file: ReturnType<ReturnType<ReturnType<typeof getStorage>['bucket']>['file']>, keepAll: boolean, limit: number): Promise<{ bytes: Buffer; sha256: string; total: number }> {
  const hash = createHash('sha256');
  const chunks: Buffer[] = [];
  let kept = 0;
  let total = 0;
  for await (const chunk of file.createReadStream() as AsyncIterable<Buffer>) {
    total += chunk.length;
    if (total > limit) throw new HttpsError('invalid-argument', 'The uploaded file is larger than allowed.', { reason: 'rejected-file' });
    hash.update(chunk);
    if (keepAll || kept < INSPECT_HEAD_BYTES) {
      const part = keepAll ? chunk : chunk.subarray(0, INSPECT_HEAD_BYTES - kept);
      chunks.push(part);
      kept += part.length;
    }
  }
  return { bytes: Buffer.concat(chunks), sha256: hash.digest('hex'), total };
}

function attachmentOf(upload: UploadDoc): AttachmentRef {
  return { id: upload.id, name: upload.name, contentType: upload.contentType ?? upload.declaredType, size: upload.size ?? upload.declaredSize };
}

/**
 * Read the uploaded object's real metadata and bytes, identify the format by
 * signature, and either mark the upload ready (with sha256, size and the
 * pinned generation) or delete the object and refuse it with a reason.
 */
export async function confirmFormUpload(uid: string, data: Record<string, unknown>): Promise<{ attachment: AttachmentRef }> {
  const uploadId = docId(data.uploadId, 'Upload');
  const snap = await uploadRef(uploadId).get();
  const upload = snap.data() as UploadDoc | undefined;
  if (!upload || upload.ownerUid !== uid) throw new HttpsError('not-found', 'This upload does not exist.');
  if (upload.status === 'ready') return { attachment: attachmentOf(upload) };
  if (upload.status === 'rejected') throw new HttpsError('invalid-argument', upload.rejectionReason ?? 'This file was not accepted.', { reason: 'rejected-file' });
  if (upload.status !== 'pending') throw new HttpsError('failed-precondition', 'This upload was removed. Upload the file again.');

  const version = await loadVersion(upload.formId, upload.formVersion);
  const field = uploadField(version.definition, upload.fieldId);
  const declaredFormat = field ? matchUploadFormat(field, upload.name, upload.declaredType) : null;
  const bucket = getStorage().bucket();
  let metadata: Record<string, any>;
  try {
    [metadata] = await bucket.file(upload.path).getMetadata();
  } catch (error) {
    if ((error as { code?: number }).code === 404) throw new HttpsError('failed-precondition', 'The upload has not finished yet. Try again in a moment.', { reason: 'incomplete' });
    throw error;
  }
  const generation = String(metadata.generation ?? '');
  const pinned = bucket.file(upload.path, { generation: Number(generation) });
  const size = Number(metadata.size);
  const contentType = String(metadata.contentType ?? '').split(';')[0].trim().toLowerCase();

  const reject = async (reason: string): Promise<never> => {
    await pinned.delete({ ignoreNotFound: true }).catch((error) => logger.warn('Form upload delete failed', { uploadId, code: (error as { code?: unknown }).code ?? null }));
    await getFirestore().runTransaction(async (tx) => {
      const current = (await tx.get(uploadRef(uploadId))).data() as UploadDoc | undefined;
      if (current?.status !== 'pending') return;
      tx.update(uploadRef(uploadId), { status: 'rejected', rejectionReason: reason, generation: generation || null, confirmedAt: nowIso() });
    });
    throw new HttpsError('invalid-argument', reason, { reason: 'rejected-file' });
  };

  if (!field || !declaredFormat) return reject('This question no longer accepts this file.');
  const maxBytes = maxBytesFor(field);
  if (!Number.isInteger(size) || size <= 0 || size > maxBytes) return reject(`Files for this question must be ${field.settings?.maxSizeMb} MB or smaller.`);
  if (size !== upload.declaredSize) return reject('The uploaded file is not the file that was announced. Upload it again.');
  if (contentType !== upload.declaredType) return reject('The uploaded file’s type changed during upload. Upload it again.');

  const { bytes, sha256, total } = await readObject(pinned, isDocumentFormat(declaredFormat), maxBytes);
  if (total !== size) return reject('The uploaded file could not be read completely. Upload it again.');
  const inspection = inspectFormUpload(bytes, [declaredFormat]);
  if (!inspection.ok) return reject(inspection.reason);

  // Firebase download tokens would make the object readable by URL; these files are reached only through signed links.
  if (metadata.metadata?.firebaseStorageDownloadTokens) {
    await bucket.file(upload.path).setMetadata({ metadata: { firebaseStorageDownloadTokens: '' } });
  }
  const ready = await getFirestore().runTransaction(async (tx) => {
    const current = (await tx.get(uploadRef(uploadId))).data() as UploadDoc | undefined;
    if (!current) throw new HttpsError('not-found', 'This upload does not exist.');
    if (current.status === 'ready') return current;
    if (current.status !== 'pending') throw new HttpsError('failed-precondition', 'This upload was removed. Upload the file again.');
    const update = { status: 'ready' as const, format: inspection.format, contentType, size, generation, sha256, rejectionReason: null, confirmedAt: nowIso() };
    tx.update(uploadRef(uploadId), update);
    return { ...current, ...update };
  });
  return { attachment: attachmentOf(ready) };
}

/**
 * Remove an upload the contributor no longer wants. The file stays while
 * anything saved still lists it: a submitted revision (earlier revisions still
 * point at it), or the saved draft, whose answers may not have caught up with
 * the page yet (a removal that is never saved must not break the draft). Such a
 * file is marked unused when a submission stops using it, and the daily sweep
 * deletes it; the contributor simply stops referring to it.
 *
 * The check and the mark happen in one transaction with the response, so a
 * submit that races this call either commits first (and keeps the file) or
 * finds it removed and refuses it. The object is deleted only after that.
 */
export async function removeFormUpload(uid: string, data: Record<string, unknown>): Promise<{ removed: true }> {
  const uploadId = docId(data.uploadId, 'Upload');
  const db = getFirestore();
  const path = await db.runTransaction(async (tx) => {
    const upload = (await tx.get(uploadRef(uploadId))).data() as UploadDoc | undefined;
    if (!upload || upload.ownerUid !== uid) throw new HttpsError('not-found', 'This upload does not exist.');
    if (upload.status === 'removed') return null;
    const response = (await tx.get(db.collection(RESPONSES).doc(upload.responseId))).data() as ResponseDoc | undefined;
    if (response) {
      if ((response.attachmentIds ?? []).includes(uploadId)) return null;
      if (response.workingAnswers) {
        const version = (await tx.get(versionRef(response.formId, response.formVersion))).data() as VersionDoc | undefined;
        if (!version || attachmentsIn(version.definition, response.workingAnswers).some((ref) => ref.id === uploadId)) return null;
      }
    }
    tx.update(uploadRef(uploadId), { status: 'removed' });
    return upload.path;
  });
  if (path) await getStorage().bucket().file(path).delete({ ignoreNotFound: true });
  return { removed: true };
}

/**
 * Upload ids registered to a response that the new answers no longer use and
 * no submitted revision ever used: marked removed in the submitting
 * transaction, deleted by the daily sweep.
 */
export function unusedUploads(uploads: UploadDoc[], keep: Set<string>): string[] {
  return uploads.filter((upload) => (upload.status === 'pending' || upload.status === 'ready') && !keep.has(upload.id)).map((upload) => upload.id);
}

/* -- Cleanup --------------------------------------------------------------------------------- */

const DAY = 24 * 60 * 60 * 1000;
/** Resumable sessions expire after a week; until then a late upload can still land on a swept path. */
const SESSION_LIFETIME = 8 * DAY;
/** Never-submitted responses of forms without drafts are abandoned after this long. */
const ABANDONED_DRAFT = 30 * DAY;

/**
 * One sweep.
 *
 * Uploads that never became usable (pending), failed inspection (rejected) or
 * were removed lose their object once they are a day old. The record stays,
 * marked removed, until every resumable session issued for it has expired, so
 * a late upload that lands in between is deleted by the next sweep too.
 *
 * Responses that were never submitted, on a form version that does not offer
 * drafts, are deleted with their uploads after thirty days untouched (the
 * contributor never saw them as drafts; they only existed to hold uploads).
 *
 * An upload whose id any response lists in `attachmentIds` is never deleted,
 * whatever its status says.
 */
export async function sweepFormUploadsOnce(now = Date.now(), pageLimit = 300): Promise<{ deleted: number; kept: number; draftsRemoved: number }> {
  const db = getFirestore();
  const cutoff = new Date(now - DAY).toISOString();
  const expired = new Date(now - SESSION_LIFETIME).toISOString();
  let deleted = 0;
  let kept = 0;
  const responses = new Map<string, ResponseDoc | undefined>();
  let last: QueryDocumentSnapshot | null = null;
  for (let page = 0; page < 10; page += 1) {
    let query = db.collection(UPLOADS)
      .where('status', 'in', ['pending', 'rejected', 'removed'])
      .where('createdAt', '<', cutoff)
      .orderBy('createdAt', 'asc')
      .limit(pageLimit);
    if (last) query = query.startAfter(last);
    const snap = await query.get();
    for (const doc of snap.docs) {
      const upload = doc.data() as UploadDoc;
      if (!responses.has(upload.responseId)) {
        responses.set(upload.responseId, (await db.collection(RESPONSES).doc(upload.responseId).get()).data() as ResponseDoc | undefined);
      }
      if ((responses.get(upload.responseId)?.attachmentIds ?? []).includes(upload.id) || !upload.path.startsWith(`${UPLOAD_PREFIX}/${upload.ownerUid}/`)) {
        kept += 1;
        continue;
      }
      await getStorage().bucket().file(upload.path).delete({ ignoreNotFound: true });
      if (upload.createdAt < expired) {
        await doc.ref.delete();
        deleted += 1;
      } else if (upload.status === 'pending') {
        await doc.ref.update({ status: 'removed' });
      }
    }
    if (snap.size < pageLimit) break;
    last = snap.docs[snap.docs.length - 1];
  }

  let draftsRemoved = 0;
  const stale = await db.collection(RESPONSES)
    .where('status', '==', 'draft')
    .where('updatedAt', '<', new Date(now - ABANDONED_DRAFT).toISOString())
    .orderBy('updatedAt', 'asc')
    .limit(100)
    .get();
  const versions = new Map<string, VersionDoc | undefined>();
  for (const doc of stale.docs) {
    const response = doc.data() as ResponseDoc;
    if (response.revision !== 0) continue;
    const key = `${response.formId}/${response.formVersion}`;
    if (!versions.has(key)) versions.set(key, (await versionRef(response.formId, response.formVersion).get()).data() as VersionDoc | undefined);
    if (versions.get(key)?.definition.submission.allowDrafts !== false) continue;
    const removed = await db.runTransaction(async (tx) => {
      const fresh = (await tx.get(doc.ref)).data() as ResponseDoc | undefined;
      if (!fresh || fresh.status !== 'draft' || fresh.revision !== 0 || fresh.updatedAt !== response.updatedAt) return false;
      tx.delete(doc.ref);
      tx.update(formRef(fresh.formId), countsDelta('draft', null));
      return true;
    });
    if (!removed) continue;
    await db.recursiveDelete(doc.ref);
    await deleteDraftUploads(doc.id, response.contributorUid);
    draftsRemoved += 1;
  }
  return { deleted, kept, draftsRemoved };
}

/** Deletes every upload of a never-submitted draft that is being discarded. */
export async function deleteDraftUploads(responseId: string, ownerUid: string): Promise<void> {
  const db = getFirestore();
  const uploads = await db.collection(UPLOADS).where('responseId', '==', responseId).limit(500).get();
  for (const doc of uploads.docs) {
    const upload = doc.data() as UploadDoc;
    if (upload.ownerUid !== ownerUid || !upload.path.startsWith(`${UPLOAD_PREFIX}/${ownerUid}/`)) continue;
    await getStorage().bucket().file(upload.path).delete({ ignoreNotFound: true });
    await doc.ref.delete();
  }
}

export const sweepFormUploads = onSchedule({ schedule: 'every 24 hours', region: FORMS_REGION, timeoutSeconds: 540 }, async () => {
  const result = await sweepFormUploadsOnce();
  logger.info('Form uploads swept', result);
});

/** Idempotency records expire on their own (TTL on `expiresAt`). */
export function requestExpiry(days: number): Timestamp {
  return Timestamp.fromMillis(Date.now() + days * DAY);
}
