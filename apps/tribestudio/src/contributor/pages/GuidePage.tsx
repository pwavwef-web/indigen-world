import { useEffect } from 'react';
import { Card, Icon, Notice, PageHeader } from '../components';
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
  const reportWork = data.works[0]?.id;

  useEffect(() => {
    if (!section) return;
    const target = document.getElementById(`guide-${section}`);
    if (!target) return;
    target.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    target.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true });
  }, [section]);

  return (
    <div className="cw-page">
      <PageHeader
        kicker="Platform guide"
        title="Platform guide"
        id="page-title"
        description="How contributing works: assignments, what makes a good Kasem contribution, review, payment details and privacy. Each section says where its policy comes from."
      />
      <div className="cw-guide">
        <nav className="cw-guide__toc" aria-label="Guide sections">
          <p className="cw-kicker">On this page</p>
          <ol>
            {GUIDE.map((entry) => (
              <li key={entry.id}>
                <PortalLink to={data.paths.section('guide', { section: entry.id })} className={entry.id === section ? 'is-active' : undefined}>{entry.title}</PortalLink>
              </li>
            ))}
          </ol>
        </nav>
        <div className="cw-guide__body">
          {GUIDE.map((entry) => (
            <Card key={entry.id} as="article" className="cw-guide__section" labelledBy={`guide-${entry.id}-title`}>
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
                    {reportWork ? <ContributorIssues work={reportWork} preview={data.preview} /> : <p className="cw-muted">Reporting opens once you have an assignment. Until then, contact the team member who invited you.</p>}
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
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
