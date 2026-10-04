import { Suspense, type ReactNode } from 'react';
import { canContribute, canMakeVideo, canValidate, signOutUser, useAuth } from '../auth';
import { useRoute } from '../router';
import { RouteLoader } from '../LoadingScreen';
import { AppShell, type NavItem } from '../ui';
import { reviewNav } from '../contributor/review/nav';
import { CreatorNotificationsProvider, useCreatorNotifications } from './notifications';
import './creator.css';

/** The most specific destination that contains the current path. */
export function activeDestination(items: NavItem[], path: string): NavItem | undefined {
  return [...items]
    .sort((a, b) => b.to.length - a.to.length)
    .find((item) => {
      const target = item.to.split('?')[0];
      return target === '/studio' ? path === target : path === target || path.startsWith(`${target}/`);
    });
}

function creatorNav(role: ReturnType<typeof useAuth>['role']): NavItem[] {
  return [
    { to: '/studio', label: 'Overview', icon: 'overview', group: 'Your work', dock: true },
    { to: '/studio/submissions', label: 'Content library', short: 'Library', icon: 'library', group: 'Your work', dock: true, hint: 'Drafts, submissions and published posts' },
    { to: '/studio/editor', label: 'Video projects', short: 'Videos', icon: 'film', group: 'Your work', dock: true, hint: 'Edit footage, captions and exports' },
    { to: '/studio/published', label: 'Published', icon: 'globe', group: 'Your work', hint: 'Live posts and their public links' },
    { to: '/studio/expressions', label: 'Expressions', icon: 'quote', group: 'Language', dock: true, hint: 'Share a phrase with its meaning and context' },
    { to: '/studio/dictionary', label: 'Dictionary words', icon: 'book', group: 'Language', hint: 'Propose a word for the Kasem dictionary' },
    { to: '/contributor/corpus', label: 'Corpus records', icon: 'database', group: 'Language', hint: 'Sourced language and cultural records' },
    { to: '/studio/opportunities', label: 'Opportunities', icon: 'opportunities', group: 'Language', hint: 'Campaigns open for submissions' },
    ...(canMakeVideo(role) ? [
      { to: '/studio/video', label: 'Generate a video', icon: 'sparkles' as const, group: 'Tools', hint: 'AI video for approved creators' },
      { to: '/studio/video/jobs', label: 'Generation history', icon: 'hourglass' as const, group: 'Tools' },
    ] : []),
    ...(canContribute(role) ? [{ to: '/workspace', label: 'Lexicon tools', icon: 'branch' as const, group: 'Tools', hint: 'Lexical entries and their review' }] : []),
    { to: '/studio/profile', label: 'Creator profile', icon: 'user', group: 'Account' },
    { to: '/studio/notifications', label: 'Notifications', icon: 'bell', group: 'Account' },
    { to: '/studio/help', label: 'Help & guidance', icon: 'help', group: 'Account' },
  ];
}

function Shell({ children, immersive }: { children: ReactNode; immersive: boolean }) {
  const { user, role } = useAuth();
  const { path } = useRoute();
  const notifications = useCreatorNotifications();
  // The lexicon tools are a review surface for validators and a drafting
  // surface for contributors; the shell follows whichever this person is.
  const reviewing = path === '/workspace' && canValidate(role);
  const items = reviewing ? reviewNav({ path }) : creatorNav(role);
  const active = activeDestination(items, path);
  const nav = items.map((item) => ({
    ...item,
    active: item === active,
    badge: item.to === '/studio/notifications' && notifications.unread ? notifications.unread : item.badge,
  }));
  return (
    <AppShell
      workspace={reviewing ? 'review' : 'create'}
      nav={nav}
      primary={reviewing ? undefined : { to: '/studio/submissions/new', label: 'Create a post', icon: 'plus' }}
      account={{ name: user?.displayName || user?.email || 'Creator', photo: user?.photoURL, role: reviewing ? 'Validator' : 'Creator' }}
      onSignOut={() => void signOutUser()}
      immersive={immersive}
      bell={reviewing ? undefined : { to: '/studio/notifications', unread: notifications.unread }}
    >
      <Suspense fallback={<RouteLoader />}>{children}</Suspense>
    </AppShell>
  );
}

export function StudioLayout({ children, immersive = false }: { children: ReactNode; immersive?: boolean }) {
  const { user } = useAuth();
  return (
    <CreatorNotificationsProvider uid={user?.uid}>
      <Shell immersive={immersive}>{children}</Shell>
    </CreatorNotificationsProvider>
  );
}
