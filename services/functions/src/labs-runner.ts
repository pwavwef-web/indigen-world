import { randomUUID } from "node:crypto";
import { getFirestore, type Transaction } from "firebase-admin/firestore";
import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import type { Experiment, RunnerRun } from "@indigen-world/contracts/labs";
import { assertOwner, id } from "./labs-policy.js";
import { queueBatchFor, submitQueueTranslation } from "./word-queue.js";

type Access = (tx: Transaction, req: CallableRequest, experimentId: string) => Promise<Experiment>;
const now = () => new Date().toISOString();

export function validateRunnerSection(run: RunnerRun, data: Record<string, unknown>) {
  if (run.id !== data.id || run.section !== data.section)
    throw new HttpsError("failed-precondition", "The trail changed in another tab. Reload your saved trail.");
}

export function validateRunnerScore(score: unknown) {
  if (!Number.isInteger(score) || (score as number) < 0 || (score as number) > 500)
    throw new HttpsError("invalid-argument", "Invalid section score.");
  return score as number;
}

/** One account-owned trail. Gate unlock and queue receipt commit together. */
export async function runnerAction(req: CallableRequest, data: Record<string, unknown>, access: Access) {
  const db = getFirestore(), uid = req.auth!.uid, ref = db.doc(`labsRunners/${uid}`);
  const action = data.action;
  if (action === "submitRunnerWord") {
    const snapshot = await ref.get(), initial = snapshot.data() as RunnerRun | undefined;
    if (!initial || initial.id !== id(data.id)) throw new HttpsError("not-found", "Trail not found. Reload to start.");
    const retry = initial.lastReceipt?.section === data.section;
    const wordId = retry ? initial.lastReceipt!.wordId : initial.word?.id;
    if (!wordId) throw new HttpsError("failed-precondition", "Get a checkpoint word before submitting.");
    // Only these answer fields are accepted. Revision IDs, queue IDs and reward data are never client-controlled here.
    const payload = { wordId, translations: data.translations, partOfSpeech: data.partOfSpeech,
      dialect: data.dialect, notes: data.notes, kasemExample: data.kasemExample,
      englishExample: data.englishExample, publicationPermission: data.publicationPermission === true,
      aiTraining: data.aiTraining === true, credit: data.credit === "name" ? "name" : "anonymous", origin: "queue" };
    let current: RunnerRun;
    await submitQueueTranslation({ ...req, data: payload }, {
      async validate(tx) {
        await access(tx, req, "word-trail");
        const stored = (await tx.get(ref)).data() as RunnerRun | undefined;
        if (!stored) throw new HttpsError("not-found", "Trail not found.");
        assertOwner(stored.uid, uid);
        if (stored.id !== data.id) throw new HttpsError("failed-precondition", "This trail was restarted. Reload it.");
        if (stored.lastReceipt?.section === data.section) return stored.lastReceipt;
        validateRunnerSection(stored, data);
        if (stored.phase !== "checkpoint" || stored.word?.id !== wordId)
          throw new HttpsError("failed-precondition", "This checkpoint word changed. Reload it before submitting.");
        current = stored;
        return null;
      },
      complete(tx, receipt) {
        tx.set(ref, { ...current, phase: "ready", section: current.section + 1,
          score: current.score + 100, checkpoints: current.checkpoints + 1,
          lastReceipt: { ...receipt, section: current.section }, word: null,
          skippedWordIds: [], startedAt: null, updatedAt: now() });
      },
    });
    return { run: (await ref.get()).data() };
  }

  // Queue reads happen before any transactional writes; compare the captured gate again to prevent stale replacements.
  const captured = (await ref.get()).data() as RunnerRun | undefined;
  let word = null;
  let excluded = captured?.skippedWordIds ?? [];
  if (action === "runnerWord" && captured?.phase === "checkpoint") {
    if (data.another === true && captured.word) excluded = [...excluded, captured.word.id];
    if (excluded.length > 200) throw new HttpsError("resource-exhausted", "You have tried 200 words on this trail. End the run and start fresh when you are ready.");
  }
  if (action === "runnerCheckpoint" || action === "runnerWord") {
    await db.runTransaction(tx => access(tx, req, "word-trail"));
    word = (await queueBatchFor(uid, 1, excluded)).words[0] ?? null;
  }
  return db.runTransaction(async tx => {
    const config = await access(tx, req, "word-trail");
    const stored = (await tx.get(ref)).data() as RunnerRun | undefined;
    if (action === "runner") {
      if (stored && data.restart !== true) return { run: stored };
      const run: RunnerRun = { id: randomUUID(), uid, version: config.version, section: 1,
        phase: "ready", score: 0, checkpoints: 0, word: null, skippedWordIds: [],
        startedAt: null, updatedAt: now(), lastReceipt: null };
      tx.set(ref, run);
      return { run };
    }
    if (!stored) throw new HttpsError("not-found", "Start a trail first.");
    assertOwner(stored.uid, uid);
    validateRunnerSection(stored, data);
    let run: RunnerRun;
    if (action === "beginRunnerSection") {
      if (stored.phase === "checkpoint") throw new HttpsError("failed-precondition", "Save a translation to open the next section.");
      run = { ...stored, phase: "running", startedAt: now(), updatedAt: now() };
    } else if (action === "runnerCheckpoint") {
      if (stored.phase === "checkpoint") return { run: stored };
      if (stored.phase !== "running" || !stored.startedAt || Date.now() - Date.parse(stored.startedAt) < 29000)
        throw new HttpsError("failed-precondition", "Finish the running section before opening its checkpoint.");
      run = { ...stored, phase: "checkpoint", score: stored.score + validateRunnerScore(data.score), word, updatedAt: now() };
    } else if (action === "runnerWord") {
      if (stored.phase !== "checkpoint" || stored.word?.id !== captured?.word?.id)
        throw new HttpsError("failed-precondition", "The checkpoint changed. Reload your trail.");
      run = { ...stored, word, skippedWordIds: excluded, updatedAt: now() };
    } else throw new HttpsError("invalid-argument", "Unknown trail action.");
    tx.set(ref, run);
    return { run };
  });
}
