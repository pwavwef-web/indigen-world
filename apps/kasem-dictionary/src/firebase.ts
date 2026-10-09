import { ILLUSTRATIONS } from './illustrations';
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
  illustration?: { url: string; alt: string; caption: string };
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
      dialect: text(data, ["dialect"], "Not recorded"), pronunciation: text(data, ["pronunciation"], "No written guide yet"),
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
    dialect: text(data, ["dialect", "region"], "Not recorded"),
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
  if (kind === 'illustrations') {
    onEntries(ILLUSTRATIONS.map(figure => ({ id: `grammarIllustrations:${figure.id}`, sourceCollection: 'grammarIllustrations', headword: figure.title, translation: figure.caption, partOfSpeech: 'Original source illustration', dialect: 'Not recorded', pronunciation: '', audioUrl: '', example: '', exampleTranslation: '', culturalNote: null, attribution: 'A Basic Grammar of Kasem · GILLBT', authenticationStatus: '', literalTranslation: '', usageContext: '', frenchTranslation: '', reference: sourceReference({importId:'gillbt-basic-grammar-1983-2014', sourceRefs:[`DOCX block ${figure.block}`]}), illustration: {url:figure.url,alt:figure.alt,caption:figure.caption} })));
    return () => {};
  }
  const db = getFirestore(app);
  const base = [where(COLLECTIONS[kind].field, "==", kind === 'grammar' ? 'published' : kind === 'sentences' ? 'confirmed' : true)];
  const rows = new Map<string, DictionaryEntry[]>();
  const emit = () => onEntries([...rows.values()].flat()
    .filter(entry => kind !== 'sentences' || expiries.get(entry.id) == null || Number(expiries.get(entry.id)) > Date.now())
    .sort((a,b) => a.headword.localeCompare(b.headword, undefined, {sensitivity:'base'})));
  const expiries = new Map<string, number | null>();
  const listen = (key:string, filters: ReturnType<typeof where>[]) => onSnapshot(query(collection(db,COLLECTIONS[kind].source),...base,...filters),snapshot => {
    rows.set(key,snapshot.docs.map(document => {
      const data=document.data(), entry=readEntry(document.id,data,kind);
      if(entry && kind === 'sentences') expiries.set(entry.id,data.expiresAtMillis ?? null);
      return entry;
    }).filter((entry):entry is DictionaryEntry => entry !== null));
    emit();
  },onError);
  if(kind !== 'sentences') return listen('published',[]);
  const permanent=listen('permanent',[where('projectionVersion','==',2),where('expiresAtMillis','==',null)]);
  let expiring:Unsubscribe=()=>{};
  const refresh=()=>{
    expiring();
    // Future cutoff lets Firestore prove every result is eligible at request time.
    rows.delete('expiring');emit();
    expiring=listen('expiring',[where('projectionVersion','==',2),where('expiresAtMillis','>',Date.now()+60_000)]);
  };
  refresh();
  const timer=setInterval(refresh,30_000);
  return ()=>{clearInterval(timer);permanent();expiring();};
}
