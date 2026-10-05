/** Full-screen community progress: TribeStudio pumps verified contributions into each collection's vessel. */

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useDocumentMeta } from '../lib/useDocumentMeta';
import { ROUTES_BY_PATH } from '../content/navigation';
import { Link } from '../app/router';
import { ProgressPopup } from '../features/progress/ProgressDialog';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { BrandMark } from '../components/BrandMark';
import { useProgressMotion } from '../features/progress/useProgressMotion';
import { useLiveProgress } from '../features/progress/useLiveProgress';
import { useApprovalFlows } from '../features/progress/useApprovalFlows';
import { approvalLabel, type FreshApproval } from '../features/progress/liveProgressModel';
import { formatCount } from '../features/progress/progressFormat';
import { VerticalJar } from '../features/progress/VerticalJar';
import { HorizontalTank } from '../features/progress/HorizontalTank';
import { CulturalPot } from '../features/progress/CulturalPot';
import { TribePump } from '../features/progress/TribePump';
import { PipeNetwork } from '../features/progress/PipeNetwork';
import { ConnectionStatus } from '../features/progress/ConnectionStatus';
import { ProgressDataTable } from '../features/progress/ProgressDataTable';
import { CategoryBreakdownModal } from '../features/progress/CategoryBreakdownModal';
import { PledgeModal } from '../features/progress/PledgeModal';
import { ShareVesselModal } from '../features/progress/ShareVesselModal';
import { AuditQueryModal } from '../features/progress/AuditQueryModal';
import { playVesselChime } from '../features/progress/progressAudio';
import {
  CATEGORIES_BY_ID,
  COMMUNITY_CONTRIBUTOR_HONORS,
  HISTORICAL_MILESTONES,
} from '../features/progress/progressConfig';
import { buildProgressList, calculateProjectedDays, calculateTargetsSummary } from '../features/progress/progressCalculation';
import type {
  CategoryProgress,
  ContributionCategoryId,
  VesselViewMode,
} from '../features/progress/progressTypes';

const VIEW_MODE_STORAGE_KEY = 'iw_progress_vessel_view_mode';
/** Screen readers hear at most one approval summary in this window. */
const ANNOUNCE_WINDOW_MS = 8000;
const route = ROUTES_BY_PATH.progress ?? {
  title: 'Our Progress · Help Fill the Jars',
  description: 'Track community contributions bringing Indigen World closer to our planned December/January launch.',
  path: 'progress',
};

const VIEW_LABELS: Record<VesselViewMode, { short: string; long: string; icon: 'volume' | 'layers' | 'source' | 'context' }> = {
  vertical: { short: 'Jars', long: 'Vertical jars', icon: 'volume' },
  horizontal: { short: 'Tanks', long: 'Horizontal tanks', icon: 'layers' },
  cultural: { short: 'Local pots', long: 'Traditional pots', icon: 'source' },
  table: { short: 'Table', long: 'Data table', icon: 'context' },
};
const VIEW_MODES = ['vertical', 'horizontal', 'cultural', 'table'] as const;

/** Which collections are on screen right now, without re-rendering as the page scrolls. */
function useVisibleCategories(rootRef: RefObject<HTMLElement | null>, key: string) {
  const visible = useRef(new Set<string>());
  useEffect(() => {
    const root = rootRef.current;
    visible.current = new Set();
    if (!root || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const id = (entry.target as HTMLElement).dataset.category;
        if (!id) continue;
        if (entry.isIntersecting) visible.current.add(id);
        else visible.current.delete(id);
      }
    }, { threshold: 0.35 });
    root.querySelectorAll('[data-category]').forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [rootRef, key]);
  return useCallback((id: ContributionCategoryId) => visible.current.has(id), []);
}

/** Decorative motion pauses while the vessels are scrolled out of view. */
function useInView(ref: RefObject<HTMLElement | null>) {
  const [inView, setInView] = useState(true);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { rootMargin: '80px' });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return inView;
}

export function ProgressPage() {
  useDocumentMeta(route.title, route.description);

  const { isMotionPaused, prefersReducedMotion, toggleMotionPause, canAnimate } = useProgressMotion();

  // Persistent view preference: 'vertical' | 'horizontal' | 'cultural' | 'table'
  const [viewMode, setViewMode] = useState<VesselViewMode>(() => {
    try {
      const stored = localStorage.getItem(VIEW_MODE_STORAGE_KEY);
      if (stored === 'vertical' || stored === 'horizontal' || stored === 'cultural' || stored === 'table') {
        return stored;
      }
    } catch {
      // Default to vertical
    }
    return 'vertical';
  });

  // Fixture mode toggle: inspect sample targets in dev without fabricating data
  const [useFixtures, setUseFixtures] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [popup, setPopup] = useState<'view' | 'settings' | 'pace' | 'milestones' | 'honors' | 'about' | 'contribute' | 'simulate' | null>(null);
  const [breakdownProgress, setBreakdownProgress] = useState<CategoryProgress | null>(null);
  const [pledgeProgress, setPledgeProgress] = useState<CategoryProgress | null>(null);
  const [shareProgress, setShareProgress] = useState<CategoryProgress | null>(null);
  const [auditProgress, setAuditProgress] = useState<CategoryProgress | null>(null);
  const [paceCategoryId, setPaceCategoryId] = useState<string>('lexicon');
  const [pageHidden, setPageHidden] = useState(() => typeof document !== 'undefined' && document.hidden);
  const [announcement, setAnnouncement] = useState('');
  const [sessionPledges, setSessionPledges] = useState<Partial<Record<ContributionCategoryId, number>>>({});

  const stageRef = useRef<HTMLDivElement>(null);
  const galleryRef = useRef<HTMLDivElement>(null);
  const scrollGallery = (direction: number) => galleryRef.current?.scrollBy({ left: direction * galleryRef.current.clientWidth * 0.85, behavior: canAnimate ? 'smooth' : 'instant' });

  useEffect(() => {
    const onVisibility = () => setPageHidden(document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  const hasPipes = viewMode === 'vertical' || viewMode === 'horizontal';
  const stageInView = useInView(stageRef);
  const decorativeMotion = canAnimate && stageInView;
  const flows = useApprovalFlows({ travel: canAnimate && hasPipes, cues: !pageHidden });
  // Filled in once the vessels exist (they mount when the first numbers arrive).
  const isVisibleRef = useRef<(id: ContributionCategoryId) => boolean>(() => false);

  // Polite, batched announcements: one sentence for a burst, never one per particle.
  const announceRef = useRef<{ pending: Map<ContributionCategoryId, { delta: number; total: number }>; timer: number | undefined; last: number }>({ pending: new Map(), timer: undefined, last: 0 });
  const announce = useCallback((approvals: FreshApproval[]) => {
    const state = announceRef.current;
    for (const approval of approvals) {
      const previous = state.pending.get(approval.category);
      state.pending.set(approval.category, { delta: (previous?.delta ?? 0) + approval.delta, total: approval.totalAfter });
    }
    if (state.timer !== undefined) return;
    const wait = Math.max(1200, state.last + ANNOUNCE_WINDOW_MS - Date.now());
    state.timer = window.setTimeout(() => {
      // The new total keeps two similar announcements distinct, so both are read.
      const parts = [...state.pending.entries()].map(([id, { delta, total }]) => `${CATEGORIES_BY_ID[id].title} ${approvalLabel(delta, id)}, now ${formatCount(total)}`);
      state.pending.clear();
      state.timer = undefined;
      state.last = Date.now();
      if (parts.length) setAnnouncement(`New contributions: ${parts.join(', ')}.`);
    }, wait);
  }, []);
  useEffect(() => () => window.clearTimeout(announceRef.current.timer), []);

  const flowsRef = useRef(flows);
  flowsRef.current = flows;
  const soundRef = useRef(soundEnabled);
  soundRef.current = soundEnabled;
  const handleApprovals = useCallback((approvals: FreshApproval[]) => {
    flowsRef.current.push(approvals, (id) => isVisibleRef.current(id));
    announce(approvals);
    if (soundRef.current && !document.hidden) playVesselChime();
  }, [announce]);

  const live = useLiveProgress({ fixtureMode: import.meta.env.DEV && useFixtures, onApprovals: handleApprovals });
  isVisibleRef.current = useVisibleCategories(stageRef, `${viewMode}|${live.hasData}|${live.fixtureMode}`);

  const categories = useMemo(() => {
    const list = buildProgressList(live.totals, live.config, undefined, live.fixtureMode);
    return list.map((item) => ({ ...item, pledgeCount: item.pledgeCount + (sessionPledges[item.category.id] ?? 0) }));
  }, [live.totals, live.config, live.fixtureMode, sessionPledges]);
  const summary = calculateTargetsSummary(categories);
  const knownCount = categories.filter((item) => item.isCountKnown).length;

  const handleViewModeChange = useCallback((mode: VesselViewMode) => {
    // A transient flow belongs to the view it started in; the next view shows the true snapshot.
    flowsRef.current.cancelAll();
    setViewMode(mode);
    if (soundRef.current) playVesselChime();
    try { localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode); } catch { /* Optional preference. */ }
  }, []);

  // Keyboard shortcut listener: Alt+T toggles accessible table view
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.querySelector('dialog[open]')) return;
      if (e.altKey && (e.key === 't' || e.key === 'T')) {
        e.preventDefault();
        handleViewModeChange(viewMode === 'table' ? 'vertical' : 'table');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [viewMode, handleViewModeChange]);

  const handleToggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    if (next) playVesselChime();
  };

  const handlePledgeSubmitted = (categoryId: string, amount: number) => {
    if (soundEnabled) playVesselChime();
    setSessionPledges((current) => ({ ...current, [categoryId]: (current[categoryId as ContributionCategoryId] ?? 0) + amount }));
  };
  const closePopup = () => setPopup(null);
  const handlePrintBulletin = () => { closePopup(); window.setTimeout(() => window.print(), 0); };
  const selectedPaceCategory = categories.find((category) => category.category.id === paceCategoryId) || categories[0];
  const projectedDays = selectedPaceCategory ? calculateProjectedDays(selectedPaceCategory.approvedCount, selectedPaceCategory.target, selectedPaceCategory.velocityWeek) : null;
  const viewLabel = VIEW_LABELS[viewMode].long;
  const showVessels = live.hasData;
  const vesselHandlers = {
    onOpenBreakdown: setBreakdownProgress,
    onOpenShare: setShareProgress,
    onOpenAudit: setAuditProgress,
    onOpenPledge: setPledgeProgress,
  };
  const vesselState = (progress: CategoryProgress) => ({
    fillCount: flows.held[progress.category.id] ?? null,
    arrival: flows.arrivals[progress.category.id] ?? null,
  });

  return (
    <div className="progress-immersive progress-observatory" data-motion={canAnimate ? 'animated' : 'static'}>
      <div className="observatory-atmosphere" aria-hidden="true"><span /><span /><span /></div>
      <header className="progress-immersive-header">
        <div className="progress-immersive-nav">
          <Link to="home" className="observatory-brand" aria-label="Back to website"><BrandMark /><span>Indigen<strong>World</strong></span></Link>
          <div className="progress-actions-group">
            <button type="button" className="control-toggle-btn" aria-haspopup="dialog" onClick={() => setPopup('settings')}>
              <Icon name="context" size={14} /> Options
            </button>
            <button type="button" className={`control-toggle-btn motion-control ${isMotionPaused ? 'is-active' : ''}`} onClick={toggleMotionPause} aria-pressed={isMotionPaused} aria-label={isMotionPaused ? 'Resume motion' : 'Pause motion'} title={isMotionPaused ? 'Resume motion' : 'Pause motion'}>
              <Icon name={isMotionPaused ? 'play' : 'pause'} size={14} /><span>{isMotionPaused ? 'Resume motion' : 'Pause motion'}</span>
            </button>
          </div>
        </div>
        <div className="progress-immersive-heading">
          <p className="eyebrow"><span className="observatory-live-dot" /> KASEM · LIVING HERITAGE</p>
          <h1>Help fill <em>the jars.</em></h1>
          <p className="observatory-intro">Every contribution moves us closer.</p>
          <div className="progress-hero-summary">
            <span className="progress-stats-pill">{showVessels && summary.totalWithTargets > 0 ? <><strong>{summary.reachedCount} / {summary.totalWithTargets}</strong> targets reached</> : '10 contribution categories'}</span>
            {prefersReducedMotion && <span className="progress-summary-badge">Reduced motion</span>}
          </div>
        </div>
        <div className="observatory-toolbar">
          <div className="observatory-views" role="group" aria-label="Progress view">
            {VIEW_MODES.map(mode => <button key={mode} type="button" aria-pressed={viewMode === mode} onClick={() => handleViewModeChange(mode)}>
              <Icon name={VIEW_LABELS[mode].icon} size={14} />
              {VIEW_LABELS[mode].short}
            </button>)}
          </div>
          <button className="observatory-text-button" type="button" aria-haspopup="dialog" onClick={() => setPopup('about')}><Icon name="check" size={14} /> Verified contributions <Icon name="context" size={13} /></button>
        </div>
      </header>

      <section className="progress-immersive-stage" id="vessels-section" aria-label="Community contribution progress">
        <div className="container">
          <div className="observatory-gallery-heading"><span>{viewLabel}<small> / {String(categories.length).padStart(2, '0')} COLLECTIONS</small></span>
            {viewMode === 'cultural' && <div className="observatory-gallery-controls"><button type="button" onClick={() => scrollGallery(-1)} aria-label="Previous collections"><span aria-hidden="true">←</span></button><button type="button" onClick={() => scrollGallery(1)} aria-label="Next collections"><span aria-hidden="true">→</span></button></div>}
          </div>
          {!showVessels && live.connection !== 'error' && live.connection !== 'offline' && <p className="progress-status" role="status">Loading contribution counts…</p>}
          {!showVessels && (live.connection === 'error' || live.connection === 'offline') && (
            <div className="callout callout--warn" role="alert">
              <strong>{live.connection === 'offline' ? 'You are offline. Verified counts will load when you reconnect.' : live.error ?? 'Verified counts are unavailable right now.'}</strong>
              <Button type="button" onClick={live.refresh} variant="secondary">Retry loading</Button>
            </div>
          )}
          {showVessels && knownCount < categories.length && !live.fixtureMode && (
            <p className="progress-status" role="status">Some counts could not be read just now and are shown as “—”.</p>
          )}
          {live.fixtureMode && <p className="progress-preview-notice" role="status"><strong>Sample counts &amp; targets</strong> · Preview only, not live progress.</p>}

          <div ref={stageRef} className={`pipeline-stage pipeline-stage--${viewMode}`} data-motion={decorativeMotion ? 'animated' : 'static'}>
            {showVessels && hasPipes && (
              <PipeNetwork
                layout={viewMode === 'vertical' ? 'jars' : 'tanks'}
                containerRef={stageRef}
                measureKey={`${viewMode}|${knownCount}|${live.fixtureMode}`}
                active={flows.active}
                travel={canAnimate}
                onArrive={flows.arrive}
              />
            )}
            {viewMode === 'vertical' && <span className="pipeline-trunk-marker" data-pipe-trunk aria-hidden="true" />}
            <div className="pipeline-head">
              <TribePump outlet={viewMode === 'vertical' ? 'center' : viewMode === 'horizontal' ? 'left' : 'none'} pulse={flows.pumpPulse} motion={decorativeMotion} />
              <ConnectionStatus state={live.connection} confirmedAtMs={live.confirmedAtMs} />
            </div>

            {showVessels && viewMode === 'vertical' && (
              <div className="vessels-gallery vessels-gallery--vertical" ref={galleryRef} aria-label="Category jars progress gallery">
                {categories.map((progress, index) => (
                  <VerticalJar key={progress.category.id} progress={progress} canAnimate={decorativeMotion} staggerIndex={index} {...vesselState(progress)} {...vesselHandlers} />
                ))}
              </div>
            )}

            {showVessels && viewMode === 'horizontal' && (
              <div className="vessels-gallery vessels-gallery--horizontal" ref={galleryRef} aria-label="Category horizontal tanks progress list">
                {categories.map((progress, index) => (
                  <HorizontalTank key={progress.category.id} progress={progress} canAnimate={decorativeMotion} staggerIndex={index} {...vesselState(progress)} {...vesselHandlers} />
                ))}
              </div>
            )}

            {showVessels && viewMode === 'cultural' && (
              <div className="vessels-gallery vessels-gallery--cultural" ref={galleryRef} tabIndex={0} aria-label="Illustrated earthenware progress vessels gallery">
                {categories.map((progress, index) => (
                  <CulturalPot key={progress.category.id} progress={progress} canAnimate={decorativeMotion} staggerIndex={index} {...vesselState(progress)} {...vesselHandlers} />
                ))}
              </div>
            )}

            {showVessels && viewMode === 'table' && (
              <ProgressDataTable categories={categories} arrivals={flows.arrivals} {...vesselHandlers} />
            )}
          </div>

          <p className="sr-only" aria-live="polite" aria-atomic="true">{announcement}</p>

          <nav className="progress-discovery-bar" aria-label="Explore progress details">
            <button type="button" className="control-toggle-btn" aria-haspopup="dialog" onClick={() => setPopup('about')}><Icon name="source" size={14} /> How it works</button>
            <button type="button" className="control-toggle-btn" aria-haspopup="dialog" onClick={() => setPopup('pace')}><Icon name="arrow" size={14} /> Launch pace</button>
            <button type="button" className="control-toggle-btn is-active" aria-haspopup="dialog" onClick={() => setPopup('contribute')}><Icon name="chat" size={14} /> Add your voice</button>
          </nav>
        </div>
      </section>

      {popup === 'view' && (
        <ProgressPopup title="Choose your view" onClose={closePopup}>
          <div className="progress-popup-options" role="group" aria-label="Vessel layout">
            {VIEW_MODES.map((mode) => (
              <button type="button" key={mode} className={`progress-popup-option ${viewMode === mode ? 'is-active' : ''}`} aria-pressed={viewMode === mode} onClick={() => { handleViewModeChange(mode); closePopup(); }}>
                <Icon name={VIEW_LABELS[mode].icon} size={18} />
                {VIEW_LABELS[mode].long}
              </button>
            ))}
          </div>
          <p className="tiny muted">Your view is saved on this device. Alt+T switches to the data table.</p>
        </ProgressPopup>
      )}
      {popup === 'settings' && (
        <ProgressPopup title="Progress options" onClose={closePopup}>
          <div className="progress-popup-options">
            <button type="button" className="progress-popup-option" onClick={() => setPopup('view')}><Icon name="layers" size={16} /> Choose your view</button>
            <button type="button" className="progress-popup-option" aria-pressed={soundEnabled} onClick={handleToggleSound}><Icon name="volume" size={16} /> {soundEnabled ? 'Chimes on' : 'Enable sound'}</button>
            <button type="button" className="progress-popup-option" onClick={handlePrintBulletin}><Icon name="bookmark" size={16} /> Print flyer</button>
            {import.meta.env.DEV && <button type="button" className={`progress-popup-option ${useFixtures ? 'is-active' : ''}`} aria-pressed={useFixtures} onClick={() => { setUseFixtures((prev) => !prev); closePopup(); }}><Icon name="context" size={16} /> {useFixtures ? 'Return to live progress' : 'Preview sample targets'}</button>}
            {import.meta.env.DEV && useFixtures && <button type="button" className="progress-popup-option" onClick={() => setPopup('simulate')}><Icon name="play" size={16} /> Simulate an approval</button>}
            {import.meta.env.DEV && useFixtures && <button type="button" className="progress-popup-option" onClick={() => setPopup('milestones')}><Icon name="bookmark" size={16} /> Sample milestones</button>}
            {import.meta.env.DEV && useFixtures && <button type="button" className="progress-popup-option" onClick={() => setPopup('honors')}><Icon name="check" size={16} /> Sample contributors</button>}
            <button type="button" className="progress-popup-option" onClick={() => { live.refresh(); closePopup(); }}><Icon name="arrow" size={16} /> Reconnect</button>
          </div>
          {import.meta.env.DEV && <p className="tiny muted">Preview mode uses sample counts and targets. Simulated approvals exist only in this development preview and never touch live progress.</p>}
        </ProgressPopup>
      )}
      {import.meta.env.DEV && useFixtures && popup === 'simulate' && (
        <ProgressPopup title="Simulate an approval" onClose={closePopup}>
          <p className="tiny muted">Development preview only. Plays a sample approval through the same path a committed one takes.</p>
          <div className="progress-popup-options" role="group" aria-label="Collection to approve into">
            {categories.map((item) => (
              <button key={item.category.id} type="button" className="progress-popup-option" onClick={() => { closePopup(); window.setTimeout(() => live.simulateApproval(item.category.id), 350); }}>
                <Icon name={item.category.iconName} size={16} /> {item.category.shortLabel}
              </button>
            ))}
          </div>
        </ProgressPopup>
      )}
      {popup === 'pace' && <ProgressPopup title="Launch pace" onClose={closePopup}>
          <div className="progress-calculator-card">
            <div className="section-heading">
              <p className="eyebrow">Momentum &amp; Run-rate</p>
              <h2>Launch Pace &amp; Velocity Estimator</h2>
              <p className="section-heading__body">
                Estimate how our community run-rate brings each category to full harvest ahead of launch.
              </p>
            </div>

            <div className="calculator-interface">
              <div className="calculator-select-row">
                <p className="calculator-label" id="pace-category-label">Choose a category</p>
                <div className="progress-popup-options" role="group" aria-labelledby="pace-category-label">
                  {categories.map((c) => (
                    <button
                      key={c.category.id}
                      type="button"
                      className={`progress-popup-option ${selectedPaceCategory?.category.id === c.category.id ? 'is-active' : ''}`}
                      aria-pressed={selectedPaceCategory?.category.id === c.category.id}
                      onClick={() => setPaceCategoryId(c.category.id)}
                    >
                      <Icon name={c.category.iconName} size={16} /> {c.category.shortLabel}
                    </button>
                  ))}
                </div>
              </div>

              {selectedPaceCategory && (
                <div className="calculator-results-grid">
                  <div className="calculator-result-box">
                    <span className="tiny muted">{live.fixtureMode ? 'Sample weekly rate' : 'Measured weekly rate'}</span>
                    <strong>{selectedPaceCategory.velocityWeek > 0 ? `+${selectedPaceCategory.velocityWeek} ${selectedPaceCategory.category.unitPlural}/week` : 'Not available yet'}</strong>
                  </div>

                  <div className="calculator-result-box">
                    <span className="tiny muted">{live.fixtureMode ? 'Sample pledges' : 'Pledges in this session'}</span>
                    <strong>{selectedPaceCategory.pledgeCount} {selectedPaceCategory.category.unitPlural} promised</strong>
                  </div>

                  <div className="calculator-result-box">
                    <span className="tiny muted">Target Horizon Status</span>
                    {selectedPaceCategory.isTargetSetting ? (
                      <span className="tiny">Target being finalized with custodians</span>
                    ) : selectedPaceCategory.isTargetReached ? (
                      <strong className="text-success">Harvest target achieved!</strong>
                    ) : projectedDays !== null ? (
                      <strong>Approx. {projectedDays} days at current velocity</strong>
                    ) : (
                      <span>Estimate unavailable without a measured weekly rate</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

        <p className="tiny muted">Estimates depend on a target and a measured weekly rate; they are not confirmed launch dates.</p>
      </ProgressPopup>}
      {import.meta.env.DEV && useFixtures && popup === 'milestones' && <ProgressPopup title="Illustrative milestones" onClose={closePopup}>
          <div className="progress-milestones-section">
            <div className="section-heading">
              <p className="eyebrow">Community genesis</p>
              <h2>Milestones reached along the way.</h2>
              <p className="section-heading__body">
                Every approved recording, story, and proverb represents community dedication.
              </p>
            </div>

            <div className="milestones-timeline">
              {HISTORICAL_MILESTONES.map((item) => (
                <div key={item.id} className="milestone-entry">
                  <div className="milestone-entry__marker" aria-hidden="true" />
                  <div className="milestone-entry__content">
                    <div className="milestone-entry__date-row">
                      <span className="milestone-entry__date">{item.date}</span>
                      <span className="milestone-entry__badge">
                        +{item.countReached.toLocaleString()} verified
                      </span>
                    </div>
                    <h4 className="milestone-entry__title">{item.title}</h4>
                    <p className="milestone-entry__desc">{item.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
      </ProgressPopup>}
      {import.meta.env.DEV && useFixtures && popup === 'honors' && <ProgressPopup title="Illustrative contributors" onClose={closePopup}>
          <div className="progress-honor-wall">
            <div className="section-heading">
              <p className="eyebrow">Voices of our heritage</p>
              <h2>Community Custodians &amp; Contributors.</h2>
              <p className="section-heading__body">
                Warm gratitude to the elders, youth circles, and diaspora members filling our vessels.
              </p>
            </div>

            <div className="honor-wall-grid">
              {COMMUNITY_CONTRIBUTOR_HONORS.map((c) => (
                <div key={c.name} className="honor-card">
                  <div className="honor-card__avatar">
                    <Icon name="check" size={16} />
                  </div>
                  <div>
                    <h4 className="honor-card__name">{c.name}</h4>
                    <span className="honor-card__meta">{c.location} · {c.role}</span>
                    <p className="tiny muted">{c.category}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
      </ProgressPopup>}
      {popup === 'about' && <ProgressPopup title="How progress works" onClose={closePopup}>
        <p>TribeStudio is the pump. When a reviewer approves a contribution and it is published, the change travels down the pipe into its own collection’s vessel. Collections never share liquid: each fills on its own.</p>
        <p>A vessel fills to exactly its counted total divided by its target, so a small collection shows a small sliver and its precise percentage. Songs &amp; Lyrics counts all published songs, including songs creators publish directly. Its pulse marks a publication arriving; the other collections show approvals.</p>
        <p><strong>Live</strong> means this page is subscribed to collection totals and shows changes within moments of their being committed. <strong>Updated</strong> with a time means the totals were counted at that time instead. Totals counted before you opened the page are history and are never replayed as new.</p>
        <p>Local pots use generated pottery illustrations and a separate fill gauge because clay is opaque. They are artistic interpretations, not photographs of authenticated Kasena artifacts.</p>
        <p><strong>{live.config.launchWindowLabel}</strong></p>
        {live.config.notes && <p className="tiny muted">{live.config.notes}</p>}
          <div className="progress-methodology-section">
            <div className="section-heading">
              <p className="eyebrow">Trustworthy counting</p>
              <h2>How launch progress is verified.</h2>
              <p className="section-heading__body">
                We believe in genuine, verified milestones rather than vanity numbers. Every vessel reflects only work that is ready for our community.
              </p>
            </div>

            <div className="methodology-grid">
              <article className="methodology-card">
                <h4>Clear counting rules</h4>
                <p>
                  Songs &amp; Lyrics measures the published music library, including open publications; publication does not imply independent review. Other collections measure approved, usable heritage data and exclude open posts. Drafts and unpublished work never fill a vessel.
                </p>
              </article>

              <article className="methodology-card">
                <h4>Categories stay distinct</h4>
                <p>
                  We never merge distinct cultural forms or split multi-word expressions into individual dictionary words merely to inflate a total. A proverb is counted once, as a proverb.
                </p>
              </article>

              <article className="methodology-card">
                <h4>Configurable ambition</h4>
                <p>
                  Targets and dates remain honest. If a category milestone is being agreed with elders, we state &ldquo;Target being set&rdquo; rather than publishing an arbitrary number.
                </p>
              </article>

              <article className="methodology-card">
                <h4>Privacy &amp; safety first</h4>
                <p>
                  Totals are counted on our servers. The page receives a collection, a number and a time — never a contributor, a private note or unpublished work.
                </p>
              </article>
            </div>
          </div>
      </ProgressPopup>}
      {popup === 'contribute' && <ProgressPopup title="Add your voice" onClose={closePopup}>
        <p>Share a Kasem greeting, record a story, or suggest a word. Choose a vessel to find its contribution link.</p>
        <div className="hero__actions">
          <Button href="https://tribestudio.indigenworld.com/studio/expressions" external>Share an everyday expression</Button>
          <Button to="contribute" variant="secondary">Learn about contributing</Button>
        </div>
      </ProgressPopup>}
      {/* Active Modals */}
      <CategoryBreakdownModal
        progress={breakdownProgress}
        fixtureMode={live.fixtureMode}
        onOpenPledge={(progress) => { setBreakdownProgress(null); setPledgeProgress(progress); }}
        onOpenShare={(progress) => { setBreakdownProgress(null); setShareProgress(progress); }}
        onOpenAudit={(progress) => { setBreakdownProgress(null); setAuditProgress(progress); }}
        onClose={() => setBreakdownProgress(null)}
      />

      <PledgeModal
        progress={pledgeProgress}
        onClose={() => setPledgeProgress(null)}
        onPledgeSubmitted={handlePledgeSubmitted}
      />

      <ShareVesselModal
        progress={shareProgress}
        fixtureMode={live.fixtureMode}
        onClose={() => setShareProgress(null)}
      />

      <AuditQueryModal
        progress={auditProgress}
        fixtureMode={live.fixtureMode}
        connection={live.connection}
        onClose={() => setAuditProgress(null)}
      />

      {import.meta.env.DEV && live.fixtureMode && <DevSimulationHook simulate={live.simulateApproval} />}
    </div>
  );
}

/** Development preview only: lets automated browser checks trigger a sample approval. */
function DevSimulationHook({ simulate }: { simulate: (category: ContributionCategoryId, delta?: number) => void }) {
  useEffect(() => {
    if (!import.meta.env.DEV) return undefined;
    const target = window as unknown as { __progressSimulateApproval?: typeof simulate };
    target.__progressSimulateApproval = simulate;
    return () => { delete target.__progressSimulateApproval; };
  }, [simulate]);
  return null;
}

export default ProgressPage;
