import { initializeApp } from "firebase/app";
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
}

function text(data: DocumentData, keys: string[], fallback = ""): string {
  for (const key of keys) {
    const value = data[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return fallback;
}

function readEntry(id: string, data: DocumentData): DictionaryEntry | null {
  const headword = text(data, ["kasemText", "headword", "kasem", "word"]);
  const translation = text(data, ["englishText", "translation", "english", "definition"]);
  if (!headword || !translation) return null;

  return {
    id,
    headword,
    translation,
    partOfSpeech: text(data, ["partOfSpeech", "wordClass"], "Not specified"),
    dialect: text(data, ["dialect", "region"], "Kasem"),
    pronunciation: text(data, ["pronunciation", "phonetic"], "No written guide yet"),
    audioUrl: text(data, ["audioUrl", "pronunciationAudioUrl"]),
    example: text(data, ["kasemExample", "example", "exampleKasem"], "No example yet"),
    exampleTranslation: text(data, ["englishExample", "exampleTranslation", "exampleEnglish"], "No translated example yet"),
    culturalNote: text(data, ["culturalNote", "culturalContext", "notes"]) || null,
    attribution: text(data, ["attribution", "source", "contributorName"], "Project Kassena community dictionary"),
  };
}

export function subscribeToDictionary(
  onEntries: (entries: DictionaryEntry[]) => void,
  onError: () => void
): Unsubscribe {
  const published = query(
    collection(getFirestore(app), "dictionaryEntries"),
    where("isPublished", "==", true)
  );

  return onSnapshot(
    published,
    (snapshot) => onEntries(
      snapshot.docs
        .map((document) => readEntry(document.id, document.data()))
        .filter((entry): entry is DictionaryEntry => entry !== null)
        .sort((a, b) => a.headword.localeCompare(b.headword, undefined, { sensitivity: "base" }))
    ),
    onError
  );
}
