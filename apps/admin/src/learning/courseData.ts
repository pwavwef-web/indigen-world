import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { getDownloadURL, getStorage, ref, uploadBytes } from 'firebase/storage';
import { app, db, functions } from '../firebase';

/**
 * The course outline and the two review desks behind it: units, the Nano
 * Banana illustration desk, and pronunciation recordings from Speak practice.
 *
 * Every Vertex call happens in the `generateLearnIllustration` Function. This
 * console sends a prompt and reads back a record; it holds no credential and
 * never talks to Vertex itself.
 */

const storage = getStorage(app);

// ---------------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------------

export interface CourseUnit {
  id: string;
  courseId: string;
  order: number;
  title: string;
  subtitle: string;
  published: boolean;
  imageUrl: string;
  imageAttribution: string;
}

export function emptyUnit(order: number): CourseUnit {
  return {
    id: '',
    courseId: 'kasem',
    order,
    title: '',
    subtitle: '',
    published: false,
    imageUrl: '',
    imageAttribution: '',
  };
}

export function unitProblems(unit: CourseUnit): string[] {
  const problems: string[] = [];
  if (!unit.title.trim()) problems.push('Give the unit a title.');
  if (unit.title.trim().length > 120) problems.push('Keep the title under 120 characters.');
  if (!Number.isInteger(unit.order) || unit.order < 1) problems.push('The unit number must be 1 or more.');
  if (!/^[a-z0-9-]{1,40}$/.test(unit.courseId)) problems.push('The course id is lowercase letters, digits and dashes.');
  return problems;
}

export async function listUnits(): Promise<CourseUnit[]> {
  const snapshot = await getDocs(query(collection(db, 'learnUnits'), orderBy('order')));
  return snapshot.docs.map((entry) => {
    const data = entry.data() as Partial<CourseUnit>;
    return {
      id: entry.id,
      courseId: data.courseId ?? 'kasem',
      order: typeof data.order === 'number' ? data.order : 1,
      title: data.title ?? '',
      subtitle: data.subtitle ?? '',
      published: data.published === true,
      imageUrl: data.imageUrl ?? '',
      imageAttribution: data.imageAttribution ?? '',
    };
  });
}

/** Saves a unit. Its id is `{course}-unit-{order}` on first save and fixed after. */
export async function saveUnit(unit: CourseUnit): Promise<string> {
  const id = unit.id || `${unit.courseId}-unit-${Math.round(unit.order)}`;
  await setDoc(
    doc(db, 'learnUnits', id),
    {
      id,
      courseId: unit.courseId,
      order: Math.round(unit.order),
      title: unit.title.trim(),
      subtitle: unit.subtitle.trim(),
      published: unit.published,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
  return id;
}

export async function deleteUnit(id: string): Promise<void> {
  await deleteDoc(doc(db, 'learnUnits', id));
}

// ---------------------------------------------------------------------------
// Illustrations
// ---------------------------------------------------------------------------

export type IllustrationQuality = 'standard' | 'best';
export const ILLUSTRATION_RATIOS = ['1:1', '4:3', '16:9', '9:16'] as const;
export const ILLUSTRATION_SIZES: Record<IllustrationQuality, string[]> = {
  standard: ['1K', '2K'],
  best: ['1K', '2K', '4K'],
};

export interface IllustrationTarget {
  kind: 'unit' | 'lesson' | 'course' | 'none';
  id: string;
}

export interface Illustration {
  id: string;
  status: 'generating' | 'draft' | 'approved' | 'rejected' | 'failed';
  title: string;
  prompt: string;
  style: string;
  mode: 'generate' | 'edit';
  aspectRatio: string;
  imageSize: string;
  quality: IllustrationQuality;
  model: string | null;
  modelLabel: string | null;
  target: IllustrationTarget;
  storagePath: string | null;
  publicUrl: string | null;
  creatorName: string;
  createdAt: string;
  errorMessage: string | null;
  reviewerName: string | null;
  reviewNote: string | null;
  attribution: string | null;
}

export interface IllustrationRequest {
  prompt: string;
  title: string;
  aspectRatio: string;
  imageSize: string;
  quality: IllustrationQuality;
  style: 'course' | 'none';
  mode: 'generate' | 'edit';
  sourceIllustrationId?: string;
  referenceImagePaths: string[];
  target: IllustrationTarget;
}

export function newRequestId(): string {
  const random = crypto.getRandomValues(new Uint32Array(2));
  return `ill_${Date.now().toString(36)}_${random[0].toString(36)}${random[1].toString(36)}`;
}

function asIllustration(id: string, data: Record<string, unknown>): Illustration {
  const text = (key: string) => (typeof data[key] === 'string' ? (data[key] as string) : '');
  const target = (data.target ?? {}) as Partial<IllustrationTarget>;
  return {
    id,
    status: (text('status') || 'failed') as Illustration['status'],
    title: text('title'),
    prompt: text('prompt'),
    style: text('style'),
    mode: data.mode === 'edit' ? 'edit' : 'generate',
    aspectRatio: text('aspectRatio'),
    imageSize: text('imageSize'),
    quality: data.quality === 'best' ? 'best' : 'standard',
    model: text('model') || null,
    modelLabel: text('modelLabel') || null,
    target: { kind: target.kind ?? 'none', id: target.id ?? '' },
    storagePath: text('storagePath') || null,
    publicUrl: text('publicUrl') || null,
    creatorName: text('creatorName'),
    createdAt: text('createdAt'),
    errorMessage: text('errorMessage') || null,
    reviewerName: text('reviewerName') || null,
    reviewNote: text('reviewNote') || null,
    attribution: text('attribution') || null,
  };
}

export async function listIllustrations(): Promise<Illustration[]> {
  const snapshot = await getDocs(
    query(collection(db, 'learnIllustrations'), orderBy('createdAt', 'desc'), limit(60)),
  );
  return snapshot.docs.map((entry) => asIllustration(entry.id, entry.data()));
}

/** A link a staff member's browser can show a draft with. Drafts are private. */
export async function previewUrl(illustration: Illustration): Promise<string | null> {
  if (illustration.publicUrl) return illustration.publicUrl;
  if (!illustration.storagePath) return null;
  return getDownloadURL(ref(storage, illustration.storagePath));
}

export async function uploadReference(file: File, uid: string): Promise<string> {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
    throw new Error('Reference images must be PNG, JPEG or WebP.');
  }
  if (file.size > 8 * 1024 * 1024) throw new Error('Reference images must be under 8 MB.');
  const safe = file.name.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 80) || 'reference';
  const path = `learn-illustrations/references/${uid}/${Date.now().toString(36)}/${safe}`;
  await uploadBytes(ref(storage, path), file, { contentType: file.type });
  return path;
}

export async function generateIllustration(request: IllustrationRequest): Promise<Illustration> {
  const call = httpsCallable<IllustrationRequest & { requestId: string }, Record<string, unknown>>(
    functions,
    'generateLearnIllustration',
    { timeout: 200_000 },
  );
  const result = await call({ ...request, requestId: newRequestId() });
  return asIllustration(String(result.data.id ?? ''), result.data);
}

export async function reviewIllustration(
  illustrationId: string,
  decision: 'approve' | 'reject',
  note: string,
  target: IllustrationTarget | null,
): Promise<Illustration> {
  const call = httpsCallable<
    { illustrationId: string; decision: string; note: string; target: IllustrationTarget | null },
    Record<string, unknown>
  >(functions, 'reviewLearnIllustration');
  const result = await call({ illustrationId, decision, note, target });
  return asIllustration(illustrationId, result.data);
}

// ---------------------------------------------------------------------------
// Pronunciation recordings
// ---------------------------------------------------------------------------

export interface PronunciationRecording {
  id: string;
  entryId: string;
  headword: string;
  meaning: string;
  contributorName: string;
  storagePath: string;
  durationMs: number;
  publishConsent: boolean;
  status: string;
}

export async function listSubmittedRecordings(): Promise<PronunciationRecording[]> {
  const snapshot = await getDocs(
    query(
      collection(db, 'pronunciationRecordings'),
      where('status', '==', 'submitted'),
      orderBy('createdAt', 'desc'),
      limit(50),
    ),
  );
  return snapshot.docs.map((entry) => {
    const data = entry.data();
    return {
      id: entry.id,
      entryId: String(data.entryId ?? ''),
      headword: String(data.headword ?? ''),
      meaning: String(data.meaning ?? ''),
      contributorName: String(data.contributorName ?? ''),
      storagePath: String(data.storagePath ?? ''),
      durationMs: Number(data.durationMs ?? 0),
      publishConsent: data.publishConsent === true,
      status: String(data.status ?? ''),
    };
  });
}

export function recordingUrl(recording: PronunciationRecording): Promise<string> {
  return getDownloadURL(ref(storage, recording.storagePath));
}

export async function decideRecording(
  recordingId: string,
  decision: 'approve' | 'reject',
  note: string,
): Promise<{ status: string; outcome?: string }> {
  const call = httpsCallable<
    { recordingId: string; decision: string; note: string },
    { status: string; outcome?: string }
  >(functions, 'decidePronunciationRecording');
  const result = await call({ recordingId, decision, note });
  return result.data;
}
