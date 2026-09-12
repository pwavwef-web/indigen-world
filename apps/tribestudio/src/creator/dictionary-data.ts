/**
 * Reads and writes for the studio's dictionary desk.
 *
 * ── Why this goes through the mobile app's callable ──────────────────────
 * The obvious thing was to write `lexicalEntries` directly, the way the old
 * lexicon workspace does. It was the wrong thing. Two write paths into one
 * dictionary means two review queues, two publication projections and two sets
 * of rules about what a valid entry is — and the one that actually reaches the
 * app's dictionary is `submitCollectionContribution`, which lands a
 * contribution in `collectionContributions`, mints its canonical `submissions`
 * document, and publishes to `dictionaryEntries` when a validator approves it.
 *
 * So a word typed at a desk now takes exactly the path a word typed on a phone
 * takes: same callable, same review desk, same homograph numbering, same
 * published document. The difference between the two clients is the size of
 * the screen, not the shape of the record.
 */
import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase';
import {
  type EntryDraft,
  formsPayload,
  headwordKey,
  sensesPayload,
  splitList,
} from './lexicon';

/** One published entry, reduced to what the desk needs to warn about. */
export interface PublishedHeadword {
  id: string;
  kasemText: string;
  englishText: string;
  partOfSpeech: string;
  homographIndex: number;
}

/**
 * Whether a row is one a contributor may be shown.
 *
 * The query filters on `isPublished` to satisfy the public-read Security Rules.
 * Keep this defensive check as well for malformed legacy rows.
 *
 * A withdrawn entry is deliberately excluded from the *warning* while its
 * homograph number stays spent for ever (see `kasem-homographs.ts`). Those are
 * different questions: "is there a word here a contributor should look at" and
 * "may this number be handed out again".
 */
function isVisible(data: Record<string, unknown>): boolean {
  return data.isPublished === true && typeof data.kasemText === 'string' && data.kasemText !== '';
}

/**
 * Every published entry under a spelling, so the editor can say what already
 * exists before somebody types a duplicate.
 *
 * ── Why this warns rather than blocks ────────────────────────────────────
 * Two entries under one spelling is not an error. It is a homograph, and Kasem
 * has a great many: 478 of the 1200 published entries share a spelling with
 * another, eight of them headed `ni`. The thing a contributor needs is not to
 * be stopped, it is to be told — so that somebody adding a second sense of a
 * word they can see already exists adds it as a *sense* of that entry, and
 * somebody adding a genuinely different word knows it will be numbered.
 *
 * Queried on `headwordKey` because that is the indexed field the server groups
 * homographs by; a client-side scan over the whole dictionary would be a
 * megabyte of reads per keystroke.
 */
export async function fetchHeadwordMatches(headword: string): Promise<PublishedHeadword[]> {
  const key = headwordKey(headword);
  if (!key) return [];
  try {
    const snap = await getDocs(
      query(collection(db, 'dictionaryEntries'), where('headwordKey', '==', key), where('isPublished', '==', true), limit(10)),
    );
    return snap.docs
      .map((doc) => ({ id: doc.id, data: doc.data() as Record<string, unknown> }))
      .filter(({ data }) => isVisible(data))
      .map(({ id, data }) => ({
        id,
        kasemText: String(data.kasemText ?? ''),
        englishText: String(data.englishText ?? ''),
        partOfSpeech: String(data.partOfSpeech ?? ''),
        homographIndex: Number(data.homographIndex ?? 0) || 0,
      }));
  } catch {
    // An offline tab, or rules saying no. The warning is a courtesy and its
    // absence must never stop somebody submitting.
    return [];
  }
}

/** One of the contributor's own dictionary submissions. */
export interface MyDictionaryContribution {
  id: string;
  title: string;
  body: string;
  status: string;
  senseCount: number;
  createdAt: string;
  reviewFeedback: string;
}

export async function fetchMyDictionaryContributions(
  uid: string,
): Promise<MyDictionaryContribution[]> {
  try {
    const snap = await getDocs(
      query(
        collection(db, 'collectionContributions'),
        where('authUid', '==', uid),
        where('collectionKind', '==', 'dictionary'),
        limit(40),
      ),
    );
    return snap.docs
      .map((doc) => {
        const data = doc.data() as Record<string, unknown>;
        const senses = Array.isArray(data.senses) ? data.senses : [];
        return {
          id: doc.id,
          title: String(data.title ?? ''),
          body: String(data.body ?? ''),
          status: String(data.status ?? 'submitted'),
          senseCount: senses.length,
          createdAt: String(data.createdAt ?? ''),
          reviewFeedback: String(data.reviewFeedback ?? ''),
        };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
}

/**
 * Sends the entry for review, on exactly the terms a phone contribution is
 * sent.
 *
 * The two legacy example fields are filled from the first sense that carries a
 * sentence. They are read by the review desk and by every app build that
 * predates senses, and leaving them empty on an entry that plainly has an
 * example would make a well-documented word look bare in the queue. The entry
 * screen suppresses the duplicate at render time instead.
 */
export async function submitDictionaryEntry(draft: EntryDraft): Promise<void> {
  if (draft.culturalPermissionTier !== 'public') {
    throw new Error('This dictionary accepts public cultural material only. Do not submit community-only, restricted or sacred material.');
  }
  const senses = sensesPayload(draft.senses);
  const firstExample = draft.senses
    .flatMap((sense) => sense.examples)
    .find((example) => example.kasem.trim() || example.english.trim());

  const call = httpsCallable<Record<string, unknown>, unknown>(
    functions,
    'submitCollectionContribution',
  );

  await call({
    collectionKind: 'dictionary',
    culturalPermissionTier: draft.culturalPermissionTier,
    lexicalKind: 'word',
    // `title` is the English side and `body` is the Kasem, which is the
    // direction the whole pipeline reads them in. The first sense is the
    // English side: the publication projection writes it to `englishText` and
    // writes every sense definition to `englishTranslations` beside it.
    title: senses[0] ? String(senses[0].definition) : '',
    body: draft.headword.trim(),
    format: draft.partOfSpeech,
    dialect: draft.dialect,
    source: draft.source.trim(),
    notes: draft.notes.trim(),
    kasemExample: firstExample?.kasem.trim() ?? '',
    englishExample: firstExample?.english.trim() ?? '',
    ...(senses.length > 0 ? { senses } : {}),
    ...(Object.keys(formsPayload(draft.forms)).length > 0
      ? { forms: formsPayload(draft.forms) }
      : {}),
    ...(draft.alsoUsedAs.length > 0 ? { alsoUsedAs: draft.alsoUsedAs } : {}),
    ...(draft.ipa.trim() ? { ipa: draft.ipa.trim() } : {}),
    ...(draft.kasemDefinition.trim() ? { kasemDefinition: draft.kasemDefinition.trim() } : {}),
    ...(draft.etymology.trim() ? { etymology: draft.etymology.trim() } : {}),
    rightsConfirmed: true,
    publicationPermission: draft.publicationPermission,
    // A word has no participants, so the question is not put and a
    // manufactured "no" would be a false declaration.
    involvesMinors: null,
    usesThirdPartyMaterial: false,
    participantConsentConfirmed: draft.consentGranted,
  });
}

/** Every Kasem rendering of the headword, as the reader will split it. */
export function renderings(headword: string): string[] {
  const list = splitList(headword);
  return list.length > 0 ? list : [headword.trim()].filter(Boolean);
}
