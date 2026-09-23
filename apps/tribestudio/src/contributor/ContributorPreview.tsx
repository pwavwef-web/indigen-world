import { useMemo, useRef, useState } from 'react';
import { WorkspaceContext, WorkspaceShell } from './workspace';
import { STATEMENT_TYPES, statementProblem } from './data';
import type { Item, SubmissionRound, Work } from './model';
import type { AssistResult, PaymentsView, PortalPaths, SelfView, Settings, WorkspaceData, WorkspaceServices } from './types';
import { MOMO_NETWORKS } from './types';
import './contributor.css';

/**
 * Local preview of the contributor workspace — development builds only
 * (App.tsx loads it behind `import.meta.env.DEV`), at /contributor/preview.
 *
 * It renders the real shell and pages from sample data held in memory, so the
 * whole workspace can be seen and exercised without a contributor account.
 * Nothing is sent anywhere: saves, uploads, codes and Kawuri answers are
 * simulated in this tab and reset on reload. Kasem text is shown as a
 * bracketed placeholder rather than invented.
 */

const PLACEHOLDER = '[Sample Kasem translation]';
const iso = (hoursAgo: number) => new Date(Date.now() - hoursAgo * 3_600_000).toISOString();
const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

function sample(id: string, expression: string, state: 'new' | 'draft' | 'unsure' | 'awaiting' | 'approved' | 'returned', hoursAgo = 30): Item {
  const base: Item = { id, expression, translation: '', alternatives: [], revision: 0, status: 'draft', updatedAt: iso(hoursAgo) };
  switch (state) {
    case 'draft': return { ...base, translation: PLACEHOLDER, revision: 2 };
    case 'unsure': return { ...base, unsure: true, revision: 1, skippedAt: iso(hoursAgo) };
    case 'awaiting': return { ...base, translation: PLACEHOLDER, context: 'Said to an elder when arriving at their home.', revision: 3, status: 'submitted', submissionId: `sub-${id}` };
    case 'approved': return { ...base, translation: PLACEHOLDER, alternatives: ['[Sample alternative]'], revision: 3, status: 'verified', submissionId: `sub-${id}`, reviewedAt: iso(hoursAgo - 6) };
    case 'returned': return { ...base, translation: PLACEHOLDER, revision: 3, status: 'rejected', submissionId: `sub-${id}`, reviewedAt: iso(hoursAgo - 4), feedback: 'This reads as an instruction. Please use the everyday, welcoming way of inviting someone to sit with you, and add who you would say it to.' };
    default: return base;
  }
}

const WORKS: Work[] = [
  { id: 'everyday', title: 'Everyday conversations', createdAt: iso(24 * 6), deadline: inDays(9), dialect: 'Navrongo', tone: 'Warm and conversational', helpContact: 'Your assignment coordinator (sample contact)', instructions: 'Translate each expression the way you would say it to family or neighbours. Add alternatives when more than one expression is common, and say in the usage note who it is said to.' },
  { id: 'greetings', title: 'Greetings and hospitality', createdAt: iso(24 * 14), deadline: inDays(-2), tone: 'Respectful', instructions: 'Greetings used when visiting someone’s home.' },
  { id: 'market', title: 'At the market', createdAt: iso(24 * 30), instructions: 'Short phrases for buying and selling.' },
];

const ITEMS: Record<string, Item[]> = {
  everyday: [
    sample('e1', 'Good morning. How is your family?', 'approved', 70),
    sample('e2', 'Thank you for welcoming me into your home.', 'awaiting', 26),
    sample('e3', 'Please come and sit with us.', 'returned', 20),
    sample('e4', 'Let us meet at the market tomorrow.', 'draft', 3),
    sample('e5', 'Could you say that again, please?', 'unsure', 5),
    sample('e6', 'We learn from those who came before us.', 'new'),
    sample('e7', 'I will see you tomorrow.', 'new'),
    sample('e8', 'May your journey be peaceful.', 'new'),
  ],
  greetings: [
    sample('g1', 'You are welcome here.', 'approved', 200),
    sample('g2', 'Did you sleep well?', 'approved', 190),
    sample('g3', 'Greet your family for me.', 'awaiting', 50),
  ],
  market: [
    sample('m1', 'How much is this?', 'approved', 500),
    sample('m2', 'Please reduce the price a little.', 'approved', 480),
  ],
};

const ROUNDS: SubmissionRound[] = Object.entries(ITEMS).flatMap(([work, items]) => items.filter((item) => item.submissionId).flatMap((item) => {
  const sent = { id: `${item.submissionId}`, work, item: item.id, expression: item.expression, revisionOf: '', feedback: '', createdAt: item.updatedAt ?? iso(40), decidedAt: '', status: 'SUBMITTED' };
  if (item.status === 'verified') return [{ ...sent, status: 'APPROVED', decidedAt: item.reviewedAt ?? '' }];
  if (item.status === 'rejected') return [{ ...sent, status: 'REJECTED', decidedAt: item.reviewedAt ?? '', feedback: item.feedback ?? '' }];
  return [sent];
}));

const SELF: SelfView = {
  contributorId: 'preview-contributor',
  profile: { displayName: 'Sample Contributor', photoUrl: '', location: 'Navrongo', biography: '', dialect: 'Navrongo', otherLanguages: 'English', expertise: ['language'], roles: ['translator'], contributionTypes: ['expressions'], publicVisibility: 'hidden' },
  contact: { email: 'contributor@example.com', phoneMasked: '•••• 4567' },
  account: { status: 'active', activatedAt: iso(24 * 20), invitedAt: iso(24 * 21), createdAt: iso(24 * 21), lastSignInAt: iso(1), signInMethods: ['password'] },
  permissions: { edit: true, submit: true },
  settings: { activityVisibility: 'anonymous', notifications: { reviewEmail: true, paymentEmail: true, paymentSms: false }, updatedAt: '' },
};

function initialPayments(): PaymentsView {
  return {
    preferredMethod: 'bank',
    payoutReady: false,
    bank: {
      bankName: 'Ecobank Ghana', accountName: 'Sample Contributor', accountNumberMasked: '•••• 3456', branch: 'Navrongo', currency: 'GHS',
      status: 'needs_action', statusReason: 'The statement shows a different branch and the account number is cut off at the edge of the photo.',
      nextStep: 'Upload a statement or bank letter where the full account number is visible.',
      statement: { contentType: 'image/jpeg', sizeBytes: 812_000, uploadedAt: iso(30) },
      automatedCheck: { state: 'uncertain', fields: { accountName: 'match', bankName: 'match', accountNumber: 'not_found' }, ranAt: iso(30) },
      submittedAt: iso(30), decidedAt: iso(8), legacy: false,
    },
    momo: null,
    momoChallenge: null,
    history: [
      { at: iso(8), method: 'bank', action: 'bank.needs_action', status: 'needs_action', note: 'The statement shows a different branch and the account number is cut off at the edge of the photo.', actor: 'finance' },
      { at: iso(30), method: 'bank', action: 'bank.automated_check', status: 'pending', note: 'Automated statement check: uncertain. A finance reviewer still decides.', actor: 'system' },
      { at: iso(30), method: 'bank', action: 'bank.submitted', status: 'pending', note: 'Submitted for review with a statement.', actor: 'contributor' },
    ],
    statementCheck: 'enabled',
  };
}

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

function previewPaths(): PortalPaths {
  const base = '/contributor/preview';
  const withQuery = (path: string, params?: Record<string, string>) => {
    const search = params ? new URLSearchParams(Object.entries(params).filter(([, value]) => value)).toString() : '';
    return search ? `${path}?${search}` : path;
  };
  return {
    base,
    section: (section, params) => withQuery(section === 'overview' ? base : `${base}/${section}`, params),
    account: (tab) => `${base}/account/${tab}`,
    work: (workId, itemId) => withQuery(`${base}/assignment/${workId}`, itemId ? { item: itemId } : undefined),
  };
}

export function ContributorPreview() {
  const [items, setItems] = useState<Record<string, Item[]>>(ITEMS);
  const payments = useRef<PaymentsView>(initialPayments());
  const self = useRef<SelfView>(SELF);
  const pendingCode = useRef('');

  const services = useMemo<WorkspaceServices>(() => ({
    async saveAnswer(data) {
      await wait(300);
      const revision = Number(data.revision) + 1;
      const submissionId = data.submit ? `preview-${String(data.item)}-${revision}` : undefined;
      setItems((current) => ({
        ...current,
        [String(data.work)]: current[String(data.work)].map((item) => item.id === data.item ? {
          ...item, unsure: data.skip === true, translation: String(data.translation), alternatives: data.alternatives as string[],
          context: typeof data.context === 'string' ? data.context : item.context, revision, updatedAt: new Date().toISOString(),
          ...(submissionId ? { submissionId, status: 'submitted', feedback: '', reviewedAt: null } : {}),
        } : item),
      }));
      return { data: { revision, submissionId } };
    },
    async loadPayments() { await wait(250); return payments.current; },
    async uploadStatement(file, onProgress) {
      const problem = statementProblem(file);
      if (problem) throw Object.assign(new Error(problem), { code: 'invalid-file' });
      for (const step of [0.25, 0.6, 1]) { await wait(180); onProgress?.(step); }
      return { uploadId: 'preview-upload', fileName: `statement.${STATEMENT_TYPES[file.type]}` };
    },
    async submitBank(input) {
      await wait(600);
      payments.current = {
        ...payments.current,
        bank: {
          bankName: input.bankName, accountName: input.accountName, accountNumberMasked: `•••• ${input.accountNumber.slice(-4)}`, branch: input.branch, currency: 'GHS',
          status: 'pending', statusReason: '', nextStep: '', statement: { contentType: 'application/pdf', sizeBytes: 240_000, uploadedAt: new Date().toISOString() },
          automatedCheck: { state: 'consistent', fields: { accountName: 'match', bankName: 'match', accountNumber: 'match' }, ranAt: new Date().toISOString() },
          submittedAt: new Date().toISOString(), decidedAt: null, legacy: false,
        },
        history: [{ at: new Date().toISOString(), method: 'bank', action: 'bank.submitted', status: 'pending', note: 'Submitted for review with a statement.', actor: 'contributor' }, ...payments.current.history],
      };
      return payments.current;
    },
    async removeMethod(method) {
      await wait(300);
      payments.current = { ...payments.current, [method]: null, preferredMethod: method === 'bank' ? (payments.current.momo ? 'momo' : null) : (payments.current.bank ? 'bank' : null) };
      return payments.current;
    },
    async setPreferred(method) { await wait(200); payments.current = { ...payments.current, preferredMethod: method }; return payments.current; },
    async startMomo(input) {
      await wait(400);
      pendingCode.current = '123456';
      const masked = `•••• ${input.walletNumber.replace(/\D/g, '').slice(-4)}`;
      payments.current = { ...payments.current, momoChallenge: { network: input.network, walletNumberMasked: masked, registeredName: input.registeredName, expiresAt: new Date(Date.now() + 600_000).toISOString(), resendAvailableAt: new Date(Date.now() + 60_000).toISOString(), attemptsLeft: 5 } };
      (payments.current as PaymentsView & { pendingWallet?: typeof input }).pendingWallet = input;
      return { delivery: 'accepted', walletNumberMasked: masked, expiresAt: payments.current.momoChallenge!.expiresAt, resendAvailableAt: payments.current.momoChallenge!.resendAvailableAt, attemptsLeft: 5 };
    },
    async confirmMomo(code) {
      await wait(400);
      if (code !== pendingCode.current) throw Object.assign(new Error('That code is not right. 4 tries left. (Preview: the code is 123456.)'), { code: 'functions/invalid-argument' });
      const wallet = (payments.current as PaymentsView & { pendingWallet?: { network: 'mtn' | 'telecel' | 'at'; walletNumber: string; registeredName: string } }).pendingWallet;
      payments.current = {
        ...payments.current,
        momoChallenge: null,
        momo: {
          network: wallet?.network ?? 'mtn', networkLabel: MOMO_NETWORKS[wallet?.network ?? 'mtn'], walletNumberMasked: payments.current.momoChallenge?.walletNumberMasked ?? '•••• 0000',
          registeredName: wallet?.registeredName ?? 'Sample Contributor', phoneVerifiedAt: new Date().toISOString(), ownershipStatus: 'pending', statusReason: '', nextStep: '',
          submittedAt: new Date().toISOString(), decidedAt: null,
        },
        history: [{ at: new Date().toISOString(), method: 'momo', action: 'momo.phone_verified', status: 'pending', note: 'Phone number control confirmed by one-time code. Wallet ownership and registered name wait for a finance reviewer.', actor: 'contributor' }, ...payments.current.history],
      };
      return payments.current;
    },
    async loadSelf() { await wait(200); return self.current; },
    async updateSelf(input) { await wait(400); self.current = { ...self.current, profile: { ...self.current.profile, ...input } }; return self.current; },
    async uploadPhoto() { throw Object.assign(new Error('Photo upload is not simulated in the preview.'), { code: 'preview' }); },
    async saveSettings(input) { await wait(300); const settings: Settings = { ...input, updatedAt: new Date().toISOString() }; self.current = { ...self.current, settings }; return settings; },
    async assist(input): Promise<AssistResult> {
      await wait(700);
      const work = WORKS.find((entry) => entry.id === input.work)!;
      const item = (ITEMS[input.work] ?? []).find((entry) => entry.id === input.item);
      return {
        mode: input.mode, expression: item?.expression ?? '', configured: true, unavailableReason: null, removed: 0,
        summary: 'Preview response — not produced by Kawuri. In the live workspace this summary comes from Gemini on Vertex AI.',
        suggestions: [
          { id: 's1', kind: 'context', text: 'Say who you would say this to — an elder, a friend or a child — so the reviewer can check the level of respect.', guideSection: 'alternatives-context' },
          { id: 's2', kind: 'meaning', text: 'The English can be a real question or a polite greeting. Note which one you translated.', guideSection: 'good-contribution' },
        ],
        questions: ['Is this said on arrival, or when someone is leaving?'],
        checks: input.mode === 'check_draft' ? [
          { id: 'no-context', severity: 'note', title: 'No usage note', detail: 'A short note on who says this, to whom and when helps a reviewer approve the meaning you intended.', guideSection: 'alternatives-context' },
        ] : [],
        sources: {
          assignment: { title: work.title, instructions: work.instructions ?? '', dialect: work.dialect ?? '', tone: work.tone ?? '', deadline: work.deadline ?? '', helpContact: work.helpContact ?? '' },
          dictionary: [],
          guide: [{ id: 'alternatives-context', title: 'Alternative expressions and context' }, { id: 'good-contribution', title: 'What makes a good Kasem contribution' }],
        },
        generatedAt: new Date().toISOString(),
      };
    },
    async changePassword() { await wait(400); },
    async sendPasswordReset() { await wait(300); },
    async signOut() { window.location.assign('/contributor'); },
  }), []);

  const value = useMemo<WorkspaceData>(() => ({
    uid: 'preview-contributor',
    email: 'contributor@example.com',
    displayName: 'Sample Contributor',
    account: { status: 'active', requiresPasswordChange: false, defaultWork: 'everyday', activatedAt: iso(24 * 20), phoneMasked: '•••• 4567' },
    works: WORKS,
    worksState: 'ready',
    items,
    itemsState: 'ready',
    rounds: ROUNDS,
    roundsState: 'ready',
    paymentNotices: [{ id: 'n1', title: 'Your bank account needs attention', body: 'The account number is cut off at the edge of the photo.', createdAt: iso(8) }],
    pulse: {
      state: 'live',
      reason: '',
      totals: { submitted: 14, approved: 5, contributors: 4 },
      entries: [
        { id: 'p1', day: new Date().toISOString().slice(0, 10), label: null, submitted: 6, approved: 0, updatedAt: iso(0.1) },
        { id: 'p2', day: new Date().toISOString().slice(0, 10), label: 'Sample name', submitted: 5, approved: 3, updatedAt: iso(0.9) },
        { id: 'p3', day: new Date().toISOString().slice(0, 10), label: null, submitted: 3, approved: 2, updatedAt: iso(2.5) },
      ],
    },
    services,
    paths: previewPaths(),
    preview: true,
  }), [items, services]);

  return (
    <WorkspaceContext.Provider value={value}>
      <WorkspaceShell banner={(
        <div className="cw-preview-banner" role="note">
          <strong>Local preview · sample data</strong>
          <span>Nothing is saved or sent. Kasem text is a placeholder. The MoMo code is 123456. Community activity is sample data.</span>
        </div>
      )} />
    </WorkspaceContext.Provider>
  );
}
