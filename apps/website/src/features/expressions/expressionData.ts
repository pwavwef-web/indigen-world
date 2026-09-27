/**
 * Reviewed Kasem expressions, as visitors see them.
 *
 * Read from `expressionEntries`, which holds expressions published whole —
 * never split into dictionary words. Only rows marked published are requested,
 * which is also all the Security Rules allow a visitor to read. Sorting happens
 * here so the query stays a single equality filter with no composite index.
 */
import { collection, getDocs, limit, query, where, type DocumentData } from "firebase/firestore";
import { websiteFirestore } from "../../lib/firebaseApp";

export interface PublishedExpression {
  id: string;
  phrase: string;
  alternatives: string[];
  meaning: string;
  literalTranslation: string;
  context: string;
  kindLabel: string;
  dialect: string;
  sourceLabel: string;
  sourceDetail: string;
  speakerName: string;
  contributorName: string;
  publishedAt: string;
}

const KIND_LABELS: Record<string, string> = {
  phrase: "Everyday phrase",
  idiom: "Idiom",
  proverb: "Proverb or saying",
};

const SOURCE_LABELS: Record<string, string> = {
  self: "The contributor's own everyday Kasem",
  family: "Learned from a family member",
  elder: "Learned from an elder",
  community: "Heard in the community",
  written: "From a written source",
  recording: "From a recording",
  "invited-speaker": "Translated by an invited Kasem speaker",
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function expressionFromData(id: string, data: DocumentData): PublishedExpression | null {
  const phrase = text(data.phrase);
  const meaning = text(data.meaning);
  if (!phrase || !meaning || data.isPublished !== true) return null;
  const source = data.source && typeof data.source === "object" ? (data.source as DocumentData) : {};
  return {
    id,
    phrase,
    alternatives: Array.isArray(data.alternatives) ? data.alternatives.map(text).filter(Boolean) : [],
    meaning,
    literalTranslation: text(data.literalTranslation),
    context: text(data.context),
    kindLabel: KIND_LABELS[text(data.expressionKind)] ?? "Expression",
    dialect: text(data.dialect),
    sourceLabel: SOURCE_LABELS[text(source.type)] ?? "Source recorded with the expression",
    sourceDetail: text(source.detail),
    speakerName: text(source.speakerName),
    contributorName: text(data.contributor?.displayName) || "Indigen World contributor",
    publishedAt: text(data.publishedAt),
  };
}

/** The most recently published expressions, newest first. */
export async function fetchPublishedExpressions(max = 9): Promise<PublishedExpression[]> {
  const snapshot = await getDocs(
    query(collection(websiteFirestore(), "expressionEntries"), where("isPublished", "==", true), limit(60))
  );
  return snapshot.docs
    .map((doc) => expressionFromData(doc.id, doc.data()))
    .filter((entry): entry is PublishedExpression => entry !== null)
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, max);
}
