/** Provisional capture contract. Approval of capture does not grant release rights. */
export const KNOWLEDGE_SCHEMA_VERSION = 2;
export const KNOWLEDGE_NORMALIZATION_VERSION = 'original-nfc-search-v1';
export const VALUE_STATES = ['known', 'unknown', 'not_applicable', 'not_yet_translated', 'no_direct_equivalent'];
export const WORKFLOW_LABELS = { draft: 'Draft', submitted: 'Submitted', in_review: 'In review', changes_requested: 'Changes requested', review_complete: 'Review complete', withdrawn: 'Withdrawn' };
export const AUTHENTICATION_LABELS = { community: 'Community', reviewed: 'Reviewed', gold: 'Gold authenticated', rejected_outdated: 'Rejected / outdated' };
export const RELATION_TYPES = ['illustrates_rule', 'variant_of', 'translates', 'related_proverb', 'related_story', 'related_concept', 'pronunciation_of', 'supports', 'supersedes'];
export const DESTINATIONS = ['venacula', 'tribestudio', 'kawuri', 'training', 'evaluation'];
export const REVIEW_CHECKS = ['original', 'meaning', 'context', 'provenance', 'rights', 'relationships', 'audio'];
export const DISPLAY_PREFIXES = { lexicon: 'KSM-LEX', grammar: 'KSM-GRM', expressions: 'KSM-EXP', proverbs: 'KSM-PRV', literature: 'KSM-FLK', dialogue: 'KSM-DLG', pronunciation: 'KSM-AUD', culture: 'KSM-CUL', qa: 'KSM-QA' };
export const STRUCTURED_FIELDS = {
  lexicon: ['senses', 'examples'], grammar: ['examples'], expressions: ['dialogueTurns'], sentences: [],
  proverbs: ['examples'], literature: ['segments'], dialogue: ['dialogueTurns'], pronunciation: [], culture: [], qa: ['qaExamples'],
};
export const RIGHTS_STATES = ['unresolved', 'documented', 'withdrawn'];

/** These are submission minimums, deliberately separate from review readiness. */
export function submissionIssues(record, { sentenceEnabled = false } = {}) {
  const issues = [];
  const add = (field, message) => issues.push({ field, message });
  if (!Object.hasOwn(STRUCTURED_FIELDS, record.datasetType)) add('datasetType', 'Choose a category.');
  if (record.datasetType === 'sentences' && !sentenceEnabled) add('datasetType', 'Sentence submissions await approval of the provisional schema. You can save a private draft.');
  if (!record.title?.trim()) add('title', 'Add a record title.');
  if (record.datasetType === 'qa') {
    if (!record.details?.question?.trim()) add('details.question', 'Add the question.');
    if (!record.details?.answer?.trim()) add('details.answer', 'Add the target answer or expected uncertainty.');
  } else if (!record.original?.trim() && !(record.datasetType === 'pronunciation' && record.audio?.length)) add('original', 'Add the original content.');
  if (!record.source?.trim()) add('source', 'Identify the source separately from your account.');
  if (!record.sourceReference?.trim()) add('sourceReference', 'Add a traceable source reference.');
  if (!record.permissions?.review) add('permissions.review', 'Allow private review before submitting.');
  if (!RIGHTS_STATES.includes(record.rights?.state)) add('rights.state', 'Record an explicit rights state.');
  if (record.datasetType === 'pronunciation' && !record.audio?.length) add('audio', 'Attach a pronunciation recording.');
  if (record.audio?.length && !record.permissions?.audio) add('permissions.audio', 'Confirm permission to store and review the recordings.');
  for (const [index, clip] of (record.audio ?? []).entries()) {
    if (!clip.transcript?.trim()) add(`audio.${index}.transcript`, `Recording ${index + 1}: add the exact transcript.`);
    if (!clip.speakerId?.trim()) add(`audio.${index}.speakerId`, `Recording ${index + 1}: add a pseudonymous speaker reference.`);
  }
  return issues;
}

/** Legacy approval counts never become evidence of qualified authentication. */
export function knowledgeState(record) {
  const workflow = record.workflow ?? ({ reviewed: 'in_review', gold: 'review_complete', disputed: 'in_review' }[record.status] ?? record.status ?? 'draft');
  const authentication = record.authentication ?? (record.status === 'reviewed' ? 'reviewed' : 'community');
  return { workflow, authentication, disputed: record.disputed === true || record.status === 'disputed' };
}

export function knowledgeSearchText(record) {
  return [record.title, record.original, record.english, record.french, record.region].filter(Boolean).join(' ').normalize('NFC').toLocaleLowerCase('en');
}
