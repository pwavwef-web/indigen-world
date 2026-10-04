import { useState } from 'react';
import type { CreatorNotification } from '@indigen-world/contracts/creator-models';
import { Link } from '../../router';
import { LoadError, WhatsAppCard } from '../components';
import { useCreatorNotifications } from '../notifications';
import { Badge, Button, EmptyState, FilterChips, Icon, PageHeader, Skeleton, type IconName } from '../../ui';

const TYPE_ICON: Record<CreatorNotification['type'], IconName> = {
  application_update: 'user',
  campaign_opening: 'opportunities',
  submission_deadline: 'clock',
  review_decision: 'check-circle',
  revision_request: 'refresh',
  publication_notice: 'globe',
  winner_announcement: 'award',
  payment_update: 'wallet',
  policy_change: 'shield',
  announcement: 'message',
};

function iconFor(n: CreatorNotification): IconName {
  return TYPE_ICON[n.type] ?? 'bell';
}

function when(iso?: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** In-studio links stay in the studio; anything else opens as a normal link. */
function linkFor(n: CreatorNotification): string | null {
  const link = n.link?.trim();
  if (!link) return null;
  if (link.startsWith('/studio') || link.startsWith('/contributor')) return link;
  return null;
}

export function NotificationsPage() {
  const notifications = useCreatorNotifications();
  const [show, setShow] = useState<'all' | 'unread'>('all');
  const [marking, setMarking] = useState<string | null>(null);
  const [markFailed, setMarkFailed] = useState(false);

  const markRead = async (n: CreatorNotification) => {
    setMarking(n.id);
    setMarkFailed(false);
    try { await notifications.markRead(n); } catch { setMarkFailed(true); } finally { setMarking(null); }
  };

  const header = (
    <PageHeader
      kicker="Account"
      title="Notifications"
      description="Review decisions, campaign openings and application updates, newest first."
    />
  );

  if (notifications.failed) return <div className="ts-page ts-page--medium">{header}<LoadError title="Could not load notifications" onRetry={notifications.retry} /></div>;
  if (notifications.loading) return <div className="ts-page ts-page--medium">{header}<div className="ts-panel"><Skeleton lines={5} label="Loading notifications" /></div></div>;

  const visible = show === 'unread' ? notifications.items.filter((n) => !n.read) : notifications.items;

  return (
    <div className="ts-page ts-page--medium cr-notifications">
      {header}
      {notifications.items.length === 0 ? (
        <EmptyState boxed icon="bell" title="No notifications yet" body="Application updates, campaign openings and review decisions will appear here." />
      ) : (
        <>
          <FilterChips
            label="Show"
            value={show}
            onChange={setShow}
            options={[
              { value: 'all', label: 'All', count: notifications.items.length },
              { value: 'unread', label: 'Unread', count: notifications.unread },
            ]}
          />
          {markFailed ? <p className="ts-error" role="alert"><Icon name="alert" />That could not be marked as read. Try again.</p> : null}
          {visible.length === 0 ? (
            <EmptyState boxed compact icon="check-circle" tone="success" title="You are all caught up" body="Every notification has been read." />
          ) : (
            <ul className="cr-notes ts-stagger">
              {visible.map((n) => {
                const target = linkFor(n);
                return (
                  <li key={n.id} className={n.read ? 'cr-note' : 'cr-note is-unread'}>
                    <span className="cr-note__icon" aria-hidden="true"><Icon name={iconFor(n)} /></span>
                    <div className="cr-note__main">
                      <p className="cr-note__title">
                        {target ? <Link to={target}>{n.title}</Link> : n.title}
                        {!n.read ? <Badge tone="accent">New</Badge> : null}
                      </p>
                      {n.body ? <p className="cr-note__body">{n.body}</p> : null}
                      <time className="cr-note__time" dateTime={n.lifecycle?.createdAt}>{when(n.lifecycle?.createdAt)}</time>
                    </div>
                    {!n.read ? (
                      <Button size="sm" variant="ghost" icon="check" busy={marking === n.id} onClick={() => void markRead(n)}>Mark read</Button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
      <WhatsAppCard compact />
    </div>
  );
}
