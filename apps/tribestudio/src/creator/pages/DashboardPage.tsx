import type { ReactNode } from 'react';
import { Link } from '../../router';
import { useAuth } from '../../auth';
import { fetchMyNotifications, fetchMySubmissions, fetchPublicCampaigns, submissionsOpen } from '../data';
import { LoadError, Skeleton, StatusPill, SUBMISSION_STATUS_LABELS } from '../components';
import { useCreatorResource } from '../useCreatorResource';
import { Icon } from '../../interface/icons';
import { ProcessGuide } from '../../interface/WorkspaceFrame';

function SectionState({ resource, title, children }: { resource: { failed: boolean; loading: boolean; retry: () => void }; title: string; children: ReactNode }) {
  if (resource.failed) return <LoadError title={`Could not load ${title}`} onRetry={resource.retry} />;
  if (resource.loading) return <Skeleton lines={3} />;
  return <>{children}</>;
}

export function DashboardPage() {
  const { user } = useAuth();
  const work = useCreatorResource(fetchMySubmissions, user?.uid);
  const campaigns = useCreatorResource(fetchPublicCampaigns, user?.uid);
  const notifications = useCreatorResource(fetchMyNotifications, user?.uid);
  const submissions = work.data ?? [];
  const actionable = submissions.filter(s => ['DRAFT','NEEDS_REVISION'].includes(s.status) && !s.collectionContribution && s.campaign.id !== 'collection-contributions')
    .sort((a,b) => Number(b.status === 'NEEDS_REVISION') - Number(a.status === 'NEEDS_REVISION'));
  const openCampaigns = (campaigns.data ?? []).filter(submissionsOpen);
  return <div className="page">
    <header className="page__head page__head--spread"><div><p className="hero__eyebrow">Creator overview</p><h1>Your creative work</h1><p>Start something new or pick up where you left off.</p></div><Link to="/studio/submissions/new" className="button button--primary"><Icon name="plus" />Create a post</Link></header>
    <div className="iw-launch-grid" aria-label="Start creating">
      <Link className="iw-launch" to="/studio/submissions/new"><Icon name="doc" /><div><strong>Create a post</strong><small>Writing, photos, audio, video or translation. Preview before publishing.</small></div></Link>
      <Link className="iw-launch" to="/studio/editor"><Icon name="video" /><div><strong>Edit a video</strong><small>Arrange footage, add captions and export your project.</small></div></Link>
      <Link className="iw-launch" to="/studio/expressions"><Icon name="translation" /><div><strong>Share an expression</strong><small>Add a phrase, meaning and context for language review.</small></div></Link>
    </div>
    <SectionState resource={work} title="your content"><div className="tiles">{[['DRAFT','Drafts'],['NEEDS_REVISION','Needs revision'],['APPROVED','Approved · not published'],['PUBLISHED','Published']].map(([status,label]) => <Link key={status} className="tile" to={`/studio/submissions?status=${status}`}><span className="tile__label">{label}</span><strong className="tile__value">{submissions.filter(s => s.status === status).length}</strong></Link>)}</div></SectionState>
    <div className="iw-dashboard-grid">
      <section className="panel"><div className="panel__head"><h2>Continue your work</h2><Link to="/studio/submissions">Content library</Link></div><SectionState resource={work} title="your drafts">{actionable.length ? <ul className="mini-list">{actionable.slice(0,5).map(s => <li key={s.id}><div><Link to={`/studio/submissions/${s.id}/edit`}>{s.title || 'Untitled draft'}</Link><p className="tiny muted">{s.moderation?.feedback || 'Open the editor to continue'}</p></div><StatusPill status={s.status} labels={SUBMISSION_STATUS_LABELS} /></li>)}</ul> : <div className="empty"><Icon name="doc" /><h3>No drafts waiting</h3><p>Your saved posts and requested revisions will appear here.</p><Link to="/studio/submissions/new" className="button button--primary">Start a post</Link></div>}</SectionState></section>
      <section className="panel"><div className="panel__head"><h2>Updates</h2><Link to="/studio/notifications">View all</Link></div><SectionState resource={notifications} title="notifications">{notifications.data?.length ? <ul className="mini-list">{notifications.data.slice(0,4).map(n => <li key={n.id}><Link to="/studio/notifications">{n.title}</Link></li>)}</ul> : <p className="muted">Review decisions and campaign updates will appear here.</p>}</SectionState></section>
    </div>
    <ProcessGuide label="Creator post workflow" steps={[{title:'Create',detail:'Choose a format and save a private draft',icon:'doc'},{title:'Preview',detail:'Check your material and permissions',icon:'check'},{title:'Publish',detail:'Open posts go to Explore; campaigns go to review',icon:'external'}]} />
    <details className="panel dashboard-details"><summary>Opportunities and language tools</summary><SectionState resource={campaigns} title="opportunities">{openCampaigns.length ? <ul className="mini-list">{openCampaigns.map(c => <li key={c.id}><Link to={`/studio/opportunities/${c.id}`}>{c.title}</Link></li>)}</ul> : <p>No campaigns are accepting submissions right now.</p>}</SectionState><div className="page__head-actions"><Link to="/studio/opportunities">View opportunities</Link><Link to="/studio/dictionary">Contribute a dictionary word</Link><Link to="/studio/profile">Creator profile</Link></div></details>
  </div>;
}
