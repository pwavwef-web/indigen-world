import { useEffect, useState } from 'react';
import { EmptyState, Icon, Notice, PageHeader } from '../components';
import { GUIDE } from '../guide';
import { ContributorIssues } from '../ContributorIssues';
import { PortalLink, useWorkspace } from '../workspace';

/**
 * Guidelines, inside the workspace. Form fields link here by section
 * (?section=…); the page opens that section, scrolls to it and moves focus to
 * its heading so a keyboard or screen-reader user lands where the link
 * promised. Every section names its source; where no policy exists yet, it
 * says so instead of inventing one.
 */
export function GuidePage({ section }: { section: string }) {
  const data = useWorkspace();
  const [query, setQuery] = useState('');
  const needle = query.trim().toLocaleLowerCase();
  const visible = GUIDE.filter((entry) => [entry.title, entry.summary, ...entry.body, ...(entry.points ?? [])].join(' ').toLocaleLowerCase().includes(needle));

  useEffect(() => {
    if (!section) return;
    const target = document.getElementById(`guide-${section}`);
    if (!target) return;
    (target as HTMLDetailsElement).open = true;
    target.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    target.querySelector<HTMLElement>('summary')?.focus({ preventScroll: true });
  }, [section]);

  return (
    <div className="cw-page">
      <PageHeader
        title="Guidelines"
        description="How tasks, review, points and payments work, in plain words. Each section names where its rules come from."
        actions={<div className="cw-inline-actions"><ContributorIssues preview={data.preview} accountId={data.uid} showHistory /></div>}
      />
      <div className="cw-guide">
        <nav className="cw-guide__toc" aria-label="Guideline sections">
          <label className="cw-search">
            <span className="cw-sr">Search the guidelines</span>
            <Icon name="search" />
            <input type="search" placeholder="Search the guidelines" value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
          <ol>
            {visible.map((entry) => (
              <li key={entry.id}>
                <PortalLink to={data.paths.section('guide', { section: entry.id })} className={entry.id === section ? 'is-active' : undefined}>{entry.title}</PortalLink>
              </li>
            ))}
          </ol>
          <p className="cw-small cw-muted">Locked out of your account? <a href="/contributor/support">Contact support</a></p>
        </nav>
        <div className="cw-guide__body">
          {!visible.length ? (
            <EmptyState title="No matching guidance" icon="search" actions={<button type="button" onClick={() => setQuery('')}>Clear search</button>}>
              Try another word, or use Report a problem and the team will answer.
            </EmptyState>
          ) : visible.map((entry) => (
            <details key={entry.id} id={`guide-${entry.id}`} className="cw-guide-topic" open={Boolean(needle) || entry.id === section}>
              <summary>
                <span className="cw-guide-topic__copy"><h2 id={`guide-${entry.id}-title`}>{entry.title}</h2><span className="cw-guide__summary">{entry.summary}</span></span>
                <Icon name="chevron-down" className="cw-guide-topic__chevron" />
              </summary>
              <div className="cw-guide__anchor">
                {entry.body.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                {entry.points?.length ? <ul className="cw-guide__points">{entry.points.map((point) => <li key={point}>{point}</li>)}</ul> : null}
                {entry.pending?.map((note) => (
                  <Notice key={note} tone="neutral" title="Policy not yet published"><p>{note}</p></Notice>
                ))}
                {entry.id === 'payments' ? <p><PortalLink to={data.paths.account('payments')} className="cw-text-link">Open payment details<Icon name="arrow" /></PortalLink></p> : null}
                {entry.id === 'privacy' ? <p><PortalLink to={data.paths.account('notifications')} className="cw-text-link">Change how you appear<Icon name="arrow" /></PortalLink></p> : null}
                {entry.id === 'contribution-types' ? <p><PortalLink to={data.paths.section('contribute')} className="cw-text-link">Start a contribution<Icon name="arrow" /></PortalLink></p> : null}
                <p className="cw-guide__source">Source: {entry.source}</p>
              </div>
            </details>
          ))}
        </div>
      </div>
    </div>
  );
}
