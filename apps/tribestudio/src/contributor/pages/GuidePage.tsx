import { useEffect, useState } from 'react';
import { Icon, Notice, PageHeader } from '../components';
import { artwork } from '../artwork';
import { GUIDE } from '../guide';
import { ContributorIssues } from '../ContributorIssues';
import { PortalLink, useWorkspace } from '../workspace';

/**
 * The Platform guide, inside the workspace. Form fields link here by section
 * (?section=…); the page scrolls to it and moves focus to its heading so a
 * keyboard or screen-reader user lands where the link promised.
 */
export function GuidePage({ section }: { section: string }) {
  const data = useWorkspace();
  const [query, setQuery] = useState('');
  const needle = query.trim().toLocaleLowerCase();
  const visible = GUIDE.filter(entry => [entry.title, entry.summary, ...entry.body, ...(entry.points ?? [])].join(' ').toLocaleLowerCase().includes(needle));

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
        kicker="Platform guide"
        title="A little guidance. A great start."
        id="page-title"
        description="Find what you need, then get back to creating."
      />
      <div className="cw-guide-welcome">
        <img src={artwork.livingKnowledge} alt="" width="1536" height="1024" />
        <div><span className="cw-kicker">YOUR CONTRIBUTOR FIELD GUIDE</span><h2>Start with what you know.</h2><p>Write naturally. Add context. Let the reviewers help you grow.</p></div>
      </div>
      <div className="cw-help-toolbar">
        <label className="cw-search"><Icon name="search" /><input type="search" aria-label="Search help" placeholder="Search help, review, saving or rewards" value={query} onChange={event => setQuery(event.target.value)} /></label>
        <div className="cw-help-actions"><ContributorIssues preview={data.preview} accountId={data.uid} showHistory /></div>
      </div>
      {!visible.length ? <p className="cw-muted">No matching answers. Try another word or report a problem above.</p> : null}
      <div className="cw-guide">
        <nav className="cw-guide__toc" aria-label="Guide sections">
          <p className="cw-kicker">On this page</p>
          <ol>
            {visible.map((entry) => (
              <li key={entry.id}>
                <PortalLink to={data.paths.section('guide', { section: entry.id })} className={entry.id === section ? 'is-active' : undefined}>{entry.title}</PortalLink>
              </li>
            ))}
          </ol>
        </nav>
        <div className="cw-guide__body">
          {visible.map((entry) => (
            <details key={entry.id} id={`guide-${entry.id}`} className="cw-card cw-guide__section cw-guide-topic" open={Boolean(needle) || entry.id === section}>
              <summary><span className="cw-guide-topic__number">{String(GUIDE.indexOf(entry) + 1).padStart(2, '0')}</span><span><h2 id={`guide-${entry.id}-title`}>{entry.title}</h2><span className="cw-guide__summary">{entry.summary}</span></span><Icon name="arrow" /></summary>
              <div className="cw-guide__anchor">
                {entry.body.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                {entry.points?.length ? <ul className="cw-guide__points">{entry.points.map((point) => <li key={point}>{point}</li>)}</ul> : null}
                {entry.pending?.map((note) => (
                  <Notice key={note} tone="neutral" title="Policy not yet published"><p>{note}</p></Notice>
                ))}
                {entry.id === 'report-problem' ? (
                  <div className="cw-inline-actions">
                    <p className="cw-muted">Use Report a problem or My reports above, even before receiving tasks.</p>
                  </div>
                ) : null}
                {entry.id === 'payments' ? (
                  <p><PortalLink to={data.paths.account('payments')} className="cw-text-link">Open payment details<Icon name="arrow" /></PortalLink></p>
                ) : null}
                {entry.id === 'privacy' ? (
                  <p><PortalLink to={data.paths.account('notifications')} className="cw-text-link">Change how you appear<Icon name="arrow" /></PortalLink></p>
                ) : null}
                <p className="cw-guide__source">Source: {entry.source}</p>
              </div>
            </details>
          ))}
        </div>
      </div>
    </div>
  );
}
