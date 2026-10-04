/**
 * src/pages/ProgressPage.tsx
 *
 * Public progress page for Indigen World, centred on the concept
 * "Help Fill the Jars."
 *
 * Features:
 *  - Two switchable views: "Vertical jars" and "Horizontal tanks", persisted in localStorage.
 *  - Beautiful SVG vessels with accurate liquid fill, bubbles, and glass highlights.
 *  - Real data connections with server aggregations and honest loading/offline states.
 *  - Category-specific CTAs directing to the exact contribution workflows.
 *  - Honest presentation: unconfigured targets display "Target being set" without inventing numbers.
 *  - Development fixture toggle for verification of all target thresholds.
 *  - Performance-optimized motion controls and reduced-motion support.
 */

import { useEffect, useState } from 'react';
import { useDocumentMeta } from '../lib/useDocumentMeta';
import { useRevealOnScroll } from '../lib/useRevealOnScroll';
import { ROUTES_BY_PATH } from '../content/navigation';
import { SectionHeading } from '../components/SectionHeading';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { useProgressMotion } from '../features/progress/useProgressMotion';
import { fetchLiveLaunchProgress } from '../features/progress/progressData';
import { VerticalJar } from '../features/progress/VerticalJar';
import { HorizontalTank } from '../features/progress/HorizontalTank';
import type { ProgressState, VesselViewMode } from '../features/progress/progressTypes';

const VIEW_MODE_STORAGE_KEY = 'iw_progress_vessel_view_mode';
const route = ROUTES_BY_PATH.progress ?? {
  title: 'Our Progress · Help Fill the Jars',
  description: 'Track community contributions bringing Indigen World closer to our planned December/January launch.',
  path: 'progress',
};

export function ProgressPage() {
  useDocumentMeta(route.title, route.description);
  useRevealOnScroll('progress');

  const { isMotionPaused, prefersReducedMotion, toggleMotionPause, canAnimate } = useProgressMotion();

  // Persistent view preference: 'vertical' (jars) or 'horizontal' (tanks)
  const [viewMode, setViewMode] = useState<VesselViewMode>(() => {
    try {
      const stored = localStorage.getItem(VIEW_MODE_STORAGE_KEY);
      if (stored === 'vertical' || stored === 'horizontal') return stored;
    } catch {
      // Default to vertical
    }
    return 'vertical';
  });

  // Fixture mode toggle: lets reviewers inspect sample targets in dev without inventing live data
  const [useFixtures, setUseFixtures] = useState(false);

  const [state, setState] = useState<ProgressState>({
    status: 'loading',
    categories: [],
    launchConfig: {
      launchWindowLabel: 'Planned: December 2026 / January 2027',
      launchTargetDate: null,
      categoryTargets: {
        lexicon: null,
        expressions: null,
        sentences: null,
        literature: null,
        music: null,
        audiobooks: null,
        video: null,
        grammar: null,
        proverbs: null,
        pronunciation: null,
      },
    },
    lastUpdated: null,
    targetsReachedCount: 0,
    totalWithTargetsCount: 0,
    fixtureMode: false,
  });

  const loadData = async (fixtures: boolean) => {
    setState((prev) => ({ ...prev, status: 'loading' }));
    try {
      const result = await fetchLiveLaunchProgress({ useFixtures: fixtures });
      setState(result);
    } catch {
      setState((prev) => ({
        ...prev,
        status: 'error',
        error: 'Unable to load verified launch metrics right now. Please retry.',
      }));
    }
  };

  useEffect(() => {
    void loadData(useFixtures);
  }, [useFixtures]);

  const handleViewModeChange = (mode: VesselViewMode) => {
    setViewMode(mode);
    try {
      localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode);
    } catch {
      // Ignore storage errors
    }
  };

  return (
    <>
      {/* Hero Section */}
      <section className="page-hero page-hero--progress">
        <div className="container">
          <SectionHeading
            eyebrow="Community launch progress"
            title="Help fill the jars."
            body="Every contribution brings launch closer. Explore what we need, follow how far our community has come, and add your voice to the vessels."
            light
            as="h1"
          />

          <div className="progress-hero-summary">
            <div className="progress-window-pill">
              <span className="progress-window-pill__dot" aria-hidden="true" />
              <span>{state.launchConfig.launchWindowLabel}</span>
            </div>

            {state.totalWithTargetsCount > 0 ? (
              <div className="progress-stats-pill">
                <Icon name="check" size={16} />
                <span>
                  <strong>{state.targetsReachedCount} of {state.totalWithTargetsCount}</strong> targets reached
                </span>
              </div>
            ) : (
              <div className="progress-stats-pill">
                <span>10 heritage contribution categories active</span>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Main Content Section */}
      <section className="section section--white" id="vessels-section">
        <div className="container">
          {/* Controls Bar */}
          <div className="progress-controls-bar">
            {/* View Segmented Switch */}
            <div
              className="segmented-switch-group"
              role="radiogroup"
              aria-label="Vessel layout view"
            >
              <button
                type="button"
                className={`segmented-switch-btn ${viewMode === 'vertical' ? 'is-active' : ''}`}
                role="radio"
                aria-checked={viewMode === 'vertical'}
                onClick={() => handleViewModeChange('vertical')}
              >
                <Icon name="volume" size={16} />
                Vertical jars
              </button>

              <button
                type="button"
                className={`segmented-switch-btn ${viewMode === 'horizontal' ? 'is-active' : ''}`}
                role="radio"
                aria-checked={viewMode === 'horizontal'}
                onClick={() => handleViewModeChange('horizontal')}
              >
                <Icon name="layers" size={16} />
                Horizontal tanks
              </button>
            </div>

            {/* Actions: Pause Motion, Fixture Toggle, Refresh */}
            <div className="progress-actions-group">
              {prefersReducedMotion && (
                <span className="progress-summary-badge" title="System reduced motion preference detected">
                  Reduced motion
                </span>
              )}

              <button
                type="button"
                className={`control-toggle-btn ${isMotionPaused ? 'is-active' : ''}`}
                onClick={toggleMotionPause}
                title={isMotionPaused ? 'Resume liquid and bubble animation' : 'Pause continuous animation'}
                aria-label={isMotionPaused ? 'Resume animation' : 'Pause animation'}
              >
                <Icon name={isMotionPaused ? 'play' : 'pause'} size={14} />
                {isMotionPaused ? 'Resume animation' : 'Pause motion'}
              </button>

              <button
                type="button"
                className={`control-toggle-btn ${useFixtures ? 'is-active' : ''}`}
                onClick={() => setUseFixtures((prev) => !prev)}
                title="Toggle between live honest targets and sample targets fixture"
                aria-pressed={useFixtures}
              >
                <Icon name="context" size={14} />
                {useFixtures ? 'Sample targets active' : 'Preview sample targets'}
              </button>

              <button
                type="button"
                className="control-toggle-btn"
                onClick={() => void loadData(useFixtures)}
                aria-label="Refresh latest contribution counts"
              >
                <Icon name="arrow" size={14} />
                Refresh
              </button>
            </div>
          </div>

          {/* Status notices */}
          {state.status === 'loading' ? (
            <p className="contribute-published__note" role="status">
              Loading verified contribution counts…
            </p>
          ) : null}

          {state.status === 'error' ? (
            <div className="callout callout--warn" role="alert">
              <strong>{state.error}</strong>
              <p>We do not show estimated zeros when live data is unreachable.</p>
              <Button type="button" onClick={() => void loadData(useFixtures)} variant="secondary">
                Retry loading
              </Button>
            </div>
          ) : null}

          {state.status === 'stale' ? (
            <p className="tiny muted" role="status">
              Showing cached progress. Next connection will update counts.
            </p>
          ) : null}

          {useFixtures ? (
            <div className="callout callout--info" role="status">
              <strong>Sample Target Preview Active.</strong> This preview uses development targets to demonstrate all visual liquid levels, completion states, and exceeded targets. Real production targets display &ldquo;Target being set&rdquo; until finalized with community custodians.
            </div>
          ) : null}

          {/* Vessel Display Gallery */}
          {viewMode === 'vertical' ? (
            <div
              className="vessels-gallery vessels-gallery--vertical"
              aria-label="Category jars progress gallery"
            >
              {state.categories.map((progress, index) => (
                <VerticalJar
                  key={progress.category.id}
                  progress={progress}
                  canAnimate={canAnimate}
                  staggerIndex={index}
                />
              ))}
            </div>
          ) : (
            <div
              className="vessels-gallery vessels-gallery--horizontal"
              aria-label="Category horizontal tanks progress list"
            >
              {state.categories.map((progress, index) => (
                <HorizontalTank
                  key={progress.category.id}
                  progress={progress}
                  canAnimate={canAnimate}
                  staggerIndex={index}
                />
              ))}
            </div>
          )}

          {/* Transparent Methodology & Integrity */}
          <div className="progress-methodology-section" data-reveal>
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
                  Launch progress measures approved, usable heritage data. Submissions awaiting review appear as compact pending indicators and only fill the vessel when independent reviewers verify them.
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
        </div>
      </section>

      {/* Bottom Community CTA */}
      <section className="section section--sand">
        <div className="container">
          <SectionHeading
            eyebrow="Join the effort"
            title="Every contribution counts."
            body="Whether you have one everyday Kasem greeting, a recorded elder story, or ten minutes to suggest words, you can help fill the jars before our planned launch."
          />
          <div className="hero__actions">
            <Button href="https://tribestudio.indigenworld.com/studio/expressions" external>
              Share an everyday expression
            </Button>
            <Button to="contribute" variant="secondary">
              Learn about contributing
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}

export default ProgressPage;
