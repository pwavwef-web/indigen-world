import { DESTINATIONS, REVIEW_CHECKS, STRUCTURED_FIELDS, VALUE_STATES, knowledgeState, type CaptureMetadata, type Destination, type ReviewScope } from '@indigen-world/contracts/knowledge';
import { knowledgeObject, knowledgeText, requiresCulturalCompetence, type KnowledgeRecord, type KnowledgeReview } from './knowledge-records.js';

export interface KnowledgePolicy {
  version: string; approved: boolean; approvedCategories: string[]; sentenceEnabled: boolean;
  sentencePrefix?: string; sentenceSchemaVersion?: string; reviewerQuorum: number; requiredChecks: string[]; destinations: Destination[];
}
export interface KnowledgeGrant { active: boolean; policyVersion: string; categories: string[]; scopes: (ReviewScope | 'release')[]; expiresAt: string; qualificationReference: string }
export const CLOSED_POLICY: KnowledgePolicy = { version: 'unapproved', approved: false, approvedCategories: [], sentenceEnabled: false, reviewerQuorum: 0, requiredChecks: [...REVIEW_CHECKS], destinations: [] };
export function policyFrom(raw: unknown): KnowledgePolicy {
  const p = knowledgeObject(raw);
  if (p.approved !== true || typeof p.version !== 'string' || !p.version.trim() || !Number.isInteger(p.reviewerQuorum) || Number(p.reviewerQuorum) < 1 || Number(p.reviewerQuorum) > 20
    || !Array.isArray(p.approvedCategories) || !p.approvedCategories.every(c => typeof c === 'string' && c in STRUCTURED_FIELDS)
    || !Array.isArray(p.requiredChecks) || !REVIEW_CHECKS.every(c => p.requiredChecks instanceof Array && p.requiredChecks.includes(c))
    || !Array.isArray(p.destinations) || !p.destinations.every(d => DESTINATIONS.includes(d))) return { ...CLOSED_POLICY };
  if (p.sentenceEnabled === true && (typeof p.sentencePrefix !== 'string' || !/^KSM-[A-Z]{3,8}$/.test(p.sentencePrefix) || ['KSM-LEX', 'KSM-GRM', 'KSM-EXP', 'KSM-PRV', 'KSM-FLK', 'KSM-DLG', 'KSM-AUD', 'KSM-CUL', 'KSM-QA'].includes(p.sentencePrefix) || typeof p.sentenceSchemaVersion !== 'string' || !p.sentenceSchemaVersion.trim())) return { ...CLOSED_POLICY };
  return { ...(p.sentenceEnabled === true ? { sentencePrefix: String(p.sentencePrefix), sentenceSchemaVersion: String(p.sentenceSchemaVersion) } : {}), version: p.version, approved: true, approvedCategories: p.approvedCategories, sentenceEnabled: p.sentenceEnabled === true,
    reviewerQuorum: Number(p.reviewerQuorum), requiredChecks: [...REVIEW_CHECKS], destinations: p.destinations };
}
export function hasKnowledgeGrant(raw: unknown, policy: KnowledgePolicy, category: string, scope: ReviewScope | 'release', now = new Date().toISOString()): boolean {
  const g = knowledgeObject(raw);
  return policy.approved && g.active === true && g.policyVersion === policy.version && Array.isArray(g.categories) && g.categories.includes(category)
    && Array.isArray(g.scopes) && g.scopes.includes(scope) && typeof g.qualificationReference === 'string' && !!g.qualificationReference.trim()
    && typeof g.expiresAt === 'string' && Date.parse(g.expiresAt) > Date.parse(now);
}
function keys(raw: Record<string, unknown>, allowed: readonly string[], label: string) {
  if (Object.keys(raw).some(key => !allowed.includes(key))) throw new Error(`${label} contains unknown or protected fields.`);
}
export function parseCaptureMetadata(raw: Record<string, unknown>, category: string): CaptureMetadata {
  const r = knowledgeObject(raw.rights);
  keys(r, ['state', 'holder', 'evidence', 'version', 'publicAttribution', 'restrictions', 'expiresAt', 'preservation', 'derivedMedia', 'speechSynthesis'], 'Rights');
  if (!['unresolved', 'documented', 'withdrawn'].includes(String(r.state))) throw new Error('Choose an explicit rights state.');
  const rights = { state: r.state as CaptureMetadata['rights']['state'], holder: knowledgeText(r.holder, 'Rights holder', 2000), evidence: knowledgeText(r.evidence, 'Consent evidence reference', 2000),
    version: knowledgeText(r.version, 'Consent version', 100), publicAttribution: knowledgeText(r.publicAttribution, 'Public attribution', 1000), restrictions: knowledgeText(r.restrictions, 'Disclosure restrictions', 4000), expiresAt: knowledgeText(r.expiresAt, 'Rights expiry', 40),
    preservation: r.preservation === true, derivedMedia: r.derivedMedia === true, speechSynthesis: r.speechSynthesis === true };
  for (const key of ['preservation', 'derivedMedia', 'speechSynthesis']) if (r[key] !== undefined && typeof r[key] !== 'boolean') throw new Error('Rights scopes must be explicit boolean choices.');
  if (rights.expiresAt && !Number.isFinite(Date.parse(rights.expiresAt))) throw new Error('Use a valid rights expiry date.');
  if (rights.state === 'documented' && (!rights.holder.trim() || !rights.evidence.trim() || !rights.version.trim())) throw new Error('Documented rights need a holder, evidence reference and consent version.');
  const states = knowledgeObject(raw.valueStates), valueStates: CaptureMetadata['valueStates'] = {};
  for (const [key, value] of Object.entries(states)) {
    if (!/^(english|french|region|context|details\.[A-Za-z]+)$/.test(key) || !VALUE_STATES.includes(value as never)) throw new Error('Choose a valid field value state.');
    valueStates[key] = value as CaptureMetadata['valueStates'][string];
  }
  const s = knowledgeObject(raw.structured), structured: CaptureMetadata['structured'] = {};
  keys(s, STRUCTURED_FIELDS[category], 'Structured representations');
  for (const [key, rows] of Object.entries(s)) {
    if (!Array.isArray(rows) || rows.length > 100) throw new Error('Use at most 100 structured items.');
    structured[key] = rows.map(rawRow => {
      const row = knowledgeObject(rawRow); keys(row, ['id', 'original', 'english', 'french', 'speakerId', 'context', 'translator', 'translationState'], 'Representation');
      const id = knowledgeText(row.id, 'Representation ID', 80, true);
      if (!/^[\w-]+$/.test(id)) throw new Error('Invalid representation ID.');
      const translationState = row.translationState ?? 'not_yet_translated';
      if (!VALUE_STATES.includes(translationState as never)) throw new Error('Choose a translation state.');
      return { id, original: knowledgeText(row.original, 'Original representation', 12000), english: knowledgeText(row.english, 'English translation', 12000), french: knowledgeText(row.french, 'French translation', 12000),
        speakerId: knowledgeText(row.speakerId, 'Pseudonymous speaker', 100), context: knowledgeText(row.context, 'Representation context', 4000), translator: knowledgeText(row.translator, 'Translator reference', 200), translationState: translationState as CaptureMetadata['valueStates'][string] };
    });
    if (new Set(structured[key].map(row => row.id)).size !== structured[key].length) throw new Error('Representation IDs must be unique.');
  }
  const rel = raw.relations ?? [];
  if (!Array.isArray(rel) || rel.length > 30) throw new Error('Use at most 30 relationships.');
  const types = ['illustrates_rule', 'variant_of', 'translates', 'related_proverb', 'related_story', 'related_concept', 'pronunciation_of', 'supports', 'supersedes'];
  const relations = rel.map(rawRelation => {
    const r = knowledgeObject(rawRelation); keys(r, ['type', 'recordId', 'revision'], 'Relationship');
    if (!types.includes(String(r.type)) || !Number.isInteger(r.revision) || Number(r.revision) < 1) throw new Error('Relationships need a type and exact positive revision.');
    return { type: String(r.type), recordId: knowledgeText(r.recordId, 'Related record', 100, true), revision: Number(r.revision) };
  });
  const split = raw.split ?? 'unassigned';
  if (!['unassigned', 'train', 'evaluation'].includes(String(split))) throw new Error('Choose a dataset split.');
  return { rights, valueStates, structured, relations, split: split as CaptureMetadata['split'], sourceFamily: knowledgeText(raw.sourceFamily, 'Source family', 200), requestContext: knowledgeText(raw.requestContext, 'Queue request reference', 200) };
}
export function authenticationFor(record: KnowledgeRecord, reviews: KnowledgeReview[], policy: KnowledgePolicy): 'community' | 'reviewed' | 'gold' {
  if (!policy.approved || !policy.approvedCategories.includes(record.datasetType) || record.disputed || reviews.some(r => r.decision !== 'approve')) return reviews.length ? 'reviewed' : 'community';
  const scopes: ReviewScope[] = requiresCulturalCompetence(record) ? ['language', 'culture'] : ['language'];
  const valid = reviews.filter(r => r.revision === record.revision && r.policyVersion === policy.version && r.reviewerUid !== record.authorUid && r.decision === 'approve' && policy.requiredChecks.every(c => r.checklist?.[c] === true));
  return scopes.every(scope => new Set(valid.filter(r => r.scope === scope).map(r => r.reviewerUid)).size >= policy.reviewerQuorum) ? 'gold' : 'reviewed';
}
export function releaseDenials(record: KnowledgeRecord, destination: Destination, policy: KnowledgePolicy, now = new Date().toISOString()): string[] {
  const reasons: string[] = [], state = knowledgeState(record);
  if (!policy.approved || !policy.destinations.includes(destination) || !policy.approvedCategories.includes(record.datasetType)) reasons.push('Destination and category need an approved policy.');
  if (record.datasetType === 'sentences' && !policy.sentenceEnabled) reasons.push('The sentence contract is provisional.');
  if (record.schemaVersion !== 2 || state.authentication !== 'gold' || state.workflow !== 'review_complete' || !record.verifiedAt || record.authenticationPolicy !== policy.version) reasons.push('This exact revision needs qualified Gold authentication under the current policy.');
  if (state.disputed || record.blockingIssues?.length) reasons.push('Resolve all blocking issues and disputes.');
  if (!record.source.trim() || !record.sourceReference.trim()) reasons.push('Identify the source and reference.');
  if (record.rights?.state !== 'documented' || !record.rights.holder || !record.rights.evidence || !record.rights.version || !record.permissions.sourceConfirmed || !record.permissions.licence.trim()) reasons.push('Document the rights holder, consent, version and terms.');
  if (record.rights?.expiresAt && Date.parse(record.rights.expiresAt) <= Date.parse(now)) reasons.push('Rights have expired.');
  if (record.permissions.culturalAccess !== 'open' || record.rights?.restrictions) reasons.push('Restricted disclosure requires an approved protocol outside this release path.');
  const permission = { venacula: 'publication', tribestudio: 'publication', kawuri: 'providerRetrieval', training: 'modelTraining', evaluation: 'evaluation' } as const;
  if (!record.permissions[permission[destination]]) reasons.push('Permission for this destination is absent.');
  if (!record.rights?.publicAttribution.trim()) reasons.push('Add consented public attribution.');
  if (record.audio.some(a => !a.generation || !a.checksum)) reasons.push('An original recording has not been verified.');
  if (record.datasetType === 'grammar' && !record.structured?.examples?.some(e => e.original.trim())) reasons.push('Grammar release needs an authentic structured example.');
  if (record.datasetType === 'dialogue' && (!record.structured?.dialogueTurns?.length || new Set(record.structured.dialogueTurns.map(t => t.speakerId).filter(Boolean)).size !== 2)) reasons.push('Dialogue release needs ordered turns from exactly two pseudonymous speakers.');
  if (record.datasetType === 'pronunciation' && !record.relations?.some(r => r.type === 'pronunciation_of')) reasons.push('Link pronunciation to an exact linguistic revision.');
  if ((destination === 'training' || destination === 'evaluation') && (!record.sourceFamily || record.split !== (destination === 'training' ? 'train' : 'evaluation'))) reasons.push('Assign a source family and matching held-out split.');
  if (destination === 'kawuri' && record.split === 'evaluation') reasons.push('Held-out evaluation examples cannot enter retrieval.');
  return reasons;
}

/** Explicit allowlist: private account IDs, consent evidence and upload paths never leave review tooling. */
export function knowledgeProjection(record: KnowledgeRecord, destination: Destination) {
  return { recordId: record.id, displayId: record.displayId ?? record.id, revision: record.revision, language: record.language, category: record.datasetType,
    title: record.title, original: record.original, english: record.english, french: record.french, context: record.context, region: record.region,
    details: record.details, structured: record.structured, valueStates: record.valueStates, variants: record.variants, relations: record.relations,
    attribution: record.rights.publicAttribution, authentication: 'gold', policyVersion: record.authenticationPolicy, destination };
}
