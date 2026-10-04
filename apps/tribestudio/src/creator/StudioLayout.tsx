import { Suspense, type ReactNode } from 'react';
import { canContribute, canMakeVideo, canValidate, signOutUser, useAuth } from '../auth';
import { useRoute } from '../router';
import { RouteLoader } from '../LoadingScreen';
import { WorkspaceFrame, type WorkspaceDestination } from '../interface/WorkspaceFrame';

export function StudioLayout({ children, immersive = false }: { children: ReactNode; immersive?: boolean }) {
  const { user, role } = useAuth();
  const { path } = useRoute();
  const destinations: WorkspaceDestination[] = [
    { to: '/studio', label: 'Overview', icon: 'overview', group: 'Your work' },
    { to: '/studio/submissions', label: 'Content library', icon: 'contributions', group: 'Your work' },
    { to: '/studio/editor', label: 'Video projects', icon: 'video', group: 'Your work' },
    { to: '/studio/published', label: 'Published links', icon: 'external', group: 'Your work' },
    { to: '/studio/opportunities', label: 'Opportunities', icon: 'opportunities', group: 'Contribute' },
    { to: '/studio/dictionary', label: 'Dictionary words', icon: 'guide', group: 'Contribute' },
    { to: '/studio/expressions', label: 'Expressions', icon: 'translation', group: 'Contribute' },
    { to: '/contributor/corpus', label: 'Corpus workspace', icon: 'guide', group: 'Contribute' },
    ...(canMakeVideo(role) ? [
      { to: '/studio/video', label: 'Generate a video', icon: 'kawuri' as const, group: 'Tools' },
      { to: '/studio/video/jobs', label: 'Generation history', icon: 'clock' as const, group: 'Tools' },
    ] : []),
    ...(canContribute(role) ? [{ to: '/workspace', label: 'Lexicon tools', icon: 'guide' as const, group: 'Tools' }] : []),
    ...(canValidate(role) ? [{ to: '/contributor/review', label: 'Review workspace', icon: 'shield' as const, group: 'Tools' }] : []),
    { to: '/studio/profile', label: 'Creator profile', icon: 'user', group: 'Account' },
    { to: '/studio/notifications', label: 'Notifications', icon: 'bell', group: 'Account' },
    { to: '/studio/help', label: 'Help & guidance', icon: 'help', group: 'Account' },
  ];
  const active = [...destinations].sort((a, b) => b.to.length - a.to.length).find(item => item.to === '/studio' ? path === item.to : path === item.to || path.startsWith(item.to + '/'));
  return <WorkspaceFrame identity="Create" destinations={destinations.map(item => ({ ...item, active: item === active }))} account={user?.displayName || user?.email || 'Creator'} photo={user?.photoURL} onSignOut={() => void signOutUser()} immersive={immersive} primary={{ to: '/studio/submissions/new', label: 'Create a post' }}>
    <div className="studio iwx"><Suspense fallback={<RouteLoader />}>{children}</Suspense></div>
  </WorkspaceFrame>;
}
