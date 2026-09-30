import {
  LABS_REGISTRY,
  type Experiment,
  type LabsSource,
  type PracticeQuestion,
} from "@indigen-world/contracts/labs";
import { HttpsError } from "firebase-functions/v2/https";
export const registry = LABS_REGISTRY;
export function object(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new HttpsError("invalid-argument", "Expected an object.");
  return raw as Record<string, unknown>;
}
export function text(raw: unknown, max = 200, required = false): string {
  if (raw === undefined && !required) return "";
  if (typeof raw !== "string" || raw.length > max || (required && !raw.trim()))
    throw new HttpsError(
      "invalid-argument",
      `Enter text of ${max} characters or fewer.`,
    );
  return raw;
}
export function id(raw: unknown): string {
  const value = text(raw, 180, true);
  if (!/^[A-Za-z0-9_:.-]+$/.test(value))
    throw new HttpsError("invalid-argument", "Invalid record reference.");
  return value;
}
export function choice<T extends string>(
  raw: unknown,
  values: readonly T[],
): T {
  if (!values.includes(raw as T))
    throw new HttpsError("invalid-argument", "Choose a supported option.");
  return raw as T;
}
export function experimentConfig(
  experimentId: string,
  data?: Record<string, unknown>,
): Experiment {
  const base = registry.find((e) => e.id === experimentId);
  if (!base) throw new HttpsError("not-found", "Experiment not found.");
  if (!data) return { ...base, feedbackTypes: [...base.feedbackTypes] };
  return {
    ...base,
    enabled: data.enabled === true,
    status: choice(data.status, [
      "prototype",
      "alpha",
      "beta",
      "graduated",
      "retired",
    ]),
    access: choice(data.access, ["public", "signed-in", "invited testers"]),
    version: text(data.version, 40, true),
    limitations: text(data.limitations, 3000, true),
    updatedAt: text(data.updatedAt, 40, true),
  };
}
export function assertAccess(
  config: Experiment,
  uid: string | undefined,
  invited: boolean,
) {
  if (
    !config.enabled ||
    config.status === "retired" ||
    config.status === "graduated"
  )
    throw new HttpsError(
      "failed-precondition",
      "This experiment is unavailable. Your saved activity is still accessible.",
    );
  if (config.access !== "public" && !uid)
    throw new HttpsError("unauthenticated", "Sign in to try this experiment.");
  if (config.access === "invited testers" && !invited)
    throw new HttpsError(
      "permission-denied",
      "This experiment is open to invited testers.",
    );
}
export function assertOwner(owner: unknown, uid: string) {
  if (owner !== uid)
    throw new HttpsError(
      "permission-denied",
      "This work belongs to another account.",
    );
}
function first(d: Record<string, unknown>, keys: string[]): string {
  for (const key of keys)
    if (typeof d[key] === "string" && (d[key] as string).trim())
      return d[key] as string;
  return "";
}
/** Deliberately strict: publication without language review is not enough. */
export function sourceFrom(
  collection: string,
  entryId: string,
  d: Record<string, unknown>,
): LabsSource | null {
  if (
    d.isDevelopmentFixture === true &&
    process.env.GCLOUD_PROJECT?.startsWith("demo-") !== true
  )
    return null;
  const reviewed = ["reviewed", "verified"].includes(
    String(d.authenticationStatus),
  );
  if (!reviewed || d.isPublished !== true) return null;
  const expression = collection === "expressionEntries";
  const original = first(
    d,
    expression ? ["phrase"] : ["kasemText", "headword"],
  );
  const meaning = first(
    d,
    expression ? ["meaning"] : ["englishText", "translation"],
  );
  if (
    !original.trim() ||
    !meaning.trim() ||
    original.length > 500 ||
    meaning.length > 1000
  )
    return null;
  const declared = String(d.lexicalKind ?? d.entryKind ?? "");
  const kind =
    declared === "sentence"
      ? "sentence"
      : expression ||
          ["phrase", "idiom", "proverb"].includes(declared) ||
          /\s/.test(original.trim())
        ? "expression"
        : "word";
  return {
    ref: `${collection}:${entryId}`,
    developmentFixture: d.isDevelopmentFixture === true,
    kind,
    original,
    meaning,
    context: first(d, ["context", "usageContext", "culturalNote"]),
    attribution:
      first(d, ["attribution", "sourceReference", "source"]) ||
      "Published Indigen World review record",
    topic: expression
      ? "Expressions"
      : first(d, ["topic"]) || "Dictionary meanings",
    reviewed: true,
    revision: String(
      d.revision ??
        d.version ??
        (d.updatedAt &&
        typeof (d.updatedAt as { toDate?: unknown }).toDate === "function"
          ? (d.updatedAt as { toDate: () => Date }).toDate().toISOString()
          : typeof d.updatedAt === "string"
            ? d.updatedAt
            : "published"),
    ),
    url: expression
      ? "/contribute"
      : `/dictionary?entry=${encodeURIComponent(entryId)}`,
    audioUrl: "",
  };
}
const key = (s: string) =>
  s.normalize("NFC").toLocaleLowerCase().trim().replace(/\s+/g, " ");
/** Matches the owner-reviewed pronunciation pilot's existing publication record. */
export function reviewedPublishedAudio(
  entryId: string,
  d: Record<string, unknown>,
  source: LabsSource,
): { url: string; credit: string } | null {
  const raw = d.pronunciationAudioProvenance;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const p = raw as Record<string, unknown>;
  const url = p.audioUrl;
  if (
    typeof url !== "string" ||
    !url.startsWith("https://firebasestorage.googleapis.com/") ||
    url !== d.audioUrl ||
    p.sourceEntryId !== entryId ||
    p.isPrimary !== true ||
    p.aiGenerated !== true ||
    p.approvalSource !== "explicit_owner_instruction" ||
    typeof p.reviewedAt !== "string" ||
    !p.reviewedAt ||
    typeof p.approvedBy !== "string" ||
    !p.approvedBy ||
    p.reviewedHeadword !== source.original ||
    p.reviewedMeaning !== source.meaning ||
    p.reviewedDialect !== (d.dialect || "Not recorded")
  )
    return null;
  return {
    url,
    credit: `AI-generated pronunciation, reviewed for publication by ${p.approvedBy}. This review applies to the source meaning and dialect.`,
  };
}
/** Ambiguous spellings/meanings, multi-sense glosses and mixed dialects never become distractors. */
export function makeQuestions(
  sources: LabsSource[],
  topic: string,
): PracticeQuestion[] {
  const eligible = sources.filter(
    (s) =>
      s.topic === topic &&
      ["word", "expression", "sentence"].includes(s.kind) &&
      !/[;,\/]|\bor\b/i.test(s.meaning),
  );
  const unique = eligible.filter(
    (s) =>
      sources.filter(
        (x) => x.topic === topic && key(x.original) === key(s.original),
      ).length === 1 &&
      eligible.filter((x) => key(x.meaning) === key(s.meaning)).length === 1,
  );
  const questions: PracticeQuestion[] = [];
  for (const source of unique) {
    const pool = unique.filter(
      (x) => x.ref !== source.ref && x.kind === source.kind,
    );
    if (pool.length < 2) continue;
    const mode =
      source.audioUrl && questions.length % 2 === 0
        ? "listening"
        : source.kind === "word"
          ? "meaning"
          : "matching";
    const options = [source, ...pool.slice(0, 2)];
    const rotation = questions.length % options.length;
    const ordered = [...options.slice(rotation), ...options.slice(0, rotation)];
    questions.push({
      id: `q${questions.length + 1}`,
      mode,
      prompt:
        mode === "matching"
          ? source.meaning
          : mode === "listening"
            ? "Listen and choose the meaning."
            : source.original,
      choices: ordered.map((s) =>
        mode === "matching" ? s.original : s.meaning,
      ),
      answer: ordered.findIndex((s) => s.ref === source.ref),
      source,
    });
    if (questions.length === 6) break;
  }
  return questions;
}
