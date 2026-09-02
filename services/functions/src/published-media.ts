import { randomUUID } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

/**
 * Moving approved media into the public bucket path.
 *
 * Extracted from the campaign review workflow so the open-publishing path can
 * reuse it verbatim: however a piece reaches publication — a reviewer's decision
 * or a creator posting directly — the media ends up in the same world-readable
 * place, with the same stable download URL, and the mobile Explore feed cannot
 * tell the two routes apart.
 */

type StorageBucket = ReturnType<ReturnType<typeof getStorage>['bucket']>;

export interface PublishableMedia {
  contentId: string;
  /**
   * The private upload to make world-readable, or '' when there is nothing to
   * move — a piece whose recording is already public and must keep the download
   * URL it was published with. Re-copying such a file would mint a fresh token
   * and break every URL already sitting in a client's cache, so the caller
   * blanks this rather than passing a path it does not want copied again.
   */
  storagePath: string;
  mimeType: string;
  mediaType: string;
  thumbnailPath: string | null;
}

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Copies an approved submission file (and thumbnail, if present) from the
 * private submission path into the world-readable `published-media/{id}/` path,
 * mints a stable Firebase download URL for each, and records them on the
 * publishedContent document so the mobile Explore feed can play them.
 *
 * The two files are moved independently. An earlier version bailed out of the
 * whole function when the main upload was missing, which quietly took the
 * artwork with it: a song whose recording had already been published (so it was
 * deliberately not copied again) could never gain the cover its contributor
 * uploaded, and the Now Playing screen stayed blank for good. A missing file is
 * now only ever a reason to skip *that* file.
 */
export async function finalisePublishedMedia(
  publishedRef: FirebaseFirestore.DocumentReference,
  info: PublishableMedia,
): Promise<void> {
  const bucket = getStorage().bucket();

  const mediaUrl = info.storagePath
    ? await copyToPublicPath(
        bucket,
        info.storagePath,
        `published-media/${info.contentId}/original`,
        info.mimeType,
      )
    : null;

  const thumbnailUrl = info.thumbnailPath
    ? await copyToPublicPath(
        bucket,
        info.thumbnailPath,
        `published-media/${info.contentId}/thumbnail`,
        'image/jpeg',
      )
    : null;

  // Nothing moved, so nothing to say. Writing here anyway would bump the
  // lifecycle version of a record that did not change.
  if (!mediaUrl && !thumbnailUrl) return;

  await publishedRef.update({
    // Spread rather than written unconditionally: a null `mediaUrl` would erase
    // the URL a previous publish minted, taking a playable song off the air
    // because its *cover* was the only thing that needed moving.
    ...(mediaUrl ? { mediaUrl, mediaType: info.mediaType } : {}),
    ...(thumbnailUrl ? { thumbnailUrl } : {}),
    'lifecycle.updatedAt': nowIso(),
    'lifecycle.version': FieldValue.increment(1),
  });
}

/**
 * Copies one private upload to its public path and returns its download URL,
 * or null when the source file is not there.
 *
 * The file's own recorded content type wins over the declared one. The declared
 * type comes from whatever the client said when it asked for an upload slot,
 * and the thumbnail branch had no declared type at all — every cover was
 * labelled `image/jpeg`, so a PNG was served under a lie. A missing file is
 * distinguished from a failing bucket by the 404 alone: swallowing every error
 * as "not there" would silently skip media that exists whenever Storage had a
 * bad minute, and publication would look complete when it was not.
 */
async function copyToPublicPath(
  bucket: StorageBucket,
  sourcePath: string,
  destPath: string,
  declaredType: string,
): Promise<string | null> {
  const source = bucket.file(sourcePath);
  let contentType = declaredType;
  try {
    const [metadata] = await source.getMetadata();
    if (typeof metadata.contentType === 'string' && metadata.contentType) {
      contentType = metadata.contentType;
    }
  } catch (error) {
    if ((error as { code?: number }).code === 404) return null;
    throw error;
  }
  await source.copy(bucket.file(destPath));
  return mintDownloadUrl(bucket, destPath, contentType);
}

/**
 * Copies an approved pronunciation recording into the world-readable path and
 * writes its URL onto the published dictionary entry.
 *
 * A dictionary entry is not a `publishedContent` record — it lands in
 * `dictionaryEntries`, keyed by its submission, and carries a word rather than
 * a piece of media. So it needs the same Storage move as everything else and a
 * different field at the end of it: the mobile entry screen plays `audioUrl`,
 * and nothing about a word belongs in `mediaUrl`.
 */
export async function finalisePublishedPronunciation(
  entryRef: FirebaseFirestore.DocumentReference,
  info: { contentId: string; storagePath: string; mimeType: string },
): Promise<void> {
  const bucket = getStorage().bucket();
  const audioUrl = await copyToPublicPath(
    bucket,
    info.storagePath,
    `published-media/${info.contentId}/pronunciation`,
    info.mimeType,
  );
  if (!audioUrl) return;

  await entryRef.update({
    audioUrl,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

/** Sets a download token on a file and returns its stable public download URL. */
export async function mintDownloadUrl(
  bucket: StorageBucket,
  path: string,
  contentType: string,
): Promise<string> {
  const token = randomUUID();
  await bucket.file(path).setMetadata({
    contentType,
    metadata: { firebaseStorageDownloadTokens: token },
  });
  return (
    `https://firebasestorage.googleapis.com/v0/b/${bucket.name}` +
    `/o/${encodeURIComponent(path)}?alt=media&token=${token}`
  );
}
