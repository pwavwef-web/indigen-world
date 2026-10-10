import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import type { SectionId } from './routes';

/**
 * The screen behind every tool, loaded on first use so the home launcher
 * does not ship every workspace up front. Keys are `section.tool`, matching
 * the ids in routes.ts; scripts/validate-admin.mjs checks that every tool in
 * the map has a screen here.
 */

type Screen = LazyExoticComponent<ComponentType>;

const named = <T extends Record<string, unknown>>(loader: () => Promise<T>, key: keyof T, props: Record<string, unknown> = {}): Screen =>
  lazy(() => loader().then((module) => {
    const Component = module[key] as ComponentType<Record<string, unknown>>;
    return { default: () => <Component {...props} /> };
  }));

const finance = () => import('./finance/FinanceScreens');
const collections = () => import('./collection/CollectionAdmin');
const messaging = () => import('./messaging/MessagingAdmin');
const creators = () => import('./creators/CreatorsAdmin');
const contributors = () => import('./contributors/ContributorsAdmin');
const review = () => import('./review/ReviewDesk');
const learning = () => import('./learning/LearningAdmin');
const reports = () => import('./reports/ReportsAdmin');
const interests = () => import('./interests/InterestsAdmin');
const teamSites = () => import('./team-sites/TeamSiteIntake');
const audit = () => import('./console/AuditLogViewer');
const exportsScreen = () => import('./console/ExportManager');

export const SCREENS: Record<`${SectionId}.${string}`, Screen> = {
  'finance.overview': named(finance, 'FinanceOverview'),
  'finance.redemptions': named(finance, 'RedemptionsDesk'),
  'finance.settings': named(finance, 'PointSettings'),
  'finance.payouts': named(finance, 'PayoutRecords'),

  'collections.heroes': named(collections, 'CollectionAdmin', { tab: 'heroes' }),
  'collections.names': named(collections, 'CollectionAdmin', { tab: 'names' }),
  'collections.apps': named(collections, 'CollectionAdmin', { tab: 'apps' }),
  'collections.audiobooks': named(collections, 'CollectionAdmin', { tab: 'audiobooks' }),
  'collections.shop': named(collections, 'CollectionAdmin', { tab: 'shop' }),
  'collections.orders': named(collections, 'CollectionAdmin', { tab: 'orders' }),

  'messaging.compose': named(messaging, 'MessagingAdmin', { view: 'compose' }),
  'messaging.groups': named(messaging, 'MessagingAdmin', { view: 'groups' }),
  'messaging.history': named(messaging, 'MessagingAdmin', { view: 'history' }),
  'messaging.test': named(messaging, 'MessagingAdmin', { view: 'test' }),

  'creators.overview': named(creators, 'CreatorsAdmin', { tab: 'overview' }),
  'creators.applications': named(creators, 'CreatorsAdmin', { tab: 'applications' }),
  'creators.profiles': named(creators, 'CreatorsAdmin', { tab: 'creators' }),
  'creators.members': named(creators, 'CreatorsAdmin', { tab: 'members' }),
  'creators.campaigns': named(creators, 'CreatorsAdmin', { tab: 'campaigns' }),

  'contributors.directory': named(contributors, 'ContributorsAdmin', { view: 'directory' }),
  'contributors.invitations': named(contributors, 'ContributorsAdmin', { view: 'invitations' }),
  'contributors.assignments': named(contributors, 'ContributorsAdmin', { view: 'assignments' }),
  'contributors.history': named(contributors, 'ContributorsAdmin', { view: 'history' }),
  'contributors.support': named(contributors, 'ContributorsAdmin', { view: 'support' }),

  'review.pending': named(review, 'ReviewDesk', { scope: 'pending' }),
  'review.approved': named(review, 'ReviewDesk', { scope: 'approved' }),
  'review.published': named(review, 'ReviewDesk', { scope: 'published' }),
  'review.revision': named(review, 'ReviewDesk', { scope: 'revision' }),
  'review.rejected': named(review, 'ReviewDesk', { scope: 'rejected' }),
  'review.archived': named(review, 'ReviewDesk', { scope: 'archived' }),

  'learning.lessons': named(learning, 'LearningWorkspace', { tab: 'lessons' }),
  'learning.units': named(learning, 'LearningWorkspace', { tab: 'units' }),
  'learning.illustrations': named(learning, 'LearningWorkspace', { tab: 'illustrations' }),
  'learning.pronunciation': named(learning, 'LearningWorkspace', { tab: 'recordings' }),

  'community.reports': named(reports, 'ReportsAdmin'),
  'community.forms': named(interests, 'InterestsAdmin'),
  'community.team-sites': named(teamSites, 'TeamSiteRequestsAdmin'),

  'governance.audit': named(audit, 'AuditLogViewer'),
  'governance.exports': named(exportsScreen, 'ExportManager'),
  'governance.configuration': named(creators, 'PlatformConfiguration'),
};
