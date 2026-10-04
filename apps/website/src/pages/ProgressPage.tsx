import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from '../app/router';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { ROUTES_BY_PATH } from '../content/navigation';
import { HorizontalTank } from '../features/progress/HorizontalTank';
import { ProgressDialog } from '../features/progress/ProgressDialog';
import { VerticalJar } from '../features/progress/VerticalJar';
import { DEFAULT_PRODUCTION_CONFIG } from '../features/progress/progressConfig';
import { fetchLiveLaunchProgress } from '../features/progress/progressData';
import type { CategoryProgress, ProgressState, VesselViewMode } from '../features/progress/progressTypes';
import { useProgressMotion } from '../features/progress/useProgressMotion';
import { useDocumentMeta } from '../lib/useDocumentMeta';

const VIEW_MODE_STORAGE_KEY = 'iw_progress_vessel_view_mode';
type InformationPanel = 'methodology' | 'launch' | 'contribute' | null;
const route = ROUTES_BY_PATH.progress;

export function ProgressPage() {
  useDocumentMeta(route.title, route.description);
  const { isMotionPaused, prefersReducedMotion, toggleMotionPause, canAnimate } = useProgressMotion();
  const [viewMode, setViewMode] = useState<VesselViewMode>(() => {
    try {
      const stored = localStorage.getItem(VIEW_MODE_STORAGE_KEY);
      if (stored === 'vertical' || stored === 'horizontal') return stored;
    } catch { /* The default view works without browser storage. */ }
    return 'vertical';
  });
  const [panel, setPanel] = useState<InformationPanel>(null);
  const [selectedCategory, setSelectedCategory] = useState<CategoryProgress | null>(null);
  const [state, setState] = useState<ProgressState>({
    status: 'loading', categories: [], launchConfig: DEFAULT_PRODUCTION_CONFIG,
    lastUpdated: null, targetsReachedCount: 0, totalWithTargetsCount: 0, fixtureMode: false,
  });
  const requestId = useRef(0);
  const loadData = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setState((previous) => ({ ...previous, status: 'loading' }));
    try {
      const result = await fetchLiveLaunchProgress();
      if (requestId.current === currentRequest) {
        setState((previous) => result.status === 'error'
          ? { ...previous, status: 'error', error: result.error || 'Verified counts are unavailable. Please retry.' }
          : result);
      }
    } catch {
      if (requestId.current === currentRequest) {
        setState((previous) => ({ ...previous, status: 'error', error: 'Verified counts are unavailable. Please retry.' }));
      }
    }
  }, []);
  useEffect(() => {
    void loadData();
    return () => { requestId.current += 1; };
  }, [loadData]);
  const changeView = (mode: VesselViewMode) => {
    setViewMode(mode);
    try { localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode); } catch { /* Optional preference. */ }
  };
  const closeDialog = useCallback(() => { setPanel(null); setSelectedCategory(null); }, []);
  const dialogTitle = selectedCategory?.category.title ?? (
    panel === 'methodology' ? 'How progress is counted' : panel === 'launch' ? 'About our launch' : 'Help fill a jar'
  );
  const lastUpdated = state.lastUpdated ? new Date(state.lastUpdated) : null;
  const hasValidUpdate = lastUpdated && !Number.isNaN(lastUpdated.getTime());

  return (
    <div className={`progress-stage ${canAnimate ? 'progress-stage--animated' : 'progress-stage--static'}`}>
      <div className="progress-stage__aura progress-stage__aura--warm" aria-hidden="true" />
      <div className="progress-stage__aura progress-stage__aura--cool" aria-hidden="true" />
      <div className="progress-stage__content">
        <div className="progress-topbar">
          <Link to="home" className="progress-back"><span aria-hidden="true">←</span> Back to website</Link>
          <span className="progress-topbar__brand">INDIGEN WORLD <span> / COMMUNITY PROGRESS</span></span>
          <button type="button" className="progress-contribute-button" onClick={() => setPanel('contribute')} aria-haspopup="dialog">
            Contribute <Icon name="arrow" size={16} />
          </button>
        </div>
        <section className="progress-heading" aria-labelledby="progress-title">
          <div>
            <p className="progress-eyebrow">Small contributions. A shared future.</p>
            <h1 id="progress-title">Help fill the jars<span>.</span></h1>
            <p className="progress-heading__intro">Watch our language and culture grow.</p>
          </div>
          <div className="progress-heading__summary">
            <button type="button" className="progress-window-pill" onClick={() => setPanel('launch')} aria-haspopup="dialog">
              <span className="progress-window-pill__dot" aria-hidden="true" />
              {state.launchConfig.launchWindowLabel}<span aria-hidden="true">↗</span>
            </button>
            <span className="progress-stats-pill">
              {state.totalWithTargetsCount > 0
                ? `${state.targetsReachedCount} of ${state.totalWithTargetsCount} targets reached`
                : '10 ways to preserve our heritage'}
            </span>
          </div>
        </section>
        <div className="progress-controls-bar">
          <div className="segmented-switch-group" role="group" aria-label="Vessel layout view">
            <button type="button" className={`segmented-switch-btn ${viewMode === 'vertical' ? 'is-active' : ''}`} aria-label="Vertical jars" aria-pressed={viewMode === 'vertical'} onClick={() => changeView('vertical')}>
              <Icon name="volume" size={16} /> Jars
            </button>
            <button type="button" className={`segmented-switch-btn ${viewMode === 'horizontal' ? 'is-active' : ''}`} aria-label="Horizontal tanks" aria-pressed={viewMode === 'horizontal'} onClick={() => changeView('horizontal')}>
              <Icon name="layers" size={16} /> Tanks
            </button>
          </div>
          <div className="progress-actions-group">
            <button type="button" className="control-toggle-btn" onClick={() => setPanel('methodology')} aria-haspopup="dialog">How it works</button>
            <button type="button" className={`control-toggle-btn ${isMotionPaused ? 'is-active' : ''}`} onClick={toggleMotionPause} aria-pressed={isMotionPaused}>
              <Icon name={isMotionPaused ? 'play' : 'pause'} size={14} /> {isMotionPaused ? 'Resume' : 'Pause motion'}
            </button>
            <button type="button" className="control-toggle-btn" onClick={() => void loadData()} disabled={state.status === 'loading'} aria-label="Refresh verified contribution counts">
              <Icon name="arrow" size={14} /> Refresh
            </button>
          </div>
        </div>
        <div className="progress-status-line" role="status" aria-live="polite">
          {state.status === 'loading' ? 'Loading verified contribution counts…' : null}
          {state.status === 'stale' ? 'Cached counts · reconnect to update.' : null}
          {state.status === 'ready' ? <><span className="progress-live-dot" aria-hidden="true" /> Verified contribution counts</> : null}
          {hasValidUpdate && state.status !== 'loading' ? <time dateTime={state.lastUpdated!}>Updated {lastUpdated.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</time> : null}
          {prefersReducedMotion ? <span className="progress-reduced-motion">Reduced motion enabled</span> : null}
        </div>
        {state.status === 'error' ? (
          <div className="progress-error" role="alert">
            <div><strong>{state.error}</strong><p>{state.categories.length > 0 ? 'The previous counts remain visible below.' : 'No counts are shown until they can be verified.'}</p></div>
            <button type="button" className="control-toggle-btn" onClick={() => void loadData()}>Retry</button>
          </div>
        ) : null}
        <section aria-label="Heritage contribution progress" className={`vessels-gallery vessels-gallery--${viewMode}`}>
          {state.categories.map((progress, index) => viewMode === 'vertical'
            ? <VerticalJar key={progress.category.id} progress={progress} canAnimate={canAnimate} staggerIndex={index} onInfo={setSelectedCategory} />
            : <HorizontalTank key={progress.category.id} progress={progress} canAnimate={canAnimate} staggerIndex={index} onInfo={setSelectedCategory} />)}
        </section>
        <div className="progress-stage__footnote">
          <span>Every reviewed contribution makes a difference.</span>
          <button type="button" onClick={() => setPanel('launch')} aria-haspopup="dialog">About the launch <span aria-hidden="true">↗</span></button>
        </div>
      </div>
      <ProgressDialog isOpen={panel !== null || selectedCategory !== null} title={dialogTitle} onClose={closeDialog}>
        {selectedCategory ? <>
          <p className="progress-dialog__lead">{selectedCategory.category.description}</p>
          <h3>What counts?</h3><p>{selectedCategory.category.explanation}</p>
          <h3>Launch target</h3>
          <p>{selectedCategory.target === null ? 'This target is being agreed with the community. No target percentage is implied until it is set.' : `${selectedCategory.approvedCount.toLocaleString()} approved ${selectedCategory.category.unitPlural} toward a target of ${selectedCategory.target.toLocaleString()}.`}</p>
          {selectedCategory.awaitingReviewCount != null && selectedCategory.awaitingReviewCount > 0 ? <p>{selectedCategory.awaitingReviewCount.toLocaleString()} awaiting review. These do not fill the vessel until approved.</p> : null}
          <Button href={selectedCategory.category.ctaUrl} external>{selectedCategory.category.ctaLabel}</Button>
        </> : null}
        {panel === 'methodology' ? <>
          <p className="progress-dialog__lead">The liquid shows approved contributions against each category’s launch target.</p>
          <h3>Reviewed work fills the vessels</h3><p>Pending submissions count only after review. Words, expressions, proverbs and recordings keep their own categories and counting rules.</p>
          <h3>Colour follows progress</h3><p>As a vessel fills, the liquid moves from red through yellow and blue to green, with more bubbles. Empty vessels have no liquid. A target that is still being set has no percentage or implied fill level.</p>
          <h3>Honest targets and counts</h3><p>Targets can be updated as the community agrees its milestones. Counts can be unavailable or cached when the service cannot refresh them. A failed refresh keeps the previously loaded view until you can retry.</p>
          <h3>Privacy matters</h3><p>This page uses aggregate counts. Private contributor details, notes and unpublished cultural material are not downloaded into the public page.</p>
        </> : null}
        {panel === 'launch' ? <>
          <p className="progress-dialog__lead">{state.launchConfig.launchWindowLabel}</p>
          <p>This is a planned launch window. Community review and readiness guide the release; the progress page does not guarantee a launch date.</p>
          <p>Each vessel represents a different contribution category. An agreed target lets you see the percentage ready for launch; “Target being set” means that milestone is still being agreed.</p>
          {state.launchConfig.notes ? <p>{state.launchConfig.notes}</p> : null}
          <Button type="button" onClick={() => setPanel('contribute')}>Find a way to contribute</Button>
        </> : null}
        {panel === 'contribute' ? <>
          <p className="progress-dialog__lead">A word, an everyday expression or a recording can help preserve Kasem for the next generation.</p>
          <p>Choose a category’s contribution button to open its workflow in TribeStudio. Add the meaning, context and source; a reviewer checks it before it becomes public.</p>
          <div className="progress-dialog__actions">
            <Button href="https://tribestudio.indigenworld.com/studio/expressions" external>Share an expression</Button>
            <Button to="contribute" variant="secondary">Contribution guide</Button>
          </div>
        </> : null}
      </ProgressDialog>
    </div>
  );
}
export default ProgressPage;
