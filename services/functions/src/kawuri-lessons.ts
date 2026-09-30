import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import {
  dictionaryBriefing,
  dictionaryRecordFrom,
  isStopWord,
  normaliseTerm,
  publishedEntriesFor,
  type DictionaryRecord,
} from './kawuri-dictionary.js';

/**
 * "Practise with Kawuri."
 *
 * A lesson is an ordinary Kawuri conversation with one more block in its
 * instruction: what the lesson is about, the verified entries it may teach,
 * and how to run a short practice session over them. The app sends the lesson
 * with every turn, so the server rebuilds it from the archive each time and
 * the client can never widen what counts as verified.
 *
 * Two kinds of starting point:
 *
 *   entry  a published dictionary entry — verified by construction, since
 *          only reviewed answers are ever published there.
 *   post   something from Explore. A published reel or a community post is
 *          NOT a verified source of Kasem: anyone can post, and a reel's own
 *          captions were never read by the dictionary's reviewers. So the post
 *          supplies the topic, and the Kasem taught is whatever the published
 *          dictionary holds for the words it is about. Anything quoted from
 *          the post itself is labelled as the post's own, not verified.
 *
 * ── Why the lesson ends with a marker ─────────────────────────────────────
 * "Did the lesson finish?" is a question the app needs answered to offer the
 * next steps and to count completions, and guessing it from the number of
 * turns would count a member who wandered off after three questions as a
 * completion. The model ends its closing message with [LESSON_COMPLETE_MARKER]
 * and the server strips it before the member sees the reply.
 */

export type LessonKind = 'entry' | 'post' | 'community';

export interface LessonRequest {
  kind: LessonKind;
  id: string;
}

export const LESSON_COMPLETE_MARKER = '[[lesson-complete]]';

/** The questions in one lesson before it closes. */
export const LESSON_QUESTIONS = 3;

type JsonRecord = Record<string, unknown>;

function text(value: unknown, max = 2000): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

/** A lesson the client asked for, or null when the conversation is not a lesson. */
export function parseLessonRequest(raw: unknown): LessonRequest | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const data = raw as JsonRecord;
  const kind = text(data.kind, 20).toLowerCase();
  const id = text(data.id, 200);
  if (!id) return null;
  if (kind !== 'entry' && kind !== 'post' && kind !== 'community') {
    throw new HttpsError('invalid-argument', 'A lesson is about a dictionary entry or an Explore post.');
  }
  if (!/^[A-Za-z0-9_:.-]+$/.test(id)) {
    throw new HttpsError('invalid-argument', 'That lesson is not one Kawuri can open.');
  }
  return { kind, id };
}

/**
 * Removes the closing marker, and says whether it was there.
 *
 * Tolerant of the model's formatting — on its own line, with trailing space,
 * inside a code span — because a marker the parser misses is a lesson that
 * never finishes in the app.
 */
export function stripLessonMarker(reply: string): { reply: string; complete: boolean } {
  const pattern = /`?\[\[\s*lesson-complete\s*\]\]`?/gi;
  const complete = pattern.test(reply);
  return { reply: reply.replace(pattern, '').trim(), complete };
}

/** English words worth looking up from a post's own description of itself. */
export function lessonTermsFrom(...sources: string[]): string[] {
  const terms: string[] = [];
  for (const source of sources) {
    for (const raw of source.toLowerCase().split(/[^a-z'-]+/)) {
      const word = normaliseTerm(raw);
      if (word.length < 4 || isStopWord(word) || terms.includes(word)) continue;
      terms.push(word);
      if (terms.length >= 12) return terms;
    }
  }
  return terms;
}

/** How to run the lesson, whatever it is about. */
export function lessonRules(subject: string, postNote: string): string {
  return `LESSON MODE — the member tapped "Practise with Kawuri" on ${subject}. Run a short, warm practice lesson.

Rules for the lesson:
1. Teach only the Kasem in the DICTIONARY LOOKUP below. It is the verified material; nothing else is.${postNote ? `\n2. ${postNote}` : '\n2. Stay on this word. If the member asks about another word, answer from its own lookup, or say it is not verified yet.'}
3. Keep every message short: at most four sentences and exactly one question.
4. The lesson has ${LESSON_QUESTIONS} questions. Start by presenting the word and its meaning, quoting the spelling exactly, then ask the first question. Good questions: "How do you say ... in Kasem?", "What does ... mean?", or asking them to read an example sentence and say what it means.
5. Check each answer strictly against the lookup. Accept only the renderings listed there. If the answer differs, say so kindly and show the verified form. Never call an unlisted spelling correct, and never "correct" the dictionary.
6. After the member has answered the last question (question ${LESSON_QUESTIONS}) or asks to stop, give a one-sentence summary of what they practised, then end the message with this exact line on its own: ${LESSON_COMPLETE_MARKER}
7. Do not suggest next steps in words; the app shows them.`;
}

export interface LessonContext {
  instruction: string;
  title: string;
  /** The verified entries the lesson draws on, for the app to link to. */
  entries: DictionaryRecord[];
}

/**
 * The lesson block for [lesson], built from the archive.
 *
 * Throws not-found for anything that is not published — an unpublished entry,
 * a withdrawn reel, a deleted post — rather than teaching from it.
 */
export async function lessonContextFor(lesson: LessonRequest): Promise<LessonContext> {
  const db = getFirestore();
  if (lesson.kind === 'entry') {
    const snap = await db.collection('dictionaryEntries').doc(lesson.id).get();
    const data = snap.exists ? (snap.data() ?? {}) : null;
    const entry = data && data.isPublished === true ? dictionaryRecordFrom(snap.id, data) : null;
    if (!entry) {
      throw new HttpsError('not-found', 'That word is not in the published dictionary, so there is no verified lesson for it yet.');
    }
    const term = normaliseTerm(entry.english.split(/[;,]/)[0] ?? '') || normaliseTerm(entry.kasem);
    const title = entry.english ? `${entry.kasem} (${entry.english.split(/[;,]/)[0]!.trim()})` : entry.kasem;
    return {
      title,
      entries: [entry],
      instruction: [
        lessonRules(`the dictionary word ${title}`, ''),
        dictionaryBriefing([term], [entry]),
      ].join('\n\n'),
    };
  }

  // An Explore post: the topic comes from the post, the Kasem from the dictionary.
  let postTitle = '';
  let about = '';
  let postKasem = '';
  if (lesson.kind === 'post') {
    const snap = await db.collection('publishedContent').doc(lesson.id).get();
    const data = snap.exists ? (snap.data() ?? {}) as JsonRecord : null;
    if (!data || text(data.publicationStatus) !== 'published') {
      throw new HttpsError('not-found', 'That post is no longer published.');
    }
    postTitle = text(data.title, 160);
    about = [text(data.englishSummary), text(data.description), text(data.culturalNotes),
      ...(Array.isArray(data.tags) ? data.tags.map((tag) => text(tag, 40)) : [])].filter(Boolean).join(' ');
    postKasem = [text(data.body, 400), ...(Array.isArray(data.translations) ? data.translations.map((t) => text(t, 200)) : [])]
      .filter(Boolean).join(' / ');
  } else {
    const snap = await db.collection('communityPosts').doc(lesson.id).get();
    const data = snap.exists ? (snap.data() ?? {}) as JsonRecord : null;
    if (!data || data.deleted === true || data.hidden === true) {
      throw new HttpsError('not-found', 'That post is no longer available.');
    }
    const reel = data.reel && typeof data.reel === 'object' ? data.reel as JsonRecord : {};
    postKasem = text(data.text, 500);
    about = [text(reel.context), text(reel.topic)].filter(Boolean).join(' ');
    postTitle = text(reel.topic) || 'a community post';
  }

  const terms = lessonTermsFrom(postTitle, about);
  const entries = await publishedEntriesFor(terms, 4);
  const subject = postTitle ? `the Explore post "${postTitle}"` : 'an Explore post';
  const postNote = `The post is the topic, not a source. Its own Kasem${postKasem ? ` ("${postKasem.slice(0, 300)}")` : ''} has not been checked by the dictionary's reviewers: if you quote it, say "from the post, not verified". Teach the verified words below that relate to the post; if there are none, say the dictionary does not hold words for this post yet, teach nothing in Kasem, and close the lesson.`;
  return {
    title: postTitle || 'Explore post',
    entries,
    instruction: [
      lessonRules(subject, postNote),
      about ? `What the post says about itself (English, from its author): ${about.slice(0, 800)}` : '',
      entries.length
        ? dictionaryBriefing(terms, entries)
        : 'DICTIONARY LOOKUP — the published dictionary holds no entries for the words this post is about.',
    ].filter(Boolean).join('\n\n'),
  };
}
