import { useEffect, useState } from 'react';
import { Icon, Notice, PageHeader } from '../components';
import { GUIDE } from '../guide';
import { ContributorIssues } from '../ContributorIssues';
import { SearchField } from '../../ui';
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
    target.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.motion === 'off' ? 'auto' : 'smooth' });
    target.querySelector<HTMLElement>('summary')?.focus({ preventScroll: true });
  }, [section]);

  return (
    <div className="ts-page">
      <PageHeader
        kicker="Help"
        title="Help & guide"
        id="page-title"
        description="How assignments, review and recognition work — and where to get help when something is stuck."
        actions={<div className="ts-cluster"><ContributorIssues preview={data.preview} accountId={data.uid} showHistory /></div>}
      />

      <section className="ts-panel cw-flow-panel" aria-labelledby="flow-title">
        <div className="ts-panel__head">
          <div className="ts-panel__heading">
            <h2 className="ts-panel__title" id="flow-title">The path of a contribution</h2>
            <p className="ts-panel__desc">What happens to an expression from the moment it is assigned to you.</p>
          </div>
        </div>
        <ol className="cw-flow ts-stagger" aria-label="Contribution process">
          <li><span className="cw-flow__node"><Icon name="assignments" /></span><strong>Assigned</strong><small>An English expression in one of your assignments</small></li>
          <li><span className="cw-flow__node"><Icon name="pen" /></span><strong>Draft</strong><small>Saves as you type; private to you</small></li>
          <li><span className="cw-flow__node cw-flow__node--accent"><Icon name="send" /></span><strong>Sent for review</strong><small>Locked while a reviewer decides</small></li>
          <li className="cw-flow__fork">
            <span className="cw-flow__branch cw-flow__branch--ok"><span className="cw-flow__node cw-flow__node--ok"><Icon name="check" /></span><span><strong>Approved</strong><small>Kept in the expression collection</small></span></span>
            <span className="cw-flow__branch cw-flow__branch--warn"><span className="cw-flow__node cw-flow__node--warn"><Icon name="refresh" /></span><span><strong>Returned</strong><small>Read the feedback, revise, resend</small></span></span>
          </li>
        </ol>
        <p className="ts-hint"><Icon name="info" /> Unsure about one? Flag it — nothing is sent, and it waits under the Unsure filter.</p>
      </section>

      <div className="ts-toolbar">
        <SearchField label="Search help" placeholder="Search help: review, saving, recognition, payments…" value={query} onChange={setQuery} />
        <a href="/contributor/support" className="ts-btn ts-btn--ghost"><Icon name="message" /><span>Account help and support inbox</span></a>
      </div>
      {!visible.length ? <Notice tone="neutral" title="No matching answers">Try another word, or use Report a problem above.</Notice> : null}

      <div className="cw-guide">
        <nav className="cw-guide__toc" aria-label="Guide sections">
          <p className="ts-overline">On this page</p>
          <ol>
            {visible.map((entry) => (
              <li key={entry.id}>
                <PortalLink to={data.paths.section('guide', { section: entry.id })} className={entry.id === section ? 'is-active' : undefined}>
                  <span className="cw-guide__num">{String(GUIDE.indexOf(entry) + 1).padStart(2, '0')}</span>{entry.title}
                </PortalLink>
              </li>
            ))}
          </ol>
        </nav>
        <div className="ts-stack ts-stack--sm">
          {visible.map((entry) => (
            <details key={entry.id} id={`guide-${entry.id}`} className="ts-disclosure cw-guide-topic" open={Boolean(needle) || entry.id === section}>
              <summary>
                <span className="cw-guide__num cw-guide__num--lg" aria-hidden="true">{String(GUIDE.indexOf(entry) + 1).padStart(2, '0')}</span>
                <span><h2 id={`guide-${entry.id}-title`} className="cw-guide__title">{entry.title}</h2><small>{entry.summary}</small></span>
                <Icon name="chevron" className="ts-disclosure__chev" />
              </summary>
              <div className="ts-disclosure__body">
                {entry.body.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                {entry.points?.length ? <ul className="cw-guide__points">{entry.points.map((point) => <li key={point}>{point}</li>)}</ul> : null}
                {entry.pending?.map((note) => (
                  <Notice key={note} tone="neutral" title="Policy not yet published"><p>{note}</p></Notice>
                ))}
                {entry.id === 'report-problem' ? <p className="ts-muted">Use Report a problem or My reports at the top of this page, even before receiving tasks.</p> : null}
                {entry.id === 'payments' ? <p><PortalLink to={data.paths.account('payments')} className="ts-link">Open payment details<Icon name="arrow" /></PortalLink></p> : null}
                {entry.id === 'privacy' ? <p><PortalLink to={data.paths.account('notifications')} className="ts-link">Change how you appear<Icon name="arrow" /></PortalLink></p> : null}
                <p className="cw-guide__source"><Icon name="book" />Source: {entry.source}</p>
              </div>
            </details>
          ))}
        </div>
      </div>
    </div>
  );
}
