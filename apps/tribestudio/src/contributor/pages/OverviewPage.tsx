import { workState, type Item, type Work } from '../model';
import { CollectionHome } from './CollectionHome';

export function currentAssignment(works: Work[], items: Record<string, Item[]>): Work | null {
  const open = works.filter((work) => ['needs_attention', 'in_progress', 'not_started'].includes(workState(items[work.id] ?? [])));
  const ranked = [...open].sort((a, b) => {
    const attention = Number(workState(items[b.id] ?? []) === 'needs_attention') - Number(workState(items[a.id] ?? []) === 'needs_attention');
    if (attention) return attention;
    const dueA = a.deadline ? new Date(a.deadline).getTime() : Number.POSITIVE_INFINITY;
    const dueB = b.deadline ? new Date(b.deadline).getTime() : Number.POSITIVE_INFINITY;
    if (dueA !== dueB) return (Number.isNaN(dueA) ? Infinity : dueA) - (Number.isNaN(dueB) ? Infinity : dueB);
    return String(b.createdAt).localeCompare(String(a.createdAt));
  });
  return ranked[0] ?? works[0] ?? null;
}

export function OverviewPage() { return <CollectionHome />; }
