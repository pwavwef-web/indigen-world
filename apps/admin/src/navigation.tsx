import type { ReactNode } from 'react';
import { isAdmin, isValidator, type AdminRole } from './creators/data';
import { ConsoleHome } from './console/ConsoleHome';
import { CreatorsAdmin } from './creators/CreatorsAdmin';
import { TeamSiteRequestsAdmin } from './team-sites/TeamSiteIntake';
import { MessagingAdmin } from './messaging/MessagingAdmin';
import { InterestsAdmin } from './interests/InterestsAdmin';
import { LearningAdmin } from './learning/LearningAdmin';
import { CollectionAdmin } from './collection/CollectionAdmin';
import { ReportsAdmin } from './reports/ReportsAdmin';
import { AuditLogViewer } from './console/AuditLogViewer';
import { ExportManager } from './console/ExportManager';

/**
 * The admin console's top-level screens, in nav order. Both the navigation bar
 * and the routed content in `App.tsx` are derived from this one list — so
 * adding a screen is a two-step change with no edits to the shell:
 *
 *   1. Build the screen in its own file (e.g. `src/moderation/ModerationAdmin.tsx`).
 *   2. Add an entry here: an `id`, a nav `label`, an optional access gate + deny
 *      notice, and a `render` that returns the screen.
 *
 * Access gates run against the signed-in staff member's role claim. Omit
 * `canAccess` for a screen any signed-in user may open.
 */

export type ViewId =
  | 'console'
  | 'creators'
  | 'learning'
  | 'collection'
  | 'reports'
  | 'interests'
  | 'teamSites'
  | 'messaging'
  | 'audit'
  | 'exports';

export interface AdminScreen {
  /** Stable identifier used for nav state and routing. */
  id: ViewId;
  /** URL path the screen lives at, e.g. `/messaging`. Deep-linkable and
   * restored on refresh (the hosting config rewrites all paths to index.html). */
  path: string;
  /** Label shown in the top navigation and breadcrumb trail. */
  label: string;
  /** Sidebar section used to keep a growing console scannable. */
  group: 'Overview' | 'Publishing' | 'Community' | 'Governance';
  /** Role gate; return false to show `deny` instead of the screen. */
  canAccess?: (role: AdminRole) => boolean;
  /** Notice rendered when `canAccess` denies the current user. */
  deny?: { title: string; body: string };
  /** Render the screen for the given signed-in role. */
  render: (ctx: { role: AdminRole; navigate: (to: string) => void }) => ReactNode;
}

export const SCREENS: AdminScreen[] = [
  {
    id: 'console',
    path: '/',
    label: 'Console',
    group: 'Overview',
    render: ({ role, navigate }) => <ConsoleHome role={role} onNavigate={navigate} />,
  },
  {
    id: 'creators',
    path: '/creators',
    label: 'Creators',
    group: 'Publishing',
    canAccess: isValidator,
    deny: { title: 'Staff access required', body: 'Your account needs a validator or admin role to manage creators.' },
    render: ({ role }) => <CreatorsAdmin role={role} />,
  },
  {
    id: 'learning',
    path: '/learning',
    label: 'Learning',
    group: 'Publishing',
    canAccess: isAdmin,
    deny: {
      title: 'Admin access required',
      body: 'Your account needs an admin role to configure the Kasem learning path.',
    },
    render: () => <LearningAdmin />,
  },
  {
    id: 'collection',
    path: '/collection',
    label: 'Collection',
    group: 'Publishing',
    canAccess: isAdmin,
    deny: {
      title: 'Admin access required',
      body: 'Your account needs an admin role to manage the app directory and the shop.',
    },
    render: () => <CollectionAdmin />,
  },
  {
    id: 'reports',
    path: '/reports',
    label: 'Reports',
    group: 'Community',
    canAccess: isAdmin,
    deny: {
      title: 'Admin access required',
      body: 'Your account needs an admin role to review community reports.',
    },
    render: () => <ReportsAdmin />,
  },
  {
    id: 'interests',
    path: '/interests',
    label: 'Interests',
    group: 'Community',
    canAccess: isValidator,
    deny: { title: 'Staff access required', body: 'Your account needs a validator or admin role to view submitted interests.' },
    render: ({ role }) => <InterestsAdmin role={role} />,
  },
  {
    id: 'teamSites',
    path: '/team-sites',
    label: 'Team sites',
    group: 'Community',
    canAccess: isValidator,
    deny: { title: 'Staff access required', body: 'Your account needs a validator or admin role to review team site responses.' },
    render: () => <TeamSiteRequestsAdmin />,
  },
  {
    id: 'messaging',
    path: '/messaging',
    label: 'Messaging',
    group: 'Community',
    canAccess: isAdmin,
    deny: { title: 'Admin access required', body: 'Your account needs an admin role to send announcements and view the SMS balance.' },
    render: () => <MessagingAdmin />,
  },
  {
    id: 'audit',
    path: '/audit',
    label: 'Audit Trail',
    group: 'Governance',
    canAccess: isAdmin,
    deny: { title: 'Admin access required', body: 'Your account needs an admin role to inspect audit logs.' },
    render: () => <AuditLogViewer />,
  },
  {
    id: 'exports',
    path: '/exports',
    label: 'Exports',
    group: 'Governance',
    canAccess: isAdmin,
    deny: { title: 'Admin access required', body: 'Your account needs an admin role to generate governed exports.' },
    render: () => <ExportManager />,
  },
];

/** The screen whose `path` matches the given pathname. Unknown paths return
 * null so the shell can render an explicit 404 instead of a misleading console
 * fallback. Trailing slashes are ignored so `/messaging/` resolves too. */
export function screenForPath(pathname: string): AdminScreen | null {
  const normalized = pathname.replace(/\/+$/, '') || '/';
  return SCREENS.find((screen) => screen.path === normalized) ?? null;
}
