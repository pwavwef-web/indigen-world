export type Desk = 'contributions' | 'sentences' | 'adverts' | 'names';
export type ReviewRecord = Record<string, any> & { id: string; status: string };
export const DESKS: Record<Desk, { label: string; collection: string; queues: [string, string][] }> = {
  contributions: { label: 'Contributions', collection: 'submissions', queues: [['SUBMITTED', 'Waiting'], ['RESUBMITTED', 'Resubmitted'], ['APPROVED', 'Approved'], ['UNDER_REVIEW', 'Escalated'], ['PUBLISHED', 'Published'], ['NEEDS_REVISION', 'Needs revision'], ['REJECTED', 'Rejected']] },
  sentences: { label: 'Sentences', collection: 'grammarNotes', queues: [['submitted', 'Waiting'], ['confirmed', 'Confirmed'], ['disputed', 'Disagreements'], ['reviewed', 'Reviewed variants'], ['needs-permission', 'Needs permission'], ['withdrawn', 'Withdrawn'], ['rejected', 'Rejected']] },
  adverts: { label: 'Adverts', collection: 'adCampaigns', queues: [['IN_REVIEW', 'Waiting'], ['ACTIVE', 'Running'], ['PAUSED', 'Paused'], ['REJECTED', 'Rejected']] },
  names: { label: 'Names', collection: 'kasemNameRequests', queues: [['pending', 'Waiting'], ['approved', 'Added'], ['rejected', 'Rejected']] },
};
export const DECISION_LABELS: Record<string, string> = { APPROVE: 'Approve', REQUEST_REVISION: 'Ask for changes', REJECT: 'Reject', PUBLISH: 'Publish', ESCALATE_CULTURAL: 'Escalate', PAUSE: 'Pause', RESUME: 'Resume', approve: 'Add the name', reject: 'Reject' };
export function decisionsFor(desk: Desk, item: ReviewRecord): string[] {
  if (desk === 'names') return item.status === 'pending' ? ['approve', 'reject'] : [];
  if (desk === 'adverts') return ({ IN_REVIEW: ['APPROVE', 'REJECT'], ACTIVE: ['PAUSE', 'REJECT'], PAUSED: ['RESUME', 'REJECT'] } as Record<string, string[]>)[item.status] ?? [];
  if (desk === 'sentences') return [];
  if (['APPROVED', 'SCHEDULED'].includes(item.status)) return [...(item.permissions?.publication === true ? ['PUBLISH'] : []), 'REJECT'];
  if (!['SUBMITTED', 'RESUBMITTED', 'UNDER_REVIEW', 'NEEDS_REVISION'].includes(item.status)) return [];
  return ['APPROVE', ...(!item.collectionKind || item.wordQueueId ? ['REQUEST_REVISION'] : []), 'REJECT', 'ESCALATE_CULTURAL'];
}
export const TARGETS = { headword: 'Dictionary word', variant: 'Regional variant', expression: 'Expression', example: 'Example sentence', 'translation-pair': 'Translation pair', training: 'Training material (private)' };
export function targetProblem(target: string, item: ReviewRecord): string | null {
  if (target === 'training' && item.permissions?.aiTraining !== true) return 'Training permission was not granted.';
  if (target === 'example' && !item.kasemExample) return 'This answer has no Kasem example.';
  if (target === 'translation-pair' && (!item.kasemExample || !(item.englishExample || item.wordQueuePrompt?.sentence))) return 'An English sentence and its Kasem are required.';
  return null;
}
export function decisionRequest(desk: Desk, item: ReviewRecord, decision: string, feedback: string, target: string, entryId: string) {
  if (!decisionsFor(desk, item).includes(decision)) throw new Error('This action is unavailable for the current status.');
  if (['REJECT', 'REQUEST_REVISION', 'reject'].includes(decision) && feedback.trim().length < 5) throw new Error('Explain the reason in at least 5 characters.');
  const expected = { expectedStatus: item.status, ...(item.lifecycle?.version != null ? { expectedVersion: item.lifecycle.version } : {}), ...(item.updatedAt?.toMillis ? { expectedUpdatedAtMillis: item.updatedAt.toMillis() } : {}) };
  if (desk === 'names') return { callable: 'decideKasemNameRequest', data: { ...expected, requestId: item.id, decision, note: feedback.trim() } };
  if (desk === 'adverts') return { callable: 'decideAdCampaign', data: { ...expected, campaignId: item.id, decision, feedback: feedback.trim() } };
  const dictionary = item.collectionKind?.toLowerCase() === 'dictionary';
  if (dictionary && ['APPROVE', 'PUBLISH'].includes(decision)) {
    const problem = targetProblem(target, item);
    if (problem) throw new Error(problem);
    if (['variant', 'example'].includes(target) && !entryId.trim()) throw new Error('Choose the existing dictionary entry this refers to.');
  }
  return { callable: 'decideSubmission', data: { ...expected, submissionId: item.id, decision, feedback: feedback.trim(), ...(dictionary && ['APPROVE', 'PUBLISH'].includes(decision) ? { publishAs: target, entryId: entryId.trim() } : {}) } };
}
export const DIMENSIONS: Record<string, Record<string, string>> = {
  meaning: { 'cannot-judge': 'Cannot judge', faithful: 'Faithful', partial: 'Part missing', different: 'Different meaning' },
  grammar: { 'cannot-judge': 'Cannot judge', acceptable: 'Acceptable', unacceptable: 'Unacceptable', 'context-dependent': 'Depends on context' },
  naturalness: { 'cannot-judge': 'Cannot judge', natural: 'Natural', awkward: 'Awkward', unnatural: 'Unnatural' },
  contextFit: { 'cannot-judge': 'Cannot judge', fits: 'Fits', 'does-not-fit': 'Does not fit', 'context-missing': 'Need more context' },
};
export function safeUrl(value: unknown): string | null {
  try { const url = new URL(String(value)); return ['https:', 'http:'].includes(url.protocol) ? url.href : null; } catch { return null; }
}
