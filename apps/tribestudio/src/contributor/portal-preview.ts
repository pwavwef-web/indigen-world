/** Development-only UI fixtures, never selected by a production build. */
import { blankContribution, type PortalRecord } from './portal-data';
import { PORTAL_LIMITS } from '@indigen-world/contracts/portal-contributions';
const records: PortalRecord[] = [];
export function seedMaterialPreview() {
  if (records.some(r => r.id === 'PC-preview-source-material')) return;
  records.push({ ...blankContribution('documents'), id: 'PC-preview-source-material', owner: 'preview-contributor', version: 1, title: 'Synthetic Kasem field notes', language: 'Kasem (xsm)', provenance: 'original', content: { text: 'Working field notes and examples from everyday conversations. Synthetic review fixture.', source: 'Sample author · synthetic fixture', category: 'Field notes' }, uses: { review: true, training: false, retrieval: false, public: false }, rights: { ownership: 'own', speakers: false, sensitive: false, confidential: false, cultural: false }, files: [{ path: 'preview-only', name: 'synthetic-field-notes.txt', mime: 'text/plain' }], status: 'submitted', createdAt: '2026-10-23T12:00:00Z', updatedAt: '2026-10-23T12:00:00Z', processing: { state: 'extracted_unverified', attempts: 1, scan: 'Local preview · simulated extraction, no real upload or scanner.', files: [{ path: 'preview-only', name: 'synthetic-field-notes.txt', mime: 'text/plain', state: 'extracted_unverified', text: 'Synthetic source text for reviewer inspection.\nTone marks stay intact: vèi sɔ́ŋɔ̀.' }] } });
}
export async function previewPortal(action: string, data: Record<string, any>, _review = false): Promise<any> {
  await new Promise(resolve => setTimeout(resolve, 80));
  if (action === 'capabilities') return { ...PORTAL_LIMITS, uploadsEnabled: true };
  if (action === 'summary') return { counts: Object.fromEntries(['draft', 'submitted', 'changes_requested', 'approved', 'rejected', 'disputed', 'withdrawn'].map(s => [s, records.filter(r => r.status === s).length])), failed: 0, unread: 0 };
  if (action === 'list') return { records: records.filter(r => (!data.type || r.type === data.type) && (!data.status || r.status === data.status) && (!data.query || r.title.includes(data.query))), nextCursor: null };
  if (action === 'save') {
    const old = records.find(r => r.id === data.id);
    const record = { ...blankContribution(data.record.type), ...data.record, id: data.id ?? `PC-preview-${crypto.randomUUID()}`, owner: 'preview-contributor', version: (old?.version ?? 0) + 1, status: data.submit ? 'submitted' : 'draft', updatedAt: new Date().toISOString(), createdAt: old?.createdAt ?? new Date().toISOString(), processing: { state: 'not_required', attempts: 0, files: [] } };
    if (old) records.splice(records.indexOf(old), 1);
    records.push(record); return { record };
  }
  const record = records.find(r => r.id === data.id);
  if (action === 'get' && record) return { record, history: [{ action: record.status, version: record.version, at: record.updatedAt }] };
  if (action === 'withdraw' && record) { record.status = 'withdrawn'; return { record }; }
  if (action === 'ack') return {};
  throw new Error('This action needs a signed-in live account. Preview files remain on this device; they are not uploaded.');
}
