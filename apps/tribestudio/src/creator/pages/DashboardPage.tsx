import type { ReactNode } from 'react';
import { Link } from '../../router';
import { useAuth } from '../../auth';
import { fetchMySubmissions, fetchPublicCampaigns, submissionsOpen } from '../data';
import { LoadError, Skeleton, StatusPill, SUBMISSION_STATUS_LABELS } from '../components';
import { useCreatorResource } from '../useCreatorResource';
import { useCreatorNotifications } from '../notifications';
import { ActionCard, Badge, ButtonLink, EmptyState, Icon, Notice, PageHeader, Panel, StatCard, StatGrid, Steps } from '../../ui';

/**
 * The creator's first screen. It answers, in order: what can I start, what is
 * waiting for me, and where does my work stand. Every number is counted from
 * the creator's own submissions; nothing here is an estimate.
 */

const TILES: { status: string; label: string; hint: string }[] = [
  { status: 'DRAFT', label: 'Drafts', hint: 'Private until you send them' },
  { status: 'NEEDS_REVISION', label: 'Needs revision', hint: 'A reviewer asked for changes' },
  { status: 'APPROVED', label: 'Approved · not published', hint: 'Accepted, waiting to go live' },
  { status: 'PUBLISHED', label: 'Published', hint: 'Live on Indigen World' },
];

function ago(iso?: string | null): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const minutes = Math.round((Date.now() - then) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return days === 1 ? 'yesterday' : `${days} days ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function SectionState({ resource, title, children }: { resource: { failed: boolean; loading: boolean; retry: () => void }; title: string; children: ReactNode }) {
  if (resource.failed) return <LoadError title={`Could not load ${title}`} onRetry={resource.retry} />;
  if (resource.loading) return <Skeleton lines={3} />;
  return <>{children}</>;
}

export function DashboardPage() {
  const { user } = useAuth();
  const work = useCreatorResource(fetchMySubmissions, user?.uid);
  const campaigns = useCreatorResource(fetchPublicCampaigns, user?.uid);
  const notifications = useCreatorNotifications();
  const submissions = work.data ?? [];
  const actionable = submissions.filter(s => ['DRAFT','NEEDS_REVISION'].includes(s.status) && !s.collectionContribution && s.campaign.id !== 'collection-contributions')
    .sort((a,b) => Number(b.status === 'NEEDS_REVISION') - Number(a.status === 'NEEDS_REVISION'));
  const revisions = submissions.filter((s) => s.status === 'NEEDS_REVISION').length;
  const openCampaigns = (campaigns.data ?? []).filter(submissionsOpen);
  const firstName = (user?.displayName ?? '').trim().split(/\s+/)[0];

  return (
    <div className="ts-page cr-overview">
      <PageHeader
        kicker="Creator overview"
        title={firstName ? `Welcome back, ${firstName}` : 'Your creative work'}
        description="Start something new or pick up where you left off. Drafts stay private until you send them."
        actions={<ButtonLink to="/studio/submissions/new" variant="primary" icon="plus">Create a post</ButtonLink>}
      />

      {revisions > 0 ? (
        <Notice
          tone="warning"
          title={revisions === 1 ? 'One post needs revision' : `${revisions} posts need revision`}
          action={<ButtonLink to="/studio/submissions?status=NEEDS_REVISION" variant="secondary" size="sm">Open them</ButtonLink>}
        >
          A reviewer has left feedback. Make the changes and send the post again.
        </Notice>
      ) : null}

      <section className="cr-launch" aria-labelledby="cr-launch-title">
        <h2 id="cr-launch-title" className="ts-overline">Start creating</h2>
        <div className="ts-grid ts-grid--4 ts-stagger">
          <ActionCard to="/studio/submissions/new" icon="doc" title="Create a post" body="Writing, photos, audio, video or a translation. Preview before you send." go="New post" />
          <ActionCard to="/studio/editor" icon="film" title="Edit a video" body="Arrange footage, add captions and music, then export your project." go="Video projects" />
          <ActionCard to="/studio/expressions" icon="quote" title="Share an expression" body="A phrase in Kasem with its meaning and when people say it." go="Expressions" />
          <ActionCard to="/studio/dictionary" icon="book" title="Propose a word" body="Add a Kasem word with its senses and forms for review." go="Dictionary words" />
        </div>
      </section>

      <SectionState resource={work} title="your content">
        <StatGrid label="Your content by status">
          {TILES.map(({ status, label, hint }) => (
            <StatCard
              key={status}
              to={`/studio/submissions?status=${status}`}
              label={label}
              value={submissions.filter((s) => s.status === status).length}
              hint={hint}
              attention={status === 'NEEDS_REVISION' && revisions > 0}
            />
          ))}
        </StatGrid>
      </SectionState>

      <div className="ts-split">
        <div className="ts-stack">
          <Panel
            title="Continue your work"
            description="Requested revisions come first, then your most recent drafts."
            actions={<Link className="ts-link" to="/studio/submissions">Content library</Link>}
          >
            <SectionState resource={work} title="your drafts">
              {actionable.length ? (
                <ul className="ts-list cr-continue">
                  {actionable.slice(0, 5).map((s) => (
                    <li key={s.id} className="ts-list__row">
                      <span className={s.status === 'NEEDS_REVISION' ? 'ts-list__lead cr-lead--warning' : 'ts-list__lead'} aria-hidden="true">
                        <Icon name={s.status === 'NEEDS_REVISION' ? 'refresh' : 'edit'} />
                      </span>
                      <div className="ts-list__main">
                        <Link className="ts-list__title" to={`/studio/submissions/${s.id}/edit`}>{s.title || 'Untitled draft'}</Link>
                        <p className="ts-list__meta ts-clamp-2">{s.moderation?.feedback || 'Open the editor to continue'}</p>
                      </div>
                      <div className="ts-list__trail">
                        <StatusPill status={s.status} labels={SUBMISSION_STATUS_LABELS} />
                        {s.lifecycle?.updatedAt ? <small className="ts-faint">{ago(s.lifecycle.updatedAt)}</small> : null}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState
                  compact
                  icon="doc"
                  title="No drafts waiting"
                  body="Saved posts and requested revisions appear here."
                  actions={<ButtonLink to="/studio/submissions/new" variant="primary" size="sm" icon="plus">Start a post</ButtonLink>}
                />
              )}
            </SectionState>
          </Panel>

          <Panel title="How a post moves" description="The same path for every format." variant="tint">
            <Steps
              label="Creator post workflow"
              steps={[
                { title: 'Create', detail: 'Choose a format and save a private draft.', icon: 'doc' },
                { title: 'Preview', detail: 'Check the material, people and permissions.', icon: 'eye' },
                { title: 'Publish', detail: 'Open posts go to Explore; campaign entries go to review first.', icon: 'globe' },
              ]}
            />
          </Panel>
        </div>

        <aside className="ts-stack" aria-label="Updates and opportunities">
          <Panel
            title="Updates"
            actions={<Link className="ts-link" to="/studio/notifications">View all</Link>}
          >
            {notifications.failed ? (
              <LoadError title="Could not load updates" onRetry={notifications.retry} />
            ) : notifications.loading ? (
              <Skeleton lines={3} />
            ) : notifications.items.length ? (
              <ul className="ts-list cr-list--compact">
                {notifications.items.slice(0, 4).map((n) => (
                  <li key={n.id} className="ts-list__row">
                    <span className={n.read ? 'ts-dot' : 'ts-dot cr-dot--new'} aria-hidden="true" />
                    <div className="ts-list__main">
                      <Link className="ts-list__title ts-clamp-2" to="/studio/notifications">{n.title}</Link>
                      {n.lifecycle?.createdAt ? <span className="ts-list__meta">{ago(n.lifecycle.createdAt)}</span> : null}
                    </div>
                    {!n.read ? <Badge tone="accent">New</Badge> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="ts-muted">Review decisions and campaign updates appear here.</p>
            )}
          </Panel>

          <Panel
            title="Opportunities"
            description="Campaigns accepting submissions now."
            actions={<Link className="ts-link" to="/studio/opportunities">All opportunities</Link>}
          >
            <SectionState resource={campaigns} title="opportunities">
              {openCampaigns.length ? (
                <ul className="ts-list cr-list--compact">
                  {openCampaigns.slice(0, 4).map((c) => (
                    <li key={c.id} className="ts-list__row">
                      <span className="ts-list__lead" aria-hidden="true"><Icon name="opportunities" /></span>
                      <div className="ts-list__main">
                        <Link className="ts-list__title ts-clamp-2" to={`/studio/opportunities/${c.id}`}>{c.title}</Link>
                        {c.initiative ? <span className="ts-list__meta ts-truncate">{c.initiative}</span> : null}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="ts-muted">No campaigns are accepting submissions right now. Open posts can be published at any time.</p>
              )}
            </SectionState>
          </Panel>

          <Panel title="More from the studio" variant="tight">
            <nav className="cr-shortcuts" aria-label="More from the studio">
              <Link to="/studio/published"><Icon name="globe" /><span>Published posts</span><Icon name="chevron" /></Link>
              <Link to="/studio/profile"><Icon name="user" /><span>Creator profile</span><Icon name="chevron" /></Link>
              <Link to="/studio/help"><Icon name="help" /><span>Help & guidance</span><Icon name="chevron" /></Link>
            </nav>
          </Panel>
        </aside>
      </div>
    </div>
  );
}
