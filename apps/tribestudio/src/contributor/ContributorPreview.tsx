import { useState } from 'react';
import { submittedCount, AssignmentSelector, ContributionWorkspace, ContributorActivityNotice, ContributorHeader, ContributorTabs, ContributorRewards, ContributorStreak, type Item, type PayoutProfile, type PaymentRequest, type ContributorPaymentService } from './ContributorPortal';
import './contributor.css';

const expressions = [
  'Good morning. How is your family?', 'Thank you for welcoming me into your home.',
  'Let us meet at the market tomorrow.', 'Could you say that again, please?',
  'We learn from those who came before us.', 'Please come and sit with us.',
  'I will see you tomorrow.', 'May your journey be peaceful.',
];
const sampleItems: Item[] = expressions.map((expression, index) => ({
  id: String(index), expression, translation: [0, 7].includes(index) ? '' : '[Sample Kasem translation — replace with your wording]',
  alternatives: index === 3 ? ['[Sample alternative expression]'] : [], revision: index ? 1 : 0,
  status: index === 5 ? 'rejected' : index === 2 ? 'verified' : [1, 6].includes(index) ? 'submitted' : 'draft',
  ...([1, 2, 5, 6].includes(index) ? { submissionId: 'preview-' + index } : {}),
  ...(index === 5 ? { feedback: 'Please use the everyday invitation to sit together. The current wording sounds like an instruction. Keep the welcoming tone.', reviewedAt: '2026-09-16' } : {}),
}));
export function ContributorPreview() {
  const [activeWork, setActiveWork] = useState('sample');
  const [activeTab, setActiveTab] = useState<'expressions' | 'rewards' | 'streak'>('expressions');
  const [rewardsInitialView, setRewardsInitialView] = useState<'redeem' | 'history'>('redeem');
  const works = [
    { id: 'sample', title: 'Everyday conversations', createdAt: '2026-09-23', instructions: 'Translate each expression naturally into Kasem. Add alternative expressions when useful.', dialect: 'Your local Kasem dialect', tone: 'Warm and conversational', deadline: '2026-10-15', helpContact: 'Contact your assignment coordinator for help.' },
    { id: 'greetings', title: 'Greetings and hospitality', createdAt: '2026-09-23', instructions: 'Use welcoming expressions that sound natural in everyday conversation.', tone: 'Friendly and respectful' },
  ];
  const [paymentService] = useState<ContributorPaymentService>(() => {
    let profile: PayoutProfile = { bankName: 'Example Bank (sample)', accountName: 'Sample Contributor', accountNumber: '0000000000', branch: 'Sample branch', currency: 'GHS', verificationStatus: 'verified', updatedAt: '2026-09-23' };
    let requests: PaymentRequest[] = [{ id: 'sample-redeemed', amountMinor: 500, currency: 'GHS', description: '300 points for data', points: 300, status: 'fulfilled', kind: 'data', network: 'MTN', phoneNumber: '+233241234567', createdAt: '2026-09-16', paymentReference: 'DEMO-001' }];
    let balance = 900;
    const today = new Date().toISOString().slice(0, 10);
    return {
      load: async () => ({ data: { profile, requests, rewards: { balance, lifetime: 900, pointsPerExpression: 10, dailyCap: 300, redemptionMinimum: 300, cedisPerRedemption: 5 }, streak: { current: 3, best: 5, lastDay: today, activeToday: true } } }),
      save: async details => { profile = { ...profile, ...details, verificationStatus: 'pending', updatedAt: new Date().toISOString() }; },
      redeem: async choice => { balance -= choice.points; requests = [{ id: 'sample-request', amountMinor: Math.round(choice.points / 300 * 500), currency: 'GHS', description: `${choice.points} points for ${choice.kind}`, points: choice.points, status: 'submitted', kind: choice.kind, network: choice.network, phoneNumber: choice.phoneNumber, createdAt: new Date().toISOString() }, ...requests]; },
    };
  });
  const [assignmentItems, setAssignmentItems] = useState<Record<string, Item[]>>({ sample: sampleItems, greetings: sampleItems.slice(0, 2) });
  const items = assignmentItems[activeWork];
  const [offline, setOffline] = useState(false);
  const [pending, setPending] = useState(false);
  return <div className="contributor-portal">
    <ContributorHeader title={works.find(work => work.id === activeWork)?.title} completed={submittedCount(items)} total={items.length}
      paymentsEnabled paymentService={paymentService} accountId="preview-contributor" pending={pending} onSignOut={() => window.location.assign('/contributor')} />
    <main id="main-content" tabIndex={-1}>
      <section className="contributor-preview-controls"><p>Complete workspace preview · Bank details, payments, assignments, and translations are fictional. Use sample details only. Nothing is sent. Saved samples reset on refresh; unsaved recovery copies stay on this device.</p>
        <label className="contributor-check"><input type="checkbox" checked={offline} onChange={e => setOffline(e.target.checked)} />Simulate connection failure</label>
        <small>To try recovery, enable this option, edit an expression, then refresh. Reopen that expression and choose Restore draft.</small></section>
      <ContributorActivityNotice items={items} accountId="preview-contributor" service={paymentService} onOpenTasks={() => setActiveTab('expressions')} onOpenHistory={() => { setRewardsInitialView('history'); setActiveTab('rewards'); }} />
      <ContributorTabs active={activeTab} onChange={setActiveTab} pending={pending} completed={submittedCount(items)} total={items.length} paymentService={paymentService} />
      {activeTab === 'rewards' ? <div role="tabpanel" id="contributor-panel-rewards" aria-labelledby="contributor-tab-rewards"><ContributorRewards initialView={rewardsInitialView} service={paymentService} onOpenTasks={() => setActiveTab('expressions')} /></div> : activeTab === 'streak' ? <div role="tabpanel" id="contributor-panel-streak" aria-labelledby="contributor-tab-streak"><ContributorStreak service={paymentService} onOpenTasks={() => setActiveTab('expressions')} /></div> : <div role="tabpanel" id="contributor-panel-expressions" aria-labelledby="contributor-tab-expressions"><AssignmentSelector works={works} active={activeWork} itemCount={items.length} completed={submittedCount(items)} pending={pending} onChange={setActiveWork} />
      <ContributionWorkspace guidance={works.find(work => work.id === activeWork)} key={activeWork} accountId="preview-contributor" items={items} work={activeWork} onPending={setPending} saveAnswer={async data => {
        await new Promise(resolve => window.setTimeout(resolve, 350));
        if (offline) throw new Error('Preview connection is offline. Turn off “Simulate connection failure” and retry.');
        const revision = Number(data.revision) + 1;
        const submissionId = data.submit ? 'preview-' + data.item + '-' + revision : undefined;
        setAssignmentItems(current => ({ ...current, [String(data.work)]: current[String(data.work)].map(item => item.id === data.item ? {
          ...item, unsure: data.skip === true, translation: String(data.translation), alternatives: data.alternatives as string[], revision,
          ...(submissionId ? { submissionId, status: 'submitted', feedback: '', reviewedAt: null } : {}),
        } : item) }));
        return { data: { revision, submissionId } };
      }} /></div>}
    </main>
  </div>;
}
