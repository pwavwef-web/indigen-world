import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../../components/Icon';
import { BrandMark } from '../../components/BrandMark';
import { FactoryBackdrop } from './FactoryBackdrop';
import { GlassVessel } from './GlassVessel';
import { connectionLabel } from './ConnectionStatus';
import { CONTRIBUTION_CATEGORIES } from './progressConfig';
import { fillFraction, formatCount, formatPercent } from './progressFormat';
import { milestoneLabel, nextMilestone } from './progressMilestones';
import type { CategoryProgress, ConnectionState, ContributionCategoryId } from './progressTypes';
import type { Shift } from './useShiftLighting';

/** How long each jar stays on screen while the tour plays. */
const SLIDE_MS = 9000;

/**
 * A tour of the jars for a screen at a community event: one jar at a time,
 * large, with its verified numbers and where to contribute. The numbers stay
 * live while it runs. A native modal dialog keeps keyboard focus inside and
 * Escape closes it; it also asks the browser for full screen, and leaving full
 * screen leaves the tour.
 */
export function ShowcaseMode({ categories, startId, canAnimate, shift, connection, confirmedAtMs, fixtureMode, onClose }: {
  categories: CategoryProgress[];
  startId: ContributionCategoryId | null;
  /** Decorative motion allowed (not paused, not reduced): also gates the automatic tour. */
  canAnimate: boolean;
  shift: Shift;
  connection: ConnectionState;
  confirmedAtMs: number | null;
  fixtureMode: boolean;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const [index, setIndex] = useState(() => Math.max(0, categories.findIndex((item) => item.category.id === startId)));
  const [playing, setPlaying] = useState(true);
  const count = categories.length;
  const item = categories[Math.min(index, count - 1)];
  const autoplay = playing && canAnimate && count > 1;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return undefined;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.showModal();
    let enteredFullscreen = false;
    if (dialog.requestFullscreen) {
      dialog.requestFullscreen().then(() => { enteredFullscreen = true; }).catch(() => undefined);
    }
    const onFullscreenChange = () => {
      if (enteredFullscreen && !document.fullscreenElement) closeRef.current();
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  const go = useCallback((step: number) => setIndex((current) => (current + step + count) % count), [count]);

  useEffect(() => {
    if (!autoplay) return undefined;
    const timer = window.setTimeout(() => go(1), SLIDE_MS);
    return () => window.clearTimeout(timer);
  }, [autoplay, index, go]);

  if (!item) return null;
  const { category, approvedCount, target, isTargetSetting, isTargetReached, isCountKnown } = item;
  const unknown = isTargetSetting || !isCountKnown;
  const next = unknown ? null : nextMilestone(approvedCount, target);
  const percent = formatPercent(approvedCount, target);
  const number = CONTRIBUTION_CATEGORIES.findIndex((entry) => entry.id === category.id) + 1;
  const motion = canAnimate ? 'animated' : 'static';

  return createPortal(
    <dialog ref={dialogRef} className="showcase-dialog" data-shift={shift} data-motion={motion} aria-labelledby="showcase-title"
      onCancel={(event) => { event.preventDefault(); closeRef.current(); }}
      onKeyDown={(event) => {
        if (event.key === 'ArrowRight') { event.preventDefault(); go(1); }
        if (event.key === 'ArrowLeft') { event.preventDefault(); go(-1); }
      }}>
      <FactoryBackdrop />
      <div className="showcase">
        <header className="showcase__bar">
          <p className="showcase__brand"><BrandMark /><span>Indigen World · <strong>Help fill the jars</strong></span></p>
          <p className="pipeline-status" data-state={connection}><span className="pipeline-status__dot" aria-hidden="true" />{connectionLabel(connection, confirmedAtMs)}</p>
          <div className="showcase__controls">
            <button type="button" onClick={() => go(-1)} aria-label="Previous jar"><span aria-hidden="true">←</span></button>
            <button type="button" onClick={() => setPlaying((value) => !value)} aria-pressed={!playing} disabled={!canAnimate}
              aria-label={playing ? 'Pause the tour' : 'Play the tour'}><Icon name={playing && canAnimate ? 'pause' : 'play'} size={16} /></button>
            <button type="button" onClick={() => go(1)} aria-label="Next jar"><span aria-hidden="true">→</span></button>
            <button type="button" className="showcase__exit" onClick={() => closeRef.current()}><Icon name="minimize" size={15} /> Exit</button>
          </div>
        </header>
        <div className="showcase__stage" key={category.id}>
          <div className="showcase__jar showcase-stage" data-motion={motion}>
            <GlassVessel categoryId={category.id} fill={fillFraction(approvedCount, target)} unknown={unknown} easeFill={false}
              label={{ number, name: category.shortLabel, title: category.title, icon: category.iconName, accent: category.accentHue }}
              sealed={isTargetReached} goal={next ? { fraction: next.fraction, label: milestoneLabel(next.percent) } : null} />
          </div>
          <div className="showcase__facts" aria-live="polite">
            <p className="showcase__eyebrow">No. {String(number).padStart(2, '0')} · {category.shortLabel}{fixtureMode ? ' · sample data' : ''}</p>
            <h2 id="showcase-title">{category.title}</h2>
            <p className="showcase__count"><strong>{formatCount(approvedCount)}</strong> {isCountKnown ? `${category.unitPlural} ${category.id === 'music' ? 'published' : 'verified'}` : 'count unavailable'}</p>
            <p className="showcase__target">{isTargetSetting ? 'Target being set' : <>of {formatCount(target)} · <strong>{percent}</strong></>}</p>
            {next && <p className="showcase__next"><strong>{formatCount(next.remaining)}</strong> {next.remaining === 1 ? category.unit : category.unitPlural} to reach {milestoneLabel(next.percent)}</p>}
            {isTargetReached && <p className="showcase__next">Sealed · target met</p>}
            <p className="showcase__cta">{category.ctaLabel} at <strong>tribestudio.indigenworld.com</strong></p>
          </div>
        </div>
        <footer className="showcase__footer">
          <ol className="showcase__dots" aria-label="Jars in the tour">
            {categories.map((entry, position) => <li key={entry.category.id}>
              <button type="button" aria-current={position === index ? 'true' : undefined} aria-label={entry.category.title} onClick={() => setIndex(position)} />
            </li>)}
          </ol>
          {autoplay ? <span className="showcase__timer" key={`${category.id}-${index}`} style={{ animationDuration: `${SLIDE_MS}ms` }} />
            : <span className="showcase__manual">{canAnimate ? 'Tour paused' : 'Motion is paused: use the arrows to move between jars'}</span>}
        </footer>
      </div>
    </dialog>,
    document.body,
  );
}
