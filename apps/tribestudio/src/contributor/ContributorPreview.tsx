import { useState } from 'react';
import { ContributionWorkspace, type Item } from './ContributorPortal';
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
  const [items, setItems] = useState<Item[]>(sampleItems);
  const [offline, setOffline] = useState(false);
  const [pending, setPending] = useState(false);
  return <div className="contributor-portal">
    <header><div><span className="contributor-kicker">INDIGEN WORLD / CONTRIBUTORS</span><h1>Your contributions</h1><p>Everyday conversations</p></div>
      <details><summary>Account details</summary><p>contributor@example.com</p><p className="contributor-identity">Contributor ID: <code>preview-contributor</code></p><button disabled={pending} onClick={() => window.location.assign('/contributor')}>Exit preview</button></details></header>
    <main id="main-content" tabIndex={-1}>
      <section className="contributor-preview-controls"><p>Design preview · Sample translations are placeholders. Nothing is sent. Saved samples reset on refresh; unsaved recovery copies stay on this device.</p>
        <label className="contributor-check"><input type="checkbox" checked={offline} onChange={e => setOffline(e.target.checked)} />Simulate connection failure</label>
        <small>To try recovery, enable this option, edit an expression, then refresh. Reopen that expression and choose Restore draft.</small></section>
      <ContributionWorkspace accountId="preview-contributor" items={items} work="sample" onPending={setPending} saveAnswer={async data => {
        await new Promise(resolve => window.setTimeout(resolve, 350));
        if (offline) throw new Error('Preview connection is offline. Turn off “Simulate connection failure” and retry.');
        const revision = Number(data.revision) + 1;
        const submissionId = data.submit ? 'preview-' + data.item + '-' + revision : undefined;
        setItems(current => current.map(item => item.id === data.item ? {
          ...item, translation: String(data.translation), alternatives: data.alternatives as string[], revision,
          ...(submissionId ? { submissionId, status: 'submitted', feedback: '', reviewedAt: null } : {}),
        } : item));
        return { data: { revision, submissionId } };
      }} />
    </main>
  </div>;
}
