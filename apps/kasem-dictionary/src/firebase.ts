import { initializeApp } from "firebase/app";
import { sourceReference, type SourceReference } from './sourceReference';
import { belongsToCollection, COLLECTIONS, type CollectionKind } from "./collections";
import {
  collection,
  getFirestore,
  onSnapshot,
  query,
  where,
  type DocumentData,
  type Unsubscribe,
} from "firebase/firestore";

const app = initializeApp({
  apiKey: "AIzaSyDe9TAz3pl0tiNqpIZZ0EQxmPEgMtf6kRA",
  authDomain: "project-kassena-7e026.firebaseapp.com",
  projectId: "project-kassena-7e026",
  storageBucket: "project-kassena-7e026.firebasestorage.app",
  messagingSenderId: "111428711822",
  appId: "1:111428711822:web:4c3913f1d671a7b129a0df",
});

export interface DictionaryEntry {
  id: string;
  headword: string;
  translation: string;
  partOfSpeech: string;
  dialect: string;
  pronunciation: string;
  audioUrl: string;
  example: string;
  exampleTranslation: string;
  culturalNote: string | null;
  attribution: string;
  authenticationStatus: string;
  literalTranslation: string;
  usageContext: string;
  frenchTranslation: string;
  sourceCollection: string;
  reference: SourceReference;
  examples?: { kasem: string; english: string }[];
}

function text(data: DocumentData, keys: string[], fallback = ""): string {
  for (const key of keys) {
    const value = data[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return fallback;
}

export function readEntry(id: string, data: DocumentData, kind: CollectionKind = "words"): DictionaryEntry | null {
  if (!belongsToCollection(kind, data)) return null;
  if (kind !== "words") {
    const headword = text(data, kind === "names" ? ["name"] : kind === 'sentences' ? ['kasem'] : kind === 'grammar' ? ['title'] : ["phrase"]);
    if (!headword) return null;
    return {
      id: `${COLLECTIONS[kind].source}:${id}`, sourceCollection: COLLECTIONS[kind].source,
      headword, translation: text(data, kind === 'grammar' ? ['summary'] : kind === 'sentences' ? ['english'] : ["meaning"], "Meaning not recorded yet"),
      partOfSpeech: kind === 'grammar' ? 'Grammar rule' : kind === 'sentences' ? 'Whole sentence' : kind === "names" ? ({ given: "Given name", clan: "Clan name", place: "Place name" }[String(data.kind)] ?? "Name") : kind === "proverbs" ? "Proverb" : data.expressionKind === "idiom" ? "Idiom" : "Common phrase",
      dialect: text(data, ["dialect"], "Kasem"), pronunciation: text(data, ["pronunciation"], "No written guide yet"),
      audioUrl: text(data, ["audioUrl", "pronunciationAudioUrl"]), example: "No example yet", exampleTranslation: "No translated example yet",
      culturalNote: text(data, ["culturalNote"]) || null, literalTranslation: text(data, ["literalTranslation"]),
      usageContext: text(data, ["context", "usageContext"]), frenchTranslation: "",
      authenticationStatus: text(data, ["authenticationStatus"]),
      attribution: text(data, ["licenceDisplay", "attribution"], kind === "names" ? "Indigen World curated Kassena names collection" : "Source not recorded in this entry"),
      reference: sourceReference(data),
      examples: kind === 'grammar' && Array.isArray(data.examples) ? data.examples.filter((row: Record<string, unknown>) => typeof row.kasem === 'string' && typeof row.english === 'string') : [],
    };
  }
  if (data.contentKind === 'expression' || data.collectionKind === 'expressions'
    || ['phrase', 'idiom', 'proverb'].includes(data.lexicalKind)) return null;
  const headword = text(data, ["kasemText", "headword", "kasem", "word"]);
  const translation = text(data, ["englishText", "translation", "english", "definition"]);
  if (!headword || !translation) return null;

  return {
    id,
    sourceCollection: "dictionaryEntries",
    headword,
    translation,
    partOfSpeech: text(data, ["partOfSpeech", "wordClass"], "Not specified"),
    dialect: text(data, ["dialect", "region"], "Kasem"),
    pronunciation: text(data, ["pronunciation", "phonetic"], "No written guide yet"),
    audioUrl: text(data, ["audioUrl", "pronunciationAudioUrl"]),
    example: text(data, ["kasemExample", "example", "exampleKasem"], "No example yet"),
    exampleTranslation: text(data, ["englishExample", "exampleTranslation", "exampleEnglish"], "No translated example yet"),
    culturalNote: text(data, ["culturalNote", "culturalContext", "notes"]) || null,
    attribution: text(data, ["attribution", "source", "contributorName"], "Source not recorded in this entry"),
    authenticationStatus: text(data, ["authenticationStatus"]),
    literalTranslation: text(data, ["literalTranslation"]),
    usageContext: text(data, ["usageContext"]),
    frenchTranslation: text(data, ["frenchTranslation"]),
    reference: sourceReference(data),
  };
}

export function subscribeToDictionary(
  onEntries: (entries: DictionaryEntry[]) => void,
  onError: () => void,
  kind: CollectionKind = "words"
): Unsubscribe {
  const published = query(
    collection(getFirestore(app), COLLECTIONS[kind].source),
    where(COLLECTIONS[kind].field, "==", kind === 'grammar' ? 'published' : kind === 'sentences' ? 'confirmed' : true),
    ...(kind === 'sentences' ? [where('projectionVersion', '==', 2), where('expiresAtMillis', '==', null)] : [])
  );

  return onSnapshot(
    published,
    (snapshot) => onEntries(
      snapshot.docs
        .map((document) => readEntry(document.id, document.data(), kind))
        .filter((entry): entry is DictionaryEntry => entry !== null)
        .sort((a, b) => a.headword.localeCompare(b.headword, undefined, { sensitivity: "base" }))
    ),
    onError
  );
}
