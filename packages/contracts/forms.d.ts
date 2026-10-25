/**
 * Indigen Forms: versioned, declarative contribution forms.
 *
 * One module is shared by the backend (services/functions), the admin console
 * and the contributor portal so that visibility, required-ness and answer
 * validation behave identically on client and server. Nothing here executes
 * administrator-supplied code: conditions are a fixed set of operators over
 * earlier answers, and every identifier is checked against a strict pattern.
 */

export const FORM_SCHEMA_VERSION: 1;

/* -- Statuses --------------------------------------------------------------- */

export type FormStatus = 'draft' | 'published' | 'paused' | 'closed' | 'archived';
export const FORM_STATUSES: readonly FormStatus[];
export const FORM_STATUS_LABELS: Readonly<Record<FormStatus, string>>;
/** Which lifecycle moves an admin may make from each status (publish is separate). */
export const FORM_STATUS_TRANSITIONS: Readonly<Record<FormStatus, readonly FormStatus[]>>;

/** A version is a draft until published; published versions are immutable; retired ones accept nothing new. */
export type VersionState = 'draft' | 'published' | 'retired';

export type ResponseStatus = 'draft' | 'submitted' | 'under_review' | 'changes_requested' | 'approved' | 'rejected';
export const RESPONSE_STATUSES: readonly ResponseStatus[];
export const RESPONSE_STATUS_LABELS: Readonly<Record<ResponseStatus, string>>;
/** Reviewer decisions and the statuses they may be taken from. */
export type ReviewDecision = 'start_review' | 'request_changes' | 'approve' | 'reject';
export const REVIEW_DECISIONS: Readonly<Record<ReviewDecision, { label: string; from: readonly ResponseStatus[]; to: ResponseStatus }>>;

/* -- Vocabularies ------------------------------------------------------------- */

export interface Choice { id: string; label: string }
export const FORM_CATEGORIES: readonly Choice[];
export const FORM_LANGUAGES: readonly Choice[];
export const FORM_DIALECTS: readonly Choice[];

/**
 * Consent purposes line up with the contributor portal's PORTAL_USES
 * (review, retrieval, training, public) plus explicit permission to store a
 * recording and to credit the contributor by name. Approval never grants any of them.
 */
export type ConsentPurpose = 'storage' | 'review' | 'retrieval' | 'training' | 'public' | 'attribution';
export const CONSENT_PURPOSES: Readonly<Record<ConsentPurpose, { label: string; description: string }>>;

/* -- Fields ------------------------------------------------------------------- */

export type FieldType =
  | 'short_text' | 'long_text' | 'number' | 'email' | 'url' | 'date'
  | 'single_choice' | 'multiple_choice' | 'dropdown'
  | 'checkbox' | 'consent'
  | 'language' | 'dialect'
  | 'file' | 'image' | 'audio' | 'video'
  | 'group'
  | 'instruction' | 'heading';

export type FieldFamily = 'text' | 'choice' | 'confirm' | 'upload' | 'structure' | 'display';

export interface FieldTypeInfo {
  label: string;
  family: FieldFamily;
  description: string;
  /** False for instruction and heading, which collect nothing. */
  collects: boolean;
  /** Whether a field of this type may sit inside a repeatable group. */
  allowedInGroup: boolean;
}
export const FIELD_TYPES: Readonly<Record<FieldType, FieldTypeInfo>>;

export type UploadKind = 'image' | 'audio' | 'video' | 'document';
export interface UploadFormat {
  label: string;
  kind: UploadKind;
  mimeTypes: readonly string[];
  extensions: readonly string[];
}
/** The only formats an upload field may accept. Each is checked by its leading bytes on the server. */
export const UPLOAD_FORMATS: Readonly<Record<string, UploadFormat>>;
/** Default formats per upload field type, and the hard per-file ceiling in megabytes. */
export const UPLOAD_DEFAULTS: Readonly<Record<'file' | 'image' | 'audio' | 'video', { formats: readonly string[]; maxSizeMb: number; ceilingMb: number }>>;

export type ConditionOperator =
  | 'equals' | 'not_equals'
  | 'includes' | 'not_includes'
  | 'answered' | 'not_answered'
  | 'is_true' | 'is_false'
  | 'greater_than' | 'less_than';
export const CONDITION_OPERATORS: Readonly<Record<ConditionOperator, { label: string; needsValue: boolean }>>;

export interface Condition {
  /** A top-level input field that comes earlier in the form. */
  fieldId: string;
  operator: ConditionOperator;
  /** An option id for choice fields, a string, number or ISO date otherwise. */
  value?: string | number | null;
}
export interface ConditionGroup {
  match: 'all' | 'any';
  conditions: Condition[];
}

export interface FieldSettings {
  /* text */
  minLength?: number | null;
  maxLength?: number | null;
  /** short_text: suggest published Kasem dictionary headwords while typing (suggestions never replace what was typed). */
  dictionarySuggestions?: boolean;
  /** short_text / long_text: show the Kasem character bar (ɛ, ɔ, ʋ, ŋ, ɩ and tone marks). */
  kasemKeyboard?: boolean;
  defaultText?: string;
  /* number */
  min?: number | null;
  max?: number | null;
  integer?: boolean;
  /* date (YYYY-MM-DD) */
  minDate?: string | null;
  maxDate?: string | null;
  /* single_choice, multiple_choice, dropdown */
  options?: Choice[];
  defaultOptionIds?: string[];
  minSelections?: number | null;
  maxSelections?: number | null;
  /* language, dialect: restrict the list (empty = all) */
  allowedIds?: string[];
  /* checkbox, consent */
  statement?: string;
  consentPurpose?: ConsentPurpose;
  /* uploads */
  formats?: string[];
  maxSizeMb?: number;
  maxFiles?: number;
  /** audio: allow recording in the browser as well as choosing a file. */
  allowRecording?: boolean;
  /* group */
  minItems?: number;
  maxItems?: number;
  itemLabel?: string;
  /* instruction */
  body?: string;
}

export interface FormField {
  /** Stable identity of the stored answer. Never derived from, or changed with, the label. */
  id: string;
  type: FieldType;
  label: string;
  description?: string;
  example?: string;
  placeholder?: string;
  required?: boolean;
  /** Required only when this matches (in addition to being visible). */
  requiredWhen?: ConditionGroup | null;
  visibleWhen?: ConditionGroup | null;
  validationMessage?: string;
  settings?: FieldSettings;
  /** group only: the repeated sub-fields (one level deep, no uploads of groups). */
  fields?: FormField[];
}

export interface FormSection {
  id: string;
  title: string;
  description?: string;
  visibleWhen?: ConditionGroup | null;
  fields: FormField[];
}

/* -- Form configuration ------------------------------------------------------- */

export type AudienceMode = 'all_contributors' | 'groups';
export interface Audience {
  mode: AudienceMode;
  /** Contributors whose profile names one of these Kasem varieties (dialect ids). */
  dialectIds: string[];
  /** Contributors who chose one of these contribution types in their profile. */
  contributionTypes: string[];
  /** Admin-managed named cohorts (formCohorts). */
  cohortIds: string[];
}

export type ReviewerGroup = 'reviewers' | 'language_reviewers' | 'culture_reviewers' | 'admins';
export const REVIEWER_GROUPS: Readonly<Record<ReviewerGroup, { label: string; description: string }>>;

export interface ReviewCheck { id: string; label: string }
export interface ReviewConfig {
  required: boolean;
  reviewerGroup: ReviewerGroup;
  instructions: string;
  /** Checks a reviewer must tick before approving. */
  checks: ReviewCheck[];
  /** Points awarded once per response on approval, through the existing ledger. 0 = none. */
  points: number;
}

export type DestinationType = 'general_intake' | 'dictionary_candidate' | 'translation_review' | 'audio_collection' | 'document_intake';
export interface DestinationSlot {
  id: string;
  label: string;
  required: boolean;
  accepts: readonly FieldType[];
}
export interface DestinationInfo {
  label: string;
  description: string;
  slots: readonly DestinationSlot[];
  /** Consents a response must have granted before it may be routed here. */
  requiredConsents: readonly ConsentPurpose[];
  /** What happens on approval, in plain language, for the admin interface. */
  effect: string;
}
export const DESTINATIONS: Readonly<Record<DestinationType, DestinationInfo>>;
export interface DestinationConfig {
  type: DestinationType;
  /** destination slot id → top-level field id. Never guessed from labels. */
  mapping: Record<string, string>;
}

export interface FormDefinition {
  schemaVersion: 1;
  title: string;
  description: string;
  category: string;
  instructions: string;
  estimatedMinutes: number | null;
  languageContext: { languageIds: string[]; dialectIds: string[]; note: string };
  presentation: 'single_page' | 'paged';
  sections: FormSection[];
  /** ISO timestamps, or null for no limit. */
  schedule: { opensAt: string | null; closesAt: string | null };
  submission: {
    policy: 'once' | 'multiple';
    allowDrafts: boolean;
    allowAttachments: boolean;
    successMessage: string;
    nextSteps: string;
  };
  audience: Audience;
  review: ReviewConfig;
  destination: DestinationConfig;
}

/* -- Answers -------------------------------------------------------------------- */

export interface AttachmentRef {
  /** The upload id issued by the server; the storage path is resolved server-side. */
  id: string;
  name: string;
  contentType: string;
  size: number;
}
export type AnswerValue = string | number | boolean | string[] | AttachmentRef[] | Array<Record<string, AnswerValue>> | null;
export type Answers = Record<string, AnswerValue>;

export interface Issue {
  /** Field path: `fieldId`, `groupId.2.subFieldId`, or a definition path. */
  path: string;
  message: string;
}

export interface Visibility {
  sections: Record<string, boolean>;
  fields: Record<string, boolean>;
  required: Record<string, boolean>;
}

export interface ConsentRecord {
  fieldId: string;
  purpose: ConsentPurpose;
  statement: string;
  granted: boolean;
}

/* -- Functions ------------------------------------------------------------------ */

export const FORM_LIMITS: Readonly<{
  maxSections: number;
  maxFields: number;
  maxGroupFields: number;
  maxOptions: number;
  maxChecks: number;
  maxConditions: number;
  maxTitle: number;
  maxLabel: number;
  maxText: number;
  maxLongAnswer: number;
  maxShortAnswer: number;
  maxGroupItems: number;
  maxFilesPerField: number;
  maxPoints: number;
}>;
/** Most UTF-8 bytes of JSON one response's answers may take (`answersByteSize`); the server refuses more. */
export const ANSWERS_BYTE_BUDGET: number;

export const ID_PATTERN: RegExp;
export function newId(prefix: string, taken?: Iterable<string>): string;
/** A readable id from a label ("Audio recording" → "audio_recording"); the label itself is never altered. */
export function slugId(label: string, prefix: string, taken?: Iterable<string>): string;
export function createField(type: FieldType, taken?: Iterable<string>): FormField;
export function createSection(taken?: Iterable<string>): FormSection;
export function emptyDefinition(): FormDefinition;

/** Every field id in the definition, including group sub-fields. */
export function allFieldIds(definition: FormDefinition): string[];
/** Top-level fields in form order with their section id. */
export function topLevelFields(definition: FormDefinition): Array<{ field: FormField; sectionId: string; index: number }>;
export function findField(definition: FormDefinition, fieldId: string): FormField | null;

/**
 * Check and normalise a definition (unknown keys dropped, strings trimmed of
 * surrounding whitespace only — inner characters and diacritics untouched).
 * `forPublish` adds the checks that only matter for a live form (destination
 * mapping complete, at least one input, schedule order, review/points coherence).
 */
export function validateDefinition(input: unknown, options?: { forPublish?: boolean; now?: number }): { definition: FormDefinition | null; issues: Issue[] };
/** Published answer keys keep their type: an id may be removed or added in a new version, but never reused for another type. */
export function versionCompatibilityIssues(previous: FormDefinition[], next: FormDefinition): Issue[];
/** Options for a choice, language or dialect question (respecting allowedIds). */
export function choicesFor(field: FormField): Choice[];

/** Operators that make sense for a question of this type. */
export function operatorsFor(type: FieldType): ConditionOperator[];
export function isAnswered(value: unknown): boolean;
/** `answers` must already treat hidden questions as unanswered (computeVisibility does this). */
export function evaluateCondition(group: ConditionGroup | null | undefined, answers: Answers): boolean;
export function computeVisibility(definition: FormDefinition, answers: Answers): Visibility;

/**
 * Validate answers against a definition. `draft` only checks shape and limits
 * of what is present; `submit` also enforces required and conditional rules.
 * The returned answers hold only known, visible fields (hidden answers are
 * dropped on submit and kept on draft so toggling a choice back restores them).
 */
export function validateAnswers(
  definition: FormDefinition,
  input: unknown,
  options: { mode: 'draft' | 'submit' },
): { answers: Answers; issues: Issue[] };

/** Admin-configured defaults to pre-fill a new response. */
export function defaultAnswers(definition: FormDefinition): Answers;
/** UTF-8 bytes of the answers' JSON, as the server counts them against ANSWERS_BYTE_BUDGET. */
export function answersByteSize(answers: unknown): number;
/** The largest answers first (top-level, or `groupId.2.subId` inside a group), to point at when a response is too large. */
export function largestAnswers(definition: FormDefinition, answers: Answers, count?: number): Array<{ path: string; label: string; bytes: number }>;
/**
 * A draft's answers moved to another version: kept when the question exists in
 * both with the same type and passes the new draft checks; permissions are
 * never carried. `dropped` lists `fieldId` or `groupId.subId` once each.
 */
export function carryAnswers(previous: FormDefinition, next: FormDefinition, answers: Answers): { answers: Answers; dropped: string[] };
export function consentRecords(definition: FormDefinition, answers: Answers): ConsentRecord[];
export function grantedPurposes(consents: ConsentRecord[]): ConsentPurpose[];
/** Attachments named in answers, with the field that holds each. */
export function attachmentsIn(definition: FormDefinition, answers: Answers): Array<AttachmentRef & { fieldId: string }>;

/** The upload question with this id (top level or in a group). */
export function uploadField(definition: FormDefinition, fieldId: string): FormField | null;
/** The allowed format whose extension AND declared type both match, or null. */
export function matchUploadFormat(field: FormField, name: string, contentType: string): string | null;

export type WindowReason = 'paused' | 'closed' | 'archived' | 'not_published' | 'retired' | 'not_yet_open' | 'past_deadline';
/** Whether a response may be submitted now against a version (drafts stay on their version). */
export function submissionWindow(input: { formStatus: FormStatus; versionState: VersionState; schedule: FormDefinition['schedule']; now?: number }): { open: boolean; reason: WindowReason | null; message: string };

export const AUDIENCE_CONTRIBUTION_TYPES: readonly Choice[];
/** Profile dialect labels ("Navrongo", "Not sure") to dialect ids. */
export function dialectIdFromLabel(label: unknown): string | null;
export interface AudienceProfile { dialect?: string | null; contributionTypes?: string[]; cohortIds?: string[] }
export function audienceMatches(audience: Audience, profile: AudienceProfile | null | undefined): boolean;
export function audienceText(audience: Audience, cohortNames?: Record<string, string>): string;

export interface PublishSummary {
  title: string;
  sections: number;
  questions: number;
  requiredQuestions: number;
  conditionalQuestions: number;
  uploads: number;
  consents: Array<{ purpose: ConsentPurpose; statement: string }>;
  audience: string;
  schedule: string;
  submission: string;
  review: string;
  destination: string;
  validation: string[];
}
export function publishSummary(definition: FormDefinition, options?: { cohortNames?: Record<string, string> }): PublishSummary;

/** Human-readable answer text (labels for option ids, file names for uploads). */
export function displayAnswer(field: FormField, value: AnswerValue): string;

/* -- Templates ------------------------------------------------------------------ */

export interface FormTemplate { id: string; name: string; description: string; definition: FormDefinition }
export const FORM_TEMPLATES: readonly FormTemplate[];

/* -- Export ---------------------------------------------------------------------- */

/** Quote a CSV cell and neutralise spreadsheet formulas (=, +, -, @, tab, CR). */
export function csvCell(value: unknown): string;

export interface ExportResponse {
  id: string;
  referenceId: string;
  formId: string;
  formVersion: number;
  revision: number;
  status: ResponseStatus;
  contributorId: string;
  submittedAt: string | null;
  decidedAt: string | null;
  answers: Answers;
  consents: ConsentRecord[];
}
export interface ExportVersion { version: number; definition: FormDefinition }
export function responsesToCsv(versions: ExportVersion[], responses: ExportResponse[]): string;
export function responsesToJson(form: { id: string; title: string }, versions: ExportVersion[], responses: ExportResponse[], meta: Record<string, unknown>): string;

/** `IWF-XXXX-XXXX` from random bytes (Crockford base32, no ambiguous letters). */
export function referenceIdFrom(bytes: Uint8Array): string;
