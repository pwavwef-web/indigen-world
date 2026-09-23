import type { Item, PaymentNotice, SubmissionRound, Work } from './model';

/**
 * The shapes the contributor workspace reads and the services it calls.
 *
 * The live workspace fills these from Firestore listeners and callables
 * (data.ts); the local preview fills them from sample data
 * (ContributorPreview.tsx). Pages only ever see this interface, so the two
 * cannot drift into rendering different things.
 */

export type LoadState = 'loading' | 'ready' | 'error';
export type VerificationStatus = 'not_started' | 'pending' | 'verified' | 'needs_action' | 'rejected';
export type CheckState = 'off' | 'not_run' | 'consistent' | 'mismatch' | 'uncertain' | 'unreadable' | 'unavailable';
export type FieldOutcome = 'match' | 'partial' | 'mismatch' | 'not_found';
export type MomoNetwork = 'mtn' | 'telecel' | 'at';
export type PayoutMethod = 'bank' | 'momo';
export type ActivityVisibility = 'name' | 'anonymous' | 'hidden';

export const MOMO_NETWORKS: Record<MomoNetwork, string> = {
  mtn: 'MTN MoMo',
  telecel: 'Telecel Cash',
  at: 'AT Money (AirtelTigo)',
};

export interface BankView {
  bankName: string;
  accountName: string;
  accountNumberMasked: string;
  branch: string;
  currency: string;
  status: VerificationStatus;
  statusReason: string;
  nextStep: string;
  statement: { contentType: string; sizeBytes: number; uploadedAt: string } | null;
  automatedCheck: {
    state: CheckState;
    fields: { accountName: FieldOutcome; accountNumber: FieldOutcome; bankName: FieldOutcome } | null;
    ranAt: string | null;
  };
  submittedAt: string;
  decidedAt: string | null;
  legacy: boolean;
}

export interface MomoView {
  network: MomoNetwork;
  networkLabel: string;
  walletNumberMasked: string;
  registeredName: string;
  phoneVerifiedAt: string;
  ownershipStatus: VerificationStatus;
  statusReason: string;
  nextStep: string;
  submittedAt: string;
  decidedAt: string | null;
}

export interface MomoChallengeView {
  network: MomoNetwork;
  walletNumberMasked: string;
  registeredName: string;
  expiresAt: string;
  resendAvailableAt: string;
  attemptsLeft: number;
}

export interface PaymentHistoryEvent {
  at: string;
  method: PayoutMethod;
  action: string;
  status: string;
  note: string;
  actor: 'contributor' | 'finance' | 'system';
}

export interface PaymentsView {
  preferredMethod: PayoutMethod | null;
  payoutReady: boolean;
  bank: BankView | null;
  momo: MomoView | null;
  momoChallenge: MomoChallengeView | null;
  history: PaymentHistoryEvent[];
  statementCheck: 'enabled' | 'off';
}

export interface MomoStart {
  delivery: 'accepted';
  walletNumberMasked: string;
  expiresAt: string;
  resendAvailableAt: string;
  attemptsLeft: number;
}

export interface Settings {
  activityVisibility: ActivityVisibility;
  notifications: { reviewEmail: boolean; paymentEmail: boolean; paymentSms: boolean };
  updatedAt: string;
}

export interface SelfView {
  contributorId: string;
  profile: {
    displayName: string;
    photoUrl: string;
    location: string;
    biography: string;
    dialect: string;
    otherLanguages: string;
    expertise: string[];
    roles: string[];
    contributionTypes: string[];
    publicVisibility: 'public' | 'hidden';
  };
  contact: { email: string; phoneMasked: string };
  account: {
    status: string;
    activatedAt: string;
    invitedAt: string;
    createdAt: string;
    lastSignInAt: string;
    signInMethods: string[];
  };
  permissions: { edit: boolean; submit: boolean };
  settings: Settings;
}

export interface ProfileInput {
  displayName: string;
  location: string;
  biography: string;
  dialect: string;
  otherLanguages: string;
  photoUrl: string;
}

export type AssistMode = 'explain_assignment' | 'context_needed' | 'check_draft';

export interface AssistCheck {
  id: string;
  severity: 'ask' | 'warn' | 'note';
  title: string;
  detail: string;
  guideSection: string;
}

export interface AssistResult {
  mode: AssistMode;
  expression: string;
  configured: boolean;
  unavailableReason: string | null;
  summary: string;
  suggestions: { id: string; kind: string; text: string; guideSection: string | null }[];
  questions: string[];
  removed: number;
  checks: AssistCheck[];
  sources: {
    assignment: { title: string; instructions: string; dialect: string; tone: string; deadline: string; helpContact: string };
    dictionary: { id: string; kasem: string; english: string; partOfSpeech: string; dialect: string }[];
    guide: { id: string; title: string }[];
  };
  generatedAt: string;
}

export interface AssistInput {
  mode: AssistMode;
  work: string;
  item?: string;
  draft?: { translation: string; alternatives: string[]; context: string };
}

export interface PulseEntry {
  id: string;
  day: string;
  label: string | null;
  submitted: number;
  approved: number;
  updatedAt: string;
}

export interface PulseState {
  state: 'loading' | 'live' | 'cached' | 'unavailable';
  totals: { submitted: number; approved: number; contributors: number } | null;
  entries: PulseEntry[];
  /** Why the pulse is unavailable, when it is. */
  reason: string;
}

export interface AccountSummary {
  status: string;
  requiresPasswordChange: boolean;
  defaultWork: string;
  activatedAt: string;
  phoneMasked: string;
}

export type SaveAnswer = (data: Record<string, unknown>) => Promise<{ data: { revision: number; submissionId?: string } }>;

export interface WorkspaceServices {
  saveAnswer: SaveAnswer;
  loadPayments(): Promise<PaymentsView>;
  uploadStatement(file: File, onProgress?: (fraction: number) => void): Promise<{ uploadId: string; fileName: string }>;
  submitBank(input: { bankName: string; accountName: string; accountNumber: string; branch: string; statement: { uploadId: string; fileName: string } }): Promise<PaymentsView>;
  removeMethod(method: PayoutMethod): Promise<PaymentsView>;
  setPreferred(method: PayoutMethod): Promise<PaymentsView>;
  startMomo(input: { network: MomoNetwork; walletNumber: string; registeredName: string }): Promise<MomoStart>;
  confirmMomo(code: string): Promise<PaymentsView>;
  loadSelf(): Promise<SelfView>;
  updateSelf(input: ProfileInput): Promise<SelfView>;
  uploadPhoto(file: File): Promise<string>;
  saveSettings(input: Omit<Settings, 'updatedAt'>): Promise<Settings>;
  assist(input: AssistInput): Promise<AssistResult>;
  changePassword(current: string, next: string): Promise<void>;
  sendPasswordReset(): Promise<void>;
  signOut(): Promise<void>;
}

export type Section = 'overview' | 'assignments' | 'contributions' | 'activity' | 'guide' | 'kawuri' | 'account';
export type AccountTab = 'profile' | 'security' | 'notifications' | 'payments';

export interface PortalPaths {
  base: string;
  section(section: Section, query?: Record<string, string>): string;
  account(tab: AccountTab): string;
  work(workId: string, itemId?: string): string;
}

export interface WorkspaceData {
  uid: string;
  email: string;
  displayName: string;
  account: AccountSummary;
  works: Work[];
  worksState: LoadState;
  items: Record<string, Item[]>;
  itemsState: LoadState;
  rounds: SubmissionRound[];
  roundsState: LoadState;
  paymentNotices: PaymentNotice[];
  pulse: PulseState;
  services: WorkspaceServices;
  paths: PortalPaths;
  preview: boolean;
}
