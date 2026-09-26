import { useEffect, useMemo, useRef, useState } from 'react';
import { useRoute } from '../../router';
import { Card, EmptyNote, Icon, Notice, PageHeader, Skeleton } from '../components';
import { KawuriResultView, useAssist } from '../kawuri';
import { nextContribution } from '../model';
import type { AssistMode } from '../types';
import { useWorkspace } from '../workspace';

const MODES: { id: AssistMode; title: string; body: string; needsItem: boolean }[] = [
  { id: 'explain_assignment', title: 'Explain the instructions', body: 'A plain-language summary of what this assignment asks for, with practical suggestions.', needsItem: false },
  { id: 'context_needed', title: 'What context does this need?', body: 'The meaning and register of the English, any ambiguity, and what a reviewer would want to know.', needsItem: true },
  { id: 'check_draft', title: 'Check my saved draft', body: 'Checks for gaps before you submit — missing translation, missing usage note, unaddressed feedback.', needsItem: true },
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
    <div className="cw-page">
      <PageHeader
        kicker="Kawuri Intelligence"
        title="Kawuri Intelligence"
        id="page-title"
        description="Get help with English meaning, context and assignment instructions."
      />
      <details className="cw-note"><summary>Kawuri suggests; reviewers decide · Learn more</summary>
        <p>Kawuri never writes Kasem for you and never judges your Kasem. Its suggestions are marked as AI and have not been reviewed. Dictionary entries it shows are published, reviewed entries. Nothing Kawuri says is saved to your work.</p>
      </details>

      {data.worksState === 'loading' ? <div className="cw-card"><Skeleton lines={3} label="Loading your assignments" /></div> : noWork ? (
        <EmptyNote title="Nothing to work on yet">Kawuri works from your assignments. It will be available here once you have one.</EmptyNote>
      ) : (
        <div className="cw-kawuri-layout">
          <Card title="What should Kawuri look at?" className="cw-kawuri-context">
            <div className="cw-form-grid">
              <label className="cw-field">
                <span className="cw-field-label">Assignment</span>
                <select value={workId} onChange={(event) => { setWorkId(event.target.value); setItemId(''); setMode(null); reset(); }}>
                  {data.works.map((work) => <option key={work.id} value={work.id}>{work.title}</option>)}
                </select>
              </label>
              <label className="cw-field">
                <span className="cw-field-label">Expression</span>
                <select value={item?.id ?? ''} onChange={(event) => { setItemId(event.target.value); setMode(null); reset(); }} disabled={!items.length}>
                  {items.map((entry) => <option key={entry.id} value={entry.id}>{entry.expression}</option>)}
                </select>
              </label>
            </div>
            <div className="cw-mode-grid" role="group" aria-label="Choose what Kawuri helps with">
              {MODES.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  className="cw-mode"
                  aria-pressed={mode === entry.id}
                  disabled={busy || !workId || (entry.needsItem && !item)}
                  onClick={() => ask(entry.id)}
                >
                  <strong>{entry.title}</strong>
                  <span>{entry.body}</span>
                </button>
              ))}
            </div>
            {item ? (
              <p className="cw-muted">
                Checking uses the last saved draft of this expression. Unsaved changes are checked from the editor with <strong>Check with Kawuri</strong>.{' '}
                <button type="button" className="cw-link-button" onClick={() => navigate(data.paths.work(workId, item.id))}>Open this expression</button>
              </p>
            ) : null}
          </Card>

          <div className="cw-kawuri-output" aria-live="polite" aria-busy={busy}>
            {busy ? <Card><Skeleton lines={5} label="Kawuri is working" /></Card> : null}
            {error ? (
              <Notice tone="warning" title="Kawuri Intelligence is not available right now" action={mode ? <button type="button" onClick={() => ask(mode)}>Try again</button> : undefined}>
                <p>{error.message}</p>
                <p className="cw-muted">If this persists, the backend function <code>kawuriContributorAssist</code> may not be deployed yet. Your work is unaffected.</p>
              </Notice>
            ) : null}
            {!busy && result ? (
              <Card title={MODES.find((entry) => entry.id === result.mode)?.title} meta={result.expression ? `“${result.expression}”` : undefined}>
                <KawuriResultView result={result} guideHref={guideHref} onNavigate={navigate} />
              </Card>
            ) : null}
            {!busy && !result && !error ? (
              <div className="cw-empty cw-kawuri-placeholder">
                <Icon name="kawuri" />
                <strong>Choose what you would like help with</strong>
                <p>Answers appear here, split into checks, reviewed sources and AI suggestions you can dismiss.</p>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
