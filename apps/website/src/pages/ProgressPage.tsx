/** Full-screen community progress with optional details in accessible popups. */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useDocumentMeta } from '../lib/useDocumentMeta';
import { ROUTES_BY_PATH } from '../content/navigation';
import { Link } from '../app/router';
import { ProgressPopup } from '../features/progress/ProgressDialog';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { BrandMark } from '../components/BrandMark';
import { useProgressMotion } from '../features/progress/useProgressMotion';
import { fetchLiveLaunchProgress } from '../features/progress/progressData';
import { VerticalJar } from '../features/progress/VerticalJar';
import { HorizontalTank } from '../features/progress/HorizontalTank';
import { CulturalPot } from '../features/progress/CulturalPot';
import { ProgressDataTable } from '../features/progress/ProgressDataTable';
import { CategoryBreakdownModal } from '../features/progress/CategoryBreakdownModal';
import { PledgeModal } from '../features/progress/PledgeModal';
import { ShareVesselModal } from '../features/progress/ShareVesselModal';
import { AuditQueryModal } from '../features/progress/AuditQueryModal';
import { playVesselChime } from '../features/progress/progressAudio';
import {
  DEFAULT_PRODUCTION_CONFIG,
  COMMUNITY_CONTRIBUTOR_HONORS,
  HISTORICAL_MILESTONES,
} from '../features/progress/progressConfig';
import { calculateProjectedDays } from '../features/progress/progressCalculation';
import type {
  CategoryProgress,
  ProgressState,
  VesselViewMode,
} from '../features/progress/progressTypes';

const VIEW_MODE_STORAGE_KEY = 'iw_progress_vessel_view_mode';
const route = ROUTES_BY_PATH.progress ?? {
  title: 'Our Progress · Help Fill the Jars',
  description: 'Track community contributions bringing Indigen World closer to our planned December/January launch.',
  path: 'progress',
};

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

  // Audio chime enabled state
  const [soundEnabled, setSoundEnabled] = useState(false);

  const [popup, setPopup] = useState<'view' | 'settings' | 'pace' | 'milestones' | 'honors' | 'about' | 'contribute' | null>(null);

  // Selected modals state
  const [breakdownProgress, setBreakdownProgress] = useState<CategoryProgress | null>(null);
  const [pledgeProgress, setPledgeProgress] = useState<CategoryProgress | null>(null);
  const [shareProgress, setShareProgress] = useState<CategoryProgress | null>(null);
  const [auditProgress, setAuditProgress] = useState<CategoryProgress | null>(null);
  const galleryRef = useRef<HTMLDivElement>(null);
  const scrollGallery = (direction: number) => galleryRef.current?.scrollBy({ left: direction * galleryRef.current.clientWidth * 0.85, behavior: canAnimate ? 'smooth' : 'instant' });

  // Selected category for the Launch Pace Calculator
  const [paceCategoryId, setPaceCategoryId] = useState<string>('lexicon');

  const [state, setState] = useState<ProgressState>({
    status: 'loading',
    categories: [],
    launchConfig: DEFAULT_PRODUCTION_CONFIG,
    lastUpdated: null,
    targetsReachedCount: 0,
    totalWithTargetsCount: 0,
    fixtureMode: false,
    totalCommunityPledges: 0,
  });

  const requestId = useRef(0);
  const loadData = useCallback(async (fixtures: boolean) => {
    const currentRequest = ++requestId.current;
    setState((prev) => ({ ...prev, status: 'loading' }));
    try {
      const result = await fetchLiveLaunchProgress({ useFixtures: import.meta.env.DEV && fixtures });
      if (currentRequest !== requestId.current) return;
      setState((prev) => result.status === 'error'
        ? { ...prev, status: 'error', error: result.error }
        : result);
    } catch {
      if (currentRequest !== requestId.current) return;
      setState((prev) => ({ ...prev, status: 'error', error: 'Unable to load verified launch metrics right now. Please retry.' }));
    }
  }, []);

  useEffect(() => {
    void loadData(useFixtures);
    return () => { requestId.current += 1; };
  }, [useFixtures, loadData]);

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
  }, [viewMode, soundEnabled]);

  const handleViewModeChange = (mode: VesselViewMode) => {
    setViewMode(mode);
    if (soundEnabled) playVesselChime();
    try { localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode); } catch { /* Optional preference. */ }
  };

  const handleToggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    if (next) playVesselChime();
  };

  const handlePledgeSubmitted = (categoryId: string, amount: number) => {
    if (soundEnabled) playVesselChime();
    setState((prev) => ({ ...prev,
      totalCommunityPledges: prev.totalCommunityPledges + amount,
      categories: prev.categories.map((category) => category.category.id === categoryId
        ? { ...category, pledgeCount: category.pledgeCount + amount } : category),
    }));
  };
  const handlePrintBulletin = () => { closePopup(); window.setTimeout(() => window.print(), 0); };
  const selectedPaceCategory = state.categories.find((category) => category.category.id === paceCategoryId) || state.categories[0];
  const projectedDays = selectedPaceCategory ? calculateProjectedDays(selectedPaceCategory.approvedCount, selectedPaceCategory.target, selectedPaceCategory.velocityWeek) : null;
  const viewLabel = { vertical: 'Vertical jars', horizontal: 'Horizontal tanks', cultural: 'Traditional pots', table: 'Data table' }[viewMode];
  const closePopup = () => setPopup(null);

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
          <p className="observatory-intro">A little from you. A future for all of us.</p>
          <div className="progress-hero-summary">
            <span className="progress-stats-pill">{state.totalWithTargetsCount > 0 ? <><strong>{state.targetsReachedCount} / {state.totalWithTargetsCount}</strong> targets reached</> : '10 contribution categories'}</span>
            {prefersReducedMotion && <span className="progress-summary-badge">Reduced motion</span>}
          </div>
        </div>
        <div className="observatory-toolbar">
          <div className="observatory-views" role="group" aria-label="Progress view">
            {(['vertical', 'horizontal', 'cultural', 'table'] as const).map(mode => <button key={mode} type="button" aria-pressed={viewMode === mode} onClick={() => handleViewModeChange(mode)}>
              <Icon name={mode === 'vertical' ? 'volume' : mode === 'horizontal' ? 'layers' : mode === 'cultural' ? 'source' : 'context'} size={14} />
              {{ vertical: 'Jars', horizontal: 'Tanks', cultural: 'Local pots', table: 'Table' }[mode]}
            </button>)}
          </div>
          <button className="observatory-text-button" type="button" aria-haspopup="dialog" onClick={() => setPopup('about')}><Icon name="check" size={14} /> Verified contributions <Icon name="context" size={13} /></button>
        </div>
      </header>

      <section className="progress-immersive-stage" id="vessels-section" aria-label="Community contribution progress">
        <div className="container">
          <div className="observatory-gallery-heading"><span>{viewLabel}<small> / {String(state.categories.length).padStart(2, '0')} COLLECTIONS</small></span>
            {(viewMode === 'vertical' || viewMode === 'cultural') && <div className="observatory-gallery-controls"><button type="button" onClick={() => scrollGallery(-1)} aria-label="Previous collections"><span aria-hidden="true">←</span></button><button type="button" onClick={() => scrollGallery(1)} aria-label="Next collections"><span aria-hidden="true">→</span></button></div>}
          </div>
          {state.status === 'loading' && <p className="progress-status" role="status">Loading verified contribution counts…</p>}
          {state.status === 'error' && (
            <div className="callout callout--warn" role="alert">
              <strong>{state.error}</strong>
              <Button type="button" onClick={() => void loadData(useFixtures)} variant="secondary">Retry loading</Button>
            </div>
          )}
          {state.status === 'stale' && <p className="progress-status" role="status">Cached progress · Refresh to reconnect.</p>}
          {state.fixtureMode && <p className="progress-preview-notice" role="status"><strong>Sample counts &amp; targets</strong> · Preview only, not live progress.</p>}
          {/* Vessel Display Gallery / Table */}
          {viewMode === 'vertical' && (
            <div
              className="vessels-gallery vessels-gallery--vertical"
              ref={galleryRef}
              tabIndex={0}
              aria-label="Category jars progress gallery"
            >
              {state.categories.map((progress, index) => (
                <VerticalJar
                  key={progress.category.id}
                  progress={progress}
                  canAnimate={canAnimate}
                  staggerIndex={index}
                  onOpenBreakdown={setBreakdownProgress}
                  onOpenShare={setShareProgress}
                  onOpenAudit={setAuditProgress}
                  onOpenPledge={setPledgeProgress}
                />
              ))}
            </div>
          )}

          {viewMode === 'horizontal' && (
            <div
              className="vessels-gallery vessels-gallery--horizontal"
              ref={galleryRef}
              aria-label="Category horizontal tanks progress list"
            >
              {state.categories.map((progress, index) => (
                <HorizontalTank
                  key={progress.category.id}
                  progress={progress}
                  canAnimate={canAnimate}
                  staggerIndex={index}
                  onOpenBreakdown={setBreakdownProgress}
                  onOpenShare={setShareProgress}
                  onOpenAudit={setAuditProgress}
                  onOpenPledge={setPledgeProgress}
                />
              ))}
            </div>
          )}

          {viewMode === 'cultural' && (
            <div
              className="vessels-gallery vessels-gallery--cultural"
              ref={galleryRef}
              tabIndex={0}
              aria-label="Illustrated earthenware progress vessels gallery"
            >
              {state.categories.map((progress, index) => (
                <CulturalPot
                  key={progress.category.id}
                  progress={progress}
                  canAnimate={canAnimate}
                  staggerIndex={index}
                  onOpenBreakdown={setBreakdownProgress}
                  onOpenShare={setShareProgress}
                  onOpenAudit={setAuditProgress}
                  onOpenPledge={setPledgeProgress}
                />
              ))}
            </div>
          )}

          {viewMode === 'table' && (
            <ProgressDataTable
              categories={state.categories}
              onOpenBreakdown={setBreakdownProgress}
              onOpenShare={setShareProgress}
              onOpenAudit={setAuditProgress}
              onOpenPledge={setPledgeProgress}
            />
          )}


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
            {(['vertical', 'horizontal', 'cultural', 'table'] as const).map((mode) => (
              <button type="button" key={mode} className={`progress-popup-option ${viewMode === mode ? 'is-active' : ''}`} aria-pressed={viewMode === mode} onClick={() => { handleViewModeChange(mode); closePopup(); }}>
                <Icon name={mode === 'vertical' ? 'volume' : mode === 'horizontal' ? 'layers' : mode === 'cultural' ? 'source' : 'context'} size={18} />
                {{ vertical: 'Vertical jars', horizontal: 'Horizontal tanks', cultural: 'Traditional pots', table: 'Data table' }[mode]}
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
            {import.meta.env.DEV && useFixtures && <button type="button" className="progress-popup-option" onClick={() => setPopup('milestones')}><Icon name="bookmark" size={16} /> Sample milestones</button>}
            {import.meta.env.DEV && useFixtures && <button type="button" className="progress-popup-option" onClick={() => setPopup('honors')}><Icon name="check" size={16} /> Sample contributors</button>}
            <button type="button" className="progress-popup-option" onClick={() => { void loadData(useFixtures); closePopup(); }}><Icon name="arrow" size={16} /> Refresh counts</button>
          </div>
          {import.meta.env.DEV && <p className="tiny muted">Preview mode uses sample counts and targets to demonstrate the liquid colours and levels. It does not show live community progress.</p>}
        </ProgressPopup>
      )}
      {popup === 'pace' && <ProgressPopup title="Launch pace" onClose={closePopup}>
          {/* Launch Pace & Velocity Calculator Section */}
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
                  {state.categories.map((c) => (
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
                    <span className="tiny muted">{state.fixtureMode ? 'Sample weekly rate' : 'Measured weekly rate'}</span>
                    <strong>{selectedPaceCategory.velocityWeek > 0 ? `+${selectedPaceCategory.velocityWeek} ${selectedPaceCategory.category.unitPlural}/week` : 'Not available yet'}</strong>
                  </div>

                  <div className="calculator-result-box">
                    <span className="tiny muted">{state.fixtureMode ? 'Sample pledges' : 'Pledges in this session'}</span>
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
          {/* Historical Milestone Genesis Timeline Section */}
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
          {/* Community Contributor Honor Wall Section */}
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
        <p>Every approved contribution helps preserve Kasem heritage. Open a vessel’s details to explore its category, share its progress, or make a pledge.</p>
        <p>Liquid colour moves from red through yellow and blue to green as a vessel fills. More progress brings more bubbles. Counts and percentages show the exact progress.</p>
        <p>Local pots use generated pottery illustrations and a separate fill gauge because clay is opaque. They are artistic interpretations, not photographs of authenticated Kasena artifacts.</p>
        <p><strong>{state.launchConfig.launchWindowLabel}</strong></p>
        {state.launchConfig.notes && <p className="tiny muted">{state.launchConfig.notes}</p>}
          {/* Transparent Methodology & Integrity */}
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
                <h4>Approved contributions only</h4>
                <p>
                  Launch progress measures approved, usable heritage data. Submissions awaiting review only fill a vessel after reviewers verify them.
                </p>
              </article>

              <article className="methodology-card">
                <h4>Categories stay distinct</h4>
                <p>
                  We never merge distinct cultural forms or split multi-word expressions into individual dictionary words merely to inflate a total. Words, expressions, proverbs, and audio maintain their authentic identities.
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
                  Metrics use privacy-preserving server counts. Contributor identities, private notes, and raw unpublished community corpus are never downloaded into a public browser.
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
        fixtureMode={state.fixtureMode}
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
        fixtureMode={state.fixtureMode}
        onClose={() => setShareProgress(null)}
      />

      <AuditQueryModal
        progress={auditProgress}
        fixtureMode={state.fixtureMode}
        onClose={() => setAuditProgress(null)}
      />

    </div>
  );
}

export default ProgressPage;
