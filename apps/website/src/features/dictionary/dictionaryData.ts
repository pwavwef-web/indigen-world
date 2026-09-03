import {
  collection,
  onSnapshot,
  query,
  where,
  type DocumentData,
  type Unsubscribe,
} from "firebase/firestore";
import { websiteFirestore } from "../../lib/firebaseApp";

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

export function subscribeToPublishedDictionary(
  onEntries: (entries: DictionaryEntry[]) => void,
  onError: () => void
): Unsubscribe {
  const dictionaryQuery = query(
    collection(websiteFirestore(), "dictionaryEntries"),
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
