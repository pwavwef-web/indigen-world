import type { Item, SubmissionRound } from './model';
import { contributionTextKey } from '@indigen-world/contracts/contributor-details';

export interface Journey {
  weeklyGoal: number; sessionSize: number; celebrations: boolean; practiceCompleted: boolean;
  participationDays: string[]; communityGoal: { target: number; day: string } | null;
}
export const DEFAULT_JOURNEY: Journey = { weeklyGoal: 3, sessionSize: 3, celebrations: true, practiceCompleted: false, participationDays: [], communityGoal: null };

export function weekDays(now = new Date()) {
  const start = new Date(now); start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - (start.getUTCDay() + 6) % 7);
  return Array.from({ length: 7 }, (_, index) => new Date(start.getTime() + index * 86400000).toISOString().slice(0, 10));
}

export function participationDays(journey: Journey, rounds: SubmissionRound[], now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  const submitted = rounds.filter(round => round.createdAt).map(round => round.createdAt.slice(0, 10));
  return [...new Set([...journey.participationDays, ...submitted])].filter(day => /^\d{4}-\d{2}-\d{2}$/.test(day) && day <= today);
}

export function achievements(items: Item[], rounds: SubmissionRound[]) {
  const approved = items.filter(item => item.status === 'verified' && item.submissionId);
  const contextual = approved.filter(item => item.context?.trim() || item.details?.situation?.trim()).length;
  const revisions = approved.filter(item => item.revisionOf || rounds.some(round => round.id === item.submissionId && round.revisionOf)).length;
  return [
    { id: 'first', title: 'First contribution', icon: 'spark' as const, count: approved.length, target: 1, criterion: 'One expression accepted by a reviewer' },
    { id: 'context', title: 'Context builder', icon: 'message' as const, count: contextual, target: 5, criterion: 'Five accepted expressions with usage context' },
    { id: 'reviser', title: 'Careful reviser', icon: 'refresh' as const, count: revisions, target: 3, criterion: 'Three revised expressions accepted by a reviewer' },
    { id: 'consistent', title: 'Steady contributor', icon: 'award' as const, count: approved.length, target: 25, criterion: 'Twenty-five expressions accepted by reviewers' },
  ];
}

export function duplicateHints(translation: string, items: Item[], currentId: string) {
  const key = contributionTextKey(translation);
  if (!key) return [];
  return items.filter(item => item.id !== currentId && contributionTextKey(item.translation) === key).slice(0, 3);
}

export function reviewGrowth(rounds: SubmissionRound[], now = new Date()) {
  const decided = rounds.filter(round => ['APPROVED', 'PUBLISHED', 'REJECTED', 'NEEDS_REVISION'].includes(round.status) && round.decidedAt);
  const split = now.getTime() - 14 * 86400000;
  const start = now.getTime() - 28 * 86400000;
  const cohort = (from: number, to: number) => {
    const rows = decided.filter(round => Date.parse(round.decidedAt) >= from && Date.parse(round.decidedAt) < to);
    return { total: rows.length, accepted: rows.filter(round => ['APPROVED', 'PUBLISHED'].includes(round.status)).length };
  };
  const themes = [
    { label: 'Usage and context', pattern: /context|who|when|situation|usage/i },
    { label: 'Spelling and characters', pattern: /spell|letter|character|orthograph/i },
    { label: 'Meaning and tone', pattern: /meaning|natural|tone|formal|instruction/i },
  ].map(theme => ({ label: theme.label, count: decided.filter(round => round.feedback && theme.pattern.test(round.feedback)).length })).filter(theme => theme.count);
  return { recent: cohort(split, now.getTime() + 1), previous: cohort(start, split), themes };
}
