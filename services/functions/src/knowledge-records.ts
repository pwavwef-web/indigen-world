import { createHash } from 'node:crypto';

export interface KnowledgeField { key: string; label: string; hint: string; required?: boolean; multiline?: boolean }
export interface KnowledgeCategory { id: string; label: string; description: string; fields: KnowledgeField[] }
const f = (key: string, label: string, hint: string, required = false, multiline = true): KnowledgeField => ({ key, label, hint, required, multiline });
export const KNOWLEDGE_CATALOG: KnowledgeCategory[] = [
  { id: 'lexicon', label: 'Lexicon', description: 'Separate each meaning and preserve spelling, morphology and real examples.', fields: [
    f('partOfSpeech', 'Part of speech', 'For example noun, verb, particle; write unknown if unresolved.', true, false),
    f('definitionKasem', 'Definition in Kasem', 'Explain this meaning in Kasem.'), f('sense', 'Meaning and sense', 'Specify this meaning and distinguish other senses.', true),
    f('ipa', 'IPA and tone', 'Record a verified transcription; leave unknown analysis explicit.'), f('morphology', 'Word forms and structure', 'Record noun class, plural, conjugation, or morphemes where known.'),
    f('example', 'Attested example', 'A real Kasem example with its English meaning and situation.', true), f('usage', 'Usage limits', 'Register, restrictions, collocations and uncommon uses.'), f('etymology', 'Origin and related words', 'Distinguish documented origins from hypotheses.') ] },
  { id: 'grammar', label: 'Grammar', description: 'Describe scoped rules supported by examples and counterexamples.', fields: [
    f('rule', 'Rule or claim', 'State the proposed pattern without treating a hypothesis as a fact.', true), f('scope', 'Scope and exceptions', 'Where, when and in which dialect this pattern applies.', true),
    f('structure', 'Linguistic structure', 'Word order, clause roles and morpheme analysis. Mark unresolved analysis.'), f('examples', 'Supporting examples', 'Kasem examples, meanings and contextual differences.', true),
    f('counterexamples', 'Counterexamples', 'Contexts where the claim fails or another form is preferred.'), f('evidence', 'Evidence references', 'Link reviewed sentence IDs or exact source locations.') ] },
  { id: 'expressions', label: 'Expressions', description: 'Capture natural idioms and everyday expressions in their social setting.', fields: [
    f('literalMeaning', 'Literal meaning', 'Separate literal wording from intended meaning.'), f('intendedMeaning', 'Intended meaning', 'What a speaker communicates.', true),
    f('speakerRelationship', 'Who says it to whom', 'Relationships, age, social setting and register.', true), f('response', 'Natural response', 'Typical reply, when one is expected.'), f('alternatives', 'Alternatives and limits', 'Other forms and situations where this expression is unsuitable.') ] },
  { id: 'sentences', label: 'Sentences', description: 'Keep full meaning, context and linguistic structure together.', fields: [
    f('sentenceType', 'Sentence type', 'Statement, question, command, negative or another construction.', true, false), f('literalMeaning', 'Literal reading', 'A literal paraphrase; never force uncertain particles into English words.'),
    f('structure', 'Word or phrase analysis', 'Align known words/phrases, roles and morphemes; label unknown spans.'), f('construction', 'Construction', 'For example focus, possession, negation or tense.'), f('previousTurn', 'Preceding conversation', 'What came immediately before this sentence.'), f('alternatives', 'Acceptable alternatives', 'Alternative wordings with any difference in meaning.') ] },
  { id: 'proverbs', label: 'Proverbs', description: 'Preserve the words, interpretation and cultural authority behind a saying.', fields: [
    f('literalMeaning', 'Literal translation', 'The image or literal wording used in the proverb.', true), f('interpretation', 'Interpretation', 'The lesson, figurative meaning and alternative interpretations.', true),
    f('use', 'When and by whom it is used', 'A real use case, speaker/audience and restrictions.', true), f('authority', 'Cultural source', 'Elder, storyteller or documented source; use a consented name or reference.'),
    f('englishEquivalent', 'English equivalent, if any', 'Record a verified equivalent, no direct equivalent, or unknown.'), f('frenchEquivalent', 'French equivalent, if any', 'Record a verified equivalent, no direct equivalent, or unknown.'),
    f('misuse', 'Misuse and cautions', 'Contexts where this proverb would mislead or offend.') ] },
  { id: 'literature', label: 'Literature', description: 'Document a sourced passage, story, song or poem without losing its identity.', fields: [
    f('genre', 'Genre', 'Story, poem, song, folktale, oral history or other form.', true, false), f('creator', 'Author or narrator', 'Consented attribution or a source identifier.', true),
    f('workTitle', 'Title of the full work', 'Keep the parent work identifiable.', true), f('location', 'Passage location', 'Page, chapter, verse, episode or recording time.', true),
    f('themes', 'Themes and meaning', 'Explain themes, symbolism and cultural setting.'), f('segments', 'Passage alignment', 'Numbered Kasem segments and matching translations, preserving sequence.'), f('editorialNotes', 'Editorial changes', 'Describe transcription, spelling or translation changes; keep original text intact.') ] },
  { id: 'dialogue', label: 'Dialogue', description: 'Retain speaker turns, relationships and the purpose of a conversation.', fields: [
    f('participants', 'Participants', 'Consented speaker IDs and their relationship; avoid unnecessary personal information.', true), f('turns', 'Speaker turns', 'Number each turn and identify the speaker; align translations.', true),
    f('goal', 'Conversation goal', 'What the speakers are trying to achieve.', true), f('register', 'Register and politeness', 'Formal/informal speech and any social conventions.'), f('nonverbal', 'Pauses and nonverbal context', 'Meaningful pauses, overlap or gestures.') ] },
  { id: 'pronunciation', label: 'Pronunciation', description: 'Connect recordings to precise transcripts, speakers and recording conditions.', fields: [
    f('transcription', 'Pronunciation transcription', 'IPA/tone when verified, or an explicit unresolved transcription.', true), f('tone', 'Tone and stress', 'Verified tone/stress patterns and contrasts.'),
    f('speakerBackground', 'Speaker background', 'Dialect and relevant language experience using a consented or pseudonymous ID.', true), f('minimalPairs', 'Contrast and minimal pairs', 'Examples that distinguish sounds or tones.'), f('recordingNotes', 'Recording notes', 'Device, noise, clipping and whether the speech is isolated or contextual.') ] },
  { id: 'culture', label: 'Culture', description: 'Record cultural knowledge with local interpretation and access restrictions.', fields: [
    f('topic', 'Cultural topic', 'Practice, ceremony, object, institution or concept.', true, false), f('explanation', 'Community explanation', 'Describe the significance in the community’s own terms.', true),
    f('authority', 'Knowledge source', 'Who can attest to this account, using consented attribution.', true), f('protocol', 'Access and use protocol', 'Who may see, repeat, translate or reuse this knowledge.', true),
    f('variation', 'Local or generational variation', 'Different practices or interpretations; do not erase disagreement.'), f('misinterpretations', 'Common misinterpretations', 'Explain what outside readers commonly misunderstand.') ] },
  { id: 'qa', label: 'Question and answer', description: 'Build grounded answers with references, reasoning and uncertainty.', fields: [
    f('question', 'Question', 'The exact question being answered.', true), f('answer', 'Proposed answer', 'The answer and its limits; explicitly record unknown or no direct equivalent when appropriate.', true), f('evidence', 'Supporting evidence', 'Stable record IDs or exact source references; explain a documented evidence gap.', true),
    f('reasoning', 'Explanation', 'Explain why the answer follows from the evidence.'), f('uncertainty', 'Unknowns and acceptable alternatives', 'Record when the answer should abstain or accept another response.'), f('topic', 'Topic', 'The area of knowledge this question tests.', false, false) ] },
];
export type KnowledgeStatus = 'draft' | 'submitted' | 'reviewed' | 'gold' | 'changes_requested' | 'disputed' | 'withdrawn';
export interface KnowledgePermissions { review: boolean; sourceConfirmed: boolean; publication: boolean; providerRetrieval: boolean; modelTraining: boolean; evaluation: boolean; audio: boolean; licence: string; culturalAccess: 'open' | 'restricted' | 'sensitive' }
export interface KnowledgeAudio { path: string; label: string; transcript: string; speakerId: string; region: string; kind: 'isolated' | 'in_context'; environment: string; quality: string; generation?: string }
export interface KnowledgeInput {
  datasetType: string; language: 'xsm'; title: string; original: string; english: string; french: string; context: string; region: string;
  source: string; sourceType: 'speaker' | 'literature' | 'recording' | 'other'; sourceReference: string; details: Record<string, string>;
  variants: { form: string; context: string; note: string }[]; relatedRecordIds: string[]; permissions: KnowledgePermissions; audio: KnowledgeAudio[];
}
export interface KnowledgeRecord extends KnowledgeInput { id: string; schemaVersion: 1; revision: number; authorUid: string; createdAt: string; updatedAt: string; verifiedAt: string | null; status: KnowledgeStatus; warnings: string[]; reviewCount: number; approvalCount: number }
export interface KnowledgeReview { reviewerUid: string; revision: number; decision: 'approve' | 'changes_requested' | 'dispute'; languageCompetent: boolean; culturalCompetent: boolean; note: string; createdAt: string }
export function knowledgeObject(raw: unknown): Record<string, unknown> { return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {}; }
export function knowledgeText(raw: unknown, label: string, max: number, required = false): string {
  if (raw === undefined || raw === null) { if (required) throw new Error(`${label} is required.`); return ''; }
  if (typeof raw !== 'string') throw new Error(`${label} must be text.`);
  if (raw.length > max) throw new Error(`${label} must be ${max} characters or fewer.`);
  if (required && !raw.trim()) throw new Error(`${label} is required.`);
  return raw;
}
export function knowledgeHash(value: string): string { return createHash('sha256').update(value).digest('hex'); }
export function knowledgeId(raw: unknown): string {
  const id = knowledgeText(raw, 'Record ID', 100, true);
  if (!/^KSM-[a-z]+-[a-z0-9]{12,64}$/.test(id)) throw new Error('Choose a valid knowledge record ID.');
  return id;
}
function list(raw: unknown, label: string, max: number): unknown[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length > max) throw new Error(`${label} must be a list with at most ${max} items.`);
  return raw;
}
export function parseKnowledgeInput(raw: unknown, uid: string, submit: boolean): KnowledgeInput {
  const d = knowledgeObject(raw), type = KNOWLEDGE_CATALOG.find(c => c.id === d.datasetType);
  if (!type) throw new Error('Choose one of the ten dataset areas.');
  if (d.language !== undefined && d.language !== 'xsm') throw new Error('This workspace currently records Kasem (xsm).');
  const sourceType = d.sourceType ?? 'speaker';
  if (!['speaker', 'literature', 'recording', 'other'].includes(String(sourceType))) throw new Error('Choose a source type.');
  const p = knowledgeObject(d.permissions), permissions = {} as KnowledgePermissions;
  for (const key of ['review', 'sourceConfirmed', 'publication', 'providerRetrieval', 'modelTraining', 'evaluation', 'audio'] as const) {
    if (p[key] !== undefined && typeof p[key] !== 'boolean') throw new Error(`${key} must be an explicit permission choice.`);
    permissions[key] = p[key] === true;
  }
  permissions.licence = knowledgeText(p.licence, 'Licence or source terms', 2000);
  const access = p.culturalAccess ?? 'open';
  if (!['open', 'restricted', 'sensitive'].includes(String(access))) throw new Error('Choose a cultural access level.');
  permissions.culturalAccess = access as KnowledgePermissions['culturalAccess'];
  const rawDetails = knowledgeObject(d.details), details: Record<string, string> = {};
  if (Object.keys(rawDetails).some(key => !type.fields.some(field => field.key === key))) throw new Error('Use the fields belonging to this dataset area.');
  for (const field of type.fields) details[field.key] = knowledgeText(rawDetails[field.key], field.label, 12000, submit && field.required);
  const record: KnowledgeInput = {
    datasetType: type.id, language: 'xsm', title: knowledgeText(d.title, 'Title', 200, submit), original: knowledgeText(d.original, 'Original Kasem', 30000, submit && type.id !== 'qa'),
    english: knowledgeText(d.english, 'English meaning', 30000, submit), french: knowledgeText(d.french, 'French meaning', 30000),
    context: knowledgeText(d.context, 'Context', 12000, submit), region: knowledgeText(d.region, 'Region or dialect', 200, submit),
    source: knowledgeText(d.source, 'Source attribution', 2000, submit), sourceType: sourceType as KnowledgeInput['sourceType'],
    sourceReference: knowledgeText(d.sourceReference, 'Source reference', 2000, submit && ['literature', 'recording'].includes(String(sourceType))), details,
    variants: list(d.variants, 'Variants', 20).map(rawVariant => { const v = knowledgeObject(rawVariant); return { form: knowledgeText(v.form, 'Variant form', 4000, submit), context: knowledgeText(v.context, 'Variant context', 4000), note: knowledgeText(v.note, 'Variant note', 4000) }; }),
    relatedRecordIds: [...new Set(list(d.relatedRecordIds, 'Related record IDs', 30).map(rawId => { const id = knowledgeText(rawId, 'Related ID', 200, true); if (!/^[\w:.-]+$/.test(id)) throw new Error('Related references must be record IDs, not URLs.'); return id; }))],
    permissions,
    audio: list(d.audio, 'Recordings', 12).map(rawAudio => {
      const a = knowledgeObject(rawAudio), path = knowledgeText(a.path, 'Audio path', 300, true);
      if (!path.startsWith(`grammarAudio/${uid}/`) || path.includes('..') || path.slice(`grammarAudio/${uid}/`.length).includes('/')) throw new Error('Attach a recording uploaded by this contributor.');
      if (!['isolated', 'in_context'].includes(String(a.kind))) throw new Error('Choose isolated or in-context pronunciation.');
      return { path, kind: a.kind as KnowledgeAudio['kind'], label: knowledgeText(a.label, 'Recording label', 200), transcript: knowledgeText(a.transcript, 'Audio transcript', 12000, submit),
        speakerId: knowledgeText(a.speakerId, 'Speaker reference', 200, submit), region: knowledgeText(a.region, 'Speaker region', 200, submit),
        environment: knowledgeText(a.environment, 'Recording environment', 2000), quality: knowledgeText(a.quality, 'Recording quality', 2000) };
    }),
  };
  if (record.audio.length && !permissions.audio) throw new Error('Confirm permission to store and review recordings.');
  if (permissions.culturalAccess !== 'open' && (permissions.publication || permissions.providerRetrieval || permissions.modelTraining)) throw new Error('Restricted or sensitive material cannot grant public display, AI retrieval or model training in this workspace.');
  if (submit && (!permissions.review || !permissions.sourceConfirmed)) throw new Error('Confirm source rights and community review permission before submitting.');
  if (submit && record.datasetType === 'pronunciation' && !record.audio.length) throw new Error('Pronunciation submissions need a recording.');
  if (Buffer.byteLength(JSON.stringify(record), 'utf8') > 650000) throw new Error('This record is too large. Split it into linked passages or sessions.');
  return record;
}
export function knowledgeWarnings(record: KnowledgeInput): string[] {
  const warnings: string[] = [];
  for (const [key, label] of [['title', 'title'], ['original', 'original Kasem'], ['english', 'English meaning'], ['context', 'context'], ['region', 'region or dialect'], ['source', 'source attribution']] as const) if (!record[key].trim() && !(key === 'original' && record.datasetType === 'qa')) warnings.push(`Add ${label}.`);
  const type = KNOWLEDGE_CATALOG.find(c => c.id === record.datasetType)!;
  for (const field of type.fields) if (field.required && !record.details[field.key]?.trim()) warnings.push(`Add ${field.label.toLowerCase()}.`);
  if (['literature', 'recording'].includes(record.sourceType) && !record.sourceReference.trim()) warnings.push('Add an exact source reference.');
  if (!record.permissions.sourceConfirmed) warnings.push('Confirm source rights.');
  if (!record.permissions.review) warnings.push('Community review permission is missing.');
  if (!record.permissions.licence.trim()) warnings.push('Document licence or source terms before any downstream reuse.');
  if (!record.audio.length) warnings.push('No recording is attached.');
  if (record.variants.some(v => !v.form.trim())) warnings.push('Complete or remove empty variants before submission.');
  if (record.permissions.culturalAccess !== 'open') warnings.push('Cultural access is restricted; any future reuse needs a separate protocol check.');
  return warnings;
}
export function requiresCulturalCompetence(record: KnowledgeInput): boolean { return ['proverbs', 'literature', 'culture'].includes(record.datasetType) || record.permissions.culturalAccess !== 'open'; }
export function parseKnowledgeReview(raw: unknown, record: KnowledgeRecord, uid: string, now: string): KnowledgeReview {
  const d = knowledgeObject(raw);
  if (uid === record.authorUid) throw new Error('Your own contribution needs independent review.');
  if (d.revision !== record.revision) throw new Error('Open the latest revision before reviewing.');
  if (['draft', 'withdrawn'].includes(record.status) || !record.permissions.review) throw new Error('This record is not available for review.');
  if (!['approve', 'changes_requested', 'dispute'].includes(String(d.decision))) throw new Error('Choose a review decision.');
  if (d.languageCompetent !== true) throw new Error('Confirm that you can judge this language and dialect.');
  if (requiresCulturalCompetence(record) && d.culturalCompetent !== true) throw new Error('This record also needs a reviewer competent in its cultural context.');
  const note = knowledgeText(d.note, 'Review explanation', 8000, d.decision !== 'approve');
  if (d.decision !== 'approve' && note.trim().length < 10) throw new Error('Explain the concern in at least 10 characters.');
  return { reviewerUid: uid, revision: record.revision, decision: d.decision as KnowledgeReview['decision'], languageCompetent: true, culturalCompetent: d.culturalCompetent === true, note, createdAt: now };
}
export function applyKnowledgeReview(record: KnowledgeRecord, review: KnowledgeReview): KnowledgeRecord {
  const approvalCount = record.approvalCount + (review.decision === 'approve' ? 1 : 0);
  const status: KnowledgeStatus = record.status === 'disputed' || review.decision === 'dispute' ? 'disputed'
    : record.status === 'changes_requested' || review.decision === 'changes_requested' ? 'changes_requested'
    : approvalCount >= 2 ? 'gold' : 'reviewed';
  return { ...record, approvalCount, reviewCount: record.reviewCount + 1, status, updatedAt: review.createdAt, verifiedAt: status === 'gold' ? record.verifiedAt ?? review.createdAt : null };
}
