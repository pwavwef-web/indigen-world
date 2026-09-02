import { getMetadata, getStorage, ref, uploadBytesResumable } from 'firebase/storage';
import { app } from '../firebase';

/**
 * Narration and cover art for a library audiobook, uploaded from this console.
 *
 * ── Why not `learning/imageUpload.ts` ──────────────────────────────────────
 * That helper is the right shape for a lesson picture and the wrong shape for a
 * book: it is image-only, capped at 5 MB, and uses `uploadBytes`, which resolves
 * once and says nothing on the way. A narration is hundreds of megabytes over
 * whatever connection Navrongo has that afternoon, and an upload with no
 * progress is indistinguishable from a hung browser — somebody would reload the
 * page twenty minutes in and start again. Generalising the lesson helper to
 * carry both jobs would have meant a MIME prefix, a byte ceiling and a progress
 * callback threaded through a function whose whole virtue is that it takes a
 * file and a slot, so this stays a separate module with the same fixed-slot
 * discipline.
 *
 * ── Why fixed slot names ───────────────────────────────────────────────────
 * Files land at `collection-audiobooks/{audiobookId}/narration` and
 * `…/cover` rather than under the uploaded file's own name. Two reasons, both
 * about what happens later. Nothing in this project deletes these originals, so
 * a name per upload would leave every rejected take of every recording sitting
 * in the bucket for ever. And because the path can be derived from the id
 * alone, editing a published audiobook — fixing a misspelt author, say — can
 * re-declare the narration it already has instead of demanding that somebody
 * push a 400 MB file up the wire again to correct a typo. The cost is that
 * replacing a narration overwrites the old one before the publish that would
 * have used it, which is the right trade when the alternative is an unbounded
 * bucket.
 *
 * Storage is initialised here from the shared app instance rather than exported
 * from firebase.ts, matching imageUpload.ts, so screens that never upload
 * anything do not pay for the Storage SDK.
 */
const storage = getStorage(app);

/** The prefix `publishAdminAudiobook` insists every declared file sits under. */
export const AUDIOBOOK_STORAGE_PREFIX = 'collection-audiobooks';

/** A full book runs to hours; this matches the ceiling the callable enforces. */
export const MAX_NARRATION_BYTES = 500 * 1024 * 1024;

/** Cover art, the same small ceiling contributed artwork gets. */
export const MAX_COVER_BYTES = 8 * 1024 * 1024;

/** The two things an audiobook can have a file for. */
export type AudiobookSlot = 'narration' | 'cover';

/**
 * One file that is already in Storage, described exactly as the callable wants
 * it declared. Nothing here is trusted server-side — the path prefix, the MIME
 * type and the size are all checked again in `publishAdminAudiobook` — but
 * sending the truth means the rejection never happens.
 */
export interface StoredFile {
  storagePath: string;
  mimeType: string;
  sizeBytes: number;
}

/** Where one slot's file lives for a given audiobook. */
export function audiobookFilePath(audiobookId: string, slot: AudiobookSlot): string {
  return `${AUDIOBOOK_STORAGE_PREFIX}/${audiobookId}/${slot}`;
}

function megabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Rejects the two mistakes worth catching before anything is sent.
 *
 * The Storage rules make the same demands and are the actual enforcement, but a
 * rejection there arrives as an unretryable permission error *after* the file
 * has gone up — which on a narration means twenty wasted minutes and an error
 * message that does not say which of the two rules was broken. Returns the
 * complaint as a sentence, or null when the file is fine.
 */
export function audiobookFileProblem(file: File, slot: AudiobookSlot): string | null {
  if (slot === 'narration') {
    if (!file.type.startsWith('audio/')) {
      return 'That file is not audio. Choose an MP3, M4A, WAV or Ogg recording.';
    }
    if (file.size > MAX_NARRATION_BYTES) {
      return `That recording is ${megabytes(file.size)}. Narration has to be under ${megabytes(MAX_NARRATION_BYTES)}.`;
    }
    return null;
  }
  if (!file.type.startsWith('image/')) {
    return 'That file is not an image. Choose a JPEG, PNG or WebP cover.';
  }
  if (file.size > MAX_COVER_BYTES) {
    return `That cover is ${megabytes(file.size)}. Covers have to be under ${megabytes(MAX_COVER_BYTES)}.`;
  }
  return null;
}

/**
 * Uploads one file and reports progress as a fraction between 0 and 1.
 *
 * `uploadBytesResumable` rather than `uploadBytes` is the whole point: the
 * caller draws a real bar from `onProgress`, so a slow upload looks slow rather
 * than broken. The returned descriptor is what gets declared to the callable —
 * `file.type` is carried through unchanged because Storage stores it as the
 * object's content type, so the record, the bucket and the rules all agree on
 * what the file claims to be.
 */
export async function uploadAudiobookFile(args: {
  file: File;
  audiobookId: string;
  slot: AudiobookSlot;
  onProgress?: (fraction: number) => void;
}): Promise<StoredFile> {
  const { file, audiobookId, slot, onProgress } = args;
  if (!audiobookId) {
    throw new Error('The audiobook has no id yet, so there is nowhere to file the upload.');
  }
  const problem = audiobookFileProblem(file, slot);
  if (problem) throw new Error(problem);

  const storagePath = audiobookFilePath(audiobookId, slot);
  const task = uploadBytesResumable(ref(storage, storagePath), file, { contentType: file.type });
  await new Promise<void>((resolve, reject) => {
    task.on(
      'state_changed',
      (snapshot) => {
        if (!onProgress) return;
        const total = snapshot.totalBytes || file.size || 1;
        onProgress(Math.min(1, snapshot.bytesTransferred / total));
      },
      reject,
      resolve,
    );
  });
  return { storagePath, mimeType: file.type, sizeBytes: file.size };
}

/**
 * Recovers the descriptor for a file already uploaded under a known slot.
 *
 * Editing an existing audiobook has to re-declare its narration, because the
 * published record keeps only the public download URL the server minted — not
 * the private path, MIME type and size the callable validates. Rather than keep
 * a second admin-only mirror of those three fields in Firestore (another
 * collection, another rules block, another thing to drift), the file is asked
 * about itself: the object in the bucket is the record of what was uploaded.
 *
 * Returns null when there is nothing there, which the editor treats as "this
 * one needs a fresh upload" rather than as an error — a record whose narration
 * was never uploaded, or was uploaded before the fixed-slot convention, is a
 * thing somebody has to fix, not a thing to crash on.
 */
export async function describeStoredFile(
  audiobookId: string,
  slot: AudiobookSlot,
): Promise<StoredFile | null> {
  const storagePath = audiobookFilePath(audiobookId, slot);
  try {
    const metadata = await getMetadata(ref(storage, storagePath));
    return {
      storagePath,
      mimeType: metadata.contentType ?? (slot === 'narration' ? 'audio/mpeg' : 'image/jpeg'),
      sizeBytes: typeof metadata.size === 'number' ? metadata.size : 0,
    };
  } catch {
    return null;
  }
}

/** A file size as a person reads it, for the line under a chosen file. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return megabytes(bytes);
}
