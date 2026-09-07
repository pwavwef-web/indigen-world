/**
 * The dictionary vocabulary the studio's entry editor works in.
 *
 * ── Why this file exists at all ──────────────────────────────────────────
 * The web workspace used to model a dictionary entry as six strings, because
 * that is what its form asked for. Everything the mobile app learned about
 * Kasem entries since — the paradigm, the noun class probes, the IPA, the
 * meaning stated in Kasem, and now the several senses a word carries — existed
 * only on the phone. A contributor at a desk with a keyboard, which is the
 * person best placed to write a careful entry, had the worst tool.
 *
 * These constants mirror the server's. `SENSE_REGISTERS`, `SENSE_DOMAINS` and
 * `MAX_*` come from `services/functions/src/lexical-senses.ts`; `FORM_SLOTS`
 * from `services/functions/src/kasem-morphology.ts`; the word classes from the
 * contracts schema, which is imported rather than copied. Where a list is
 * duplicated here it is because this bundle must not import server code, and
 * every such list carries the path of the one it must agree with.
 */
import lexicalEntrySchema from '@indigen-world/contracts/schemas/lexical-entry.schema.json';

export const PARTS_OF_SPEECH = (lexicalEntrySchema.properties.partOfSpeech.enum as string[]) ?? [];

/** Sentence-cased labels for the word-class ids, which are stored hyphenated. */
export function partOfSpeechLabel(id: string): string {
  if (!id) return '';
  const spaced = id.replace(/-/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * How a word is said, and to whom.
 *
 * Deliberately not the standard lexicographic abbreviations. "colloq." is a
 * vocabulary a contributor has to be taught before they can use it, and this
 * form is answered by speakers rather than by lexicographers. `avoided` is not
 * called "vulgar" for the same reason: what a Kasem speaker will actually tell
 * you is who they would not say it in front of.
 *
 * Mirrors `SENSE_REGISTERS` in services/functions/src/lexical-senses.ts and
 * `kSenseRegisters` in apps/mobile/lib/domain/entry_sense.dart.
 */
export const SENSE_REGISTERS: readonly { id: string; label: string }[] = [
  { id: 'everyday', label: 'Everyday speech' },
  { id: 'respectful', label: 'Said with respect' },
  { id: 'formal', label: 'Formal or ceremonial' },
  { id: 'colloquial', label: 'Casual, among friends' },
  { id: 'old', label: "Old people's word" },
  { id: 'new', label: 'Newer word' },
  { id: 'joking', label: 'Said jokingly' },
  { id: 'figurative', label: 'Figurative' },
  { id: 'childspeak', label: 'Said to children' },
  { id: 'avoided', label: 'Not said in front of elders' },
];

/**
 * What a sense is about.
 *
 * A closed list rather than free tags, because free tags produce "farming",
 * "farm", "Farming" and "agric" on four entries that mean the same thing,
 * which defeats the one query the field exists to serve: show me the
 * vocabulary of the farm.
 *
 * Mirrors `SENSE_DOMAINS` in services/functions/src/lexical-senses.ts.
 */
export const SENSE_DOMAINS: readonly { id: string; label: string }[] = [
  { id: 'farming', label: 'Farming and land' },
  { id: 'food', label: 'Food and cooking' },
  { id: 'kinship', label: 'Family and kinship' },
  { id: 'body', label: 'The body and health' },
  { id: 'animals', label: 'Animals' },
  { id: 'plants', label: 'Plants and trees' },
  { id: 'weather', label: 'Weather and seasons' },
  { id: 'market', label: 'Market and trade' },
  { id: 'house', label: 'House and compound' },
  { id: 'clothing', label: 'Clothing and adornment' },
  { id: 'ritual', label: 'Ritual and belief' },
  { id: 'chieftaincy', label: 'Chieftaincy and custom' },
  { id: 'greeting', label: 'Greetings and address' },
  { id: 'music', label: 'Music and dance' },
  { id: 'work', label: 'Work and craft' },
  { id: 'travel', label: 'Travel and place' },
  { id: 'time', label: 'Time and counting' },
  { id: 'speech', label: 'Speech and storytelling' },
];

export const MAX_SENSES = 12;

export function registerLabel(id: string): string {
  return SENSE_REGISTERS.find((entry) => entry.id === id)?.label ?? '';
}

export function domainLabel(id: string): string {
  return SENSE_DOMAINS.find((entry) => entry.id === id)?.label ?? '';
}

/**
 * The paradigm slots, with the question a contributor is actually asked.
 *
 * ── Why the labels are questions about talking ───────────────────────────
 * "Say it with *the*" is a question every Kasem speaker answers without
 * thinking. "Give the definite form of the noun, class III" is a question
 * about grammar that almost nobody can answer about their own language. The
 * server induces the class from the answer; the contributor is never asked to
 * name it. See the header of services/functions/src/kasem-morphology.ts.
 *
 * `classes` says which word classes the slot is drawn for, mirroring
 * `takesNounForms` / `takesVerbForms` / `takesAgreementForms` in
 * apps/mobile/lib/features/contribute/words/widgets/lexical_detail_fields.dart.
 */
export const FORM_SLOTS: readonly {
  id: string;
  label: string;
  hint: string;
  group: 'noun' | 'verb' | 'agreement';
}[] = [
  { id: 'definite', label: 'Say it with “the”', hint: 'the boy', group: 'noun' },
  { id: 'plural', label: 'Say it for many', hint: 'boys', group: 'noun' },
  { id: 'pluralDefinite', label: 'Say the many with “the”', hint: 'the boys', group: 'noun' },
  { id: 'counted', label: 'Say it with “two”', hint: 'two boys', group: 'noun' },
  { id: 'pronoun', label: 'What you call it afterwards', hint: 'he, it', group: 'noun' },
  { id: 'present', label: 'Say it for now', hint: 'he eats', group: 'verb' },
  { id: 'past', label: 'Say it for yesterday', hint: 'he ate', group: 'verb' },
  { id: 'future', label: 'Say it for tomorrow', hint: 'he will eat', group: 'verb' },
  { id: 'pluralSubject', label: 'Say it of several people', hint: 'they eat', group: 'verb' },
  { id: 'imperative', label: 'Say it as an instruction', hint: 'eat!', group: 'verb' },
  { id: 'agreeingOne', label: 'Used with one thing', hint: 'te maama', group: 'agreement' },
  { id: 'agreeingTwo', label: 'And used with another', hint: 'ya maama', group: 'agreement' },
];

const NOUN_CLASSES = new Set(['noun', 'proper-noun']);
const VERB_CLASSES = new Set(['verb', 'auxiliary-verb']);
const AGREEING_CLASSES = new Set([
  'adjective',
  'quantifier',
  'numeral',
  'determiner',
  'article',
  'pronoun',
]);

/** Which paradigm groups a word claiming these classes should be asked for. */
export function formGroupsFor(classes: string[]): Set<'noun' | 'verb' | 'agreement'> {
  const groups = new Set<'noun' | 'verb' | 'agreement'>();
  for (const id of classes) {
    if (NOUN_CLASSES.has(id)) groups.add('noun');
    if (VERB_CLASSES.has(id)) groups.add('verb');
    if (AGREEING_CLASSES.has(id)) groups.add('agreement');
  }
  return groups;
}

/**
 * The letters of Kasem that no keyboard on the contributor's desk produces.
 *
 * ── This palette is not a convenience ────────────────────────────────────
 * 785 of the 1200 published entries carry at least one of these characters —
 * ɩ in 640 headwords, ʋ in 195, ə in 177, ɔ in 156, ŋ in 115, ɛ in 9 (see
 * apps/mobile/lib/domain/kasem_orthography.dart, which counted them). A web
 * form with no way to type them is a form on which two thirds of the language
 * cannot be entered correctly, and the workaround a contributor reaches for is
 * to type the nearest ASCII letter — which silently files the word under the
 * wrong headword and makes it a different word from the one already in the
 * archive.
 *
 * The tone marks are here for the same reason and are used far more rarely.
 * They are combining characters and attach to the letter before them.
 */
export const KASEM_CHARACTERS: readonly {
  char: string;
  name: string;
  combining?: boolean;
}[] = [
  { char: 'ɛ', name: 'open e' },
  { char: 'Ɛ', name: 'open E' },
  { char: 'ɩ', name: 'iota' },
  { char: 'Ɩ', name: 'capital iota' },
  { char: 'ŋ', name: 'eng' },
  { char: 'Ŋ', name: 'capital eng' },
  { char: 'ɔ', name: 'open o' },
  { char: 'Ɔ', name: 'open O' },
  { char: 'ʋ', name: 'v with hook' },
  { char: 'Ʋ', name: 'capital v with hook' },
  { char: 'ə', name: 'schwa' },
  { char: 'ɣ', name: 'gamma' },
  { char: '́', name: 'high tone', combining: true },
  { char: '̀', name: 'low tone', combining: true },
  { char: '̄', name: 'mid tone', combining: true },
];

/**
 * The grouping key homographs are decided by.
 *
 * Case- and whitespace-insensitive, and deliberately NOT diacritic-folding:
 * this decides which entries are *the same word*, and merging ɩ with i would
 * collapse two genuinely different lexemes into one numbered series, which is
 * the exact error homograph numbering exists to prevent.
 *
 * Mirrors `headwordKey` in services/functions/src/kasem-homographs.ts and
 * apps/mobile/lib/domain/kasem_homographs.dart.
 */
export function headwordKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** One example sentence, in Kasem and in English. Either half may be empty. */
export interface SenseExampleDraft {
  kasem: string;
  english: string;
}

/** One meaning, as the editor holds it. */
export interface SenseDraft {
  /** Stable across re-orders so React keys survive a move. */
  key: string;
  definition: string;
  partOfSpeech: string;
  register: string;
  domain: string;
  kasemDefinition: string;
  usageNote: string;
  examples: SenseExampleDraft[];
  synonyms: string;
  antonyms: string;
}

/** The whole entry, as the editor holds it. */
export interface EntryDraft {
  headword: string;
  partOfSpeech: string;
  alsoUsedAs: string[];
  dialect: string;
  ipa: string;
  kasemDefinition: string;
  etymology: string;
  forms: Record<string, string>;
  senses: SenseDraft[];
  source: string;
  notes: string;
  culturalPermissionTier: string;
  licence: string;
  consentGranted: boolean;
  publicationPermission: boolean;
}

let senseKeySeed = 0;

export function emptySense(): SenseDraft {
  senseKeySeed += 1;
  return {
    key: `sense-${senseKeySeed}`,
    definition: '',
    partOfSpeech: '',
    register: '',
    domain: '',
    kasemDefinition: '',
    usageNote: '',
    examples: [{ kasem: '', english: '' }],
    synonyms: '',
    antonyms: '',
  };
}

export function emptyDraft(): EntryDraft {
  return {
    headword: '',
    partOfSpeech: 'noun',
    alsoUsedAs: [],
    dialect: 'Navrongo',
    ipa: '',
    kasemDefinition: '',
    etymology: '',
    forms: {},
    senses: [emptySense()],
    source: '',
    notes: '',
    culturalPermissionTier: 'public',
    licence: 'community_restricted',
    consentGranted: false,
    publicationPermission: true,
  };
}

/** Splits a comma/slash separated list the way every other list field is split. */
export function splitList(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const piece of raw.split(/[,/\n\r]+/)) {
    const value = piece.trim().replace(/\s+/g, ' ');
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
    if (out.length >= 8) break;
  }
  return out;
}

/**
 * The senses, shaped for `submitCollectionContribution`.
 *
 * Empty values are omitted rather than sent blank, for the same reason the
 * paradigm omits its unanswered slots: an absent key is "nobody said" and an
 * empty string is "somebody said nothing", and the record turns on that
 * difference. Mirrors `parseSenses` in lexical-senses.ts, which validates
 * every key and drops what it does not recognise.
 */
export function sensesPayload(senses: SenseDraft[]): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const sense of senses) {
    const definition = sense.definition.trim();
    if (!definition) continue;
    const examples = sense.examples
      .map((example) => ({ kasem: example.kasem.trim(), english: example.english.trim() }))
      .filter((example) => example.kasem || example.english);
    out.push({
      definition,
      ...(sense.partOfSpeech ? { partOfSpeech: sense.partOfSpeech } : {}),
      ...(sense.register ? { register: sense.register } : {}),
      ...(sense.domain ? { domain: sense.domain } : {}),
      ...(sense.kasemDefinition.trim() ? { kasemDefinition: sense.kasemDefinition.trim() } : {}),
      ...(sense.usageNote.trim() ? { usageNote: sense.usageNote.trim() } : {}),
      ...(examples.length > 0 ? { examples } : {}),
      ...(sense.synonyms.trim() ? { synonyms: splitList(sense.synonyms) } : {}),
      ...(sense.antonyms.trim() ? { antonyms: splitList(sense.antonyms) } : {}),
    });
    if (out.length >= MAX_SENSES) break;
  }
  return out;
}

/** The answered paradigm slots only. */
export function formsPayload(forms: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [slot, value] of Object.entries(forms)) {
    const trimmed = value.trim();
    if (trimmed) out[slot] = trimmed;
  }
  return out;
}

/**
 * What an entry still lacks, and how complete it is.
 *
 * ── Guidance, never a gate ───────────────────────────────────────────────
 * Nothing in this list blocks a submission, and that is deliberate. A
 * contributor who knows a word means "bottle" and nothing else has given the
 * archive something real, and a form that refused it until they invented an
 * etymology would be trading a true small record for a false large one. The
 * meter says what a full entry looks like so that somebody who *does* know the
 * rest can see what is still missing — which is a different thing from being
 * told they may not send.
 */
export interface CompletenessItem {
  label: string;
  done: boolean;
  weight: number;
  hint: string;
}

export function completeness(draft: EntryDraft): {
  items: CompletenessItem[];
  score: number;
} {
  const filledSenses = draft.senses.filter((sense) => sense.definition.trim());
  const anyExample = filledSenses.some((sense) =>
    sense.examples.some((example) => example.kasem.trim() || example.english.trim()),
  );
  const anyLabel = filledSenses.some((sense) => sense.register || sense.domain);
  const groups = formGroupsFor([draft.partOfSpeech, ...draft.alsoUsedAs]);
  const wantsForms = groups.size > 0;
  const answeredForms = Object.values(draft.forms).filter((value) => value.trim()).length;

  const items: CompletenessItem[] = [
    {
      label: 'Headword',
      done: Boolean(draft.headword.trim()),
      weight: 3,
      hint: 'The word as it is written in Kasem.',
    },
    {
      label: 'At least one meaning',
      done: filledSenses.length > 0,
      weight: 3,
      hint: 'What the word means in English.',
    },
    {
      label: 'An example sentence',
      done: anyExample,
      weight: 2,
      hint: 'A learner understands a word from a sentence long before a gloss.',
    },
    {
      label: 'The meaning said in Kasem',
      done: Boolean(draft.kasemDefinition.trim()) ||
        filledSenses.some((sense) => sense.kasemDefinition.trim()),
      weight: 2,
      hint: 'The only text on the record written in the language rather than about it.',
    },
    {
      label: 'How it is said',
      done: Boolean(draft.ipa.trim()),
      weight: 1,
      hint: 'The transcription is what survives when there is no speaker to ask.',
    },
    ...(wantsForms
      ? [
          {
            label: 'Some of the forms',
            done: answeredForms >= 2,
            weight: 2,
            hint: 'Two forms of one word are evidence about its class; one is not.',
          },
        ]
      : []),
    {
      label: 'A register or subject field',
      done: anyLabel,
      weight: 1,
      hint: 'Who says it, and what it is about.',
    },
    {
      label: 'Where it came from',
      done: Boolean(draft.source.trim()),
      weight: 2,
      hint: 'Who told you, or which book it is in.',
    },
  ];

  const total = items.reduce((sum, item) => sum + item.weight, 0);
  const earned = items.reduce((sum, item) => sum + (item.done ? item.weight : 0), 0);
  return { items, score: total === 0 ? 0 : Math.round((earned / total) * 100) };
}

/**
 * Where an in-progress entry is kept between page loads.
 *
 * ── Why a draft is saved at all ──────────────────────────────────────────
 * A careful entry with four senses and a paradigm is twenty minutes of work,
 * and the browser tab it lives in is one stray reload away from losing all of
 * it. Nothing about that work is private to a server round-trip, so it is kept
 * in the browser rather than written to Firestore: a half-finished entry is
 * not a submission, and putting one in the review collection would either
 * clutter the queue or need a status nobody else honours.
 */
const DRAFT_KEY = 'tribestudio.dictionary.draft.v1';

export function saveDraft(draft: EntryDraft): void {
  try {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // A full or disabled store is not worth telling somebody about mid-sentence.
    // The entry is still on screen and still submittable.
  }
}

export function loadDraft(): EntryDraft | null {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<EntryDraft>;
    if (!parsed || typeof parsed !== 'object') return null;
    const base = emptyDraft();
    return {
      ...base,
      ...parsed,
      // Rebuilt rather than trusted: a stored draft from an older build may
      // have senses without keys, and a React list keyed on undefined re-mounts
      // every row on every keystroke.
      senses:
        Array.isArray(parsed.senses) && parsed.senses.length > 0
          ? parsed.senses.map((sense) => ({ ...emptySense(), ...sense, key: emptySense().key }))
          : base.senses,
      forms: typeof parsed.forms === 'object' && parsed.forms ? parsed.forms : {},
      alsoUsedAs: Array.isArray(parsed.alsoUsedAs) ? parsed.alsoUsedAs : [],
      // Never restored. Consent is an act, not a preference, and a checkbox
      // that comes back ticked from last week is a consent nobody gave today.
      consentGranted: false,
    };
  } catch {
    return null;
  }
}

export function clearDraft(): void {
  try {
    window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    // Nothing to recover from: the next save overwrites it anyway.
  }
}
