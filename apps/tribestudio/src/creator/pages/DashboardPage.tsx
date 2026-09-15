import type { ReactNode } from 'react';
import { Link } from '../../router';
import { canContribute, useAuth } from '../../auth';
import { useConfig } from '../CreatorProvider';
import { fetchMyApplications, fetchMyContributorScore, fetchMyNotifications, fetchMyProfile, fetchMySubmissions, fetchPublicCampaigns, submissionsOpen } from '../data';
import { APPLICATION_STATUS_LABELS, LoadError, Skeleton, StatusPill, SUBMISSION_STATUS_LABELS, WhatsAppCard } from '../components';
import { useCreatorResource } from '../useCreatorResource';

function SectionState({ resource, title, children }: { resource: { failed: boolean; loading: boolean; retry: () => void }; title: string; children: ReactNode }) {
  if (resource.failed) return <LoadError title={`Could not load ${title}`} onRetry={resource.retry} />;
  if (resource.loading) return <Skeleton lines={2} />;
  return <>{children}</>;
}

export function DashboardPage() {
  const { user, role } = useAuth();
  const { whatsappUrl } = useConfig();
  const work = useCreatorResource(fetchMySubmissions, user?.uid);
  const profile = useCreatorResource(fetchMyProfile, user?.uid);
  const applications = useCreatorResource(fetchMyApplications, user?.uid);
  const campaigns = useCreatorResource(fetchPublicCampaigns, user?.uid);
  const notifications = useCreatorResource(fetchMyNotifications, user?.uid);
  const score = useCreatorResource(fetchMyContributorScore, user?.uid);
  const submissions = work.data ?? [];
  const actionable = submissions.filter((s) => ['DRAFT', 'NEEDS_REVISION'].includes(s.status)
    && !s.collectionContribution && s.campaign.id !== 'collection-contributions')
    .sort((a, b) => Number(b.status === 'NEEDS_REVISION') - Number(a.status === 'NEEDS_REVISION'));
  const published = submissions.filter((s) => s.status === 'PUBLISHED').length;
  const approved = submissions.filter((s) => s.status === 'APPROVED').length;
  const openCampaigns = (campaigns.data ?? []).filter(submissionsOpen);
  const firstPost = work.data !== undefined && submissions.length === 0;

  return <div className="page dashboard-focused">
    <header className="page__head page__head--spread">
      <div><h1>Welcome, {profile.data?.public.displayName ?? user?.displayName ?? 'creator'}</h1><p className="muted">Create something, continue a draft, or respond to feedback.</p></div>
      <Link to="/studio/submissions/new" className="button button--primary">Create a post</Link>
    </header>
    <section className="panel">
      <div className="panel__head"><h2>Your next step</h2><Link to="/studio/submissions">Your content →</Link></div>
      <SectionState resource={work} title="your content">
        {firstPost ? <>
          <h3>Make your first post</h3>
          <p>Start small: a short piece of writing, one photo with context, or a recording you have permission to share.</p>
          <ol className="creator-start-steps">
            <li><strong>Choose a format</strong><span>Writing, audio, video, image or translation.</span></li>
            <li><strong>Create and preview</strong><span>Save a draft, add context and check permissions.</span></li>
            <li><strong>Publish when ready</strong><span>Ordinary posts go to Explore; campaign entries are reviewed first.</span></li>
          </ol>
          <Link to="/studio/submissions/new?type=writing" className="button button--primary">Start with writing</Link>
        </> : actionable.length ? <ul className="mini-list">{actionable.slice(0, 5).map((s) => <li key={s.id}>
          <Link to={`/studio/submissions/${s.id}/edit`}>{s.title || 'Untitled draft'}</Link>
          <StatusPill status={s.status} labels={SUBMISSION_STATUS_LABELS} />
        </li>)}</ul> : <p className="muted">You have no drafts or revisions waiting. Ready for your next story?</p>}
      </SectionState>
    </section>
    <section className="panel">
      <h2>Where your work stands</h2>
      <SectionState resource={work} title="publication status">
        <div className="tiles">
          <Link className="tile" to="/studio/submissions?status=DRAFT"><span className="tile__label">Drafts</span><strong className="tile__value">{submissions.filter((s) => s.status === 'DRAFT').length}</strong></Link>
          <Link className="tile" to="/studio/submissions?status=NEEDS_REVISION"><span className="tile__label">Revisions requested</span><strong className="tile__value">{submissions.filter((s) => s.status === 'NEEDS_REVISION').length}</strong></Link>
          <Link className="tile" to="/studio/submissions?status=APPROVED"><span className="tile__label">Approved, not yet published</span><strong className="tile__value">{approved}</strong></Link>
          <Link className="tile" to="/studio/submissions?status=PUBLISHED"><span className="tile__label">Published</span><strong className="tile__value">{published}</strong></Link>
        </div>
        <p className="tiny muted">Approval is a review decision. Only work marked Published counts as published here.</p>
      </SectionState>
    </section>
    <div className="cols">
      <section className="panel">
        <div className="panel__head"><h2>Updates for you</h2><Link to="/studio/notifications">All updates →</Link></div>
        <SectionState resource={notifications} title="notifications">
          {notifications.data?.length ? <ul className="mini-list">{notifications.data.slice(0, 3).map((n) => <li key={n.id}><Link to="/studio/notifications">{n.title}</Link></li>)}</ul> : <p className="muted">No notifications yet.</p>}
        </SectionState>
      </section>
      <section className="panel">
        <h2>Want to contribute words?</h2><p>Add individual Kasem words, meanings and recordings in Word contributions.</p>
        <Link to="/studio/dictionary" className="button button--ghost-dark">Contribute a word</Link>
        {canContribute(role) ? <p className="tiny">For bulk entry and review, use the <Link to="/workspace">Advanced lexicon tools</Link>.</p> : null}
      </section>
    </div>
    <details className="panel dashboard-details">
      <summary>Campaigns and opportunities</summary>
      <p>Campaigns have eligibility rules and review before publication. You can create ordinary posts without joining a campaign.</p>
      <SectionState resource={campaigns} title="campaigns">
        {openCampaigns.length ? <ul className="mini-list">{openCampaigns.map((c) => <li key={c.id}><Link to={`/studio/opportunities/${c.id}`}>{c.title}</Link></li>)}</ul> : <p>No campaigns are accepting entries right now.</p>}
        <Link to="/studio/opportunities">See all opportunities →</Link>
      </SectionState>
      <SectionState resource={applications} title="your applications">
        {applications.data?.[0] ? <p>Your latest application: <StatusPill status={applications.data[0].status} labels={APPLICATION_STATUS_LABELS} /></p> : <p>No campaign application yet. Check an opportunity's requirements before applying.</p>}
      </SectionState>
    </details>
    <details className="panel dashboard-details">
      <summary>Your contribution progress and profile</summary>
      <SectionState resource={score} title="contribution progress">
        <p>{score.data?.points ?? 0} points · {score.data?.approvedCount ?? 0} accepted contributions · {score.data?.wordCount ?? 0} accepted words</p>
        <p>Level {Math.floor((score.data?.points ?? 0) / 300) + 1} · {score.data?.streakDays ?? 0} day streak</p>
        <progress aria-label="Progress toward the next level" value={(score.data?.points ?? 0) % 300} max={300} />
        <ul className="mini-list">
          <li><span>Kasem Wordsmith — 5 accepted words</span><strong>{(score.data?.wordCount ?? 0) >= 5 ? 'Earned' : 'In progress'}</strong></li>
          <li><span>Dialect Guardian — 500 contribution points</span><strong>{(score.data?.points ?? 0) >= 500 ? 'Earned' : 'In progress'}</strong></li>
        </ul>
        <p className="tiny muted">Points are awarded when contributions are accepted.</p>
      </SectionState>
      <SectionState resource={work} title="your first contribution milestone">
        <p>Pioneer Contributor — {submissions.some((submission) => submission.status !== 'DRAFT') ? 'Earned for your first submission' : 'Make your first submission to earn this milestone'}.</p>
      </SectionState>
      <SectionState resource={applications} title="your creator milestone">
        <p>Founding Voice — {applications.data?.some((application) => application.status === 'APPROVED') ? 'Earned through acceptance into the founding creator cohort' : 'Awarded on acceptance into the founding creator cohort'}.</p>
      </SectionState>
      <SectionState resource={profile} title="your profile">
        <p>Profile completion: {profile.data?.profileCompletion ?? 0}%</p><Link to="/studio/profile">Update your profile →</Link>
      </SectionState>
    </details>
    <WhatsAppCard url={whatsappUrl} compact />
  </div>;
}
