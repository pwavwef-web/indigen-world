import { useEffect, useMemo, useState } from 'react';
import { useRoute } from '../../router';
import { Chip, EmptyNote, Icon, Notice, PageHeader, SegmentBar, Skeleton, useNow } from '../components';
import { WORK_STATE_META, dueInfo, formatDate, metricsFor, pluralise, workState } from '../model';
import { ContributionWorkspace } from '../editor';
import { KawuriDraftCheck } from '../kawuri';
import { ContributorIssues } from '../ContributorIssues';
import { Badge, Facts } from '../../ui';
import { PortalLink, useShared, useWorkspace } from '../workspace';

const DUE_TONE: Record<string, 'neutral' | 'warning' | 'danger' | 'info'> = { danger: 'danger', warning: 'warning', neutral: 'neutral', info: 'info' };

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
  const [editorOpen, setEditorOpen] = useState(Boolean(itemId));
  useEffect(() => { if (editorOpen && window.matchMedia('(max-width: 760px)').matches) requestAnimationFrame(() => document.querySelector('.cw-editor__head')?.scrollIntoView({ block: 'start' })); }, [editorOpen]);
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
      <Icon name="chevron" className="ts-faint" />
      <span aria-current="page">{work?.title ?? 'Assignment'}</span>
    </>
  );

  if (data.worksState === 'loading' || (work && !data.items[workId] && data.itemsState !== 'error')) {
    return <div className="ts-page"><PageHeader title="Loading assignment…" breadcrumb={breadcrumb} id="page-title" /><div className="ts-panel"><Skeleton lines={6} label="Loading assignment" /></div></div>;
  }
  if (data.worksState === 'error' || data.itemsState === 'error') {
    return (
      <div className="ts-page">
        <PageHeader title="Assignment" breadcrumb={breadcrumb} id="page-title" />
        <Notice tone="danger" title="This assignment could not be loaded" action={<button type="button" className="ts-btn ts-btn--sm" onClick={() => window.location.reload()}><Icon name="refresh" /><span>Reload</span></button>}>
          <p>Check your connection. Drafts you have already saved are safe on the server.</p>
        </Notice>
      </div>
    );
  }
  if (!work) {
    return (
      <div className="ts-page">
        <PageHeader title="Assignment unavailable" breadcrumb={breadcrumb} id="page-title" />
        <EmptyNote title="This assignment is not available to your account" icon="lock" action={<button type="button" className="ts-btn ts-btn--primary" onClick={() => navigate(data.paths.section('assignments'))}><span>See your assignments</span></button>}>
          It may have been removed, or the link belongs to another account. Contact the team if you think this is a mistake.
        </EmptyNote>
      </div>
    );
  }

  const due = dueInfo(work.deadline, state === 'complete' || state === 'awaiting_review', new Date(now));
  const open = metrics.notStarted + metrics.drafts + metrics.unsure;
  return (
    <div className={`ts-page cw-assignment-page${editorOpen ? ' cw-task-focused' : ''}`}>
      <PageHeader
        breadcrumb={breadcrumb}
        title={work.title}
        id="page-title"
        meta={<>
          {due ? <Badge tone={DUE_TONE[due.tone] ?? 'neutral'} dot>{due.label}</Badge> : <Badge>No due date</Badge>}
          <span>{pluralise(items.length, 'expression')}</span>
          <span>Assigned {formatDate(work.createdAt)}</span>
        </>}
        actions={<Chip tone={WORK_STATE_META[state].tone}>{WORK_STATE_META[state].label}</Chip>}
      />

      <div className="cw-brief">
        <details className="ts-disclosure cw-instructions" open={instructionsOpen} onToggle={(event) => setInstructionsChoice((event.currentTarget as HTMLDetailsElement).open)}>
          <summary><Icon name="doc" /><span>Instructions and guidance<small>{work.dialect ? `${work.dialect} · ` : ''}{work.tone || 'Natural, everyday Kasem'}</small></span><Icon name="chevron" className="ts-disclosure__chev" /></summary>
          <div className="ts-disclosure__body">
            <p>{work.instructions || 'Translate each English expression naturally into Kasem. Add alternatives when more than one expression is common.'}</p>
            <Facts items={[
              { label: 'Kasem variety', value: work.dialect, hidden: !work.dialect },
              { label: 'Tone', value: work.tone, hidden: !work.tone },
              { label: 'Due', value: work.deadline ? `${formatDate(work.deadline, true)} — guidance, not a cut-off` : 'No due date' },
              { label: 'Help', value: work.helpContact || 'The team member who invited you, or Report a problem.' },
            ]} />
            <div className="ts-cluster">
              <button type="button" className="ts-btn ts-btn--soft ts-btn--sm" onClick={() => navigate(data.paths.section('kawuri', { work: work.id, mode: 'explain_assignment' }))}><Icon name="kawuri" /><span>Ask Kawuri to explain</span></button>
              <PortalLink to={guideHref('assignments')} className="ts-link">How assignments work</PortalLink>
              <PortalLink to={guideHref('good-contribution')} className="ts-link">What makes a good contribution</PortalLink>
            </div>
          </div>
        </details>
        <div className="ts-panel ts-panel--tight cw-progress-card">
          <div className="ts-row ts-row--between" style={{ flexWrap: 'wrap' }}>
            <strong style={{ fontSize: 'var(--fs-sm)' }}>{metrics.approved} approved · {metrics.awaiting} awaiting · {metrics.returned} to revise</strong>
            <span className="ts-muted" style={{ fontSize: 'var(--fs-xs)' }}>{open ? `${open} still to do` : 'Nothing left to translate'}</span>
          </div>
          <SegmentBar metrics={metrics} label={`Progress on ${work.title}`} showLegend={false} />
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
