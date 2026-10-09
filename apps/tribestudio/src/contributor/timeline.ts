import type { Item, SubmissionRound } from './model';
export function contributionTimeline(item: Item, rounds: readonly SubmissionRound[]) {
  return rounds.filter(round => round.item === item.id).flatMap(round => [
    ...(round.createdAt ? [{ id: round.id + ':submitted', label: 'Submitted for review', at: round.createdAt, feedback: '', revisionOf: round.revisionOf }] : []),
    ...(round.decidedAt ? [{ id: round.id + ':decision', label: ({ APPROVED: 'Approved', PUBLISHED: 'Published', NEEDS_REVISION: 'Correction requested', REJECTED: 'Rejected', UNDER_REVIEW: 'Escalated for review' } as Record<string, string>)[round.status] ?? round.status, at: round.decidedAt, feedback: round.feedback, revisionOf: round.revisionOf }] : []),
  ]).sort((a, b) => a.at.localeCompare(b.at));
}
