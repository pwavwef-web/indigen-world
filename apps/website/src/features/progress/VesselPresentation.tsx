import { type CSSProperties, type ReactNode } from 'react';
import { Button } from '../../components/Button';
import { Icon } from '../../components/Icon';
import { getLiquidVisuals } from './liquidVisuals';
import { approvalLabel } from './liveProgressModel';
import { fillFraction, formatCount, percentParts } from './progressFormat';
import { milestoneLabel, nextMilestone } from './progressMilestones';
import type { GoalLine } from './GlassVessel';
import type { JarLabelInfo } from './JarLabel';
import type { CategoryProgress, ContributionCategoryId } from './progressTypes';
import type { ArrivalCue } from './useApprovalFlows';

export interface VesselProps {
  progress: CategoryProgress;
  canAnimate: boolean;
  staggerIndex?: number;
  /** Position in the catalogue (0-based): the jar's printed number, whatever the floor order. */
  catalogueIndex?: number;
  /** The total the fill shows while an approval is still in the pipe. */
  fillCount?: number | null;
  arrival?: ArrivalCue | null;
  /** Lit by a deep link or the showcase. */
  spotlight?: boolean;
  /** This collection's pipe is being traced. */
  traced?: boolean;
  onTrace?: (id: ContributionCategoryId | null) => void;
  onOpenBreakdown?: (progress: CategoryProgress) => void;
  onOpenShare?: (progress: CategoryProgress) => void;
  onOpenAudit?: (progress: CategoryProgress) => void;
  onOpenPledge?: (progress: CategoryProgress) => void;
}

export interface VesselRenderState {
  fill: number;
  unknown: boolean;
  easeFill: boolean;
  arrival: ArrivalCue | null;
  label: JarLabelInfo;
  sealed: boolean;
  goal: GoalLine | null;
}

/** The anchor a shared link uses to open the page at one jar: /progress#jar-lexicon */
export const jarAnchor = (id: ContributionCategoryId) => `jar-${id}`;

/**
 * One collection: its vessel, then its name, numbers and actions beneath it.
 * Nothing sits between a vessel and the pipe that feeds it, so the network
 * never has to cross a heading, a number or a button.
 */
export function VesselPresentation({ progress, canAnimate, staggerIndex = 0, catalogueIndex = staggerIndex, fillCount, arrival = null, spotlight = false, traced = false, onTrace, onOpenBreakdown, kind, renderVessel }: VesselProps & {
  kind: 'vertical' | 'horizontal' | 'cultural';
  renderVessel: (state: VesselRenderState) => ReactNode;
}) {
  const { category, approvedCount, target, isTargetSetting, isTargetReached, isBeyondTarget, isCountKnown } = progress;
  const unknown = isTargetSetting || !isCountKnown;
  const fill = fillFraction(fillCount ?? approvedCount, target);
  const liquid = getLiquidVisuals(fill * 100, unknown);
  const percent = percentParts(approvedCount, target);
  const next = unknown ? null : nextMilestone(approvedCount, target);
  const titleId = `vessel-title-${category.id}`;
  const countLabel = category.id === 'music' ? 'published' : 'verified';
  const progressLabel = category.id === 'music' ? 'published' : 'approved';
  const open = () => onOpenBreakdown?.(progress);
  const valueText = !isCountKnown
    ? `${category.title}: count unavailable`
    : isTargetSetting
      ? `${formatCount(approvedCount)} ${category.unitPlural} ${progressLabel}; target is being set`
      : `${formatCount(approvedCount)} of ${formatCount(target)} ${category.unitPlural} ${progressLabel} (${percent?.text ?? '0%'})`;
  const label: JarLabelInfo = { number: catalogueIndex + 1, name: category.shortLabel, title: category.title, icon: category.iconName, accent: category.accentHue };
  const goal = next ? { fraction: next.fraction, label: milestoneLabel(next.percent) } : null;

  return <article id={jarAnchor(category.id)} className={`floating-vessel floating-vessel--${kind}`} aria-labelledby={titleId} data-category={category.id}
    data-motion={canAnimate ? 'animated' : 'static'} data-liquid-stage={liquid.stage}
    data-arrival={arrival ? (arrival.travelled ? 'flow' : 'static') : undefined}
    data-milestone={arrival?.milestone ? 'true' : undefined}
    data-sealed={isTargetReached ? 'true' : undefined}
    data-spotlight={spotlight ? 'true' : undefined}
    data-traced={traced ? 'true' : undefined}
    onPointerEnter={(event) => { if (event.pointerType === 'mouse') onTrace?.(category.id); }}
    onPointerLeave={() => onTrace?.(null)}
    onFocus={() => onTrace?.(category.id)}
    onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onTrace?.(null); }}
    style={{ '--vessel-index': staggerIndex, '--liquid-colour': liquid.colour, '--jar-accent': category.accentHue } as CSSProperties}>
    {/* The whole vessel opens its details for pointer users; the Explore button is the keyboard route. */}
    <div className="vessel-stage" onClick={open}>
      <div className="vessel-ground" aria-hidden="true" />
      <div className="vessel-volume" role="progressbar" aria-labelledby={titleId}
        aria-valuemin={0} aria-valuemax={target ?? undefined}
        aria-valuenow={unknown || approvedCount === null ? undefined : Math.min(approvedCount, target ?? 0)}
        aria-valuetext={valueText}>
        {renderVessel({ fill, unknown, easeFill: canAnimate && Boolean(arrival?.travelled), arrival, label, sealed: isTargetReached, goal })}
      </div>
      <span className="vessel-readout" aria-hidden="true">
        {!isCountKnown ? '—' : isTargetSetting ? 'Target being set' : <>{percent?.qualifier}{percent?.value}<small>%</small></>}
      </span>
      {arrival && <span className="vessel-arrival-badge" key={arrival.key} aria-hidden="true">
        {approvalLabel(arrival.delta, category.id)}{arrival.milestone ? ' · target reached' : ''}
      </span>}
    </div>
    <div className="vessel-info">
      <h2 id={titleId} className="vessel-title">
        <span className="vessel-index" aria-hidden="true">{String(catalogueIndex + 1).padStart(2, '0')}</span>
        <span>{category.title}</span>
        {isTargetReached && <span className="vessel-complete" title={isBeyondTarget ? 'Beyond target' : 'Target reached'}><Icon name="check" size={13} /></span>}
      </h2>
      <p className="vessel-counter"><strong>{formatCount(approvedCount)}</strong> <span>{isCountKnown ? `${category.unitPlural} ${countLabel}` : 'count unavailable'}</span></p>
      <p className="vessel-target">
        {isTargetSetting ? 'Target being set' : <>of {formatCount(target)}</>}
        {' · '}
        <button type="button" className="vessel-explore" aria-haspopup="dialog" aria-label={`Explore ${category.title} details`} onClick={open}>
          Explore <Icon name="arrow" size={11} />
        </button>
      </p>
      {next && <p className="vessel-next">
        <svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true" focusable="false"><path d="M2.5 11V1.5M2.5 2h7l-1.8 2.4L9.5 7h-7" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" strokeLinecap="round" /></svg>
        <span><strong>{formatCount(next.remaining)}</strong> {next.remaining === 1 ? category.unit : category.unitPlural} to {milestoneLabel(next.percent)}</span>
      </p>}
      {isTargetReached && <p className="vessel-next vessel-next--sealed"><span>Sealed · target met</span></p>}
    </div>
    <Button href={category.ctaUrl} external variant="secondary" className="floating-vessel-cta">{category.ctaLabel}</Button>
  </article>;
}
