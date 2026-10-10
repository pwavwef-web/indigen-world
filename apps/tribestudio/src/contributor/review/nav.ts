import type { NavItem } from '../../ui';
import { DESKS, type Desk } from './model';

const DESK_ICONS: Record<Desk, NavItem['icon']> = {
  contributions: 'contributions',
  rewards: 'award',
  sentences: 'translation',
  adverts: 'image',
  names: 'users',
};

/** Dock labels: a phone shows five short words, not four desk names and a section. */
const DESK_SHORT: Partial<Record<Desk, string>> = { contributions: 'Content' };

const DESK_HINTS: Record<Desk, string> = {
  contributions: 'Creator posts, dictionary words and expressions',
  rewards: 'Training-data quality and contributor points',
  sentences: 'Example sentences and their variants',
  adverts: 'Advert campaigns before and while they run',
  names: 'Kasem name requests',
};

/** The validator portal's destinations: the four review desks, then the record tools. */
export function reviewNav({ path, desk }: { path: string; desk?: Desk }): NavItem[] {
  const onDesk = path === '/contributor/review';
  return [
    ...(Object.keys(DESKS) as Desk[]).map((key, index) => ({
      to: `/contributor/review?desk=${key}`,
      label: DESKS[key].label,
      short: DESK_SHORT[key],
      icon: DESK_ICONS[key],
      group: 'Review desks',
      hint: DESK_HINTS[key],
      dock: index < 3,
      active: onDesk && (desk ?? 'contributions') === key,
    })),
    { to: '/contributor/corpus', label: 'Corpus records', icon: 'database', group: 'Records', hint: 'Sourced records awaiting qualified review', active: path === '/contributor/corpus' },
    { to: '/workspace', label: 'Lexicon review', short: 'Lexicon', icon: 'branch', group: 'Records', hint: 'Lexical entries and their decisions', dock: true, active: path === '/workspace' },
  ];
}
