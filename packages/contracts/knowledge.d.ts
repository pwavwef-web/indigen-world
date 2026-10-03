export const KNOWLEDGE_SCHEMA_VERSION: 2;
export const KNOWLEDGE_NORMALIZATION_VERSION: string;
export type ValueState = 'known' | 'unknown' | 'not_applicable' | 'not_yet_translated' | 'no_direct_equivalent';
export type Workflow = 'draft' | 'submitted' | 'in_review' | 'changes_requested' | 'review_complete' | 'withdrawn';
export type Authentication = 'community' | 'reviewed' | 'gold' | 'rejected_outdated';
export type Destination = 'venacula' | 'tribestudio' | 'kawuri' | 'training' | 'evaluation';
export type ReviewScope = 'language' | 'culture' | 'curation';
export interface KnowledgeRights { state: 'unresolved' | 'documented' | 'withdrawn'; holder: string; evidence: string; version: string; publicAttribution: string; restrictions: string; expiresAt: string; preservation: boolean; derivedMedia: boolean; speechSynthesis: boolean }
export interface Representation { id: string; original: string; english: string; french: string; speakerId: string; context: string; translator: string; translationState: ValueState }
export interface KnowledgeRelation { type: string; recordId: string; revision: number }
export interface CaptureMetadata { rights: KnowledgeRights; valueStates: Record<string, ValueState>; structured: Record<string, Representation[]>; relations: KnowledgeRelation[]; requestContext: string; split: 'unassigned' | 'train' | 'evaluation'; sourceFamily: string }
export const VALUE_STATES: readonly ValueState[];
export const WORKFLOW_LABELS: Record<Workflow, string>;
export const AUTHENTICATION_LABELS: Record<Authentication, string>;
export const RELATION_TYPES: readonly string[];
export const DESTINATIONS: readonly Destination[];
export const REVIEW_CHECKS: readonly string[];
export const DISPLAY_PREFIXES: Record<string, string>;
export const STRUCTURED_FIELDS: Record<string, readonly string[]>;
export const RIGHTS_STATES: readonly string[];
export function submissionIssues(record: unknown, options?: { sentenceEnabled?: boolean }): { field: string; message: string }[];
export function knowledgeState(record: { status?: string; workflow?: Workflow; authentication?: Authentication; disputed?: boolean }): { workflow: Workflow; authentication: Authentication; disputed: boolean };
export function knowledgeSearchText(record: unknown): string;
