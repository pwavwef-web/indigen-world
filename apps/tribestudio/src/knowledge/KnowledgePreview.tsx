import { KnowledgeDesk } from './KnowledgeWorkspace';
import { AppShell } from '../ui';
import { type CatalogEntry, type KnowledgeRecord, type KnowledgeServices } from './data';
import catalog from '@indigen-world/contracts/knowledge-catalog.json';
import { submissionIssues } from '@indigen-world/contracts/knowledge';

const now = () => new Date().toISOString();
const records: KnowledgeRecord[] = [];
const receipts = new Map<string, KnowledgeRecord>();
const uid = 'local-preview';
const service: KnowledgeServices = {
  list: async () => ({ records: structuredClone(records), catalog: catalog.categories as CatalogEntry[], canReview: false, nextCursor: null, policy: { version: 'unapproved', approved: false, sentenceEnabled: false, releaseEnabled: false }, refreshedAt: now() }),
  get: async id => { const record = records.find(r => r.id === id); if (!record) throw new Error('Record not found.'); return { record: structuredClone(record), reviews: [], history: [{ revision: record.revision, createdAt: record.updatedAt, status: record.status }] }; },
  save: async request => {
    if (receipts.has(request.requestId)) return { record: structuredClone(receipts.get(request.requestId)!) };
    if (request.submit) { const issues = submissionIssues(request.record); if (issues.length) throw new Error(issues[0].message); }
    const old = records.find(r => r.id === request.id);
    if (old && old.revision !== request.revision) throw new Error('This record changed. Reopen the latest revision.');
    const record: KnowledgeRecord = { ...structuredClone(request.record), id: old?.id ?? `KSM-${request.record.datasetType}-${crypto.randomUUID().replaceAll('-', '')}`, schemaVersion: 2, revision: (old?.revision ?? 0) + 1, authorUid: uid,
      createdAt: old?.createdAt ?? now(), updatedAt: now(), status: request.submit ? 'submitted' : 'draft', workflow: request.submit ? 'submitted' : 'draft', authentication: 'community', warnings: [], reviewCount: 0, approvalCount: 0, ...(request.submit || old?.submittedAt ? { submittedAt: old?.submittedAt ?? now() } : {}) };
    if (old) records.splice(records.indexOf(old), 1, record); else records.unshift(record);
    receipts.set(request.requestId, structuredClone(record)); return { record };
  },
  withdraw: async id => { const r = records.find(r => r.id === id)!; r.status = 'withdrawn'; r.workflow = 'withdrawn'; return { record: structuredClone(r) }; },
  progress: async () => ({ counts: Object.fromEntries(['draft', 'submitted', 'in_review', 'changes_requested', 'review_complete', 'withdrawn'].map(state => [state, records.filter(r => r.workflow === state).length])), submitted: records.filter(r => r.submittedAt).length, period: 'Synthetic preview only', timezone: 'UTC', refreshedAt: now(), definition: 'One submitted object counts once. All examples stay in this browser session.' }),
  reference: async () => ({ records: [], nextCursor: null }),
  review: async () => { throw new Error('The preview has no approved reviewer policy.'); },
  release: async () => { throw new Error('The preview does not release records.'); },
  revoke: async () => { throw new Error('The preview has no released records.'); },
  upload: async () => { throw new Error('Connect a test backend to verify media uploads. Preview files are never uploaded.'); },
  audio: async () => { throw new Error('No recordings in this preview.'); },
};
export function KnowledgePreview() {
  return (
    <AppShell
      workspace="contribute"
      nav={[
        { to: '/contributor/preview/corpus', label: 'Corpus records', icon: 'database', group: 'Your work', active: true, dock: true },
        { to: '/contributor/preview', label: 'Contributor preview', icon: 'home', group: 'Your work', dock: true },
      ]}
      account={{ name: 'Preview contributor', role: 'Local preview' }}
      onSignOut={() => undefined}
    >
      <KnowledgeDesk uid={uid} services={service} preview />
    </AppShell>
  );
}
