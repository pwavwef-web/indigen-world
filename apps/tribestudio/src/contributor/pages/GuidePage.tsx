import { useEffect, useState } from 'react';
import { Icon, Notice, PageHeader } from '../components';
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
  const [query,setQuery]=useState('');
  const needle=query.trim().toLocaleLowerCase();
  const visible=GUIDE.filter(entry=>[entry.title,entry.summary,...entry.body,...(entry.points??[])].join(' ').toLocaleLowerCase().includes(needle));

  useEffect(() => {
    if (!section) return;
    const target = document.getElementById(`guide-${section}`);
    if (!target) return;
    target.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    const details=target.closest('details'); if(details)details.open=true;
    target.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true });
  }, [section]);

  return (
    <div className="cw-page">
      <PageHeader
        kicker="Platform guide"
        title="Help & guide"
        id="page-title"
        description="Find an answer or contact the team."
      />
      <div className="cw-help-actions"><ContributorIssues preview={data.preview} accountId={data.uid} showHistory /></div>
      <label className="cw-search"><Icon name="search" /><input type="search" aria-label="Search help" placeholder="Search help, review, saving or rewards" value={query} onChange={e=>setQuery(e.target.value)} /></label>
      {!visible.length && <p>No matching answers. Try another word or report a problem above.</p>}
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
            <details key={entry.id} className="cw-card cw-guide__section" open={Boolean(needle) || entry.id === section}><summary>{entry.title}</summary>
              <div id={`guide-${entry.id}`} className="cw-guide__anchor">
                <h2 id={`guide-${entry.id}-title`} tabIndex={-1}>{entry.title}</h2>
                <p className="cw-guide__summary">{entry.summary}</p>
                {entry.body.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                {entry.points?.length ? <ul className="cw-guide__points">{entry.points.map((point) => <li key={point}>{point}</li>)}</ul> : null}
                {entry.pending?.map((note) => (
                  <Notice key={note} tone="neutral" title="Policy not yet published"><p>{note}</p></Notice>
                ))}
                {entry.id === 'report-problem' ? (
                  <div className="cw-inline-actions">
                    <p>Use Report a problem or My reports above. You can ask about your account before receiving tasks.</p>
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
