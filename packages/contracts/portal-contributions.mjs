/** Shared capture and upload limits. No permission is inferred from another use. */
export const PORTAL_TYPES = {
  translations: { label: 'Translate sentences', icon: 'translation', description: 'Choose the right words. Preserve the meaning.', example: 'Translate an everyday question and explain when you would use it.' },
  words: { label: 'Words & expressions', icon: 'book', description: 'Share a word, its meanings, and an example of everyday use.', example: 'Give a term, distinguish its meanings, and describe a regional variant.' },
  audio: { label: 'Audio & transcripts', icon: 'mic', description: 'Record or upload speech, then add a transcript when you can.', example: 'Record a greeting with the speaker’s permission and describe the dialect.' },
  stories: { label: 'Stories & culture', icon: 'library', description: 'Preserve an account, tradition, or piece of cultural knowledge.', example: 'Describe a local custom, name your source, and explain any sharing restrictions.' },
  documents: { label: 'Documents & research', icon: 'doc', description: 'Share field notes, research, documents, or datasets for review.', example: 'Working field notes, a glossary, an interview transcript, or a research draft are welcome.' },
  corrections: { label: 'Corrections', icon: 'pen', description: 'Suggest an improvement while preserving the original record.', example: 'Link to a record, propose a corrected spelling, and explain the evidence.' },
};
export const PORTAL_CONSENT_VERSION = 'portal-uses-2026-10-23';
export const PORTAL_USES = {
  review: ['Internal review', 'Authorised reviewers may assess this material for quality, privacy, usefulness, and permissions.'],
  retrieval: ['Knowledge-base retrieval', 'May be selected separately for an approved reference collection.'],
  training: ['Model training', 'May be selected separately for an approved training dataset.'],
  public: ['Public sharing', 'May be selected separately for public resources.'],
};
export const PORTAL_FORMATS = {
  txt: 'text/plain', md: 'text/markdown', csv: 'text/csv', json: 'application/json', jsonl: 'application/x-ndjson',
  pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', webm: 'audio/webm', mp4: 'video/mp4',
};
export const PORTAL_LIMITS = { maxFiles: 10, maxFileBytes: 20 * 1024 * 1024, maxBatchBytes: 50 * 1024 * 1024, maxText: 30000, maxExtractBytes: 2 * 1024 * 1024 };
export const PORTAL_STATES = { draft: 'Draft', submitted: 'Awaiting review', changes_requested: 'Changes requested', approved: 'Approved', rejected: 'Rejected', disputed: 'Escalated', withdrawn: 'Withdrawn' };
export function portalFileType(name) {
  const extension = String(name).toLowerCase().split('.').at(-1);
  return Object.hasOwn(PORTAL_FORMATS, extension) ? { extension, mime: PORTAL_FORMATS[extension] } : null;
}
export function portalIssues(record) {
  const issues = [];
  if (!Object.hasOwn(PORTAL_TYPES, record.type)) issues.push('Choose a contribution type.');
  if (!record.title?.trim()) issues.push('Add a title.');
  if (!record.language?.trim()) issues.push('Identify the language.');
  if (!record.provenance) issues.push('Describe how this material was created.');
  if (!record.uses?.review) issues.push('Allow internal review to submit.');
  if (!record.rights?.ownership) issues.push('Describe your ownership or permission.');
  if (!record.content?.source?.trim()) issues.push('Identify the source or author.');
  if (record.type === 'documents' && !record.files?.length) issues.push('Attach at least one uploaded file.');
  if (record.type === 'audio' && !record.files?.length) issues.push('Attach a recording.');
  if ((record.type === 'audio' || record.files?.some(f => /^(audio|video)\//.test(f.mime))) && !record.rights?.speakers) issues.push('Confirm permission from the recorded speakers.');
  if (record.type === 'audio' && record.files?.some(f => !f.mime.startsWith('audio/'))) issues.push('Attach only audio files in the audio workspace.');
  if (record.type === 'words' && record.files?.some(f => !f.mime.startsWith('audio/'))) issues.push('Attach only pronunciation audio to a word or expression.');
  if (record.type === 'audio' && !record.content?.transcript?.trim() && !record.content?.needsTranscription) issues.push('Add a transcript or mark the recording as needing transcription.');
  if (!['audio', 'documents'].includes(record.type) && !record.content?.text?.trim()) issues.push('Add your contribution.');
  if (record.type === 'translations' && !record.content?.sourceText?.trim()) issues.push('Add the source sentence.');
  if (record.type === 'words' && !record.content?.meaning?.trim()) issues.push('Add a meaning.');
  if (record.type === 'corrections' && (!record.content?.originalRecord?.trim() || !record.content?.reason?.trim())) issues.push('Link the original record and explain your correction.');
  return issues;
}
