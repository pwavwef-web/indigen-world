import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { logger } from 'firebase-functions';
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { googleProjectId } from './google-api-auth.js';
import { reasonOf } from './kawuri-media-policy.js';
import { generateImage, screenGenerationRequest, type MediaInput } from './kawuri-vertex.js';
import {
  ILLUSTRATIONS,
  ILLUSTRATION_INSTRUCTION,
  ILLUSTRATION_LIMITS,
  attributionFor,
  canGenerateIllustrations,
  canReviewIllustrations,
  composeIllustrationPrompt,
  draftPath,
  illustrationIdFor,
  modelLabel,
  modelsForQuality,
  newIllustrationRecord,
  parseIllustrationRequest,
  parseIllustrationReview,
  publishedPath,
  readIllustrationConfig,
  targetCollection,
  type IllustrationConfig,
} from './learn-illustration-policy.js';
import { mintDownloadUrl } from './published-media.js';
import { consumeRateLimit } from './rate-limit.js';

/**
 * The course illustration desk: Nano Banana on Vertex AI, for staff only.
 *
 * `generateLearnIllustration` makes one DRAFT picture from a prompt, optional
 * reference images, or an earlier illustration to edit. `reviewLearnIllustration`
 * approves a draft — copying it to public storage and attaching it to a unit,
 * lesson or course — or rejects it with a reason.
 *
 * Every Vertex call runs here, as the function's runtime service account, the
 * same way Kawuri's do. The admin console never holds a credential, and the
 * mobile app never calls either function: learners only ever see the public
 * URL of a picture an administrator has approved.
 */

const REGION = 'us-central1';
const ENFORCE_APP_CHECK = process.env.ENFORCE_APP_CHECK === 'true';

function config(): IllustrationConfig {
  return readIllustrationConfig(process.env, googleProjectId());
}

function bucketFor(cfg: IllustrationConfig) {
  return cfg.outputBucket ? getStorage().bucket(cfg.outputBucket) : getStorage().bucket();
}

function nowIso(): string {
  return new Date().toISOString();
}

function staffOf(req: CallableRequest<unknown>, allowed: (role: unknown, superAdmin: boolean) => boolean): string {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in is required.', { reason: 'UNAUTHENTICATED' });
  const token: Record<string, unknown> = req.auth?.token ?? {};
  if (!allowed(token.role, token.superAdmin === true)) {
    throw new HttpsError('permission-denied', 'This desk is for administrators and authorised editors.', {
      reason: 'PERMISSION_DENIED',
    });
  }
  return uid;
}

function nameOf(req: CallableRequest<unknown>): string {
  const token: Record<string, unknown> = req.auth?.token ?? {};
  const name = typeof token.name === 'string' ? token.name : '';
  const email = typeof token.email === 'string' ? token.email : '';
  return (name || email.split('@')[0] || '').slice(0, 80);
}

/** Reads a stored image into a Vertex part, checking it really is a small image. */
async function loadImage(cfg: IllustrationConfig, path: string): Promise<MediaInput> {
  const file = bucketFor(cfg).file(path);
  let contentType = '';
  let size = 0;
  try {
    const [metadata] = await file.getMetadata();
    contentType = String(metadata.contentType ?? '');
    size = Number(metadata.size ?? 0);
  } catch {
    throw new HttpsError('failed-precondition', 'A reference image could not be found. Upload it again.', {
      reason: 'UPLOAD_MISSING',
    });
  }
  if (!contentType.startsWith('image/')) {
    throw new HttpsError('invalid-argument', 'Reference files must be images.', { reason: 'INVALID_MEDIA' });
  }
  if (size > ILLUSTRATION_LIMITS.referenceImageBytes) {
    throw new HttpsError('invalid-argument', 'Reference images must be under 8 MB.', { reason: 'INVALID_MEDIA' });
  }
  const [bytes] = await file.download();
  return { mimeType: contentType, base64: bytes.toString('base64') };
}

export const generateLearnIllustration = onCall(
  {
    region: REGION,
    enforceAppCheck: ENFORCE_APP_CHECK,
    invoker: 'public',
    timeoutSeconds: 180,
    memory: '1GiB',
  },
  async (req) => {
    const uid = staffOf(req, canGenerateIllustrations);
    const cfg = config();
    const request = parseIllustrationRequest(req.data, uid);
    const db = getFirestore();
    const id = illustrationIdFor(uid, request.requestId);
    const ref = db.collection(ILLUSTRATIONS).doc(id);

    // Idempotent on the request id: a double click or a retried call reads the
    // picture already being made instead of buying a second one.
    const existing = await ref.get();
    if (existing.exists) return existing.data();

    const references: MediaInput[] = [];
    if (request.mode === 'edit') {
      const source = await db.collection(ILLUSTRATIONS).doc(request.sourceIllustrationId).get();
      const sourcePath = source.get('storagePath');
      if (!source.exists || typeof sourcePath !== 'string' || !sourcePath) {
        throw new HttpsError('failed-precondition', 'That illustration has no picture to edit.', { reason: 'NOT_FOUND' });
      }
      references.push(await loadImage(cfg, sourcePath));
    }
    for (const path of request.referenceImagePaths) references.push(await loadImage(cfg, path));

    const composedPrompt = composeIllustrationPrompt({
      prompt: request.prompt,
      style: request.style,
      mode: request.mode,
      referenceCount: references.length,
    });
    const record = newIllustrationRecord({ id, uid, creatorName: nameOf(req), request, composedPrompt, now: nowIso() });
    try {
      await ref.create(record);
    } catch {
      // Created by a request that arrived at the same moment.
      return (await ref.get()).data();
    }

    const fail = async (errorCode: string, errorMessage: string) => {
      await ref.update({ status: 'failed', errorCode, errorMessage, completedAt: nowIso(), updatedAt: nowIso() });
    };

    try {
      await consumeRateLimit('learnIllustration', uid, ILLUSTRATION_LIMITS.perHour, 60 * 60_000);
    } catch {
      await fail('RATE_LIMITED', 'The hourly illustration limit has been reached. Try again later.');
      throw new HttpsError('resource-exhausted', 'The hourly illustration limit has been reached. Try again later.', {
        reason: 'RATE_LIMITED',
      });
    }

    // The platform's own screen runs first here too. Staff are trusted to mean
    // well, not to be a content filter.
    try {
      await screenGenerationRequest({
        project: cfg.project,
        location: cfg.location,
        models: cfg.screeningModels,
        capability: 'image_generation',
        prompt: request.prompt,
        negativePrompt: '',
        reference: references[0] ?? null,
      });
    } catch (error) {
      const reason = reasonOf(error) ?? 'GENERATION_FAILED';
      await fail(reason, error instanceof Error ? error.message : 'The request could not be checked.');
      throw error;
    }

    await db.collection('auditLogs').add({
      action: 'learn.illustration.generate',
      actorUid: uid,
      targetId: id,
      quality: request.quality,
      aspectRatio: request.aspectRatio,
      imageSize: request.imageSize,
      occurredAt: nowIso(),
    });

    try {
      const { model, outcome } = await generateImage({
        project: cfg.project,
        location: cfg.location,
        models: modelsForQuality(cfg, request.quality),
        prompt: composedPrompt,
        aspectRatio: request.aspectRatio,
        reference: references[0] ?? null,
        extraReferences: references.slice(1),
        imageSize: request.imageSize,
        systemInstruction: ILLUSTRATION_INSTRUCTION,
        capability: 'learn_illustration',
      });
      if (outcome.kind === 'rejected') {
        await fail('SAFETY_REJECTED', 'Vertex AI declined to draw this. Rephrase the prompt and try again.');
        return (await ref.get()).data();
      }
      if (outcome.kind === 'empty') {
        await fail('GENERATION_FAILED', 'Vertex AI returned no picture. Try again, or rephrase the prompt.');
        return (await ref.get()).data();
      }
      const image = outcome.images[0];
      const bytes = Buffer.from(image.base64, 'base64');
      const path = draftPath(id, image.mimeType);
      await bucketFor(cfg).file(path).save(bytes, {
        contentType: image.mimeType,
        resumable: false,
        metadata: { metadata: { aiGenerated: 'true', model, illustrationId: id } },
      });
      await ref.update({
        status: 'draft',
        model,
        modelLabel: modelLabel(model),
        storagePath: path,
        mimeType: image.mimeType,
        sizeBytes: bytes.length,
        completedAt: nowIso(),
        updatedAt: nowIso(),
      });
    } catch (error) {
      const reason = reasonOf(error) ?? 'GENERATION_FAILED';
      logger.warn('Learn illustration failed', { id, reason });
      await fail(reason, error instanceof HttpsError ? error.message : 'The illustration could not be made. Try again.');
    }
    return (await ref.get()).data();
  },
);

export const reviewLearnIllustration = onCall(
  {
    region: REGION,
    enforceAppCheck: ENFORCE_APP_CHECK,
    invoker: 'public',
    timeoutSeconds: 60,
  },
  async (req) => {
    const uid = staffOf(req, canReviewIllustrations);
    const cfg = config();
    const review = parseIllustrationReview(req.data);
    const db = getFirestore();
    const ref = db.collection(ILLUSTRATIONS).doc(review.illustrationId);
    const snapshot = await ref.get();
    if (!snapshot.exists) throw new HttpsError('not-found', 'That illustration does not exist.', { reason: 'NOT_FOUND' });
    const data = snapshot.data() as Record<string, unknown>;
    const status = String(data.status ?? '');

    if (review.decision === 'reject') {
      if (status !== 'draft' && status !== 'approved') {
        throw new HttpsError('failed-precondition', 'Only a finished illustration can be rejected.', { reason: 'INVALID_REQUEST' });
      }
      await ref.update({
        status: 'rejected',
        reviewedBy: uid,
        reviewerName: nameOf(req),
        reviewedAt: nowIso(),
        reviewNote: review.note,
        updatedAt: nowIso(),
      });
      await db.collection('auditLogs').add({
        action: 'learn.illustration.reject',
        actorUid: uid,
        targetId: review.illustrationId,
        occurredAt: nowIso(),
      });
      return (await ref.get()).data();
    }

    if (status !== 'draft' && status !== 'approved') {
      throw new HttpsError('failed-precondition', 'Only a draft can be approved.', { reason: 'INVALID_REQUEST' });
    }
    const storagePath = String(data.storagePath ?? '');
    const mimeType = String(data.mimeType ?? 'image/png');
    if (!storagePath) throw new HttpsError('failed-precondition', 'This draft has no picture.', { reason: 'NOT_FOUND' });

    const target = review.target ?? (data.target as { kind: 'unit' | 'lesson' | 'course' | 'none'; id: string } | undefined)
      ?? { kind: 'none', id: '' };
    const collection = targetCollection(target.kind);
    const targetRef = collection ? db.collection(collection).doc(target.id) : null;
    if (targetRef && !(await targetRef.get()).exists) {
      throw new HttpsError(
        'failed-precondition',
        `Save the ${target.kind} in the Learning screen first, then approve the picture for it.`,
        { reason: 'NOT_FOUND' },
      );
    }

    const bucket = bucketFor(cfg);
    const destination = publishedPath(review.illustrationId, mimeType);
    let publicUrl = typeof data.publicUrl === 'string' ? data.publicUrl : '';
    if (!publicUrl) {
      await bucket.file(storagePath).copy(bucket.file(destination));
      publicUrl = await mintDownloadUrl(bucket, destination, mimeType);
    }
    const reviewerName = nameOf(req);
    const attribution = attributionFor(String(data.model ?? ''), reviewerName);
    await ref.update({
      status: 'approved',
      publicUrl,
      publishedPath: destination,
      attribution,
      target,
      reviewedBy: uid,
      reviewerName,
      reviewedAt: nowIso(),
      reviewNote: review.note || null,
      updatedAt: nowIso(),
    });
    if (targetRef) {
      await targetRef.update({
        imageUrl: publicUrl,
        imageAttribution: attribution,
        imageIllustrationId: review.illustrationId,
        imageAiGenerated: true,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    await db.collection('auditLogs').add({
      action: 'learn.illustration.approve',
      actorUid: uid,
      targetId: review.illustrationId,
      attachedTo: target,
      occurredAt: nowIso(),
    });
    return (await ref.get()).data();
  },
);
