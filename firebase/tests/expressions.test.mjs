// Pure unit tests for everyday expressions — no emulator, no network.
//
//   npm run build:functions && node --test firebase/tests/expressions.test.mjs
//
// Two promises are held here. The first is that an expression cannot reach the
// review desk without the five things a reviewer needs: the phrase, what it
// means, when it is said, who it came from, and the consent to share it. The
// second is that an approved expression stays an expression — it publishes to
// `expressionEntries`, never to `dictionaryEntries`, where it would become a
// headword, be numbered against homographs and be counted as a word.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

import {
  EXPRESSION_CONSENT_VERSION,
  EXPRESSION_EVERYDAY_STATEMENT,
  EXPRESSION_SOURCE_CONSENT,
  buildExpressionEntryDocument,
  buildExpressionReceipt,
  buildExpressionSubmissionDocument,
  expressionFromSubmission,
  parseExpressionContribution,
} from '../../services/functions/lib/expressions.js';
import {
  canonicalCollectionKind,
  isExpressionSubmission,
  publicationDestinationFor,
  publicationTargetFor,
} from '../../services/functions/lib/publication.js';
import { parseCollectionContributionInput } from '../../services/functions/lib/collection-contributions.js';
import { isWordContribution, pointsForContribution } from '../../services/functions/lib/contributor-scores.js';

const NOW = '2026-09-27T09:00:00.000Z';

/** A complete, valid expression as the TribeStudio form sends it. */
function form(overrides = {}) {
  return {
    phrase: '[Kasem expression]',
    meaning: 'Welcome back from your journey.',
    literalTranslation: '',
    context: 'Said by the household to a relative arriving home, usually in the evening.',
    expressionKind: 'phrase',
    dialect: 'Navrongo',
    sourceType: 'family',
    sourceDetail: 'My grandmother says it whenever one of us comes home from Accra.',
    speakerName: '',
    speakerConsent: true,
    everydayConfirmed: true,
    publicationPermission: true,
    ...overrides,
  };
}

function refusal(overrides, code, pattern) {
  assert.throws(() => parseExpressionContribution(form(overrides)), (error) => {
    assert.equal(error.code, code);
    if (pattern) assert.match(error.message, pattern);
    return true;
  });
}

// ── What a contributor must tell us ─────────────────────────────────────────

test('a complete expression parses into the five things a reviewer needs', () => {
  const parsed = parseExpressionContribution(form({ speakerName: '  Grandmother Ama ', literalTranslation: ' you have come ' }));
  assert.equal(parsed.expression.phrase, '[Kasem expression]');
  assert.equal(parsed.expression.meaning, 'Welcome back from your journey.');
  assert.equal(parsed.expression.context.startsWith('Said by the household'), true);
  assert.equal(parsed.expression.literalTranslation, 'you have come');
  assert.deepEqual(parsed.expression.source, {
    type: 'family',
    detail: 'My grandmother says it whenever one of us comes home from Accra.',
    speakerName: 'Grandmother Ama',
  });
  assert.equal(parsed.publicationPermission, true);
  assert.equal(parsed.revisionOf, null);
});

test('AI-training permission is opt-in and anything but true is a no', () => {
  assert.equal(parseExpressionContribution(form()).aiTraining, false);
  assert.equal(parseExpressionContribution(form({ aiTraining: 'yes' })).aiTraining, false);
  assert.equal(parseExpressionContribution(form({ aiTraining: true })).aiTraining, true);
});

test('each missing piece is refused with an instruction, not a field name', () => {
  refusal({ phrase: '  ' }, 'invalid-argument', /Write the expression in Kasem/);
  refusal({ meaning: '' }, 'invalid-argument', /what the expression means/);
  refusal({ context: '' }, 'invalid-argument', /when the expression is used/);
  refusal({ sourceDetail: '' }, 'invalid-argument', /where you heard or learned/);
  refusal({ sourceType: undefined }, 'invalid-argument', /who you learned the expression from/);
  refusal({ dialect: '' }, 'invalid-argument', /dialect/);
  refusal({ publicationPermission: undefined }, 'invalid-argument', /published after review/);
});

test('consent is required, and its wording depends on the source', () => {
  refusal({ speakerConsent: false }, 'failed-precondition', /The person I learned it from agreed/);
  refusal({ sourceType: 'self', speakerConsent: undefined }, 'failed-precondition', /my own everyday Kasem/);
  refusal({ sourceType: 'written', speakerConsent: false }, 'failed-precondition', /named the source/);
  refusal({ everydayConfirmed: false }, 'failed-precondition', /nothing sacred, secret, private or restricted/);
});

test('only public, everyday material is accepted', () => {
  refusal({ culturalPermissionTier: 'sacred_restricted' }, 'failed-precondition', /sacred, secret or restricted/);
  assert.doesNotThrow(() => parseExpressionContribution(form({ culturalPermissionTier: 'public' })));
});

test('a client cannot claim to be an invited speaker', () => {
  refusal({ sourceType: 'invited-speaker' }, 'invalid-argument', /who you learned/);
});

test('an expression and its meaning cannot be the same text', () => {
  refusal({ phrase: 'Welcome back', meaning: ' welcome   BACK ' }, 'invalid-argument', /same text/);
});

test('long text belongs elsewhere, and unknown kinds are refused', () => {
  refusal({ phrase: 'x'.repeat(301) }, 'invalid-argument', /under 300 characters/);
  refusal({ expressionKind: 'noun' }, 'invalid-argument', /what kind of expression/);
  refusal({ revisionOf: '../other' }, 'invalid-argument', /not recognised/);
});

// ── What the review desk and the contributor receive ────────────────────────

test('the canonical submission is an expression, not a dictionary word', () => {
  const contribution = parseExpressionContribution(form({ aiTraining: true, speakerName: 'Ama' }));
  const doc = buildExpressionSubmissionDocument('sub-1', 'member-1', contribution, NOW);
  assert.equal(doc.collectionKind, 'expressions');
  assert.equal(doc.category, 'expressions');
  assert.equal(doc.status, 'SUBMITTED');
  assert.equal(doc.lexicalKind, 'phrase');
  assert.equal(doc.corpusArea, 'expressions');
  assert.equal(doc.studioType, 'translation');
  // The direction the whole pipeline reads a lexical contribution in.
  assert.equal(doc.title, 'Welcome back from your journey.');
  assert.equal(doc.body, '[Kasem expression]');
  assert.equal(doc.englishSummary, 'Welcome back from your journey.');
  assert.equal(doc.usageContext, contribution.expression.context);
  assert.match(doc.sourceReferences, /^A family member: My grandmother says it/);
  assert.match(doc.sourceReferences, /\(speaker: Ama\)$/);
  // Nothing that belongs to words alone.
  assert.equal('forms' in doc, false);
  assert.equal('senses' in doc, false);
  assert.equal('ipa' in doc, false);
  // Consent, recorded in the words the contributor saw.
  assert.equal(doc.expression.consent.source, EXPRESSION_SOURCE_CONSENT.family);
  assert.equal(doc.expression.consent.everyday, EXPRESSION_EVERYDAY_STATEMENT);
  assert.equal(doc.permissions.aiTraining, true);
  assert.equal(doc.permissions.publication, true);
  assert.equal(doc.permissions.consentVersion, EXPRESSION_CONSENT_VERSION);
  assert.equal(doc.attestations.participantsConsented, true);
  assert.equal(doc.disclosures.involvesMinors, null);
  assert.equal(doc.moderation.publishedContent, null);
});

test('a proverb is filed under proverbs, and a written source is declared third-party', () => {
  const contribution = parseExpressionContribution(form({ expressionKind: 'proverb', sourceType: 'written' }));
  const doc = buildExpressionSubmissionDocument('sub-2', 'member-1', contribution, NOW);
  assert.equal(doc.corpusArea, 'proverbs');
  assert.equal(doc.lexicalKind, 'proverb');
  assert.equal(doc.disclosures.usesThirdPartyMaterial, true);
});

test('the receipt carries everything the contributor sent and starts as submitted', () => {
  const contribution = parseExpressionContribution(form({ revisionOf: 'old-1' }));
  const receipt = buildExpressionReceipt('sub-3', 'member-1', contribution);
  assert.equal(receipt.id, 'sub-3');
  assert.equal(receipt.submissionId, 'sub-3');
  assert.equal(receipt.authUid, 'member-1');
  assert.equal(receipt.collectionKind, 'expressions');
  assert.equal(receipt.status, 'submitted');
  assert.equal(receipt.expression.phrase, '[Kasem expression]');
  assert.equal(receipt.expression.source.type, 'family');
  assert.equal('speakerName' in receipt.expression.source, false, 'an unanswered name leaves no key');
  assert.equal(receipt.aiTraining, false);
  assert.equal(receipt.revisionOf, 'old-1');
});

test('the generic Collection door refuses expressions', () => {
  assert.throws(() => parseCollectionContributionInput({
    collectionKind: 'expressions', title: 'Meaning', body: 'Phrase', format: 'Phrase', dialect: 'Navrongo',
    source: 'Me', rightsConfirmed: true, publicationPermission: true, usesThirdPartyMaterial: false,
    participantConsentConfirmed: true,
  }, 'member-1'), { code: 'invalid-argument', message: /submitExpression/ });
});

// ── Where an approved expression goes ──────────────────────────────────────

test('expressions publish to expressionEntries; words stay in the dictionary', () => {
  assert.deepEqual(publicationDestinationFor({ collectionKind: 'expressions' }, 's1'),
    { collection: 'expressionEntries', id: 'expr_s1' });
  assert.deepEqual(publicationDestinationFor({ collectionKind: 'dictionary', lexicalKind: 'word' }, 's2'),
    { collection: 'dictionaryEntries', id: 'collection_s2' });
  assert.deepEqual(publicationDestinationFor({ collectionKind: 'music' }, 's3'),
    { collection: 'publishedContent', id: 'pub_s3' });
});

test('an invited translator expression filed as a dictionary phrase is still an expression', () => {
  const legacy = { collectionKind: 'dictionary', lexicalKind: 'phrase', contributorPortal: { work: 'w' } };
  assert.equal(isExpressionSubmission(legacy), true);
  assert.deepEqual(publicationDestinationFor(legacy, 's4'), { collection: 'expressionEntries', id: 'expr_s4' });
  // Non-word contributions from every entry point belong with expressions.
  assert.equal(isExpressionSubmission({ collectionKind: 'dictionary', lexicalKind: 'phrase' }), true);
  assert.equal(isExpressionSubmission({ collectionKind: 'dictionary', contentKind: 'expression' }), true);
});

test('a recorded publication is honoured, but only under this submission’s own id', () => {
  const legacyLive = {
    collectionKind: 'dictionary', lexicalKind: 'phrase', contributorPortal: { work: 'w' },
    moderation: { publishedContent: { collection: 'dictionaryEntries', id: 'collection_s5' } },
  };
  assert.deepEqual(publicationTargetFor(legacyLive, 's5'), { collection: 'dictionaryEntries', id: 'collection_s5' });
  const forged = { ...legacyLive, moderation: { publishedContent: { collection: 'dictionaryEntries', id: 'collection_other' } } };
  assert.deepEqual(publicationTargetFor(forged, 's5'), { collection: 'expressionEntries', id: 'expr_s5' });
  const unknown = { collectionKind: 'expressions', moderation: { publishedContent: { collection: 'users', id: 's6' } } };
  assert.deepEqual(publicationTargetFor(unknown, 's6'), { collection: 'expressionEntries', id: 'expr_s6' });
});

test('"expression" resolves to the expressions kind', () => {
  assert.equal(canonicalCollectionKind('expression'), 'expressions');
  assert.equal(canonicalCollectionKind('expressions'), 'expressions');
});

test('an accepted expression earns what a word earns, but is not counted as a word', () => {
  assert.equal(pointsForContribution('expressions'), pointsForContribution('dictionary'));
  assert.equal(isWordContribution('expressions'), false);
});

// ── The public record ──────────────────────────────────────────────────────

function contractValidator() {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  const schemas = new URL('../../packages/contracts/schemas/', import.meta.url);
  for (const file of ['common.schema.json', 'expression-entry.schema.json']) {
    ajv.addSchema(JSON.parse(readFileSync(new URL(file, schemas), 'utf8')));
  }
  return ajv.getSchema('https://schemas.indigen-world.org/v0/expression-entry.schema.json');
}

test('the published entry matches the public contract and carries no private detail', () => {
  const contribution = parseExpressionContribution(form({ speakerName: 'Grandmother Ama', aiTraining: true }));
  const submission = buildExpressionSubmissionDocument('sub-7', 'member-1', contribution, NOW);
  const entry = buildExpressionEntryDocument({
    submissionId: 'sub-7', contributionId: 'sub-7', submission, existing: null,
    creatorId: 'member-1', displayName: 'Ama the Storyteller', approvedBy: 'validator-1', now: NOW,
  });
  const validate = contractValidator();
  assert.ok(validate(entry), JSON.stringify(validate.errors));
  assert.equal(entry.id, 'expr_sub-7');
  assert.equal(entry.phrase, '[Kasem expression]');
  assert.equal(entry.meaning, 'Welcome back from your journey.');
  assert.equal(entry.source.speakerName, 'Grandmother Ama');
  assert.equal(entry.isPublished, true);
  assert.deepEqual(entry.sourceContribution, { collection: 'collectionContributions', id: 'sub-7' });
  // Not a dictionary row in disguise.
  for (const key of ['kasemText', 'englishText', 'headwordKey', 'homographIndex', 'partOfSpeech']) {
    assert.equal(key in entry, false, `${key} is a dictionary field`);
  }
  // Consent wording, AI permission and contact details stay on the submission.
  const serialised = JSON.stringify(entry);
  assert.equal(serialised.includes('consent'), false);
  assert.equal(serialised.includes('aiTraining'), false);
});

test('a public credit never publishes an e-mail address', () => {
  const contribution = parseExpressionContribution(form());
  const submission = buildExpressionSubmissionDocument('sub-10', 'member-1', contribution, NOW);
  const entry = buildExpressionEntryDocument({
    submissionId: 'sub-10', contributionId: 'sub-10', submission, existing: null,
    creatorId: 'member-1', displayName: 'akua@example.com', approvedBy: 'validator-1', now: NOW,
  });
  assert.equal(entry.contributor.displayName, 'Indigen World contributor');
  assert.equal(JSON.stringify(entry).includes('@'), false);
});

test('a re-publish keeps the first publication date', () => {
  const contribution = parseExpressionContribution(form());
  const submission = buildExpressionSubmissionDocument('sub-8', 'member-1', contribution, NOW);
  const entry = buildExpressionEntryDocument({
    submissionId: 'sub-8', contributionId: 'sub-8', submission,
    existing: { publishedAt: '2026-09-01T00:00:00.000Z', createdAt: '2026-09-01T00:00:00.000Z' },
    creatorId: 'member-1', displayName: 'Ama', approvedBy: 'validator-1', now: NOW,
  });
  assert.equal(entry.publishedAt, '2026-09-01T00:00:00.000Z');
  assert.equal(entry.createdAt, '2026-09-01T00:00:00.000Z');
  assert.equal(entry.updatedAt, NOW);
});

test('an invited translator’s older submission publishes whole, with its alternatives', () => {
  const legacy = {
    collectionKind: 'dictionary', lexicalKind: 'phrase', contributorPortal: { work: 'w' },
    title: 'How was your journey?', body: 'Kasem answer, with a comma / and a slash',
    alternativeExpressions: ['Another whole way of saying it'], usageContext: 'Asked of a returning traveller.',
    dialect: 'Kasem', sourceReferences: 'Invited speaker — everyday expression', primaryLanguage: 'xsm',
  };
  const expression = expressionFromSubmission(legacy);
  assert.equal(expression.phrase, 'Kasem answer, with a comma / and a slash');
  assert.deepEqual(expression.alternatives, ['Another whole way of saying it']);
  assert.equal(expression.meaning, 'How was your journey?');
  assert.equal(expression.source.type, 'invited-speaker');
  const entry = buildExpressionEntryDocument({
    submissionId: 'sub-9', contributionId: 'sub-9', submission: legacy, existing: null,
    creatorId: 'translator-1', displayName: 'Invited translator', approvedBy: 'validator-1', now: NOW,
  });
  assert.ok(contractValidator()(entry));
  assert.equal(entry.context, 'Asked of a returning traveller.');
});
