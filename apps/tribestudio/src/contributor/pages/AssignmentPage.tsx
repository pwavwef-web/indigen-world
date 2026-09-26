import { useMemo, useState } from 'react';
import { useRoute } from '../../router';
import { Chip, EmptyNote, Icon, Notice, PageHeader, SegmentBar, Skeleton, useNow } from '../components';
import { WORK_STATE_META, dueInfo, formatDate, metricsFor, pluralise, workState } from '../model';
import { ContributionWorkspace } from '../editor';
import { KawuriDraftCheck } from '../kawuri';
import { ContributorIssues } from '../ContributorIssues';
import { PortalLink, useShared, useWorkspace } from '../workspace';

/**
 * One assignment: what it asks for, where it stands, and the translation
 * workspace. Reached at /contributor/{uid}/{work} — the address every SMS
 * invitation carries — optionally with ?item= to open one expression.
 */
export function AssignmentPage({ workId, itemId }: { workId: string; itemId?: string }) {
  const data = useWorkspace();
  const { setEditing } = useShared();
  const { navigate } = useRoute();
  const now = useNow();
  const [pending, setPending] = useState(false);
  const work = data.works.find((entry) => entry.id === workId);
  const items = useMemo(() => data.items[workId] ?? [], [data.items, workId]);
  const metrics = metricsFor(items);
  const state = workState(items);
  const started = metrics.submitted + metrics.drafts + metrics.unsure > 0;
  // Open until the contributor has started; after that, their own choice.
  const [instructionsChoice, setInstructionsChoice] = useState<boolean | null>(null);
  const instructionsOpen = instructionsChoice ?? !started;
  const guideHref = (section: string) => data.paths.section('guide', { section });

  const breadcrumb = (
    <>
      <PortalLink to={data.paths.section('assignments')}>Assignments</PortalLink>
      <span aria-hidden="true">/</span>
      <span aria-current="page">{work?.title ?? 'Assignment'}</span>
    </>
  );

  if (data.worksState === 'loading' || (work && !data.items[workId] && data.itemsState !== 'error')) {
    return <div className="cw-page"><PageHeader title="Loading assignment…" breadcrumb={breadcrumb} id="page-title" /><div className="cw-card"><Skeleton lines={6} label="Loading assignment" /></div></div>;
  }
  if (data.worksState === 'error' || data.itemsState === 'error') {
    return (
      <div className="cw-page">
        <PageHeader title="Assignment" breadcrumb={breadcrumb} id="page-title" />
        <Notice tone="danger" title="This assignment could not be loaded" action={<button type="button" onClick={() => window.location.reload()}>Reload</button>}>
          <p>Check your connection. Drafts you have already saved are safe on the server.</p>
        </Notice>
      </div>
    );
  }
  if (!work) {
    return (
      <div className="cw-page">
        <PageHeader title="Assignment unavailable" breadcrumb={breadcrumb} id="page-title" />
        <EmptyNote title="This assignment is not available to your account" action={<button type="button" onClick={() => navigate(data.paths.section('assignments'))}>See your assignments</button>}>
          It may have been removed, or the link belongs to another account. Contact the team if you think this is a mistake.
        </EmptyNote>
      </div>
    );
  }

  const due = dueInfo(work.deadline, state === 'complete' || state === 'awaiting_review', new Date(now));
  const open = metrics.notStarted + metrics.drafts + metrics.unsure;
  return (
    <div className="cw-page cw-page--wide">
      <PageHeader
        breadcrumb={breadcrumb}
        kicker="Assignment"
        title={work.title}
        id="page-title"
        description={
          <span className="cw-meta-row">
            {due ? <span className={`cw-due cw-due--${due.tone}`}><Icon name="clock" />{due.label}</span> : <span className="cw-due"><Icon name="clock" />No due date</span>}
            <span>{pluralise(items.length, 'expression')}</span>
            <span>Assigned {formatDate(work.createdAt)}</span>
          </span>
        }
        actions={<Chip tone={WORK_STATE_META[state].tone}>{WORK_STATE_META[state].label}</Chip>}
      />

      <div className="cw-assignment-overview">
        <details className="cw-instructions" open={instructionsOpen} onToggle={(event) => setInstructionsChoice((event.currentTarget as HTMLDetailsElement).open)}>
          <summary><Icon name="doc" /><span>Instructions and guidance</span><Icon name="arrow" className="cw-instructions__chevron" /></summary>
          <div className="cw-instructions__body">
            <p>{work.instructions || 'Translate each English expression naturally into Kasem. Add alternatives when more than one expression is common.'}</p>
            <dl className="cw-facts">
              {work.dialect ? <div><dt>Kasem variety</dt><dd>{work.dialect}</dd></div> : null}
              {work.tone ? <div><dt>Tone</dt><dd>{work.tone}</dd></div> : null}
              <div><dt>Due</dt><dd>{work.deadline ? `${formatDate(work.deadline, true)} — guidance, not a cut-off` : 'No due date'}</dd></div>
              <div><dt>Help</dt><dd>{work.helpContact || 'Contact the team member who sent your invitation, or use Report a problem.'}</dd></div>
            </dl>
            <div className="cw-inline-actions">
              <button type="button" onClick={() => navigate(data.paths.section('kawuri', { work: work.id, mode: 'explain_assignment' }))}><Icon name="kawuri" />Ask Kawuri to explain</button>
              <PortalLink to={guideHref('assignments')} className="cw-text-link">How assignments work</PortalLink>
              <PortalLink to={guideHref('good-contribution')} className="cw-text-link">What makes a good contribution</PortalLink>
            </div>
          </div>
        </details>
        <div className="cw-card cw-progress-card">
          <div className="cw-progress-card__head">
            <strong>{metrics.awaiting + metrics.approved} of {items.length} sent and not returned</strong>
            <span className="cw-muted">{open ? `${open} still to do` : 'Nothing left to translate'}</span>
          </div>
          <SegmentBar metrics={metrics} label={`Progress on ${work.title}`} />
        </div>
      </div>

      {!open && items.length ? (
        <Notice tone={metrics.returned ? 'warning' : 'success'} title={metrics.returned ? 'Some expressions came back for revision' : 'Every expression in this assignment is submitted'} role="status">
          <p>{metrics.approved} approved · {metrics.awaiting} awaiting review{metrics.returned ? ` · ${metrics.returned} returned` : ''}. {metrics.awaiting ? 'Decisions will appear in Activity and on each expression.' : ''}</p>
        </Notice>
      ) : null}

      <ContributionWorkspace
        key={`${data.uid}:${work.id}`}
        items={items}
        work={work.id}
        accountId={data.uid}
        saveAnswer={data.services.saveAnswer}
        onPending={setPending}
        initialItem={itemId}
        onEditingChange={setEditing}
        onSelectItem={(id) => {
          try { window.history.replaceState(window.history.state, '', data.paths.work(work.id, id)); } catch { /* The address is a convenience. */ }
        }}
        extras={{
          guideHref,
          onNavigate: navigate,
          renderKawuri: (openItem, draft, close) => (
            <KawuriDraftCheck
              key={openItem}
              assist={data.services.assist}
              work={work.id}
              item={openItem}
              draft={draft}
              onClose={close}
              guideHref={guideHref}
              onNavigate={navigate}
            />
          ),
          renderReport: (openItem) => <ContributorIssues work={work.id} item={openItem} preview={data.preview} disabled={pending} />,
        }}
      />
    </div>
  );
}
