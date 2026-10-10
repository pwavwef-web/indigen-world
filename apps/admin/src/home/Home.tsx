import { useEffect, useState } from 'react';
import { countValue, useAttention, type AttentionKey, type Count } from '../attention';
import { Link } from '../router';
import { sectionEntry, visibleSections, type SectionId } from '../routes';
import { useSession } from '../session';
import { Icon, type IconName } from '../ui/icons';
import { Badge, Button, EmptyState } from '../ui/primitives';

/** Which live queue, if any, a section's card reports. */
const CARD_QUEUES: Partial<Record<SectionId, { keys: AttentionKey[]; label: (n: number) => string }>> = {
  finance: { keys: ['redemptionsPending', 'redemptionsAwaitingDelivery'], label: (n) => `${n} to act on` },
  review: { keys: ['reviewPending'], label: (n) => `${n} pending` },
  community: { keys: ['openReports', 'newForms'], label: (n) => `${n} open` },
  creators: { keys: ['creatorApplications'], label: (n) => `${n} ${n === 1 ? 'application' : 'applications'}` },
};

function greeting(date: Date): string {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function firstName(name: string | null | undefined): string {
  return name?.trim().split(/\s+/)[0] ?? '';
}

/** Sum of several counts; null if any of them is not known. */
function total(counts: Record<AttentionKey, Count>, keys: AttentionKey[], allowed: Set<AttentionKey>): number | null {
  let sum = 0;
  for (const key of keys) {
    if (!allowed.has(key)) continue;
    const value = countValue(counts[key]);
    if (value === null) return null;
    sum += value;
  }
  return sum;
}

function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

export function Home() {
  const { user, access } = useSession();
  const { counts, items, refresh } = useAttention();
  const now = useNow();
  const sections = visibleSections(access);
  const allowed = new Set(items.map((item) => item.key));
  const name = firstName(user.displayName);
  const review = allowed.has('reviewPending') ? countValue(counts.reviewPending) : null;
  const reports = allowed.has('openReports') ? countValue(counts.openReports) : null;
  const waiting = items.filter((item) => (countValue(counts[item.key]) ?? 0) > 0);
  const failed = items.filter((item) => counts[item.key]?.state === 'error');
  const loading = items.some((item) => counts[item.key]?.state === 'loading');

  return (
    <div className="ad-home">
      <header className="ad-home__head ts-enter">
        <div>
          <h1 id="page-title" tabIndex={-1}>{greeting(now)}{name ? `, ${name}` : ''}</h1>
          <p className="ad-home__lede">Choose a workspace to get started.</p>
          {allowed.has('reviewPending') || allowed.has('openReports') ? (
            <ul className="ad-home__stats" aria-label="Live queue totals">
              {allowed.has('reviewPending') ? (
                <li><Icon name="clock" /><strong>{review ?? '—'}</strong><span>awaiting review</span></li>
              ) : null}
              {allowed.has('openReports') ? (
                <li><Icon name="doc" /><strong>{reports ?? '—'}</strong><span>open {reports === 1 ? 'report' : 'reports'}</span></li>
              ) : null}
            </ul>
          ) : null}
        </div>
        <time className="ad-home__date" dateTime={now.toISOString().slice(0, 10)}>
          {now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
        </time>
      </header>

      {sections.length === 0 ? (
        <EmptyState boxed icon="lock" tone="warning" title="Your account has no staff role yet"
          body="Ask a super administrator to grant a reviewer or administrator role, then sign out and back in to refresh your access." />
      ) : (
        <nav aria-label="Workspaces">
          <ul className="ad-cards ts-stagger">
            {sections.map((section) => {
              const queue = CARD_QUEUES[section.id];
              const value = queue ? total(counts, queue.keys, allowed) : null;
              return (
                <li key={section.id}>
                  <Link to={sectionEntry(section, access)} className="ad-card" aria-describedby={`card-${section.id}-desc`}>
                    <span className="ad-card__icon" aria-hidden="true"><Icon name={section.icon as IconName} /></span>
                    <span className="ad-card__copy">
                      <span className="ad-card__title">{section.label}</span>
                      <span className="ad-card__desc" id={`card-${section.id}-desc`}>{section.description}</span>
                      {queue && value ? <Badge tone="warning" className="ad-card__badge">{queue.label(value)}</Badge> : null}
                    </span>
                    <Icon name="arrow" className="ad-card__go" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}

      {items.length ? (
        <section className="ad-attention" aria-labelledby="attention-title">
          <div className="ad-attention__head">
            <h2 id="attention-title">Needs attention</h2>
            {failed.length ? (
              <Button size="sm" variant="ghost" icon="refresh" onClick={refresh}>Retry {failed.length === 1 ? 'one queue' : `${failed.length} queues`}</Button>
            ) : null}
          </div>
          {waiting.length ? (
            <ul className="ad-attention__list">
              {waiting.map((item) => {
                const value = countValue(counts[item.key]) ?? 0;
                return (
                  <li key={item.key}>
                    <Link to={item.to} className="ad-attention__item">
                      <span className="ad-attention__icon" aria-hidden="true"><Icon name={item.icon as IconName} /></span>
                      <span className="ad-attention__label"><strong>{value}</strong> {item.label(value).toLowerCase()}</span>
                      <Icon name="arrow" className="ad-attention__go" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : loading ? (
            <p className="ad-attention__empty" role="status">Checking the queues…</p>
          ) : failed.length === items.length ? (
            <p className="ad-attention__empty" role="alert"><Icon name="alert" /> The queues could not be counted right now.</p>
          ) : (
            <p className="ad-attention__empty"><Icon name="check-circle" /> Nothing is waiting in the queues you can act on.</p>
          )}
          {failed.length && waiting.length ? (
            <p className="ad-attention__note"><Icon name="alert" /> {failed.map((item) => item.label(2).toLowerCase()).join(', ')}: count unavailable.</p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
