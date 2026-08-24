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
 */
export async function finalisePublishedMedia(
  publishedRef: FirebaseFirestore.DocumentReference,
  info: PublishableMedia,
): Promise<void> {
  const bucket = getStorage().bucket();
  const source = bucket.file(info.storagePath);
  const [exists] = await source.exists();
  if (!exists) return;

  const mediaDest = `published-media/${info.contentId}/original`;
  await source.copy(bucket.file(mediaDest));
  const mediaUrl = await mintDownloadUrl(bucket, mediaDest, info.mimeType);

  let thumbnailUrl: string | null = null;
  if (info.thumbnailPath) {
    const thumbSource = bucket.file(info.thumbnailPath);
    const [thumbExists] = await thumbSource.exists();
    if (thumbExists) {
      const thumbDest = `published-media/${info.contentId}/thumbnail`;
      await thumbSource.copy(bucket.file(thumbDest));
      thumbnailUrl = await mintDownloadUrl(bucket, thumbDest, 'image/jpeg');
    }
  }

  await publishedRef.update({
    mediaUrl,
    mediaType: info.mediaType,
    ...(thumbnailUrl ? { thumbnailUrl } : {}),
    'lifecycle.updatedAt': nowIso(),
    'lifecycle.version': FieldValue.increment(1),
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
