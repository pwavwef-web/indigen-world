import { logger } from 'firebase-functions';
import { googleProjectId } from './google-api-auth.js';
import { readKawuriMediaConfig, reasonOf } from './kawuri-media-policy.js';
import { generateStructured, mediaPart, type MediaInput } from './kawuri-vertex.js';

/**
 * The automated half of bank verification: read a statement, compare three
 * fields, hand the comparison to a person.
 *
 * ── What this is not ───────────────────────────────────────────────────────
 * It is not verification. A model reading a document cannot establish that
 * the document is genuine or that the person who uploaded it owns the
 * account, and nothing here pretends to. Its output is written to the payout
 * profile as `automatedCheck` and shown to finance reviewers as evidence; the
 * status only ever moves to `verified` through `decidePayoutVerification`, a
 * finance reviewer's explicit decision.
 *
 * ── Why it is off unless switched on ───────────────────────────────────────
 * On 2026-09-23 the project's Vertex AI `cacheConfig` did not disable caching,
 * which means Gemini keeps inputs and outputs in memory for up to 24 hours.
 * Google may also log prompts for abuse monitoring unless the project has an
 * exception. A bank statement is the most sensitive document this platform
 * handles, so it is not sent anywhere until a deployment opts in with
 * `CONTRIBUTOR_STATEMENT_CHECK=enabled`, after deciding on both settings. See
 * docs/product/contributor-portal.md, "Bank statement checks".
 *
 * ── Data minimisation ──────────────────────────────────────────────────────
 * The model is asked for three fields and told to ignore everything else. It
 * never prints the account number: it is given the number the contributor
 * typed and answers whether the document agrees, which keeps a full account
 * number out of the model's output (and away from Gemini's sensitive-data
 * filter, which stops a response that prints one). What is kept is the name
 * and bank as printed and the last four characters, for the reviewer. Nothing
 * the model returns is logged.
 */

export type FieldOutcome = 'match' | 'partial' | 'mismatch' | 'not_found';

export type CheckState =
  | 'off'
  | 'not_run'
  | 'consistent'
  | 'mismatch'
  | 'uncertain'
  | 'unreadable'
  | 'unavailable';

export interface CheckFields {
  accountName: FieldOutcome;
  accountNumber: FieldOutcome;
  bankName: FieldOutcome;
}

export interface CheckEvidence {
  documentKind: string;
  accountHolderName: string;
  bankName: string;
  accountNumberLast4: string;
}

export interface AutomatedCheck {
  state: CheckState;
  fields: CheckFields | null;
  /** What the model read. Finance reviewers only; never sent to the contributor. */
  evidence: CheckEvidence | null;
  model: string | null;
  ranAt: string | null;
  /** A stable code when the check could not run. */
  unavailableReason: string | null;
}

export interface SuppliedBankDetails {
  bankName: string;
  accountName: string;
  accountNumber: string;
}

export interface StatementExtraction {
  documentKind: 'bank_statement' | 'bank_letter' | 'other' | 'unreadable';
  legible: boolean;
  accountHolderName: string;
  bankName: string;
  accountNumberComparison: 'same' | 'different' | 'masked_consistent' | 'masked_inconsistent' | 'not_visible';
  accountNumberLast4: string;
}

/** Files up to this size go to Gemini inline; larger ones by `gs://` URI. */
export const INLINE_STATEMENT_MAX_BYTES = 7 * 1024 * 1024;

export function statementCheckEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return (env.CONTRIBUTOR_STATEMENT_CHECK ?? '').trim().toLowerCase() === 'enabled';
}

export function emptyCheck(state: 'off' | 'not_run'): AutomatedCheck {
  return { state, fields: null, evidence: null, model: null, ranAt: null, unavailableReason: null };
}

export const STATEMENT_SCHEMA = {
  type: 'object',
  properties: {
    documentKind: { type: 'string', enum: ['bank_statement', 'bank_letter', 'other', 'unreadable'] },
    legible: { type: 'boolean' },
    accountHolderName: { type: 'string' },
    bankName: { type: 'string' },
    accountNumberComparison: {
      type: 'string',
      enum: ['same', 'different', 'masked_consistent', 'masked_inconsistent', 'not_visible'],
    },
    accountNumberLast4: { type: 'string' },
  },
  required: ['documentKind', 'legible', 'accountHolderName', 'bankName', 'accountNumberComparison', 'accountNumberLast4'],
} as const;

export const STATEMENT_INSTRUCTION = `You read one document that a contributor uploaded to confirm the bank account they want to be paid into. Your answer is evidence for a human finance reviewer. You do not decide anything and you do not judge whether the document is genuine.

Return only these fields:
- documentKind: "bank_statement" for a bank statement, "bank_letter" for a bank-issued letter or account confirmation, "other" for anything else, "unreadable" if you cannot read it.
- legible: true only if the account details are clearly readable.
- accountHolderName: the account holder's name exactly as printed, or "" if not shown.
- bankName: the bank's name as printed, or "" if not shown.
- accountNumberComparison: compare the account number printed on the document with REFERENCE NUMBER given in the request, ignoring spaces and dashes. "same" if it is fully visible and identical; "different" if it is visible and not identical; "masked_consistent" if it is partly hidden and every visible character agrees; "masked_inconsistent" if it is partly hidden and a visible character disagrees; "not_visible" if no account number is shown.
- accountNumberLast4: the last four characters of the account number exactly as printed (masking characters included), or "".

Never write out the full account number. Do not extract, summarise or mention transactions, balances, addresses, dates of birth, signatures or anything else in the document. If a field is not visible, return "" rather than guessing.`;

// ---------------------------------------------------------------------------
// Comparison. Pure, so every branch is tested without Vertex.
// ---------------------------------------------------------------------------

const NAME_TITLES = new Set(['mr', 'mrs', 'ms', 'miss', 'dr', 'rev', 'prof', 'hon', 'madam', 'alhaji', 'hajia']);

export function nameTokens(value: string): string[] {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’-]/g, '')
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token && !NAME_TITLES.has(token));
}

/**
 * Names on statements are upper-cased, reordered, abbreviated and missing
 * middle names, so "equal" is the wrong test. Every part of the shorter name
 * must appear in the longer one (a single letter counts as an initial), and at
 * least two whole names must agree before this says `match`. One agreeing
 * name is `partial`: the same surname in a family is common.
 */
export function compareNames(supplied: string, printed: string): FieldOutcome {
  const typed = nameTokens(supplied);
  const shown = nameTokens(printed);
  if (shown.length === 0) return 'not_found';
  if (typed.length === 0) return 'mismatch';
  const [shorter, longer] = typed.length <= shown.length ? [typed, shown] : [shown, typed];
  const covers = (token: string) => longer.some((other) => other === token
    || (token.length === 1 && other.startsWith(token))
    || (other.length === 1 && token.startsWith(other)));
  const wholeAgreements = shorter.filter((token) => token.length > 1 && longer.includes(token)).length;
  if (shorter.every(covers) && wholeAgreements >= 2) return 'match';
  if (wholeAgreements >= 1) return 'partial';
  return 'mismatch';
}

const BANK_ALIASES: ReadonlyArray<readonly [string, readonly string[]]> = [
  ['gcb', ['ghana commercial', 'gcb']],
  ['adb', ['agricultural development', 'adb']],
  ['absa', ['absa', 'barclays']],
  ['stanbic', ['stanbic']],
  ['ecobank', ['ecobank']],
  ['calbank', ['calbank', 'cal bank']],
  ['fidelity', ['fidelity']],
  ['zenith', ['zenith']],
  ['uba', ['united bank for africa', 'uba']],
  ['gtbank', ['guaranty trust', 'gtbank', 'gt bank']],
  ['prudential', ['prudential']],
  ['republic', ['republic', 'hfc']],
  ['societe-generale', ['societe generale', 'sg ghana', 'sgssb']],
  ['standard-chartered', ['standard chartered', 'stanchart']],
  ['cbg', ['consolidated bank', 'cbg']],
  ['nib', ['national investment', 'nib']],
  ['omnibsic', ['omnibsic', 'omni bsic']],
  ['first-atlantic', ['first atlantic']],
  ['bank-of-africa', ['bank of africa', 'boa']],
  ['fnb', ['first national', 'fnb']],
  ['fbn', ['fbn', 'first bank']],
  ['umb', ['universal merchant', 'umb']],
  ['access', ['access bank']],
  ['arb-apex', ['arb apex', 'apex bank']],
];

const BANK_FILLER = new Set(['bank', 'ltd', 'limited', 'plc', 'ghana', 'gh', 'company', 'co', 'the', 'of', 'and', 'rural', 'savings', 'loans', 'plc.']);

function plainBank(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function canonicalBank(value: string): string {
  const plain = plainBank(value);
  if (!plain) return '';
  for (const [id, aliases] of BANK_ALIASES) {
    if (aliases.some((alias) => ` ${plain} `.includes(` ${alias} `) || plain === alias)) return id;
  }
  return plain.split(' ').filter((word) => !BANK_FILLER.has(word)).join(' ');
}

export function compareBanks(supplied: string, printed: string): FieldOutcome {
  const shown = canonicalBank(printed);
  if (!shown) return 'not_found';
  const typed = canonicalBank(supplied);
  if (!typed) return 'mismatch';
  if (typed === shown) return 'match';
  if (typed.length >= 3 && shown.length >= 3 && (typed.includes(shown) || shown.includes(typed))) return 'match';
  return 'mismatch';
}

function plainAccount(value: string): string {
  return value.toUpperCase().replace(/[\s-]/g, '');
}

/**
 * The model's comparison, cross-checked against the last four characters it
 * reports: a model that says `same` while showing four different digits is
 * not believed.
 */
export function compareAccountNumbers(
  supplied: string,
  comparison: StatementExtraction['accountNumberComparison'],
  printedLast4: string,
): FieldOutcome {
  const typed = plainAccount(supplied);
  const tail = plainAccount(printedLast4);
  const visibleTail = /^[0-9A-Z]{4}$/.test(tail) ? tail : '';
  const tailDisagrees = Boolean(visibleTail) && !typed.endsWith(visibleTail);
  switch (comparison) {
    case 'same':
      return tailDisagrees ? 'mismatch' : 'match';
    case 'masked_consistent':
      return tailDisagrees ? 'mismatch' : 'partial';
    case 'different':
    case 'masked_inconsistent':
      return 'mismatch';
    default:
      return 'not_found';
  }
}

export function readExtraction(json: Record<string, unknown> | null): StatementExtraction | null {
  if (!json) return null;
  const pick = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
    (typeof value === 'string' && (allowed as readonly string[]).includes(value) ? value : fallback) as T;
  const text = (value: unknown, max: number) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '');
  return {
    documentKind: pick(json.documentKind, ['bank_statement', 'bank_letter', 'other', 'unreadable'] as const, 'unreadable'),
    legible: json.legible === true,
    accountHolderName: text(json.accountHolderName, 160),
    bankName: text(json.bankName, 120),
    accountNumberComparison: pick(
      json.accountNumberComparison,
      ['same', 'different', 'masked_consistent', 'masked_inconsistent', 'not_visible'] as const,
      'not_visible',
    ),
    accountNumberLast4: text(json.accountNumberLast4, 8).slice(-4),
  };
}

/** Turns what the model read into the check a reviewer sees. Never `verified`. */
export function buildCheck(
  supplied: SuppliedBankDetails,
  extraction: StatementExtraction | null,
  model: string | null,
  ranAt: string,
): AutomatedCheck {
  if (!extraction || extraction.documentKind === 'unreadable' || extraction.documentKind === 'other' || !extraction.legible) {
    return {
      state: 'unreadable',
      fields: null,
      evidence: extraction ? evidenceOf(extraction) : null,
      model,
      ranAt,
      unavailableReason: null,
    };
  }
  const fields: CheckFields = {
    accountName: compareNames(supplied.accountName, extraction.accountHolderName),
    accountNumber: compareAccountNumbers(supplied.accountNumber, extraction.accountNumberComparison, extraction.accountNumberLast4),
    bankName: compareBanks(supplied.bankName, extraction.bankName),
  };
  const outcomes = Object.values(fields);
  const state: CheckState = outcomes.includes('mismatch')
    ? 'mismatch'
    : outcomes.every((outcome) => outcome === 'match') ? 'consistent' : 'uncertain';
  return { state, fields, evidence: evidenceOf(extraction), model, ranAt, unavailableReason: null };
}

function evidenceOf(extraction: StatementExtraction): CheckEvidence {
  return {
    documentKind: extraction.documentKind,
    accountHolderName: extraction.accountHolderName,
    bankName: extraction.bankName,
    accountNumberLast4: extraction.accountNumberLast4,
  };
}

// ---------------------------------------------------------------------------
// The model call
// ---------------------------------------------------------------------------

/**
 * Runs the check, or explains why it did not. Never throws: a check that
 * cannot run leaves the submission exactly where it was, pending review.
 */
export async function runStatementCheck(input: {
  bytes: Buffer;
  contentType: string;
  gcsUri: string;
  supplied: SuppliedBankDetails;
  now?: string;
}): Promise<AutomatedCheck> {
  const ranAt = input.now ?? new Date().toISOString();
  if (!statementCheckEnabled()) return emptyCheck('off');
  const cfg = readKawuriMediaConfig(process.env, googleProjectId());
  const unavailable = (reason: string): AutomatedCheck => ({
    state: 'unavailable', fields: null, evidence: null, model: null, ranAt, unavailableReason: reason,
  });
  if (!cfg.project) return unavailable('NO_PROJECT');
  if (cfg.disabled.has('mediaAnalysis')) return unavailable('CAPABILITY_UNAVAILABLE');

  const media: MediaInput = input.bytes.length <= INLINE_STATEMENT_MAX_BYTES
    ? { mimeType: input.contentType, base64: input.bytes.toString('base64') }
    : { mimeType: input.contentType, gcsUri: input.gcsUri };
  try {
    const { model, json } = await generateStructured({
      project: cfg.project,
      location: cfg.location,
      models: cfg.analysisModels,
      capability: 'payout_statement_check',
      systemInstruction: STATEMENT_INSTRUCTION,
      contents: [{
        role: 'user',
        parts: [
          mediaPart(media),
          { text: `REFERENCE NUMBER: ${input.supplied.accountNumber}\nRead the account details from this document.` },
        ],
      }],
      schema: STATEMENT_SCHEMA as unknown as Record<string, unknown>,
      maxOutputTokens: 512,
      temperature: 0,
      timeoutMs: 60_000,
    });
    return buildCheck(input.supplied, readExtraction(json), model, ranAt);
  } catch (error) {
    // The reason code only: provider text can quote the document back.
    const reason = reasonOf(error) ?? 'GENERATION_FAILED';
    logger.warn('Payout statement check could not run', { reason });
    return unavailable(reason);
  }
}
