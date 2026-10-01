import { Badge, EmptyState, Icon, Notice, PageHeader, Panel, TypeTag, useNow } from '../components';
import { formatDateTime, relativeTime } from '../model';
import { ACTION_LABEL, STATE_META, TYPE_META } from '../submissions';
import { PortalLink, useShared, useWorkspace } from '../workspace';
import { rowActionHref } from './OverviewPage';

/**
 * Work that has come back to the contributor: an assigned translation
 * returned with feedback, an everyday expression they can correct once, or a
 * recording they can make again. Feedback leads, because it is what the
 * contributor needs to act on.
 */
export function RevisionsPage() {
  const data = useWorkspace();
  const { revisions } = useShared();
  const now = useNow();
  const failed = data.worksState === 'error' || data.itemsState === 'error' || data.receiptsState === 'error' || data.recordingsState === 'error';

  return (
    <div className="cw-page">
      <PageHeader
        title="Revisions"
        description="Work a reviewer has returned to you, with what they asked you to change. Earlier versions and decisions stay on record."
        actions={<PortalLink to={data.paths.section('guide', { section: 'review' })} className="cw-btn"><Icon name="guide" />How revisions work</PortalLink>}
      />
      {failed ? (
        <Notice tone="danger" title="Some of your work could not be loaded" action={<button type="button" onClick={() => window.location.reload()}>Reload</button>}>
          <p>This list may be incomplete until it loads.</p>
        </Notice>
      ) : null}
      {!revisions.length ? (
        <EmptyState
          title="No revision requests"
          icon="check"
          actions={<PortalLink to={data.paths.section('contributions')} className="cw-btn">View my submissions</PortalLink>}
        >
          When a reviewer returns something with feedback, it appears here with exactly what they asked you to change.
        </EmptyState>
      ) : (
        <Panel title={`${revisions.length} waiting for you`} flush>
          <ul className="cw-revisions">
            {revisions.map((row) => (
              <li key={row.key} className="cw-revision">
                <div className="cw-revision__head">
                  <div className="cw-revision__title">
                    <TypeTag icon={TYPE_META[row.type].icon}>{TYPE_META[row.type].label}{row.type === 'assigned' ? ` · ${row.context}` : ''}</TypeTag>
                    <h3><span lang={row.titleLang}>{row.title}</span></h3>
                    {row.subtitle ? <p className="cw-muted cw-small" lang={row.subtitleLang}>{row.type === 'assigned' ? 'Your version: ' : 'Meaning: '}{row.subtitle}</p> : null}
                  </div>
                  <div className="cw-revision__state">
                    <Badge tone={STATE_META[row.state].tone}>{STATE_META[row.state].label}</Badge>
                    {row.decidedAt ? <time className="cw-small cw-muted" dateTime={row.decidedAt} title={formatDateTime(row.decidedAt)}>{relativeTime(row.decidedAt, now)}</time> : null}
                  </div>
                </div>
                {row.feedback ? <blockquote className="cw-quote cw-quote--warning"><strong>Reviewer:</strong> {row.feedback}</blockquote> : <p className="cw-muted cw-small">The reviewer did not leave a note. Open the history for details.</p>}
                <div className="cw-inline-actions">
                  {row.action ? <PortalLink to={rowActionHref(row, data.paths)} className="cw-btn cw-btn--primary cw-btn--sm">{ACTION_LABEL[row.action]}</PortalLink> : null}
                  <PortalLink to={data.paths.section('contributions', { view: row.key })} className="cw-btn cw-btn--sm cw-btn--ghost">View history</PortalLink>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
