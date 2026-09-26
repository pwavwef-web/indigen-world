import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase';

export type ContributorRole = 'translator' | 'storyteller' | 'researcher' | 'reviewer';
export type ContributionType = 'expressions' | 'articles' | 'stories' | 'research' | 'audio';
export type ContributorStatus = 'active' | 'inactive';
export type ContributorAccountStatus = 'none' | 'active' | 'suspended' | 'deactivated';
export type InvitationStatus = 'not_invited' | 'pending' | 'accepted' | 'cancelled';

export interface ContributorPermissions {
  submit: boolean;
  edit: boolean;
  review: boolean;
  publish: boolean;
}

export interface ContributorWork {
  id: string;
  title: string;
  instructions: string;
  deadline: string;
  createdAt: string;
  itemCount: number;
  submittedCount: number;
  verifiedCount: number;
  revisionCount: number;
}

export interface ContributorDirectoryRow {
  id: string;
  authUid: string | null;
  displayName: string;
  photoUrl: string;
  biography: string;
  expertise: string[];
  location: string;
  website: string;
  socialLinks: string;
  email: string;
  phone: string;
  notes: string;
  roles: ContributorRole[];
  contributionTypes: ContributionType[];
  permissions: ContributorPermissions;
  status: ContributorStatus;
  publicVisibility: 'public' | 'hidden';
  accountStatus: ContributorAccountStatus;
  invitation: {
    status: InvitationStatus;
    sentAt: string;
    resentAt: string;
    resendCount: number;
    sms?: { status: 'accepted' | 'failed' | 'pending'; to: string } | null;
  };
  createdAt: string;
  lastActiveAt: string;
  works: ContributorWork[];
}

export interface ContributorProfileInput {
  contributorId?: string;
  public: {
    displayName: string;
    photoUrl: string;
    biography: string;
    expertise: string[];
    location: string;
    website: string;
    socialLinks: string;
  };
  private: { email: string; phone: string; notes: string };
  roles: ContributorRole[];
  contributionTypes: ContributionType[];
  permissions: ContributorPermissions;
  publicVisibility: 'public' | 'hidden';
}

interface AssignmentInput {
  requestId?: string;
  phoneNumber?: string;
  contributorId?: string;
  displayName?: string;
  email?: string;
  title: string;
  deadline: string;
  instructions: string;
  expressions: string[];
}

export interface AssignmentResult {
  contributorId: string;
  work: string;
  portalUrl: string;
  activationUrl?: string;
  loginMethod?: 'phone' | 'existing';
  sms?: { status: 'accepted' | 'failed' | 'pending'; to: string };
}

export interface ContributorSubmission {
  id: string;
  contributorId: string;
  title: string;
  body: string;
  alternatives: string[];
  status: string;
  publicationPermission: boolean;
  aiTraining: boolean;
  createdAt: string;
  reviewedAt: string;
  feedback: string;
  usageContext: string;
}


export type VerificationStatus = 'pending' | 'verified' | 'needs_action' | 'rejected';
export type CheckState = 'off' | 'not_run' | 'consistent' | 'mismatch' | 'uncertain' | 'unreadable' | 'unavailable';
export type FieldOutcome = 'match' | 'partial' | 'mismatch' | 'not_found';

export interface AutomatedCheck {
  state: CheckState;
  fields: { accountName: FieldOutcome; accountNumber: FieldOutcome; bankName: FieldOutcome } | null;
  /** What the model read — finance reviewers only. */
  evidence: { documentKind: string; accountHolderName: string; bankName: string; accountNumberLast4: string } | null;
  model: string | null;
  ranAt: string | null;
  unavailableReason: string | null;
}

export interface PayoutBank {
  bankName: string;
  accountName: string;
  accountNumber: string;
  branch: string;
  currency: 'GHS';
  status: VerificationStatus;
  statusReason: string;
  nextStep: string;
  statement: { contentType: string; sizeBytes: number; uploadedAt: string; sha256: string } | null;
  automatedCheck: AutomatedCheck;
  version: number;
  submittedAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
  legacy: boolean;
}

export interface PayoutMomo {
  network: 'mtn' | 'telecel' | 'at';
  networkLabel: string;
  walletNumber: string;
  registeredName: string;
  phoneVerifiedAt: string;
  ownershipStatus: VerificationStatus;
  statusReason: string;
  nextStep: string;
  version: number;
  submittedAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
}

export interface PayoutHistoryEvent {
  at: string;
  method: 'bank' | 'momo';
  action: string;
  status: string;
  note: string;
  actor: 'contributor' | 'finance' | 'system';
  actorId?: string;
}

export interface ContributorPayoutProfile {
  id: string;
  contributorId: string;
  preferredMethod: 'bank' | 'momo' | null;
  bank: PayoutBank | null;
  momo: PayoutMomo | null;
  history: PayoutHistoryEvent[];
  createdAt: string;
  updatedAt: string;
}

export interface ContributorPaymentRequest {
  id: string;
  contributorId: string;
  amountMinor: number;
  currency: 'GHS';
  description: string;
  status: 'submitted' | 'approved' | 'rejected' | 'paid';
  payoutMethod?: 'bank' | 'momo';
  payoutSnapshot?: Record<string, string>;
  bankSnapshot?: { bankName: string; accountName: string; accountNumber: string; branch: string } | null;
  createdAt: string;
  adminNote?: string;
  paymentReference?: string;
  paidAt?: string | null;
}

export interface ContributorPayments {
  statementCheck: 'enabled' | 'off';
  profiles: ContributorPayoutProfile[];
  requests: ContributorPaymentRequest[];
}

export type ContributorRewardSettings = { pointsPerExpression: number; dailyCap: number; redemptionMinimum: number; cedisPerRedemption: number };
export type ContributorRedemption = Omit<ContributorPaymentRequest, 'status'> & {
  status: 'submitted' | 'approved' | 'rejected' | 'fulfilled' | 'paid';
  points: number; kind: 'airtime' | 'data'; network: string; phoneNumber: string;
};
export type ContributorRewards = { rewards: ContributorRewardSettings; requests: ContributorRedemption[] };
export const loadContributorRewards = httpsCallable<Record<string, never>, ContributorRewards>(functions, 'listContributorRewards');
export const saveContributorRewardSettings = httpsCallable<ContributorRewardSettings, ContributorRewardSettings>(functions, 'setContributorRewardSettings');
export const decideContributorRedemption = httpsCallable<{ requestId: string; action: 'approve' | 'reject' | 'fulfill'; note: string; paymentReference?: string }, unknown>(functions, 'decideContributorRedemption');

export interface ContributorAuditEntry {
  id: string;
  action: string;
  occurredAt: string;
  outcome: string;
  targetId: string;
  metadata: Record<string, unknown>;
}

const listDirectory = httpsCallable<Record<string, never>, { contributors: ContributorDirectoryRow[] }>(
  functions,
  'listExpressionContributors',
);
const saveProfile = httpsCallable<ContributorProfileInput, { contributorId: string }>(
  functions,
  'saveContributorProfile',
);
const inviteContributor = httpsCallable<AssignmentInput, AssignmentResult>(functions, 'inviteExpressionContributor');
const assignExpressions = httpsCallable<AssignmentInput & { contributorId: string }, AssignmentResult>(
  functions,
  'assignContributorExpressions',
);
const updateAccess = httpsCallable<{
  contributorId: string;
  profileStatus: ContributorStatus;
  accountStatus?: Exclude<ContributorAccountStatus, 'none'>;
  publicVisibility: 'public' | 'hidden';
  reason: string;
}, unknown>(functions, 'setContributorAccess');
const resendInvitation = httpsCallable<{ contributorId: string }, Pick<AssignmentResult, 'activationUrl' | 'portalUrl' | 'loginMethod' | 'sms'>>(
  functions,
  'resendContributorInvitation',
);
const cancelInvitation = httpsCallable<{ contributorId: string; reason: string }, unknown>(
  functions,
  'cancelContributorInvitation',
);
const listPayments = httpsCallable<Record<string, never>, ContributorPayments>(functions, 'listContributorPayments');
const statementLink = httpsCallable<{ contributorId: string }, { url: string; expiresAt: string; contentType: string }>(functions, 'getPayoutStatementLink');
const decideVerification = httpsCallable<{ contributorId: string; method: 'bank' | 'momo'; decision: 'verify' | 'needs_action' | 'reject'; reason: string; nextStep: string; version: number }, { status: VerificationStatus }>(functions, 'decidePayoutVerification');
const rerunCheck = httpsCallable<{ contributorId: string }, { state: CheckState }>(functions, 'rerunPayoutStatementCheck');
const decidePayment = httpsCallable<{ requestId: string; action: 'approve' | 'reject' | 'paid'; note: string; paymentReference?: string }, unknown>(functions, 'decideContributorPaymentRequest');


export async function fetchContributorDirectory(): Promise<ContributorDirectoryRow[]> {
  const result = await listDirectory({});
  return result.data.contributors;
}

export async function saveContributor(input: ContributorProfileInput): Promise<string> {
  const result = await saveProfile(input);
  return result.data.contributorId;
}

export async function inviteContributorWithExpressions(input: AssignmentInput): Promise<AssignmentResult> {
  const result = await inviteContributor(input);
  return result.data;
}

export async function assignContributorWork(
  input: AssignmentInput & { contributorId: string },
): Promise<AssignmentResult> {
  const result = await assignExpressions(input);
  return result.data;
}

export async function setContributorAccess(input: {
  contributorId: string;
  profileStatus: ContributorStatus;
  accountStatus?: Exclude<ContributorAccountStatus, 'none'>;
  publicVisibility: 'public' | 'hidden';
  reason: string;
}): Promise<void> {
  await updateAccess(input);
}

export async function resendContributorInvite(contributorId: string): Promise<Pick<AssignmentResult, 'activationUrl' | 'portalUrl' | 'loginMethod' | 'sms'>> {
  const result = await resendInvitation({ contributorId });
  return result.data;
}

export async function cancelContributorInvite(contributorId: string, reason: string): Promise<void> {
  await cancelInvitation({ contributorId, reason });
}


export async function fetchContributorPayments(): Promise<ContributorPayments> {
  const result = await listPayments({});
  return result.data;
}

/** A five-minute link to the statement; the backend records every opening. */
export async function openPayoutStatement(contributorId: string): Promise<{ url: string; expiresAt: string; contentType: string }> {
  return (await statementLink({ contributorId })).data;
}

export async function decidePayoutVerification(input: {
  contributorId: string;
  method: 'bank' | 'momo';
  decision: 'verify' | 'needs_action' | 'reject';
  reason: string;
  nextStep: string;
  version: number;
}): Promise<VerificationStatus> {
  return (await decideVerification(input)).data.status;
}

export async function rerunPayoutStatementCheck(contributorId: string): Promise<CheckState> {
  return (await rerunCheck({ contributorId })).data.state;
}

export async function decideContributorPayment(requestId: string, action: 'approve' | 'reject' | 'paid', note: string, paymentReference = ''): Promise<void> {
  await decidePayment({ requestId, action, note, paymentReference });
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** All invited-expression submissions, including settled records for contribution history. */
export async function fetchContributorSubmissions(): Promise<ContributorSubmission[]> {
  const snapshot = await getDocs(query(collection(db, 'submissions'), orderBy('lifecycle.createdAt', 'desc'), limit(400)));
  return snapshot.docs.flatMap((entry) => {
    const value = entry.data() as Record<string, unknown>;
    const portal = value.contributorPortal as Record<string, unknown> | undefined;
    if (!portal || typeof portal.contributorId !== 'string') return [];
    const permissions = (value.permissions ?? {}) as Record<string, unknown>;
    const lifecycle = (value.lifecycle ?? {}) as Record<string, unknown>;
    const moderation = (value.moderation ?? {}) as Record<string, unknown>;
    return [{
      id: entry.id,
      contributorId: portal.contributorId,
      title: text(value.title),
      body: text(value.body),
      alternatives: Array.isArray(value.alternativeExpressions) ? value.alternativeExpressions.map(String) : [],
      status: text(value.status),
      publicationPermission: permissions.publication === true,
      aiTraining: permissions.aiTraining === true,
      createdAt: text(lifecycle.createdAt),
      reviewedAt: text(moderation.decidedAt),
      feedback: text(moderation.feedback),
      usageContext: text(value.usageContext),
    }];
  });
}

export async function fetchContributorAuditEntries(): Promise<ContributorAuditEntry[]> {
  const snapshot = await getDocs(query(collection(db, 'auditLogs'), orderBy('occurredAt', 'desc'), limit(150)));
  return snapshot.docs.flatMap((entry) => {
    const value = entry.data() as Record<string, unknown>;
    const target = value.target as Record<string, unknown> | undefined;
    const action = text(value.action);
    if (target?.collection !== 'contributors' && !action.startsWith('contributor.')) return [];
    return [{
      id: entry.id,
      action,
      occurredAt: text(value.occurredAt),
      outcome: text(value.outcome),
      targetId: text(target?.id),
      metadata: value.metadata && typeof value.metadata === 'object'
        ? value.metadata as Record<string, unknown>
        : {},
    }];
  });
}
