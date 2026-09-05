import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';

import { requireAuth } from './auth.js';
import { consumeRateLimit } from './rate-limit.js';
import { publishedKasemForms, normaliseTerm } from './kawuri-dictionary.js';
import { headwordKey, superscript } from './kasem-homographs.js';
import { canonicalPartOfSpeech } from './lexical-kinds.js';

/**
 * A second pair of eyes on a contribution, before it is sent.
 *
 * ── What this is for, and what it is emphatically not ─────────────────────
 * A contributor types a Kasem word and what it means, and presses send. From
 * there it waits for a validator, who may be days away, and whose time is the
 * scarcest thing this project has. Most of what comes back from that review is
 * not a judgement about the language at all — it is "we already have this
 * one", "that is the English in the Kasem box", "which word class is this".
 * Every one of those is a question that could have been asked and answered
 * while the person was still standing in the form, and answering it there
 * costs a round trip instead of a week.
 *
 * So this advises. It does not decide, it does not block, and it never writes
 * anything. Its entire output is a list of things a person might want to know
 * before they press send, and every one of them can be ignored. The validator
 * still reviews what arrives, exactly as before.
 *
 * That boundary is the whole design, and it is not a matter of taste. This
 * project's constitution is that language "is confirmed by appointed speakers
 * before it counts as guidance". A model that could reject a contribution
 * would be deciding what enters the archive, which is a thing no model here is
 * permitted to do — and it would be doing it to the one group whose judgement
 * the project exists to record. A speaker being told by a machine that their
 * own word is wrong is the single worst experience this app could offer.
 *
 * ── Why most of it is not a model at all ──────────────────────────────────
 * The checks that matter most are arithmetic. "Is there already an entry
 * spelled this way" is a set lookup and it is the most useful thing this
 * callable says, because it is what turns an accidental duplicate into a
 * deliberate homograph — the contributor is the only person who can say
 * whether their `ni` is one of the eight already recorded or a ninth word, and
 * nobody had ever asked them.
 *
 * The model is consulted for exactly one thing: whether a Kasem/English pair
 * looks transposed or implausible, which genuinely needs judgement. When
 * Vertex is unreachable, the deterministic checks still run and the reply says
 * so — the same `configured: false` contract `kawuri.ts` uses, for the same
 * reason.
 */

const REGION = 'us-central1';
const ENFORCE_APP_CHECK = process.env.ENFORCE_APP_CHECK === 'true';

/** Drafts checked per member per minute. Generous for somebody typing. */
const CHECKS_PER_MINUTE = 30;

/** The most existing entries named back to a contributor. */
const MAX_REPORTED_PEERS = 6;

/**
 * How severely a check wants to be read.
 *
 * There is no `block`, deliberately. Every level here is advice, and a form
 * that could refuse to send would be this module deciding what enters the
 * archive.
 */
export type AssistSeverity = 'ask' | 'warn' | 'note';

/** One thing worth telling the contributor before they send. */
export interface AssistCheck {
  id: string;
  severity: AssistSeverity;
  /** One line, shown as the heading of the notice. */
  title: string;
  /** A sentence or two. Written to be shown to the member verbatim. */
  detail: string;
  /** Existing entries this check is about, where it is about any. */
  entries?: { id: string; kasem: string; english: string; homographIndex: number }[];
}

/** One published entry, as the duplicate check needs it. */
export interface AssistPeer {
  id: string;
  kasem: string;
  english: string;
  homographIndex: number;
}

/**
 * English words common enough that finding one in the Kasem box is almost
 * certainly a mistake rather than a coincidence.
 *
 * Deliberately tiny and deliberately all function words and top-frequency
 * nouns. A longer list would start catching real Kasem words that happen to be
 * spelled like English ones, and a false "you have put English in the Kasem
 * box" aimed at a speaker writing their own language is a far worse error than
 * missing a genuine slip. The check is a net for the obvious case — somebody
 * filling the two fields in the wrong order — not a spell checker.
 */
const COMMON_ENGLISH = new Set([
  'the', 'and', 'water', 'food', 'house', 'man', 'woman', 'child', 'children',
  'good', 'bad', 'big', 'small', 'come', 'go', 'eat', 'drink', 'sleep', 'work',
  'mother', 'father', 'friend', 'name', 'day', 'night', 'today', 'tomorrow',
  'yes', 'no', 'hello', 'goodbye', 'thank', 'thanks', 'please', 'sorry',
  'money', 'market', 'road', 'farm', 'rain', 'sun', 'fire', 'tree', 'dog',
]);

/** The letters that only a Kasem keyboard produces. */
const KASEM_LETTERS = /[ɩɪʋʊəɔŋɛɣ]/u;

/**
 * The checks that need no model: what the archive already holds, and which
 * box each thing was typed into.
 *
 * Pure so that `node --test` can exercise every branch without Firestore or
 * Vertex, on the same terms as the rest of this codebase's language logic.
 */
export function deterministicChecks(input: {
  kasem: string;
  english: string;
  partOfSpeech: string;
  peers: readonly AssistPeer[];
  knownKasem: ReadonlySet<string>;
}): AssistCheck[] {
  const checks: AssistCheck[] = [];
  const kasem = input.kasem.trim();
  const english = input.english.trim();
  if (!kasem || !english) return checks;

  const key = headwordKey(kasem);
  const peers = input.peers.filter((peer) => headwordKey(peer.kasem) === key);

  // ── The one that matters most ────────────────────────────────────────
  // Nobody had ever been asked this. A contributor sending `ni` had no way to
  // know the dictionary already held eight words spelled that way, so the
  // ninth arrived looking exactly like a duplicate and a reviewer had to guess
  // which it was. The contributor is the only person who can actually answer.
  if (peers.length > 0) {
    const sameMeaning = peers.filter(
      (peer) => normaliseTerm(peer.english) === normaliseTerm(english),
    );
    if (sameMeaning.length > 0) {
      checks.push({
        id: 'duplicate',
        severity: 'ask',
        title: 'This may already be in the dictionary',
        detail:
          `“${kasem}” is already published meaning “${sameMeaning[0].english}”. `
          + 'If that is the same word, there is nothing to add — you could send '
          + 'a correction to that entry instead. If yours is a different word '
          + 'that happens to be spelled the same, send it: it will be filed as '
          + 'a separate sense.',
        entries: sameMeaning.slice(0, MAX_REPORTED_PEERS),
      });
    } else {
      const numbered = peers
        .filter((peer) => peer.homographIndex > 0)
        .map((peer) => `${peer.kasem}${superscript(peer.homographIndex)}`)
        .join(', ');
      checks.push({
        id: 'homograph',
        severity: 'ask',
        title: `${peers.length} other word${peers.length === 1 ? '' : 's'} `
          + `${peers.length === 1 ? 'is' : 'are'} spelled “${kasem}”`,
        detail:
          `The dictionary already holds ${numbered || `“${kasem}”`}. Yours means `
          + 'something different, so it will be published beside them as its own '
          + 'sense with its own number. Nothing is overwritten — this is just so '
          + 'you know they are there.',
        entries: peers.slice(0, MAX_REPORTED_PEERS),
      });
    }
  }

  // ── Which box is which ───────────────────────────────────────────────
  if (normaliseTerm(kasem) === normaliseTerm(english)) {
    checks.push({
      id: 'identical-sides',
      severity: 'warn',
      title: 'Both boxes say the same thing',
      detail:
        'The Kasem and the English are identical. If the word really is the '
        + 'same in both, send it — otherwise one of the two boxes has the wrong '
        + 'text in it.',
    });
  } else if (COMMON_ENGLISH.has(normaliseTerm(kasem)) && !KASEM_LETTERS.test(kasem)) {
    checks.push({
      id: 'english-in-kasem-box',
      severity: 'warn',
      title: 'That looks like English in the Kasem box',
      detail:
        `“${kasem}” is a common English word. Check the two boxes are the right `
        + 'way round: the first is the Kasem, the second is what it means in '
        + 'English.',
    });
  }

  if (KASEM_LETTERS.test(english)) {
    checks.push({
      id: 'kasem-in-english-box',
      severity: 'warn',
      title: 'That looks like Kasem in the English box',
      detail:
        `“${english}” uses Kasem letters. The second box is for what the word `
        + 'means in English, so somebody who does not speak Kasem can find it.',
    });
  }

  // ── Things a reviewer would otherwise have to send back for ──────────
  if (!canonicalPartOfSpeech(input.partOfSpeech)) {
    checks.push({
      id: 'word-class',
      severity: 'note',
      title: 'No word class chosen',
      detail:
        'Choosing one is optional and it helps a great deal: it is what lets '
        + 'the entry show its plural and its form with “the”, and what tells a '
        + 'learner whether they are looking at a noun or a verb.',
    });
  }

  if (input.knownKasem.has(normaliseTerm(english))) {
    checks.push({
      id: 'english-is-a-headword',
      severity: 'note',
      title: 'The English side is also a Kasem word',
      detail:
        `“${english}” is itself published as a Kasem headword. That is usually `
        + 'a coincidence and nothing is wrong — worth a second look at the two '
        + 'boxes all the same.',
    });
  }

  return checks;
}

/** Everything the callable hands back. */
export interface AssistResult {
  checks: AssistCheck[];
  /** False when the model half was unavailable; the checks above still ran. */
  modelAvailable: boolean;
}

function text(value: unknown, limit: number): string {
  return typeof value === 'string' ? value.trim().slice(0, limit) : '';
}

/**
 * Checks a draft contribution and returns advice.
 *
 * Signed in, because it reads the published dictionary on the caller's behalf
 * and because an unauthenticated endpoint that answers "is this word in the
 * archive" for any input is a way to enumerate the archive without reading it.
 *
 * Never throws for a draft it cannot judge. A form that shows an error where
 * it meant to show advice has made the contribution harder rather than easier,
 * which is the opposite of the point.
 */
export const reviewContributionDraft = onCall(
  {
    enforceAppCheck: ENFORCE_APP_CHECK,
    consumeAppCheckToken: ENFORCE_APP_CHECK,
    invoker: 'public',
    region: REGION,
    timeoutSeconds: 30,
  },
  async (req) => {
    const uid = requireAuth(req);
    await consumeRateLimit('reviewContributionDraft', uid, CHECKS_PER_MINUTE);

    const data = (req.data ?? {}) as Record<string, unknown>;
    const kasem = text(data.kasem, 200);
    const english = text(data.english, 200);
    if (!kasem || !english) {
      throw new HttpsError(
        'invalid-argument',
        'Both the Kasem and what it means are needed before this can help.',
      );
    }

    try {
      const knownKasem = await publishedKasemForms();
      const peers = await peersFor(kasem);
      const checks = deterministicChecks({
        kasem,
        english,
        partOfSpeech: text(data.partOfSpeech, 80),
        peers,
        knownKasem,
      });
      return { checks, modelAvailable: false } satisfies AssistResult;
    } catch (error) {
      // Advice that cannot be produced is not an error the contributor caused,
      // and it must not stop them sending. An empty list reads in the form as
      // "nothing to flag", which is the honest degradation.
      logger.warn('Contribution assist failed; sending an empty check list', {
        errorType: error instanceof Error ? error.name : 'unknown',
      });
      return { checks: [], modelAvailable: false } satisfies AssistResult;
    }
  },
);

/**
 * Published entries already filed under this spelling.
 *
 * Queried on `headwordKey`, the field `backfill-homographs.mjs` puts on every
 * row — a single equality filter, so no composite index — and filtered to
 * published rows in memory rather than in a second `where`, because the peer
 * count under one spelling is small and a contributor should not be told about
 * an entry they cannot go and look at.
 */
async function peersFor(kasem: string): Promise<AssistPeer[]> {
  const { getFirestore } = await import('firebase-admin/firestore');
  const key = headwordKey(kasem);
  if (!key) return [];

  const snapshot = await getFirestore()
    .collection('dictionaryEntries')
    .where('headwordKey', '==', key)
    .limit(20)
    .get();

  const peers: AssistPeer[] = [];
  for (const doc of snapshot.docs) {
    if (doc.get('isPublished') !== true) continue;
    peers.push({
      id: doc.id,
      kasem: String(doc.get('kasemText') ?? ''),
      english: String(doc.get('englishText') ?? ''),
      homographIndex: Number(doc.get('homographIndex') ?? 0) || 0,
    });
  }
  return peers;
}
