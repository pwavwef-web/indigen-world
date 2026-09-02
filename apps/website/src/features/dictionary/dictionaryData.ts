import { getApp, getApps, initializeApp } from "firebase/app";
import {
  collection,
  getFirestore,
  onSnapshot,
  query,
  where,
  type DocumentData,
  type Unsubscribe,
} from "firebase/firestore";

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

// Firebase web identifiers are public application coordinates. Access to the
// cultural records remains governed by Firestore rules, which expose only rows
// explicitly marked as published.
const productionFirebaseConfig = {
  apiKey: "AIzaSyDe9TAz3pl0tiNqpIZZ0EQxmPEgMtf6kRA",
  authDomain: "project-kassena-7e026.firebaseapp.com",
  projectId: "project-kassena-7e026",
  storageBucket: "project-kassena-7e026.firebasestorage.app",
  messagingSenderId: "111428711822",
  appId: "1:111428711822:web:1b032129debe268429a0df",
};

function firstText(data: DocumentData, keys: string[], fallback = ""): string {
  for (const key of keys) {
    const value = data[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return fallback;
}

function entryFromData(id: string, data: DocumentData): DictionaryEntry | null {
  const headword = firstText(data, ["kasemText", "headword", "kasem", "word"]);
  const translation = firstText(data, [
    "englishText",
    "translation",
    "english",
    "definition",
  ]);
  if (!headword && !translation) return null;

  return {
    id,
    headword: headword || "Kasem entry",
    translation: translation || "Translation pending",
    partOfSpeech: firstText(data, ["partOfSpeech", "wordClass"], "Not specified"),
    dialect: firstText(data, ["dialect", "region"], "Kasem"),
    pronunciation: firstText(data, ["pronunciation", "phonetic"], "No written guide yet"),
    audioUrl: firstText(data, ["audioUrl", "pronunciationAudioUrl"]),
    example: firstText(data, ["kasemExample", "example", "exampleKasem"], "No example yet"),
    exampleTranslation: firstText(
      data,
      ["englishExample", "exampleTranslation", "exampleEnglish"],
      "No translated example yet"
    ),
    culturalNote:
      firstText(data, ["culturalNote", "culturalContext", "notes"]) || null,
    attribution: firstText(
      data,
      ["attribution", "source", "contributorName"],
      "Project Kassena community dictionary"
    ),
  };
}

function firebaseConfig() {
  if (
    import.meta.env.VITE_FIREBASE_API_KEY &&
    import.meta.env.VITE_FIREBASE_PROJECT_ID &&
    import.meta.env.VITE_FIREBASE_APP_ID
  ) {
    return {
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: import.meta.env.VITE_FIREBASE_APP_ID,
    };
  }
  return productionFirebaseConfig;
}

export function subscribeToPublishedDictionary(
  onEntries: (entries: DictionaryEntry[]) => void,
  onError: () => void
): Unsubscribe {
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig());
  const dictionaryQuery = query(
    collection(getFirestore(app), "dictionaryEntries"),
    where("isPublished", "==", true)
  );

  return onSnapshot(
    dictionaryQuery,
    (snapshot) => {
      const entries = snapshot.docs
        .map((document) => entryFromData(document.id, document.data()))
        .filter((entry): entry is DictionaryEntry => entry !== null)
        .sort((left, right) => left.headword.localeCompare(right.headword, undefined, { sensitivity: "base" }));
      onEntries(entries);
    },
    onError
  );
}
