import catalog from '@indigen-world/contracts/knowledge-catalog.json' with { type: 'json' };
import { submissionIssues, type CaptureMetadata, type Workflow, type Authentication, type ReviewScope } from '@indigen-world/contracts/knowledge';
import { parseCaptureMetadata } from './knowledge-policy.js';
import { createHash } from 'node:crypto';

export interface KnowledgeField { key: string; label: string; hint: string; required?: boolean; reviewRecommended?: boolean; requirement?: string; multiline?: boolean }
export interface KnowledgeCategory { id: string; label: string; description: string; fields: KnowledgeField[] }
export const KNOWLEDGE_CATALOG: KnowledgeCategory[] = catalog.categories;
export type KnowledgeStatus = 'draft' | 'submitted' | 'reviewed' | 'gold' | 'changes_requested' | 'disputed' | 'withdrawn';
export interface KnowledgePermissions { review: boolean; sourceConfirmed: boolean; publication: boolean; providerRetrieval: boolean; modelTraining: boolean; evaluation: boolean; audio: boolean; licence: string; culturalAccess: 'open' | 'restricted' | 'sensitive' }
export interface KnowledgeAudio { path: string; label: string; transcript: string; speakerId: string; region: string; kind: 'isolated' | 'in_context'; environment: string; quality: string; generation?: string; checksum?: string }
export interface KnowledgeInput extends CaptureMetadata {
  datasetType: string; language: 'xsm'; title: string; original: string; english: string; french: string; context: string; region: string;
  source: string; sourceType: 'speaker' | 'literature' | 'recording' | 'other'; sourceReference: string; details: Record<string, string>;
  variants: { form: string; context: string; note: string }[]; relatedRecordIds: string[]; permissions: KnowledgePermissions; audio: KnowledgeAudio[];
}
export interface KnowledgeRecord extends KnowledgeInput { id: string; schemaVersion: 1 | 2; displayId?: string; workflow?: Workflow; authentication?: Authentication; authenticationPolicy?: string; disputed?: boolean; blockingIssues?: string[]; submittedAt?: string; duplicateKey?: string; searchText?: string; normalizationVersion?: string; revision: number; authorUid: string; createdAt: string; updatedAt: string; verifiedAt: string | null; status: KnowledgeStatus; warnings: string[]; reviewCount: number; approvalCount: number }
export interface KnowledgeReview { scope?: ReviewScope; policyVersion?: string; qualificationReference?: string; checklist?: Record<string, boolean>; reviewerUid: string; revision: number; decision: 'approve' | 'changes_requested' | 'dispute'; languageCompetent: boolean; culturalCompetent: boolean; note: string; createdAt: string }
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
  const allowed = ['datasetType', 'language', 'title', 'original', 'english', 'french', 'context', 'region', 'source', 'sourceType', 'sourceReference', 'details', 'variants', 'relatedRecordIds', 'permissions', 'audio', 'rights', 'valueStates', 'structured', 'relations', 'requestContext', 'split', 'sourceFamily'];
  if (Object.keys(d).some(key => !allowed.includes(key))) throw new Error('Unknown or protected record fields are not accepted.');
  if (!type) throw new Error('Choose one of the ten dataset areas.');
  if (d.language !== undefined && d.language !== 'xsm') throw new Error('This workspace currently records Kasem (xsm).');
  const sourceType = d.sourceType ?? 'speaker';
  if (!['speaker', 'literature', 'recording', 'other'].includes(String(sourceType))) throw new Error('Choose a source type.');
  const p = knowledgeObject(d.permissions), permissions = {} as KnowledgePermissions;
  if (Object.keys(p).some(key => !['review', 'sourceConfirmed', 'publication', 'providerRetrieval', 'modelTraining', 'evaluation', 'audio', 'licence', 'culturalAccess'].includes(key))) throw new Error('Unknown permission field.');
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
  for (const field of type.fields) details[field.key] = knowledgeText(rawDetails[field.key], field.label, 12000, false);
  const record: KnowledgeInput = {
    ...parseCaptureMetadata(d, type.id), datasetType: type.id, language: 'xsm', title: knowledgeText(d.title, 'Title', 200, submit), original: knowledgeText(d.original, 'Original Kasem', 30000, submit && !['qa', 'pronunciation'].includes(type.id)),
    english: knowledgeText(d.english, 'English meaning', 30000), french: knowledgeText(d.french, 'French meaning', 30000),
    context: knowledgeText(d.context, 'Context', 12000), region: knowledgeText(d.region, 'Region or dialect', 200),
    source: knowledgeText(d.source, 'Source attribution', 2000, submit), sourceType: sourceType as KnowledgeInput['sourceType'],
    sourceReference: knowledgeText(d.sourceReference, 'Source reference', 2000, submit), details,
    variants: list(d.variants, 'Variants', 20).map(rawVariant => { const v = knowledgeObject(rawVariant); return { form: knowledgeText(v.form, 'Variant form', 4000, submit), context: knowledgeText(v.context, 'Variant context', 4000), note: knowledgeText(v.note, 'Variant note', 4000) }; }),
    relatedRecordIds: [...new Set(list(d.relatedRecordIds, 'Related record IDs', 30).map(rawId => { const id = knowledgeText(rawId, 'Related ID', 200, true); if (!/^[\w:.-]+$/.test(id)) throw new Error('Related references must be record IDs, not URLs.'); return id; }))],
    permissions,
    audio: list(d.audio, 'Recordings', 12).map(rawAudio => {
      const a = knowledgeObject(rawAudio);
      if (Object.keys(a).some(key => !['path', 'kind', 'label', 'transcript', 'speakerId', 'region', 'environment', 'quality'].includes(key))) throw new Error('Unknown or protected audio field.');
      const path = knowledgeText(a.path, 'Audio path', 300, true);
      const prefix = path.startsWith('knowledgeAudio/') ? `knowledgeAudio/${uid}/` : `grammarAudio/${uid}/`;
      if (!path.startsWith(prefix) || path.includes('..') || path.slice(prefix.length).includes('/')) throw new Error('Attach a recording uploaded by this contributor.');
      if (!['isolated', 'in_context'].includes(String(a.kind))) throw new Error('Choose isolated or in-context pronunciation.');
      return { path, kind: a.kind as KnowledgeAudio['kind'], label: knowledgeText(a.label, 'Recording label', 200), transcript: knowledgeText(a.transcript, 'Audio transcript', 12000, submit),
        speakerId: knowledgeText(a.speakerId, 'Speaker reference', 200, submit), region: knowledgeText(a.region, 'Speaker region', 200),
        environment: knowledgeText(a.environment, 'Recording environment', 2000), quality: knowledgeText(a.quality, 'Recording quality', 2000) };
    }),
  };
  if (record.audio.length && !permissions.audio) throw new Error('Confirm permission to store and review recordings.');
  if (permissions.culturalAccess !== 'open' && (permissions.publication || permissions.providerRetrieval || permissions.modelTraining)) throw new Error('Restricted or sensitive material cannot grant public display, AI retrieval or model training in this workspace.');
  if (submit) { const issues = submissionIssues(record, { sentenceEnabled: true }); if (issues.length) throw new Error(issues.map(issue => issue.message).join(' ')); }
  if (submit && record.datasetType === 'pronunciation' && !record.audio.length) throw new Error('Pronunciation submissions need a recording.');
  if (Buffer.byteLength(JSON.stringify(record), 'utf8') > 650000) throw new Error('This record is too large. Split it into linked passages or sessions.');
  return record;
}
export function knowledgeWarnings(record: KnowledgeInput): string[] {
  const warnings: string[] = [];
  for (const [key, label] of [['title', 'title'], ['original', 'original Kasem'], ['english', 'English meaning'], ['context', 'context'], ['region', 'region or dialect'], ['source', 'source attribution']] as const) if (!record[key].trim() && !(key === 'original' && record.datasetType === 'qa')) warnings.push(`Add ${label}.`);
  const type = KNOWLEDGE_CATALOG.find(c => c.id === record.datasetType)!;
  for (const field of type.fields) if (field.reviewRecommended && !record.details[field.key]?.trim()) warnings.push(`Add ${field.label.toLowerCase()}.`);
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
  if (!['language', 'culture', 'curation'].includes(String(d.scope))) throw new Error('Choose your authorised review scope.');
  if (d.scope === 'language' && d.languageCompetent !== true) throw new Error('Confirm that you can judge this language and dialect.');
  if (d.scope === 'culture' && d.culturalCompetent !== true) throw new Error('This record also needs a reviewer competent in its cultural context.');
  const note = knowledgeText(d.note, 'Review explanation', 8000, true);
  const rawChecklist = knowledgeObject(d.checklist);
  const checklist: Record<string, boolean> = {};
  for (const key of ['original', 'meaning', 'context', 'provenance', 'rights', 'relationships', 'audio']) { if (typeof rawChecklist[key] !== 'boolean') throw new Error('Complete each review checklist item.'); checklist[key] = rawChecklist[key] === true; }
  if (d.decision === 'approve' && Object.values(checklist).some(value => !value)) throw new Error('Approval needs every checklist item confirmed, including not-applicable checks.');
  if (note.trim().length < 10) throw new Error('Explain the concern in at least 10 characters.');
  return { scope: d.scope as ReviewScope, checklist, reviewerUid: uid, revision: record.revision, decision: d.decision as KnowledgeReview['decision'], languageCompetent: true, culturalCompetent: d.culturalCompetent === true, note, createdAt: now };
}
export function applyKnowledgeReview(record: KnowledgeRecord, review: KnowledgeReview): KnowledgeRecord {
  const approvalCount = record.approvalCount + (review.decision === 'approve' ? 1 : 0);
  const status: KnowledgeStatus = record.status === 'disputed' || review.decision === 'dispute' ? 'disputed'
    : record.status === 'changes_requested' || review.decision === 'changes_requested' ? 'changes_requested'
    : 'reviewed';
  return { ...record, workflow: status === 'changes_requested' ? 'changes_requested' : 'in_review', authentication: 'reviewed', disputed: status === 'disputed', approvalCount, reviewCount: record.reviewCount + 1, status, updatedAt: review.createdAt, verifiedAt: null };
}
