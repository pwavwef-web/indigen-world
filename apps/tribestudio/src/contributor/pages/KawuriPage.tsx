import { useEffect, useMemo, useRef, useState } from 'react';
import { useRoute } from '../../router';
import { Card, EmptyNote, Notice, PageHeader, Skeleton } from '../components';
import { KawuriResultView, useAssist } from '../kawuri';
import { nextContribution } from '../model';
import type { AssistMode } from '../types';
import { Icon, type IconName } from '../../ui';
import { useWorkspace } from '../workspace';

const MODES: { id: AssistMode; title: string; body: string; needsItem: boolean; icon: IconName }[] = [
  { id: 'explain_assignment', title: 'Explain the instructions', body: 'A clear starting point for this assignment.', needsItem: false, icon: 'doc' },
  { id: 'context_needed', title: 'What context does this need?', body: 'Meaning, tone and who says it to whom.', needsItem: true, icon: 'compass' },
  { id: 'check_draft', title: 'Check my saved draft', body: 'Missing details to add before sending.', needsItem: true, icon: 'check-circle' },
];

/**
 * Kawuri Intelligence as a contributor assistant. It works from the
 * contributor's own assignment and saved draft, labels which parts are rules,
 * reviewed sources and AI suggestions, and never changes a contribution.
 */
export function KawuriPage({ initialWork, initialItem, initialMode }: { initialWork: string; initialItem: string; initialMode: string }) {
  const data = useWorkspace();
  const { navigate } = useRoute();
  const [workId, setWorkId] = useState(() => (data.works.some((work) => work.id === initialWork) ? initialWork : data.works[0]?.id ?? ''));
  const items = useMemo(() => data.items[workId] ?? [], [data.items, workId]);
  const [itemId, setItemId] = useState(initialItem);
  const item = items.find((entry) => entry.id === itemId) ?? nextContribution(items) ?? items[0];
  const { result, error, busy, run, reset } = useAssist(data.services.assist);
  const [mode, setMode] = useState<AssistMode | null>(null);
  const autoRan = useRef(false);
  const guideHref = (section: string) => data.paths.section('guide', { section });

  useEffect(() => {
    if (!workId && data.works[0]) setWorkId(initialWork && data.works.some((work) => work.id === initialWork) ? initialWork : data.works[0].id);
  }, [data.works, initialWork, workId]);

  const ask = (next: AssistMode) => {
    if (!workId) return;
    setMode(next);
    void run({
      mode: next,
      work: workId,
      ...(next !== 'explain_assignment' && item ? { item: item.id } : {}),
      ...(next === 'check_draft' && item ? { draft: { translation: item.translation, alternatives: item.alternatives, context: item.context ?? '' } } : {}),
    });
  };

  useEffect(() => {
    if (autoRan.current || !workId || !MODES.some((entry) => entry.id === initialMode)) return;
    if (initialMode !== 'explain_assignment' && !item) return;
    autoRan.current = true;
    ask(initialMode as AssistMode);
  }, [initialMode, workId, item?.id]);

  const noWork = data.worksState === 'ready' && data.works.length === 0;
  return (
    <div className="ts-page">
      <PageHeader
        kicker="Help"
        title="Kawuri assistance"
        id="page-title"
        description="Explore the English, find the context, then write your own Kasem. Kawuri never writes or judges your Kasem and never changes your work."
      />

      {data.worksState === 'loading' ? <div className="ts-panel"><Skeleton lines={3} label="Loading your assignments" /></div> : noWork ? (
        <EmptyNote title="Nothing to work on yet" icon="kawuri">Kawuri works from your assignments. It will be available here once you have one.</EmptyNote>
      ) : (
        <div className="cw-kawuri">
          <aside className="ts-stack cw-kawuri__controls">
            <Card title="What should Kawuri look at?">
              <div className="ts-stack ts-stack--md">
                <label className="ts-field">
                  <span className="ts-label">Assignment</span>
                  <select className="ts-select" value={workId} onChange={(event) => { setWorkId(event.target.value); setItemId(''); setMode(null); reset(); }}>
                    {data.works.map((work) => <option key={work.id} value={work.id}>{work.title}</option>)}
                  </select>
                </label>
                <label className="ts-field">
                  <span className="ts-label">Expression</span>
                  <select className="ts-select" value={item?.id ?? ''} onChange={(event) => { setItemId(event.target.value); setMode(null); reset(); }} disabled={!items.length}>
                    {items.map((entry) => <option key={entry.id} value={entry.id}>{entry.expression}</option>)}
                  </select>
                </label>
                <div className="cw-modes" role="group" aria-label="Choose what Kawuri helps with">
                  {MODES.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      className="ts-card ts-card--interactive cw-mode"
                      aria-pressed={mode === entry.id}
                      disabled={busy || !workId || (entry.needsItem && !item)}
                      onClick={() => ask(entry.id)}
                    >
                      <span className="ts-row">
                        <span className="ts-card__icon" aria-hidden="true"><Icon name={entry.icon} /></span>
                        <span className="ts-stack" style={{ ['--gap' as string]: '0.1rem' }}>
                          <strong className="ts-card__title">{entry.title}</strong>
                          <span className="ts-card__body">{entry.body}</span>
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
                {item ? (
                  <p className="ts-hint">
                    Checking uses the last <strong>saved</strong> draft. For unsaved text, use <strong>Check with Kawuri</strong> in the editor.{' '}
                    <button type="button" className="ts-link" style={{ fontSize: 'inherit' }} onClick={() => navigate(data.paths.work(workId, item.id))}>Open this expression</button>
                  </p>
                ) : null}
              </div>
            </Card>
          </aside>
          <div className="ts-stack" aria-live="polite" aria-busy={busy}>
            {busy ? <Card title={MODES.find((entry) => entry.id === mode)?.title}><div className="cw-kawuri-thinking"><span className="ts-spinner ts-spinner--sm" aria-hidden="true" /><span>Kawuri is reading the assignment, the published dictionary and the guide…</span></div><Skeleton lines={5} label="Kawuri is working" /></Card> : null}
            {error ? (
              <Notice tone="warning" title="Kawuri Intelligence is not available right now" action={mode ? <button type="button" className="ts-btn ts-btn--sm" onClick={() => ask(mode)}><Icon name="refresh" /><span>Try again</span></button> : undefined}>
                <p>{error.message}</p>
                <p className="ts-muted">Try again later or contact the team. Your saved work is unaffected.</p>
              </Notice>
            ) : null}
            {!busy && result ? (
              <Card title={MODES.find((entry) => entry.id === result.mode)?.title} meta={result.expression ? `“${result.expression}”` : undefined}>
                <KawuriResultView result={result} guideHref={guideHref} onNavigate={navigate} />
              </Card>
            ) : null}
            {!busy && !result && !error ? (
              <div className="ts-panel ts-panel--dashed cw-kawuri-legend">
                <div className="ts-empty ts-empty--compact">
                  <span className="ts-empty__icon" aria-hidden="true"><Icon name="kawuri" /></span>
                  <p className="ts-empty__title">Choose what to ask</p>
                  <p className="ts-empty__body">Every answer comes in three labelled parts, so you always know what you are reading:</p>
                </div>
                <ul className="cw-kawuri-parts">
                  <li><span className="cw-kawuri-part cw-kawuri-part--rules"><Icon name="check" /></span><strong>Checks</strong><small>Rules the workspace applies. No AI.</small></li>
                  <li><span className="cw-kawuri-part cw-kawuri-part--sources"><Icon name="shield" /></span><strong>Sources</strong><small>Your assignment, the published dictionary, the guide.</small></li>
                  <li><span className="cw-kawuri-part cw-kawuri-part--ai"><Icon name="spark" /></span><strong>Suggestions</strong><small>AI, not reviewed. Dismiss anything unhelpful.</small></li>
                </ul>
              </div>
            ) : null}
          </div>

        </div>
      )}
    </div>
  );
}
