/**
 * Editing a word that is already published, and folding two of them into one.
 *
 * ── The gap this closes ───────────────────────────────────────────────────
 * Until now the only way a published entry could change was for somebody to
 * contribute a correction, wait for it to be reviewed, and have it published as
 * a *second* document. A validator who could see that `bakeira` had been filed
 * with a typo in its example sentence had exactly one tool: reject the next
 * contribution. So the archive accumulated duplicates — the same word entered
 * twice by two members who could not see each other's work — and nothing could
 * remove one without also removing the citation that pointed at it.
 *
 * This module is the pure half of the fix. It knows how to turn a patch into a
 * document and two documents into one, and it knows nothing about Firestore, so
 * every rule below is exercisable under `node --test` with no emulator running.
 * `dictionary-admin.ts` is the half that holds the transaction.
 *
 * ── The three rules the whole module turns on ─────────────────────────────
 *
 * 1. **A patch names what it changes.** An absent key means "leave it alone",
 *    never "clear it". A form that posts every field on every save would let a
 *    validator who opened the editor to fix a typo silently blank the etymology
 *    a different person spent an afternoon on.
 *
 * 2. **A merge fills blanks; it does not overwrite answers.** Where both
 *    entries say something the target's answer wins by default, because the
 *    target is the entry that keeps its id and therefore its citations. Where
 *    only one says anything, that one wins whichever side it is on. A reviewer
 *    who wants the other answer says so explicitly, per field.
 *
 * 3. **Nothing is destroyed to tidy up.** Merging retires the source rather
 *    than deleting it: `mergedInto` is left on the document so an old link
 *    still resolves to something that can point onwards. Hard deletion exists,
 *    is admin-only, and carries the whole document into the audit log first.
 */

import {
  canonicalLexicalKind,
  canonicalPartOfSpeech,
  normaliseTranslations,
  parseAlsoUsedAs,
  parseIpa,
  parseTranslations,
  MAX_ETYMOLOGY_LENGTH,
  MAX_KASEM_DEFINITION_LENGTH,
} from './lexical-kinds.js';
import {
  FORM_SLOTS,
  hasLexicalForms,
  parseLexicalForms,
  readStoredForms,
  storableForms,
  type FormSlot,
  type LexicalForms,
} from './kasem-morphology.js';
import {
  parseSenses,
  sensesAddDetail,
  sensesOrLegacy,
  sensesToTranslations,
  storableSenses,
  type LexicalSense,
} from './lexical-senses.js';
import { headwordKey } from './kasem-homographs.js';

type JsonRecord = Record<string, any>;

/** The longest a headword may be. Generous: a proverb is a lexical entry too. */
export const MAX_HEADWORD_LENGTH = 400;

/** The longest the flat English summary line may be — as `creators.ts` stores it. */
export const MAX_ENGLISH_LENGTH = 180;

/**
 * The longest an example sentence may be, either side.
 *
 * Named for the entry rather than for the sense, because `lexical-senses.ts`
 * exports a `MAX_EXAMPLE_LENGTH` of its own at 400 and the two are genuinely
 * different limits: a sense's example is one sentence, and the entry-level
 * field has held a short paragraph since before senses existed.
 */
export const MAX_ENTRY_EXAMPLE_LENGTH = 4000;

/** The longest a free-text note may be. */
export const MAX_NOTE_LENGTH = 2000;

/**
 * A reason is required on every edit, merge and deletion, and it is not
 * ceremony: the audit entry is the only record of why a published word changed,
 * and "updated" tells a future reader nothing they could not already see.
 */
export const MIN_REASON_LENGTH = 10;
export const MAX_REASON_LENGTH = 2000;

/**
 * Every field an editor may touch, in the order the editor draws them.
 *
 * Deliberately a list rather than "everything the client sent". The document
 * also carries `contributorId`, `approvedBy`, `homographIndex`,
 * `sourceContribution` and `createdAt` — provenance, not content — and a patch
 * that could rewrite those would let a validator reassign somebody else's
 * authorship, or renumber a homograph and break every citation of it.
 */
export const EDITABLE_FIELDS = [
  'kasemText',
  'translations',
  'englishText',
  'senses',
  'partOfSpeech',
  'alsoUsedAs',
  'lexicalKind',
  'dialect',
  'ipa',
  'pronunciation',
  'kasemDefinition',
  'etymology',
  'kasemExample',
  'englishExample',
  'culturalNote',
  'source',
  'forms',
  'nounClass',
  'isPublished',
] as const;

export type EditableField = (typeof EDITABLE_FIELDS)[number];

/** One field's before and after, for the audit entry. */
export interface FieldChange {
  readonly field: string;
  readonly before: unknown;
  readonly after: unknown;
}

/** What an edit amounts to: the fields to write, and what they were. */
export interface EntryEditResult {
  /** The keys to `update()` on the entry document. Empty when nothing changed. */
  readonly update: JsonRecord;
  /**
   * Field-level before/after, for the audit log.
   *
   * The array itself is mutable so the caller can append the one change it,
   * rather than this module, is in a position to work out: a respelling's new
   * homograph number, which needs a query over the group the entry has moved
   * into. See `renumberOnRespell`.
   */
  readonly changes: FieldChange[];
  /**
   * The new grouping key when the headword was respelled, or null.
   *
   * Surfaced separately because respelling is the one edit that has a
   * consequence outside the document — see [renumberOnRespell].
   */
  readonly newHeadwordKey: string | null;
}

// ---------------------------------------------------------------------------
// Reading a patch
// ---------------------------------------------------------------------------

function text(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, max).trim();
}

/** Prose keeps its line breaks; only runs of blanks collapse. */
function prose(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  return value.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, max).trim();
}

/**
 * The patch, reduced to the fields this module recognises and the shapes it
 * stores.
 *
 * Unknown keys are dropped silently rather than rejected. A client one version
 * ahead of this backend sending a field that does not exist yet is not an
 * error the validator can act on, and failing their whole edit over it would
 * lose the six corrections they made beside it.
 */
export function parseEntryPatch(raw: unknown): Map<EditableField, unknown> {
  const out = new Map<EditableField, unknown>();
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return out;
  const source = raw as JsonRecord;

  for (const field of EDITABLE_FIELDS) {
    if (!(field in source)) continue;
    const value = source[field];
    switch (field) {
      case 'kasemText': {
        const headword = text(value, MAX_HEADWORD_LENGTH);
        // The one field that cannot be cleared. An entry with no headword
        // cannot be looked up, cannot be said aloud, and the mobile reader
        // drops it on parse — so it would vanish from the dictionary without
        // anybody having asked for it to be withdrawn.
        if (headword) out.set(field, headword);
        break;
      }
      case 'englishText':
        out.set(field, text(value, MAX_ENGLISH_LENGTH));
        break;
      case 'translations':
        out.set(field, normaliseTranslations(value));
        break;
      case 'senses':
        out.set(field, parseSenses(value));
        break;
      case 'partOfSpeech':
        // Free text as the contributor's client sent it, exactly as
        // `creators.ts` stores it; the stable id is derived beside it below.
        out.set(field, text(value, 80));
        break;
      case 'alsoUsedAs':
        out.set(field, parseAlsoUsedAs(value));
        break;
      case 'lexicalKind':
        out.set(field, canonicalLexicalKind(value));
        break;
      case 'dialect':
        out.set(field, text(value, 80));
        break;
      case 'ipa':
        out.set(field, parseIpa(value));
        break;
      case 'pronunciation':
        out.set(field, text(value, 200));
        break;
      case 'kasemDefinition':
        out.set(field, prose(value, MAX_KASEM_DEFINITION_LENGTH));
        break;
      case 'etymology':
        out.set(field, prose(value, MAX_ETYMOLOGY_LENGTH));
        break;
      case 'kasemExample':
      case 'englishExample':
        out.set(field, prose(value, MAX_ENTRY_EXAMPLE_LENGTH));
        break;
      case 'culturalNote':
        out.set(field, prose(value, MAX_NOTE_LENGTH));
        break;
      case 'source':
        out.set(field, text(value, 1200));
        break;
      case 'forms':
        // Parsed against whatever classes the patch or the entry ends up
        // claiming, which the caller resolves — see [applyEntryPatch].
        out.set(field, value);
        break;
      case 'nounClass':
        out.set(field, text(value, 80));
        break;
      case 'isPublished':
        out.set(field, value === true);
        break;
    }
  }
  return out;
}

function sameValue(before: unknown, after: unknown): boolean {
  if (Array.isArray(before) || Array.isArray(after)) {
    return JSON.stringify(before ?? []) === JSON.stringify(after ?? []);
  }
  if (before && after && typeof before === 'object' && typeof after === 'object') {
    return JSON.stringify(before) === JSON.stringify(after);
  }
  return (before ?? '') === (after ?? '');
}

/**
 * Turns a parsed patch and the stored entry into the update to write.
 *
 * ── Why the derived fields are recomputed here and not asked for ──────────
 * `headwordKey`, `englishTranslations` and `partOfSpeechId` are all functions
 * of fields the editor does show. Accepting them from a client would mean a
 * form that forgot to recompute one could file a word under a grouping key
 * that does not match its spelling — which makes the entry invisible to
 * homograph numbering and to every duplicate check, silently and for ever.
 *
 * The rule the recomputation follows is the one `creators.ts` publishes under,
 * so an edited entry and a freshly published one are the same shape. Where the
 * two differ the difference is a bug in one of them, and a test says so.
 */
export function applyEntryPatch(existing: JsonRecord, patch: Map<EditableField, unknown>): EntryEditResult {
  const update: JsonRecord = {};
  const changes: FieldChange[] = [];
  let newHeadwordKey: string | null = null;

  const record = (field: string, before: unknown, after: unknown) => {
    if (sameValue(before, after)) return;
    update[field] = after;
    changes.push({ field, before: before ?? null, after });
  };

  // ── The classes this entry will claim once the patch lands ──────────────
  // Resolved before the forms, because which slots are storable depends on it:
  // a word changed from noun to verb keeps its tenses and drops its plural,
  // and doing that in the other order would store the plural of a verb.
  const declaredClassRaw = patch.has('partOfSpeech')
    ? (patch.get('partOfSpeech') as string)
    : String(existing.partOfSpeech ?? '');
  const declaredClass = canonicalPartOfSpeech(declaredClassRaw ?? '')
    ?? canonicalPartOfSpeech(existing.partOfSpeechId)
    ?? '';
  const alsoUsedAs = (patch.has('alsoUsedAs')
    ? (patch.get('alsoUsedAs') as string[])
    : (Array.isArray(existing.alsoUsedAs) ? existing.alsoUsedAs.filter((id: unknown) => typeof id === 'string') : [])
  ).filter((id: string) => id !== declaredClass);

  if (patch.has('kasemText')) {
    const headword = patch.get('kasemText') as string;
    record('kasemText', existing.kasemText, headword);
    const key = headwordKey(headword);
    if (key !== headwordKey(existing.kasemText)) {
      record('headwordKey', existing.headwordKey ?? '', key);
      newHeadwordKey = key;
    } else if (typeof existing.headwordKey !== 'string' || !existing.headwordKey) {
      // A legacy row that predates the field gains it on its first edit. Not a
      // change anybody asked for, and the cheapest possible moment to make one
      // of the archive's oldest rows visible to duplicate detection.
      record('headwordKey', existing.headwordKey ?? '', key);
    }
  }

  if (patch.has('translations')) {
    record('translations', existing.translations ?? [], patch.get('translations'));
  }
  if (patch.has('partOfSpeech')) {
    record('partOfSpeech', existing.partOfSpeech ?? '', declaredClassRaw);
    record('partOfSpeechId', existing.partOfSpeechId ?? '', declaredClass || 'unknown');
  }
  if (patch.has('alsoUsedAs')) {
    record('alsoUsedAs', existing.alsoUsedAs ?? [], alsoUsedAs);
  }
  for (const field of ['lexicalKind', 'dialect', 'ipa', 'pronunciation', 'kasemDefinition',
    'etymology', 'kasemExample', 'englishExample', 'culturalNote', 'source', 'nounClass',
    'isPublished'] as const) {
    if (patch.has(field)) record(field, existing[field], patch.get(field));
  }

  // A validator's noun class outranks the induction that wrote the stored one.
  // `creators.ts` reads `nounClassSource === 'validator'` on re-publish and
  // carries the human answer forward rather than re-inducing over it, so this
  // flag is what makes the correction survive the next publication.
  if (patch.has('nounClass')) {
    record('nounClassSource', existing.nounClassSource ?? '', 'validator');
  }

  if (patch.has('forms')) {
    const forms = parseLexicalForms(patch.get('forms'), [declaredClass, ...alsoUsedAs]);
    const stored = storableForms(forms);
    record('forms', existing.forms ?? {}, stored);
  }

  // ── The English side, and the list every reader consults ────────────────
  // `englishText` is the flat summary line; `englishTranslations` is the same
  // list split. Both are recomputed whenever either the summary or the senses
  // move, because a summary line that no longer matches its senses is the one
  // inconsistency a reader can see without opening the raw document.
  const senses: LexicalSense[] = patch.has('senses')
    ? (patch.get('senses') as LexicalSense[])
    : parseSenses(existing.senses);
  const englishText = patch.has('englishText')
    ? (patch.get('englishText') as string)
    : String(existing.englishText ?? '');
  if (patch.has('englishText')) record('englishText', existing.englishText ?? '', englishText);
  if (patch.has('senses')) {
    // Only where the senses say more than the flat gloss already says — the
    // same guard `creators.ts` publishes under, so an entry whose senses were
    // cleared loses the array rather than keeping an empty one.
    record('senses', existing.senses ?? [], sensesAddDetail(senses) ? storableSenses(senses) : []);
  }
  if (patch.has('senses') || patch.has('englishText')) {
    const resolved = sensesOrLegacy({
      senses,
      translations: parseTranslations(englishText),
      kasemExample: patch.has('kasemExample')
        ? (patch.get('kasemExample') as string)
        : String(existing.kasemExample ?? ''),
      englishExample: patch.has('englishExample')
        ? (patch.get('englishExample') as string)
        : String(existing.englishExample ?? ''),
      kasemDefinition: patch.has('kasemDefinition')
        ? (patch.get('kasemDefinition') as string)
        : String(existing.kasemDefinition ?? ''),
    });
    record('englishTranslations', existing.englishTranslations ?? [], sensesToTranslations(resolved));
  }

  return { update, changes, newHeadwordKey };
}

/**
 * Whether a respelling should hand the entry a fresh homograph number.
 *
 * ── The one place the "never reassign" rule bends, and why it must ────────
 * `kasem-homographs.ts` is emphatic that a number is an identity and is never
 * reassigned, and that is right for every case it was written for: publishing,
 * re-publishing, withdrawing. Respelling is the case it was not written for.
 *
 * `mo²` respelled to `mɔ` is no longer one of the words written `mo`. Keeping
 * the 2 leaves a superscript that points into a series the entry has left,
 * while the group it has joined may already have a `mɔ²` — two different words
 * rendering the identical string, which is the exact failure the numbering
 * exists to prevent. So a respelling that changes the grouping key takes the
 * next free number in the group it has moved to, and the number it vacated is
 * never handed out again, exactly as an unpublished entry's is not.
 *
 * A respelling that does *not* change the grouping key — capitalisation, a
 * doubled space — changes nothing and keeps the number it had.
 */
export function renumberOnRespell(result: EntryEditResult): boolean {
  return result.newHeadwordKey !== null;
}

// ---------------------------------------------------------------------------
// Merging two entries
// ---------------------------------------------------------------------------

/** Which side a reviewer chose for one field. */
export type MergeSide = 'target' | 'source';

/** What a merge produced. */
export interface MergeResult {
  /** The keys to `update()` on the target. */
  readonly update: JsonRecord;
  /** Which fields took the source's value, and what they were before. */
  readonly changes: readonly FieldChange[];
  /** Fields where both sides said something and the target's answer was kept. */
  readonly kept: readonly string[];
}

/** Scalar fields a merge considers, in the order the compare screen draws them. */
const MERGE_SCALARS = [
  'englishText',
  'kasemDefinition',
  'ipa',
  'pronunciation',
  'etymology',
  'kasemExample',
  'englishExample',
  'culturalNote',
  'source',
  'dialect',
  'partOfSpeech',
  'audioUrl',
  'nounClass',
] as const;

/** List fields a merge unions rather than choosing between. */
const MERGE_LISTS = ['translations', 'englishTranslations', 'alsoUsedAs'] as const;

function scalar(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function unionStrings(left: unknown, right: unknown, limit: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const list of [left, right]) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (typeof item !== 'string') continue;
      const value = item.trim();
      if (!value) continue;
      const key = value.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(value);
      if (out.length >= limit) return out;
    }
  }
  return out;
}

/**
 * Folds [source] into [target], and says what it did.
 *
 * The default is conservative on purpose: the target keeps every answer it
 * already has and gains only the ones it was missing. That is the behaviour a
 * reviewer expects from the word "merge", and it is the only default under
 * which merging the wrong way round is recoverable — nothing the target said
 * has been lost, so merging the other direction afterwards restores it.
 *
 * [choices] overrides that per field. A reviewer looking at two spellings of an
 * example sentence and preferring the source's says so explicitly, field by
 * field, on a screen that shows both.
 *
 * Lists are unioned rather than chosen between, because they are not
 * alternatives: two members who each gave one English meaning for a word have
 * given two meanings for it, and picking a side would throw one away.
 */
export function mergeEntryDocuments(args: {
  target: JsonRecord;
  source: JsonRecord;
  choices?: Record<string, MergeSide>;
}): MergeResult {
  const { target, source } = args;
  const choices = args.choices ?? {};
  const update: JsonRecord = {};
  const changes: FieldChange[] = [];
  const kept: string[] = [];

  for (const field of MERGE_SCALARS) {
    const mine = scalar(target[field]);
    const theirs = scalar(source[field]);
    if (!theirs) continue;
    const wantsSource = choices[field] === 'source';
    if (mine && !wantsSource) {
      kept.push(field);
      continue;
    }
    if (mine === theirs) continue;
    update[field] = theirs;
    changes.push({ field, before: target[field] ?? null, after: theirs });
  }

  for (const field of MERGE_LISTS) {
    const merged = unionStrings(target[field], source[field], 8);
    if (merged.length === 0) continue;
    if (sameValue(target[field] ?? [], merged)) continue;
    update[field] = merged;
    changes.push({ field, before: target[field] ?? [], after: merged });
  }

  // ── The paradigm merges slot by slot ────────────────────────────────────
  // Two members recording the same noun very often answered different halves
  // of it — one gave "the boy", the other "two boys" — and choosing a side
  // would discard exactly the form the merge was worth doing for.
  const mineForms = readStoredForms(target.forms);
  const theirForms = readStoredForms(source.forms);
  const forms: Record<string, string> = { ...storableForms(mineForms) };
  let formsChanged = false;
  for (const slot of FORM_SLOTS as readonly FormSlot[]) {
    const mine = mineForms[slot];
    const theirs = theirForms[slot];
    if (!theirs) continue;
    const wantsSource = choices[`forms.${slot}`] === 'source';
    if (mine && !wantsSource) {
      if (mine !== theirs) kept.push(`forms.${slot}`);
      continue;
    }
    if (mine === theirs) continue;
    forms[slot] = theirs;
    formsChanged = true;
  }
  if (formsChanged) {
    const stored: LexicalForms = { ...mineForms, ...forms } as unknown as LexicalForms;
    update.forms = hasLexicalForms(stored) ? forms : {};
    changes.push({ field: 'forms', before: target.forms ?? {}, after: update.forms });
  }

  // ── Senses append rather than replace ───────────────────────────────────
  // A duplicate entry is, by definition, the same word said by somebody else,
  // and what they said about it is a meaning the target may not carry. Senses
  // whose definition the target already has are dropped by `parseSenses`,
  // which de-duplicates case-insensitively on the definition — so merging the
  // same pair twice is a no-op rather than a doubling.
  const mergedSenses = parseSenses([
    ...storableSenses(parseSenses(target.senses)),
    ...storableSenses(parseSenses(source.senses)),
  ]);
  if (sensesAddDetail(mergedSenses) && !sameValue(target.senses ?? [], storableSenses(mergedSenses))) {
    update.senses = storableSenses(mergedSenses);
    changes.push({ field: 'senses', before: target.senses ?? [], after: update.senses });
    const flat = sensesToTranslations(mergedSenses);
    if (flat.length > 0 && !sameValue(target.englishTranslations ?? [], flat)) {
      update.englishTranslations = flat;
    }
  }

  return { update, changes, kept };
}

/**
 * The fields a compare screen should show, with both sides' answers.
 *
 * Built here rather than in the client so the screen a reviewer decides on and
 * the merge that runs afterwards are reading the same list. A field on one and
 * not the other is a decision the reviewer made about something that did not
 * happen, or a change they were never shown.
 */
export function mergePreview(target: JsonRecord, source: JsonRecord): {
  field: string;
  target: string;
  source: string;
  conflict: boolean;
}[] {
  const rows: { field: string; target: string; source: string; conflict: boolean }[] = [];
  for (const field of MERGE_SCALARS) {
    const mine = scalar(target[field]);
    const theirs = scalar(source[field]);
    if (!mine && !theirs) continue;
    rows.push({ field, target: mine, source: theirs, conflict: Boolean(mine && theirs && mine !== theirs) });
  }
  const mineForms = readStoredForms(target.forms);
  const theirForms = readStoredForms(source.forms);
  for (const slot of FORM_SLOTS as readonly FormSlot[]) {
    const mine = mineForms[slot];
    const theirs = theirForms[slot];
    if (!mine && !theirs) continue;
    rows.push({
      field: `forms.${slot}`,
      target: mine,
      source: theirs,
      conflict: Boolean(mine && theirs && mine !== theirs),
    });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Finding the duplicate in the first place
// ---------------------------------------------------------------------------

/**
 * How alike two headwords are, from 0 (unrelated) to 1 (the same string).
 *
 * ── Why this is edit distance and not the search folding ──────────────────
 * `foldForSearch` on the phone folds ɩ to i so a learner who cannot type ɩ
 * still finds the word. That is the right rule for a query and the wrong one
 * here: in a tone language the extended letter is frequently the *only* thing
 * distinguishing two words, so a duplicate check built on the folded form would
 * confidently report `dɩ` and `di` as the same entry and invite a reviewer to
 * merge two different words.
 *
 * So the comparison is on the spelling as written, case- and space-folded and
 * nothing more — the same grouping `headwordKey` uses — and near-misses are
 * reported as *near*, with their distance, for a human to judge. The function
 * never decides anything; it orders a list somebody then reads.
 */
export function headwordSimilarity(left: string, right: string): number {
  const a = headwordKey(left);
  const b = headwordKey(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const distance = editDistance(a, b);
  const longest = Math.max(a.length, b.length);
  return longest === 0 ? 0 : Math.max(0, 1 - distance / longest);
}

/** Levenshtein, two rows rather than a matrix. Headwords are short. */
function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[b.length];
}

/** One entry offered to a reviewer as an existing word. */
export interface DuplicateCandidate {
  readonly id: string;
  readonly kasemText: string;
  readonly englishText: string;
  readonly partOfSpeech: string;
  readonly dialect: string;
  readonly homographIndex: number;
  readonly isPublished: boolean;
  readonly hasAudio: boolean;
  /** 1 for an identical spelling; below 1 for a near miss. */
  readonly similarity: number;
  /** True only for an exact grouping-key match — the "this word already exists" case. */
  readonly exact: boolean;
}

/**
 * The similarity below which a near miss is not worth showing.
 *
 * Set so that a one-letter difference in a four-letter word (0.75) is offered
 * and a one-letter difference in a two-letter word (0.5) is not. Short Kasem
 * words that differ by one letter are overwhelmingly different words — `bu`,
 * `ba`, `bo` — and a prompt that cried duplicate on every one of them would be
 * dismissed unread, which costs more than the near miss it caught.
 */
export const DUPLICATE_SIMILARITY_FLOOR = 0.7;

/**
 * Orders candidate entries against a headword, exact matches first.
 *
 * Exactness is decided on [headwordKey] rather than on the raw string, so a
 * word contributed as "Bakeira" is reported as already existing when the
 * archive holds "bakeira". Ties break on the published entry first and then on
 * the homograph number, so the reviewer is offered the live word before a
 * withdrawn one and `mo¹` before `mo²`.
 */
export function rankDuplicates(
  headword: string,
  rows: readonly JsonRecord[],
  options?: { readonly excludeId?: string; readonly limit?: number },
): DuplicateCandidate[] {
  const key = headwordKey(headword);
  if (!key) return [];
  const excludeId = options?.excludeId ?? '';
  const limit = options?.limit ?? 25;
  const seen = new Set<string>();
  const out: DuplicateCandidate[] = [];

  for (const row of rows) {
    const id = String(row.id ?? '');
    if (!id || id === excludeId || seen.has(id)) continue;
    const kasem = String(row.kasemText ?? '');
    const similarity = headwordSimilarity(headword, kasem);
    if (similarity < DUPLICATE_SIMILARITY_FLOOR) continue;
    seen.add(id);
    out.push({
      id,
      kasemText: kasem,
      englishText: String(row.englishText ?? ''),
      partOfSpeech: String(row.partOfSpeech ?? row.partOfSpeechId ?? ''),
      dialect: String(row.dialect ?? ''),
      homographIndex: Number(row.homographIndex ?? 0) || 0,
      isPublished: row.isPublished === true,
      hasAudio: typeof row.audioUrl === 'string' && row.audioUrl.length > 0,
      similarity,
      exact: similarity === 1,
    });
  }

  out.sort((left, right) => {
    if (left.similarity !== right.similarity) return right.similarity - left.similarity;
    if (left.isPublished !== right.isPublished) return left.isPublished ? -1 : 1;
    if (left.homographIndex !== right.homographIndex) {
      return left.homographIndex - right.homographIndex;
    }
    return left.id.localeCompare(right.id);
  });
  return out.slice(0, limit);
}
