/**
 * The administration map: nine sections, the tools inside each, who may open
 * them, and where old addresses now live. Pure data and pure functions, so the
 * routing rules are tested without a browser (see scripts/routes.test.mjs).
 *
 * Access here decides what the console shows. It is never the security
 * boundary: Security Rules and the callable Functions enforce the same roles
 * on every read and write.
 */

export type StaffRole = 'contributor' | 'validator' | 'creator' | 'reviewer' | 'admin' | 'super_admin' | null;

export interface StaffAccess {
  role: StaffRole;
  /** The finance claim (payout detail is separated from ordinary admin). */
  finance: boolean;
  /** The orthogonal super-administrator claim. */
  superAdmin: boolean;
}

export type AccessLevel = 'validator' | 'admin' | 'finance';

export function isValidatorRole(role: StaffRole): boolean {
  return role === 'validator' || role === 'reviewer' || role === 'admin' || role === 'super_admin';
}

export function isAdminRole(role: StaffRole): boolean {
  return role === 'admin' || role === 'super_admin';
}

/** Mirrors `hasFinanceAccess` in services/functions/src/auth.ts. */
export function hasFinanceAccess(access: StaffAccess): boolean {
  if (access.superAdmin || access.role === 'super_admin') return true;
  return access.finance && isAdminRole(access.role);
}

export function allows(level: AccessLevel, access: StaffAccess): boolean {
  if (level === 'validator') return isValidatorRole(access.role);
  if (level === 'admin') return isAdminRole(access.role);
  return hasFinanceAccess(access);
}

export const ACCESS_LABEL: Record<AccessLevel, string> = {
  validator: 'a validator, reviewer or admin role',
  admin: 'an admin role',
  finance: 'the finance permission',
};

export type SectionId =
  | 'finance' | 'collections' | 'messaging' | 'creators' | 'contributors'
  | 'review' | 'learning' | 'community' | 'governance';

/** Names in the admin icon set (see ui/icons.tsx). */
export type IconKey = string;

export interface ToolDef {
  /** Unique within its section; `section.tool` is the screen key. */
  id: string;
  /** Path segment after the section base; '' is the section's front page. */
  slug: string;
  label: string;
  icon: IconKey;
  hint: string;
  access: AccessLevel;
}

export interface SectionDef {
  id: SectionId;
  label: string;
  /** One line for the home card and the switcher. */
  description: string;
  icon: IconKey;
  base: string;
  access: AccessLevel;
  tools: ToolDef[];
}

export const SECTIONS: SectionDef[] = [
  {
    id: 'finance', label: 'Finance', description: 'Points, reward policies, redemptions and payout records',
    icon: 'coins', base: '/finance', access: 'admin',
    tools: [
      { id: 'overview', slug: '', label: 'Overview', icon: 'chart', hint: 'Redemption totals by status', access: 'admin' },
      { id: 'redemptions', slug: 'redemptions', label: 'Point redemptions', icon: 'gift', hint: 'Approve, top up, reconcile or return airtime and data requests', access: 'admin' },
      { id: 'settings', slug: 'settings', label: 'Reward policies', icon: 'settings', hint: 'Versioned award and redemption rates, rollout switches', access: 'admin' },
      { id: 'ledger', slug: 'ledger', label: 'Points ledger', icon: 'list', hint: 'Every points movement and reasoned adjustments', access: 'admin' },
      { id: 'audit', slug: 'audit', label: 'Audit history', icon: 'archive', hint: 'Policy, flag, decision and adjustment history', access: 'admin' },
      { id: 'payouts', slug: 'payouts', label: 'Payout records', icon: 'bank', hint: 'Payout verification and contributor payment requests', access: 'finance' },
    ],
  },
  {
    id: 'collections', label: 'Collections', description: 'Heroes, names, apps, audiobooks, shop and orders',
    icon: 'book', base: '/collections', access: 'admin',
    tools: [
      { id: 'heroes', slug: 'heroes', label: 'Heroes', icon: 'book', hint: 'Kasem heroes and their stories', access: 'admin' },
      { id: 'names', slug: 'names', label: 'Names', icon: 'user', hint: 'Kasem names and meanings', access: 'admin' },
      { id: 'apps', slug: 'apps', label: 'Apps', icon: 'grid', hint: 'The app directory', access: 'admin' },
      { id: 'audiobooks', slug: 'audiobooks', label: 'Audiobooks', icon: 'headphones', hint: 'Recordings, files and publication', access: 'admin' },
      { id: 'shop', slug: 'shop', label: 'Shop', icon: 'bag', hint: 'Products in the community shop', access: 'admin' },
      { id: 'orders', slug: 'orders', label: 'Orders', icon: 'doc', hint: 'Shop orders and fulfilment', access: 'admin' },
    ],
  },
  {
    id: 'messaging', label: 'Messaging', description: 'Announcements, contact groups and SMS history',
    icon: 'message', base: '/messaging', access: 'admin',
    tools: [
      { id: 'compose', slug: '', label: 'Compose', icon: 'message', hint: 'Write, review and send an announcement', access: 'admin' },
      { id: 'groups', slug: 'groups', label: 'Contact groups', icon: 'users', hint: 'Saved recipient groups', access: 'admin' },
      { id: 'history', slug: 'history', label: 'Campaign history', icon: 'doc', hint: 'Sent and scheduled announcements', access: 'admin' },
      { id: 'test', slug: 'test', label: 'Test SMS', icon: 'flask', hint: 'Send one test message', access: 'admin' },
    ],
  },
  {
    id: 'creators', label: 'Creators', description: 'Applications, profiles, members and campaigns',
    icon: 'users', base: '/creators', access: 'validator',
    tools: [
      { id: 'overview', slug: '', label: 'Overview', icon: 'chart', hint: 'Application and campaign totals', access: 'validator' },
      { id: 'applications', slug: 'applications', label: 'Applications', icon: 'inbox', hint: 'Creator intake decisions', access: 'validator' },
      { id: 'profiles', slug: 'profiles', label: 'Creator profiles', icon: 'user', hint: 'Memberships, suspension and revocation', access: 'validator' },
      { id: 'members', slug: 'members', label: 'Members', icon: 'users', hint: 'Community members and verification marks', access: 'validator' },
      { id: 'campaigns', slug: 'campaigns', label: 'Campaigns', icon: 'flag', hint: 'Campaign status and visibility', access: 'validator' },
    ],
  },
  {
    id: 'contributors', label: 'Contributors', description: 'Profiles, invitations, assignments and history',
    icon: 'user', base: '/contributors', access: 'admin',
    tools: [
      { id: 'directory', slug: '', label: 'Directory', icon: 'users', hint: 'Profiles, access and activity', access: 'admin' },
      { id: 'invitations', slug: 'invitations', label: 'Invitations', icon: 'mail', hint: 'Pending and cancelled invitations', access: 'admin' },
      { id: 'assignments', slug: 'assignments', label: 'Assignments', icon: 'doc', hint: 'Expression work and progress', access: 'admin' },
      { id: 'history', slug: 'history', label: 'Contribution history', icon: 'clock', hint: 'Every contributor submission and its outcome', access: 'admin' },
      { id: 'support', slug: 'support', label: 'Support & issues', icon: 'help', hint: 'Support inbox and reported issues', access: 'admin' },
    ],
  },
  {
    id: 'review', label: 'Review Desk', description: 'Submissions and publication decisions',
    icon: 'doc', base: '/review', access: 'validator',
    tools: [
      { id: 'pending', slug: '', label: 'Pending', icon: 'doc', hint: 'Submitted, resubmitted and under review', access: 'validator' },
      { id: 'approved', slug: 'approved', label: 'Approved', icon: 'check-circle', hint: 'Approved and waiting to be published or archived', access: 'validator' },
      { id: 'published', slug: 'published', label: 'Published', icon: 'book', hint: 'Live work that can be unpublished', access: 'validator' },
      { id: 'revision', slug: 'needs-revision', label: 'Needs revision', icon: 'pen', hint: 'Returned to the contributor', access: 'validator' },
      { id: 'rejected', slug: 'rejected', label: 'Rejected', icon: 'x-circle', hint: 'Declined with a reason', access: 'validator' },
      { id: 'archived', slug: 'archived', label: 'Archived', icon: 'archive', hint: 'Approved but kept out of publication', access: 'validator' },
    ],
  },
  {
    id: 'learning', label: 'Learning', description: 'Units, lessons, illustrations and pronunciation',
    icon: 'cap', base: '/learning', access: 'validator',
    tools: [
      { id: 'lessons', slug: 'lessons', label: 'Lessons', icon: 'book', hint: 'Lesson and exercise editor', access: 'admin' },
      { id: 'units', slug: 'units', label: 'Units', icon: 'layers', hint: 'The guided learning path', access: 'admin' },
      { id: 'illustrations', slug: 'illustrations', label: 'Illustrations', icon: 'image', hint: 'Generate and approve lesson artwork', access: 'validator' },
      { id: 'pronunciation', slug: 'pronunciation', label: 'Pronunciation', icon: 'mic', hint: 'Review recorded pronunciations', access: 'validator' },
    ],
  },
  {
    id: 'community', label: 'Community', description: 'Reports, forms and team-site responses',
    icon: 'users', base: '/community', access: 'validator',
    tools: [
      { id: 'reports', slug: 'reports', label: 'Reports', icon: 'flag', hint: 'Community moderation queue', access: 'admin' },
      { id: 'forms', slug: 'forms', label: 'Forms & claims', icon: 'inbox', hint: 'Website forms and Founding Tester claims', access: 'validator' },
      { id: 'team-sites', slug: 'team-sites', label: 'Team sites', icon: 'home', hint: 'Team site intake responses', access: 'validator' },
    ],
  },
  {
    id: 'governance', label: 'Governance', description: 'Audit trail, exports and configuration',
    icon: 'settings', base: '/governance', access: 'admin',
    tools: [
      { id: 'audit', slug: '', label: 'Audit trail', icon: 'shield', hint: 'The permanent record of privileged actions', access: 'admin' },
      { id: 'exports', slug: 'exports', label: 'Exports', icon: 'download', hint: 'Permission-safe governed data packages', access: 'admin' },
      { id: 'configuration', slug: 'configuration', label: 'Configuration', icon: 'settings', hint: 'Dialects, categories and contact links', access: 'admin' },
    ],
  },
];

/** Addresses from the previous console, so bookmarks and shared links land. */
export const LEGACY_REDIRECTS: Record<string, string> = {
  '/console': '/',
  '/collection': '/collections',
  '/reports': '/community/reports',
  '/interests': '/community/forms',
  '/team-sites': '/community/team-sites',
  '/audit': '/governance',
  '/exports': '/governance/exports',
  '/contributors/rewards': '/finance/redemptions',
  '/contributors/payments': '/finance/payouts',
  '/contributors/review': '/review',
  '/creators/review': '/review',
  '/creators/config': '/governance/configuration',
  '/creators/audit': '/governance',
};

export function toolPath(section: SectionDef, tool: ToolDef): string {
  return tool.slug ? `${section.base}/${tool.slug}` : section.base;
}

export function sectionById(id: SectionId): SectionDef {
  const section = SECTIONS.find((item) => item.id === id);
  if (!section) throw new Error(`Unknown section ${id}`);
  return section;
}

export function visibleSections(access: StaffAccess): SectionDef[] {
  return SECTIONS.filter((section) => allows(section.access, access));
}

export function visibleTools(section: SectionDef, access: StaffAccess): ToolDef[] {
  return section.tools.filter((tool) => allows(tool.access, access));
}

export type Resolution =
  | { kind: 'home' }
  | { kind: 'redirect'; to: string }
  | { kind: 'tool'; section: SectionDef; tool: ToolDef }
  | { kind: 'denied'; section: SectionDef; tool: ToolDef | null; needs: AccessLevel }
  | { kind: 'not-found' };

/**
 * Where a path leads for this person. A section's own address opens its front
 * tool, or the first tool they are allowed to use; a path they may not open
 * explains which permission it needs instead of pretending not to exist.
 */
export function resolve(pathname: string, access: StaffAccess): Resolution {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path === '/') return { kind: 'home' };
  const legacy = LEGACY_REDIRECTS[path];
  if (legacy) return { kind: 'redirect', to: legacy };

  const section = SECTIONS.find((item) => path === item.base || path.startsWith(`${item.base}/`));
  if (!section) return { kind: 'not-found' };
  if (!allows(section.access, access)) return { kind: 'denied', section, tool: null, needs: section.access };

  const slug = path.slice(section.base.length).replace(/^\//, '');
  const tool = section.tools.find((item) => item.slug === slug);
  if (tool && allows(tool.access, access)) return { kind: 'tool', section, tool };
  if (slug === '') {
    // The section's own address: its front tool when allowed, otherwise the
    // first tool this person may use.
    const first = visibleTools(section, access)[0];
    if (first) return { kind: 'redirect', to: toolPath(section, first) };
    return { kind: 'denied', section, tool: tool ?? null, needs: tool?.access ?? section.access };
  }
  if (!tool) return { kind: 'not-found' };
  return { kind: 'denied', section, tool, needs: tool.access };
}

/** A section's own address resolves to a tool with an empty slug, or redirects. */
export function sectionEntry(section: SectionDef, access: StaffAccess): string {
  const root = section.tools.find((tool) => tool.slug === '');
  if (root && allows(root.access, access)) return section.base;
  const first = visibleTools(section, access)[0];
  return first ? toolPath(section, first) : section.base;
}
