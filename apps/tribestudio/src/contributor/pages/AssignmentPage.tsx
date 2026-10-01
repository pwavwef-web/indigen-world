import { useEffect, useMemo, useState } from 'react';
import { useRoute } from '../../router';
import { Badge, EmptyState, Facts, Icon, Notice, PageHeader, Panel, SegmentBar, Skeleton, cx, useNow } from '../components';
import { WORK_STATE_META, dueInfo, formatDate, metricsFor, pluralise, workState } from '../model';
import { ContributionWorkspace } from '../editor';
import { KawuriDraftCheck } from '../kawuri';
import { ContributorIssues } from '../ContributorIssues';
import { PortalLink, useShared, useWorkspace } from '../workspace';

/**
 * One task: what it asks for, where it stands, and the translation
 * workspace. Reached at /contributor/{uid}/{work} — the address every SMS
 * invitation carries — optionally with ?item= to open one expression.
 */
export function AssignmentPage({ workId, itemId }: { workId: string; itemId?: string }) {
  const data = useWorkspace();
  const { setEditing } = useShared();
  const { navigate } = useRoute();
  const now = useNow();
  const [pending, setPending] = useState(false);
  const [editorOpen, setEditorOpen] = useState(Boolean(itemId));
  useEffect(() => {
    if (editorOpen && window.matchMedia('(max-width: 1023px)').matches) {
      // The pane starts with "All expressions", so the way back stays in view.
      requestAnimationFrame(() => document.querySelector('.cw-editor-pane')?.scrollIntoView({ block: 'start' }));
    }
  }, [editorOpen]);
  const work = data.works.find((entry) => entry.id === workId);
  const items = useMemo(() => data.items[workId] ?? [], [data.items, workId]);
  const metrics = metricsFor(items);
  const state = workState(items);
  const started = metrics.submitted + metrics.drafts + metrics.unsure > 0;
  // Open until the contributor has started; after that, their own choice.
  const [briefChoice, setBriefChoice] = useState<boolean | null>(null);
  const briefOpen = briefChoice ?? !started;
  const guideHref = (section: string) => data.paths.section('guide', { section });

  const breadcrumb = (
    <>
      <PortalLink to={data.paths.section('assignments')}>Tasks</PortalLink>
      <span aria-hidden="true">/</span>
      <span aria-current="page">{work?.title ?? 'Task'}</span>
    </>
  );

  if (data.worksState === 'loading' || (work && !data.items[workId] && data.itemsState !== 'error')) {
    return <div className="cw-page"><PageHeader title="Loading task…" breadcrumb={breadcrumb} /><Panel><Skeleton lines={6} label="Loading task" /></Panel></div>;
  }
  if (data.worksState === 'error' || data.itemsState === 'error') {
    return (
      <div className="cw-page">
        <PageHeader title="Task" breadcrumb={breadcrumb} />
        <Notice tone="danger" title="This task could not be loaded" action={<button type="button" onClick={() => window.location.reload()}>Reload</button>}>
          <p>Check your connection. Drafts you have already saved are safe on the server.</p>
        </Notice>
      </div>
    );
  }
  if (!work) {
    return (
      <div className="cw-page">
        <PageHeader title="Task unavailable" breadcrumb={breadcrumb} />
        <EmptyState title="This task is not available to your account" icon="lock" actions={<button type="button" onClick={() => navigate(data.paths.section('assignments'))}>See your tasks</button>}>
          It may have been removed, or the link belongs to another account. Contact the team if you think this is a mistake.
        </EmptyState>
      </div>
    );
  }

  const due = dueInfo(work.deadline, state === 'complete' || state === 'awaiting_review', new Date(now));
  const open = metrics.notStarted + metrics.drafts + metrics.unsure;
  return (
    <div className={cx('cw-page cw-task-page', editorOpen && 'is-focused')}>
      <PageHeader
        breadcrumb={breadcrumb}
        title={work.title}
        meta={<>
          <span className={cx(due && `cw-due cw-due--${due.tone}`)}><Icon name="clock" className="cw-icon--sm" />{due ? due.label : 'No due date'}</span>
          <span>{pluralise(items.length, 'expression')}</span>
          <span>Assigned {formatDate(work.createdAt)}</span>
        </>}
        actions={<Badge tone={WORK_STATE_META[state].tone}>{WORK_STATE_META[state].label}</Badge>}
      />

      <div className="cw-task-summary">
        <details className="cw-brief" open={briefOpen} onToggle={(event) => setBriefChoice((event.currentTarget as HTMLDetailsElement).open)}>
          <summary><Icon name="doc" /><span>Instructions</span><Icon name="chevron-down" className="cw-brief__chevron" /></summary>
          <div className="cw-brief__body">
            <p className="cw-brief__text">{work.instructions || 'Translate each English expression naturally into Kasem. Add other ways of saying it when more than one is common.'}</p>
            <Facts variant="compact" items={[
              { label: 'Kasem variety', value: work.dialect },
              { label: 'Tone', value: work.tone },
              { label: 'Due', value: work.deadline ? `${formatDate(work.deadline, true)} — guidance, not a cut-off` : 'No due date' },
              { label: 'Help', value: work.helpContact || 'The team member who sent your invitation, or Report a problem below.' },
            ]} />
            <div className="cw-inline-actions">
              <button type="button" className="cw-btn--sm" onClick={() => navigate(data.paths.section('kawuri', { work: work.id, mode: 'explain_assignment' }))}><Icon name="kawuri" className="cw-icon--sm" />Ask Kawuri to explain</button>
              <PortalLink to={guideHref('assignments')} className="cw-text-link">How tasks work</PortalLink>
              <PortalLink to={guideHref('good-contribution')} className="cw-text-link">What makes a good contribution</PortalLink>
            </div>
          </div>
        </details>
        <div className="cw-task-progress" aria-label="Progress">
          <div className="cw-row cw-row--between">
            <strong className="cw-small">{open ? `${open} of ${items.length} to do` : 'Nothing left to translate'}</strong>
            <span className="cw-small cw-muted">{metrics.approved} approved · {metrics.awaiting} awaiting review{metrics.returned ? ` · ${metrics.returned} returned` : ''}</span>
          </div>
          <SegmentBar metrics={metrics} label={`Progress on ${work.title}`} showLegend={false} />
        </div>
      </div>

      {!open && items.length ? (
        <Notice tone={metrics.returned ? 'warning' : 'success'} title={metrics.returned ? 'Some expressions came back for revision' : 'Every expression in this task is submitted'} role="status">
          <p>{metrics.approved} approved · {metrics.awaiting} awaiting review{metrics.returned ? ` · ${metrics.returned} returned` : ''}. {metrics.awaiting ? 'Decisions appear in My submissions and on each expression.' : ''}</p>
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
        onEditingChange={(value) => { setEditing(value); setEditorOpen(value); }}
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
