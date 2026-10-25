/**
 * Indigen Forms: request and response shapes of the three callables.
 *
 *   formsAdmin        onStaffCall, admin console (build, publish, responses, export)
 *   formsContributor  onCall, contributor portal (available forms, drafts, uploads, submit)
 *   formsReview       onStaffCall, reviewer desk in the contributor portal and the admin console
 *
 * Every request is `{ action, ...fields }`. Timestamps are ISO strings.
 * Field and option identities come from forms.d.ts.
 */
import type {
  Answers, AttachmentRef, ConsentPurpose, ConsentRecord, FormDefinition, FormStatus, Issue,
  PublishSummary, ResponseStatus, ReviewDecision, VersionState, WindowReason,
} from './forms';

/* -- Shared views ------------------------------------------------------------------ */

export interface StatusCounts {
  draft: number;
  submitted: number;
  under_review: number;
  changes_requested: number;
  approved: number;
  rejected: number;
}

/** A form as listed on the admin dashboard. */
export interface FormSummary {
  id: string;
  title: string;
  description: string;
  category: string;
  languageIds: string[];
  status: FormStatus;
  /** Latest published version, or null if never published. */
  currentVersion: number | null;
  /** Version number of the unpublished draft, or null. */
  draftVersion: number | null;
  publishedVersions: number[];
  retiredVersions: number[];
  /** Current responses by status (drafts are contributors' unsent work). */
  counts: StatusCounts;
  /** Responses that have been submitted at least once. */
  totalSubmitted: number;
  audienceText: string;
  closesAt: string | null;
  opensAt: string | null;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedByName: string;
  lastActivityAt: string | null;
  templateId: string | null;
}

export interface VersionMeta {
  version: number;
  state: VersionState;
  createdAt: string;
  createdBy: string;
  publishedAt: string | null;
  publishedBy: string | null;
  retiredAt: string | null;
  /** Responses that reference this version (any status). */
  responses: number;
}

export interface ActivityEntry {
  id: string;
  /** forms.create, forms.save_draft, forms.publish, forms.status, forms.retire_version, forms.export, forms.review.approve, … */
  action: string;
  actorName: string;
  formId: string | null;
  formTitle: string | null;
  summary: string;
  occurredAt: string;
}

export interface Cohort {
  id: string;
  name: string;
  description: string;
  memberCount: number;
  /** Only returned by getCohort. */
  members?: Array<{ uid: string; name: string; email: string | null }>;
  updatedAt: string;
}

export interface FormsAccess {
  /** What the caller may do. */
  canManage: boolean;
  canPublish: boolean;
  canExport: boolean;
  canReview: boolean;
  /** Only the owner super administrator edits the publisher/exporter lists. */
  canConfigureAccess: boolean;
  /** Empty list = every administrator may publish / export. */
  publishers: Array<{ uid: string; name: string }>;
  exporters: Array<{ uid: string; name: string }>;
  /** Finance-owned limits on points from approved responses. */
  rewards: { enabled: boolean; maxPointsPerResponse: number; dailyCap: number };
  /** Finance access (or the owner): may change `rewards`. */
  canEditRewards: boolean;
}

/** A response row for tables (admin responses, review queue). */
export interface ResponseSummary {
  id: string;
  referenceId: string | null;
  formId: string;
  formTitle: string;
  formVersion: number;
  status: ResponseStatus;
  revision: number;
  contributorId: string;
  contributorName: string;
  languageIds: string[];
  dialectIds: string[];
  submittedAt: string | null;
  updatedAt: string;
  decidedAt: string | null;
  /** Answers of the current revision (submitted answers for reviewers). */
  answers: Answers;
  grantedPurposes: ConsentPurpose[];
  attachmentCount: number;
}

export interface HistoryEvent {
  id: string;
  type:
    | 'created' | 'submitted' | 'resubmitted' | 'review_started' | 'changes_requested' | 'approved' | 'rejected'
    | 'points_awarded' | 'points_failed' | 'routed' | 'routing_blocked' | 'version_moved' | 'attachment_link';
  /** Display name only; uids are not shown to contributors. */
  actorName: string;
  actorRole: 'contributor' | 'reviewer' | 'admin' | 'system';
  revision: number;
  at: string;
  feedback?: string;
  checks?: string[];
  note?: string;
}

export interface RevisionSnapshot {
  revision: number;
  formVersion: number;
  answers: Answers;
  consents: ConsentRecord[];
  submittedAt: string;
}

export interface ResponseDetail extends ResponseSummary {
  definition: FormDefinition;
  versionState: VersionState;
  consents: ConsentRecord[];
  attachments: Array<AttachmentRef & { fieldId: string; inspection: 'passed' | 'rejected' | 'pending' }>;
  /** Latest reviewer feedback shown to the contributor. */
  feedback: string | null;
  revisions: RevisionSnapshot[];
  history: HistoryEvent[];
  reward: { points: number; status: 'none' | 'awarded' | 'failed' | 'not_applicable'; note: string | null };
  routing: { destination: string; status: 'not_applicable' | 'pending' | 'routed' | 'blocked' | 'failed'; targetCollection: string | null; targetId: string | null; note: string | null };
  /** For reviewers: decisions allowed now, given status and caller. */
  allowedDecisions: ReviewDecision[];
  /** Status/revision the reviewer is looking at; send back as expectations. */
  expectedStatus: ResponseStatus;
  expectedRevision: number;
}

/* -- formsAdmin ------------------------------------------------------------------- */

export type FormsAdminRequest =
  | { action: 'overview' }
  | { action: 'get'; formId: string }
  | { action: 'getVersion'; formId: string; version: number }
  | { action: 'create'; templateId?: string | null; title?: string }
  | { action: 'duplicate'; formId: string }
  /** Start a draft version from the latest published version (no-op if one exists). */
  | { action: 'startDraft'; formId: string }
  /**
   * `version` + `expectedRevision` are the draft the administrator is looking at; both must
   * still match. Revisions only ever increase for a form and version numbers are never reused,
   * so the pair names one saved state of one draft.
   */
  | { action: 'saveDraft'; formId: string; definition: FormDefinition; version: number; expectedRevision: number }
  /** Succeeds only when this call (or an earlier attempt of it) discarded that draft; otherwise `no-draft`. */
  | { action: 'discardDraft'; formId: string; version: number; expectedRevision: number }
  | { action: 'publishPreview'; formId: string }
  /** A paused or closed form stays paused or closed; only a draft or published form becomes published. */
  | { action: 'publish'; formId: string; version: number; expectedRevision: number }
  /** pause, resume (published), close, reopen (published), archive, restore (closed or draft). */
  | { action: 'setStatus'; formId: string; status: FormStatus; reason?: string }
  | { action: 'retireVersion'; formId: string; version: number }
  | { action: 'listResponses'; filter: ResponseFilter; cursor?: string | null; limit?: number }
  | { action: 'getResponse'; responseId: string }
  | { action: 'export'; formId: string; format: 'csv' | 'json'; scope: 'submitted' | 'approved'; filter?: Omit<ResponseFilter, 'formId' | 'status'> }
  | { action: 'attachmentLink'; responseId: string; attachmentId: string }
  | { action: 'activity'; formId?: string | null; limit?: number }
  | { action: 'listCohorts' }
  | { action: 'getCohort'; cohortId: string }
  /**
   * members: contributor emails or uids; unknown entries are reported, not guessed.
   * Editing an existing cohort sends the `updatedAt` its members were loaded at; a cohort
   * changed since then is refused as HttpsError('aborted', …, { reason: 'conflict', updatedAt, updatedByName }).
   */
  | { action: 'saveCohort'; cohortId?: string | null; name: string; description: string; members: string[]; expectedUpdatedAt?: string | null }
  | { action: 'access' }
  | { action: 'saveAccess'; publishers: string[]; exporters: string[] }
  | { action: 'saveRewardSettings'; enabled: boolean; maxPointsPerResponse: number; dailyCap: number };

export interface ResponseFilter {
  formId?: string | null;
  version?: number | null;
  status?: ResponseStatus | 'all_submitted' | null;
  languageId?: string | null;
  contributorId?: string | null;
  /** submittedAt range, inclusive, YYYY-MM-DD. */
  from?: string | null;
  to?: string | null;
}

export interface FormsAdminResponses {
  overview: { forms: FormSummary[]; access: FormsAccess; cohorts: Cohort[]; recent: ActivityEntry[] };
  get: {
    form: FormSummary;
    versions: VersionMeta[];
    /**
     * Editable draft, or null when there is none. `definition` is the draft exactly as the
     * administrator saved it (rules or settings that do not pass validation included), and
     * `issues` are every problem that blocks publishing it.
     */
    draft: { version: number; revision: number; definition: FormDefinition; issues: Issue[]; updatedAt: string; updatedByName: string } | null;
    current: { version: number; definition: FormDefinition; publishedAt: string } | null;
  };
  getVersion: { version: number; state: VersionState; definition: FormDefinition; publishedAt: string | null };
  create: { formId: string };
  duplicate: { formId: string };
  startDraft: { version: number; revision: number };
  /** `conflict` is thrown as HttpsError('aborted', …, { reason: 'conflict', version, revision, updatedByName, updatedAt }). */
  saveDraft: { revision: number; issues: Issue[]; updatedAt: string };
  discardDraft: { discarded: true };
  publishPreview: { summary: PublishSummary; issues: Issue[]; version: number; revision: number };
  /** Validation failures are thrown as HttpsError('failed-precondition', …, { reason: 'invalid', issues }). */
  publish: { version: number; status: FormStatus };
  setStatus: { status: FormStatus };
  retireVersion: { version: number; state: 'retired' };
  listResponses: { rows: ResponseSummary[]; nextCursor: string | null; scanned: number };
  getResponse: ResponseDetail;
  export: { filename: string; contentType: string; content: string; count: number };
  attachmentLink: { url: string; expiresAt: string };
  activity: { entries: ActivityEntry[] };
  listCohorts: { cohorts: Cohort[] };
  getCohort: { cohort: Cohort };
  saveCohort: { cohort: Cohort; unknown: string[] };
  access: FormsAccess;
  saveAccess: FormsAccess;
  saveRewardSettings: FormsAccess;
}

/* -- formsContributor ----------------------------------------------------------- */

export interface AvailableForm {
  id: string;
  title: string;
  description: string;
  category: string;
  estimatedMinutes: number | null;
  closesAt: string | null;
  opensAt: string | null;
  version: number;
  open: boolean;
  closedReason: WindowReason | null;
  policy: 'once' | 'multiple';
  /** The contributor's own state for this form. */
  mine: {
    draftId: string | null;
    draftVersion: number | null;
    submitted: number;
    latestStatus: ResponseStatus | null;
    latestResponseId: string | null;
    needsChanges: number;
  };
}

export interface MyResponse {
  id: string;
  referenceId: string | null;
  formId: string;
  formTitle: string;
  formVersion: number;
  status: ResponseStatus;
  revision: number;
  updatedAt: string;
  submittedAt: string | null;
  feedback: string | null;
  canEdit: boolean;
}

export interface OpenedForm {
  form: { id: string; title: string; status: FormStatus; currentVersion: number };
  /** The version this response is attached to (a draft keeps its original version). */
  version: number;
  versionState: VersionState;
  definition: FormDefinition;
  window: { open: boolean; reason: WindowReason | null; message: string };
  /** The contributor's editable response for this form, if any. */
  response: {
    id: string;
    status: ResponseStatus;
    revision: number;
    draftRevision: number;
    answers: Answers;
    referenceId: string | null;
    feedback: string | null;
    updatedAt: string;
  } | null;
  /** Set when the draft sits on an older version than the current one. */
  newerVersion: number | null;
  /** Whether the contributor may start another response (policy 'once' and already submitted → false). */
  canStartNew: boolean;
}

export type FormsContributorRequest =
  | { action: 'list' }
  | { action: 'open'; formId: string; responseId?: string | null; startNew?: boolean }
  | { action: 'saveDraft'; formId: string; responseId?: string | null; version: number; answers: Answers; expectedDraftRevision?: number | null; requestId: string }
  | { action: 'beginUpload'; responseId: string; fieldId: string; name: string; contentType: string; size: number }
  | { action: 'confirmUpload'; uploadId: string }
  | { action: 'removeUpload'; uploadId: string }
  | { action: 'submit'; responseId: string; answers: Answers; expectedDraftRevision: number; requestId: string }
  | { action: 'mine'; cursor?: string | null }
  | { action: 'getMine'; responseId: string }
  | { action: 'moveToLatest'; responseId: string }
  | { action: 'discardDraft'; responseId: string }
  | { action: 'attachmentLink'; responseId: string; attachmentId: string };

export interface FormsContributorResponses {
  list: { forms: AvailableForm[]; attention: number };
  open: OpenedForm;
  saveDraft: { responseId: string; draftRevision: number; savedAt: string; issues: Issue[] };
  /** uploadUrl is a resumable Google Cloud Storage session (PUT in chunks with Content-Range). */
  beginUpload: { uploadId: string; uploadUrl: string; maxBytes: number };
  /** Rejected files are thrown as HttpsError('invalid-argument', message, { reason: 'rejected-file' }). */
  confirmUpload: { attachment: AttachmentRef };
  removeUpload: { removed: true };
  submit: { responseId: string; referenceId: string; status: ResponseStatus; revision: number; successMessage: string; nextSteps: string; replayed: boolean };
  mine: { responses: MyResponse[]; nextCursor: string | null };
  getMine: ResponseDetail;
  moveToLatest: { version: number; dropped: string[] };
  discardDraft: { discarded: true };
  attachmentLink: { url: string; expiresAt: string };
}

/* -- formsReview ------------------------------------------------------------------ */

export type FormsReviewRequest =
  | { action: 'queue'; status?: ResponseStatus | 'open' | null; formId?: string | null; cursor?: string | null }
  | { action: 'get'; responseId: string }
  | {
    action: 'decide';
    responseId: string;
    decision: ReviewDecision;
    feedback?: string;
    /** Ids of the form's reviewer checks the reviewer confirmed. */
    checks?: string[];
    expectedStatus: ResponseStatus;
    expectedRevision: number;
    requestId: string;
  }
  | { action: 'attachmentLink'; responseId: string; attachmentId: string }
  /** Administrators only: file an approved response again after routing failed or did not finish. */
  | { action: 'retryRouting'; responseId: string };

export interface FormsReviewResponses {
  queue: { rows: ResponseSummary[]; forms: Array<{ id: string; title: string }>; nextCursor: string | null };
  get: ResponseDetail;
  /** Stale expectations are thrown as HttpsError('aborted', …, { reason: 'stale' }). */
  decide: { status: ResponseStatus; replayed: boolean; reward: ResponseDetail['reward']; routing: ResponseDetail['routing'] };
  attachmentLink: { url: string; expiresAt: string };
  retryRouting: { routing: ResponseDetail['routing'] };
}
