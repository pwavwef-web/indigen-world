import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { requireAuth } from './auth.js';
import { consumeRateLimit } from './rate-limit.js';
import { googleProjectId } from './google-api-auth.js';
import { CONTRIBUTOR_CALL_OPTIONS, boundedText, guarded, requireActiveContributor } from './contributor-common.js';
import { normaliseTerm, publishedEntriesFor } from './kawuri-dictionary.js';
import { readKawuriMediaConfig, reasonOf } from './kawuri-media-policy.js';
import { generateStructured } from './kawuri-vertex.js';

/**
 * Kawuri Intelligence inside the contributor workspace.
 *
 * ── Three answers, kept apart ─────────────────────────────────────────────
 * Every response has up to three parts, and the portal labels each for what
 * it is:
 *   1. Checks — deterministic, no model: is there a translation, is the
 *      English in the Kasem box, was reviewer feedback addressed, is there a
 *      usage note. Advice only; nothing here blocks a submission.
 *   2. Sources — reviewed material: the assignment's own instructions, the
 *      published dictionary's entries for words in the English (with ids),
 *      and the Platform Guide sections that apply.
 *   3. Suggestions — Gemini, labelled as unreviewed AI suggestions. It is
 *      told never to write Kasem and never to judge the contributor's Kasem,
 *      because language on this platform "is confirmed by appointed speakers
 *      before it counts as guidance" (kawuri.ts). Any suggestion containing
 *      Kasem-only letters is dropped before it leaves this function, as a
 *      second line behind that instruction.
 *
 * ── What never happens ────────────────────────────────────────────────────
 * Nothing is written to the contribution. The model never sees the
 * contributor's Kasem: it is told whether a translation exists, how many
 * alternatives there are, and the (English) usage note and reviewer feedback.
 * Nothing the contributor or the model wrote is logged.
 *
 * When Vertex is unreachable the checks and sources still come back with
 * `configured: false` and the reason code, and the portal says so plainly.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
export const ASSIST_PER_MINUTE = 10;
export const ASSIST_PER_DAY = 80;

export const ASSIST_MODES = ['explain_assignment', 'context_needed', 'check_draft'] as const;
export type AssistMode = (typeof ASSIST_MODES)[number];

/** Platform Guide section ids, shared with the portal's guide page. */
export const GUIDE_SECTIONS = {
  assignments: 'How assignments work',
  'good-contribution': 'What makes a good Kasem contribution',
  'alternatives-context': 'Alternative expressions and context',
  review: 'Review, feedback and revisions',
  payments: 'Payment details and eligibility',
  privacy: 'Privacy and what others see',
  'report-problem': 'Reporting a problem',
} as const;
export type GuideSectionId = keyof typeof GUIDE_SECTIONS;
const GUIDE_IDS = Object.keys(GUIDE_SECTIONS) as GuideSectionId[];

const MODE_GUIDES: Record<AssistMode, GuideSectionId[]> = {
  explain_assignment: ['assignments', 'good-contribution'],
  context_needed: ['alternatives-context', 'good-contribution'],
  check_draft: ['good-contribution', 'alternatives-context', 'review'],
};

export interface DraftCheck {
  id: string;
  severity: 'ask' | 'warn' | 'note';
  title: string;
  detail: string;
  guideSection: GuideSectionId;
}

/** The letters only a Kasem keyboard produces (see contribution-assist.ts). */
const KASEM_LETTERS = /[ɩɪʋʊəɔŋɛɣƖƐƆŊƲƏƔ]/u;

/** Function words and very common English words, for "is this English?". */
const COMMON_ENGLISH = new Set([
  'the', 'a', 'an', 'and', 'or', 'is', 'are', 'am', 'was', 'were', 'be', 'to', 'of', 'in', 'on', 'at', 'for',
  'with', 'you', 'your', 'i', 'me', 'my', 'we', 'us', 'our', 'he', 'she', 'it', 'they', 'them', 'this', 'that',
  'how', 'what', 'where', 'when', 'who', 'why', 'please', 'thank', 'thanks', 'good', 'morning', 'evening',
  'night', 'come', 'go', 'will', 'can', 'could', 'would', 'do', 'does', 'did', 'have', 'has', 'not', 'yes',
  'no', 'let', 'see', 'tomorrow', 'today', 'family', 'home', 'here', 'there', 'again', 'sit', 'eat', 'water',
]);

function words(value: string): string[] {
  return value.toLowerCase().split(/[^\p{L}\p{M}'’]+/u).map((word) => word.replace(/^['’]+|['’]+$/g, '')).filter(Boolean);
}

/**
 * "Is this English?" — asked cautiously. A false alarm aimed at a speaker
 * writing their own language is worse than a missed slip (see
 * contribution-assist.ts), so single letters do not count, Kasem letters rule
 * it out, and nearly every word has to be common English.
 */
export function looksEnglish(value: string): boolean {
  if (KASEM_LETTERS.test(value)) return false;
  const tokens = words(value).filter((token) => token.length >= 2);
  if (tokens.length < 2) return false;
  return tokens.filter((token) => COMMON_ENGLISH.has(token)).length / tokens.length >= 0.75;
}

/** Content words of the English expression, whole phrase first, for dictionary citations. */
export function expressionTerms(expression: string): string[] {
  const whole = normaliseTerm(expression.replace(/[.?!]+\s*$/, ''));
  const stop = new Set([...COMMON_ENGLISH].filter((word) => !['family', 'water', 'morning', 'evening', 'night', 'home', 'eat', 'sit', 'tomorrow', 'today'].includes(word)));
  const content = words(expression).filter((word) => word.length >= 3 && !stop.has(word));
  return [...new Set([whole, ...content])].filter(Boolean).slice(0, 12);
}

/** Advice a contributor can read before submitting. Pure; never blocks anything. */
export function draftChecks(input: {
  expression: string;
  translation: string;
  alternatives: string[];
  context: string;
  feedback: string;
  returned: boolean;
  returnedTranslation: string;
  unsure: boolean;
}): DraftCheck[] {
  const checks: DraftCheck[] = [];
  const translation = input.translation.trim();
  const plain = (value: string) => normaliseTerm(value);
  if (!translation) {
    checks.push({
      id: 'missing-translation', severity: 'ask', title: 'No Kasem translation yet',
      detail: 'Write the Kasem before submitting. If you are not sure, use “Skip / I’m not sure”: your draft stays private and nothing is sent for review.',
      guideSection: 'assignments',
    });
  } else if (plain(translation) === plain(input.expression)) {
    checks.push({
      id: 'same-as-english', severity: 'warn', title: 'The translation is the same as the English',
      detail: 'Check that the Kasem box holds the Kasem expression, not a copy of the English.',
      guideSection: 'good-contribution',
    });
  } else if (looksEnglish(translation)) {
    checks.push({
      id: 'looks-english', severity: 'warn', title: 'The translation looks like English',
      detail: 'Most words in the Kasem box are common English words. If the English was pasted by mistake, replace it with the Kasem.',
      guideSection: 'good-contribution',
    });
  }
  const seen = new Set([plain(translation)]);
  const repeats = input.alternatives.filter((alternative) => {
    const key = plain(alternative);
    if (!key) return false;
    if (seen.has(key)) return true;
    seen.add(key);
    return false;
  });
  if (repeats.length) {
    checks.push({
      id: 'duplicate-alternative', severity: 'note', title: 'An alternative repeats another answer',
      detail: 'Repeated alternatives are removed when you save. Each alternative should be a different natural way of saying it.',
      guideSection: 'alternatives-context',
    });
  }
  if (input.alternatives.some((alternative) => looksEnglish(alternative))) {
    checks.push({
      id: 'alternative-english', severity: 'warn', title: 'An alternative looks like English',
      detail: 'Alternatives are other Kasem ways of saying the same thing. Put explanations in the usage note instead.',
      guideSection: 'alternatives-context',
    });
  }
  if (!input.context.trim()) {
    checks.push({
      id: 'no-context', severity: 'note', title: 'No usage note',
      detail: 'A short note on who says this, to whom and when helps a reviewer approve the meaning you intended.',
      guideSection: 'alternatives-context',
    });
  }
  if (input.returned && input.feedback.trim() && translation && plain(translation) === plain(input.returnedTranslation)) {
    checks.push({
      id: 'feedback-unaddressed', severity: 'ask', title: 'Reviewer feedback not yet addressed',
      detail: 'A reviewer returned this expression with feedback, and the translation has not changed since. Read the feedback and revise before resubmitting.',
      guideSection: 'review',
    });
  }
  if (input.unsure) {
    checks.push({
      id: 'flagged-unsure', severity: 'note', title: 'You flagged this as unsure',
      detail: 'Submitting clears the flag. If you are still unsure, leave it flagged and ask the team through “Report a problem”.',
      guideSection: 'report-problem',
    });
  }
  return checks;
}

export const ASSIST_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    suggestions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['meaning', 'context', 'clarity', 'completeness', 'instructions'] },
          text: { type: 'string' },
          guideSection: { type: 'string', enum: [...GUIDE_IDS, 'none'] },
        },
        required: ['kind', 'text', 'guideSection'],
      },
    },
    questions: { type: 'array', items: { type: 'string' } },
  },
  required: ['summary', 'suggestions', 'questions'],
} as const;

export const ASSIST_INSTRUCTION = `You are Kawuri, the assistant inside the Indigen World contributor workspace. Contributors are Kasem speakers who translate English expressions into Kasem for a dictionary. Appointed reviewers check every contribution before anything is published.

Your job is to help the contributor understand the English expression and the assignment, and to say what context a reviewer would want. You are not an authority on Kasem.

Rules you must always follow:
- Never write Kasem. Do not suggest Kasem words, spellings, translations, sentences or corrections, and never say whether any Kasem is right or wrong. Only appointed speakers decide that.
- Everything you say is a suggestion. Never claim that anything has been reviewed, approved or verified.
- Work only from the details given below. When the English is ambiguous, name the possible meanings and ask which one the contributor means. Do not invent facts about Kassena culture or about the assignment.
- When a Platform Guide section applies, give its id in guideSection, otherwise "none". Sections: ${GUIDE_IDS.map((id) => `${id} (${GUIDE_SECTIONS[id]})`).join('; ')}.
- Plain English, short sentences, no markdown. At most four suggestions and three questions, each under 240 characters.

By mode:
- explain_assignment: summarise what the assignment asks in two to four sentences, then give practical suggestions for working through it.
- context_needed: explain the meaning and register of the English expression (formal or casual, who might say it to whom, in what situation), point out ambiguity, and ask questions whose answers would make a useful usage note.
- check_draft: say whether the usage note (if any) tells a reviewer who says this, to whom and when, and whether the reviewer feedback (if any) seems addressed by the note. Suggest what is missing.`;

export interface AssistSuggestion {
  id: string;
  kind: string;
  text: string;
  guideSection: GuideSectionId | null;
}

/** Keeps what the rules allow, and counts what it had to drop. */
export function cleanSuggestions(json: Record<string, unknown> | null): {
  summary: string;
  suggestions: AssistSuggestion[];
  questions: string[];
  removed: number;
} {
  let removed = 0;
  const allowed = (text: string) => {
    if (KASEM_LETTERS.test(text)) {
      removed += 1;
      return false;
    }
    return true;
  };
  const clip = (value: unknown, max: number) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '');
  const rawSuggestions = Array.isArray(json?.suggestions) ? json.suggestions as Record<string, unknown>[] : [];
  const suggestions = rawSuggestions
    .map((entry, index) => ({
      id: `s${index + 1}`,
      kind: clip(entry?.kind, 20) || 'clarity',
      text: clip(entry?.text, 320),
      guideSection: GUIDE_IDS.includes(entry?.guideSection as GuideSectionId) ? entry.guideSection as GuideSectionId : null,
    }))
    .filter((entry) => entry.text && allowed(entry.text))
    .slice(0, 4);
  const questions = (Array.isArray(json?.questions) ? json.questions as unknown[] : [])
    .map((entry) => clip(entry, 320))
    .filter((entry) => entry && allowed(entry))
    .slice(0, 3);
  const summaryText = clip(json?.summary, 900);
  const summary = summaryText && allowed(summaryText) ? summaryText : '';
  return { summary, suggestions, questions, removed };
}

function brief(input: {
  mode: AssistMode;
  assignment: Record<string, string>;
  expression: string;
  draft: { hasTranslation: boolean; alternatives: number; context: string } | null;
  feedback: string;
}): string {
  const lines = [
    `Mode: ${input.mode}`,
    `Assignment title: ${input.assignment.title || '(none)'}`,
    `Assignment instructions: ${input.assignment.instructions || '(none given)'}`,
    input.assignment.dialect ? `Expected Kasem variety: ${input.assignment.dialect}` : '',
    input.assignment.tone ? `Expected tone: ${input.assignment.tone}` : '',
    input.expression ? `English expression: ${input.expression}` : 'No expression selected.',
  ];
  if (input.draft) {
    lines.push(
      `The contributor has ${input.draft.hasTranslation ? 'written' : 'not yet written'} a Kasem translation (not shown to you).`,
      `Alternatives written: ${input.draft.alternatives}`,
      `Usage note: ${input.draft.context || '(empty)'}`,
    );
  }
  if (input.feedback) lines.push(`Reviewer feedback on the previous version: ${input.feedback}`);
  return lines.filter(Boolean).join('\n');
}

function id(value: unknown, field: string): string {
  const result = boundedText(value, 128, field);
  if (!/^[A-Za-z0-9_-]+$/.test(result)) throw new HttpsError('invalid-argument', `Invalid ${field.toLowerCase()}.`);
  return result;
}

export const kawuriContributorAssist = onCall(
  { ...CONTRIBUTOR_CALL_OPTIONS, timeoutSeconds: 60 },
  guarded('kawuriContributorAssist', async (req) => {
    const uid = requireAuth(req);
    await consumeRateLimit('kawuriContributorAssist', uid, ASSIST_PER_MINUTE);
    await consumeRateLimit('kawuriContributorAssistDaily', uid, ASSIST_PER_DAY, DAY_MS, 1,
      'You have used today’s Kawuri checks. They refresh within 24 hours.');
    await requireActiveContributor(uid, { activated: true });

    const raw = (req.data ?? {}) as Record<string, unknown>;
    const mode = raw.mode as AssistMode;
    if (!ASSIST_MODES.includes(mode)) throw new HttpsError('invalid-argument', 'Choose what you would like Kawuri to help with.');
    const work = id(raw.work, 'Assignment');
    const item = raw.item == null || raw.item === '' ? '' : id(raw.item, 'Expression');
    if (mode !== 'explain_assignment' && !item) throw new HttpsError('invalid-argument', 'Choose an expression first.');

    const db = getFirestore();
    const workRef = db.doc(`contributorAccounts/${uid}/works/${work}`);
    const [workSnap, itemSnap] = await Promise.all([
      workRef.get(),
      item ? workRef.collection('items').doc(item).get() : Promise.resolve(null),
    ]);
    if (!workSnap.exists) throw new HttpsError('not-found', 'That assignment is not available to your account.');
    if (item && !itemSnap?.exists) throw new HttpsError('not-found', 'That expression is not in this assignment.');

    const assignment = Object.fromEntries(['title', 'instructions', 'dialect', 'tone', 'deadline', 'helpContact']
      .map((key) => [key, typeof workSnap.get(key) === 'string' ? String(workSnap.get(key)) : '']));
    const expression = typeof itemSnap?.get('expression') === 'string' ? String(itemSnap.get('expression')) : '';
    const status = String(itemSnap?.get('status') ?? '');
    const returned = ['rejected', 'needs_revision'].includes(status);
    const feedback = returned && typeof itemSnap?.get('feedback') === 'string' ? String(itemSnap.get('feedback')) : '';

    const draftRaw = (raw.draft ?? {}) as Record<string, unknown>;
    const draft = mode === 'check_draft' ? {
      translation: boundedText(draftRaw.translation, 2000, 'Translation', { optional: true, multiline: true }),
      alternatives: (Array.isArray(draftRaw.alternatives) ? draftRaw.alternatives : []).slice(0, 12)
        .map((value) => boundedText(value, 500, 'Alternative', { optional: true })).filter(Boolean),
      context: boundedText(draftRaw.context, 1000, 'Usage note', { optional: true, multiline: true }),
    } : null;

    const checks = draft ? draftChecks({
      expression, translation: draft.translation, alternatives: draft.alternatives, context: draft.context, feedback,
      returned, returnedTranslation: String(itemSnap?.get('translation') ?? ''), unsure: itemSnap?.get('unsure') === true,
    }) : [];
    const entries = expression ? await publishedEntriesFor(expressionTerms(expression), 6) : [];
    const sources = {
      assignment: { title: assignment.title, instructions: assignment.instructions, dialect: assignment.dialect,
        tone: assignment.tone, deadline: assignment.deadline, helpContact: assignment.helpContact },
      dictionary: entries.map((entry) => ({
        id: entry.id, kasem: entry.kasem, english: entry.english, partOfSpeech: entry.partOfSpeech, dialect: entry.dialect,
      })),
      guide: MODE_GUIDES[mode].map((section) => ({ id: section, title: GUIDE_SECTIONS[section] })),
    };

    const base = { mode, expression, checks, sources, generatedAt: new Date().toISOString() };
    const cfg = readKawuriMediaConfig(process.env, googleProjectId());
    if (!cfg.project) return { ...base, configured: false, unavailableReason: 'NO_PROJECT', summary: '', suggestions: [], questions: [], removed: 0 };
    try {
      const { json } = await generateStructured({
        project: cfg.project,
        location: cfg.location,
        models: cfg.analysisModels,
        capability: 'contributor_assist',
        systemInstruction: ASSIST_INSTRUCTION,
        contents: [{ role: 'user', parts: [{ text: brief({
          mode, assignment, expression, feedback,
          draft: draft ? { hasTranslation: Boolean(draft.translation), alternatives: draft.alternatives.length, context: draft.context } : null,
        }) }] }],
        schema: ASSIST_SCHEMA as unknown as Record<string, unknown>,
        maxOutputTokens: 1024,
        temperature: 0.3,
        timeoutMs: 40_000,
      });
      return { ...base, configured: true, unavailableReason: null, ...cleanSuggestions(json) };
    } catch (error) {
      const reason = reasonOf(error) ?? 'GENERATION_FAILED';
      logger.warn('Contributor assist model call failed', { reason });
      return { ...base, configured: false, unavailableReason: reason, summary: '', suggestions: [], questions: [], removed: 0 };
    }
  }),
);
