import { type CSSProperties, type ReactNode } from 'react';
import { Button } from '../../components/Button';
import { Icon } from '../../components/Icon';
import { getLiquidVisuals } from './liquidVisuals';
import { approvalLabel } from './liveProgressModel';
import { fillFraction, formatCount, percentParts } from './progressFormat';
import type { CategoryProgress } from './progressTypes';
import type { ArrivalCue } from './useApprovalFlows';

export interface VesselProps {
  progress: CategoryProgress;
  canAnimate: boolean;
  staggerIndex?: number;
  /** The total the fill shows while an approval is still in the pipe. */
  fillCount?: number | null;
  arrival?: ArrivalCue | null;
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
}

/**
 * One collection: its vessel, then its name, numbers and actions beneath it.
 * Nothing sits between a vessel and the pipe that feeds it, so the network
 * never has to cross a heading, a number or a button.
 */
export function VesselPresentation({ progress, canAnimate, staggerIndex = 0, fillCount, arrival = null, onOpenBreakdown, kind, renderVessel }: VesselProps & {
  kind: 'vertical' | 'horizontal' | 'cultural';
  renderVessel: (state: VesselRenderState) => ReactNode;
}) {
  const { category, approvedCount, target, isTargetSetting, isTargetReached, isBeyondTarget, isCountKnown } = progress;
  const unknown = isTargetSetting || !isCountKnown;
  const fill = fillFraction(fillCount ?? approvedCount, target);
  const liquid = getLiquidVisuals(fill * 100, unknown);
  const percent = percentParts(approvedCount, target);
  const titleId = `vessel-title-${category.id}`;
  const countLabel = category.id === 'music' ? 'published' : 'verified';
  const progressLabel = category.id === 'music' ? 'published' : 'approved';
  const open = () => onOpenBreakdown?.(progress);
  const valueText = !isCountKnown
    ? `${category.title}: count unavailable`
    : isTargetSetting
      ? `${formatCount(approvedCount)} ${category.unitPlural} ${progressLabel}; target is being set`
      : `${formatCount(approvedCount)} of ${formatCount(target)} ${category.unitPlural} ${progressLabel} (${percent?.text ?? '0%'})`;

  return <article className={`floating-vessel floating-vessel--${kind}`} aria-labelledby={titleId} data-category={category.id}
    data-motion={canAnimate ? 'animated' : 'static'} data-liquid-stage={liquid.stage}
    data-arrival={arrival ? (arrival.travelled ? 'flow' : 'static') : undefined}
    data-milestone={arrival?.milestone ? 'true' : undefined}
    style={{ '--vessel-index': staggerIndex, '--liquid-colour': liquid.colour } as CSSProperties}>
    {/* The whole vessel opens its details for pointer users; the Explore button is the keyboard route. */}
    <div className="vessel-stage" onClick={open}>
      <div className="vessel-ground" aria-hidden="true" />
      <div className="vessel-volume" role="progressbar" aria-labelledby={titleId}
        aria-valuemin={0} aria-valuemax={target ?? undefined}
        aria-valuenow={unknown || approvedCount === null ? undefined : Math.min(approvedCount, target ?? 0)}
        aria-valuetext={valueText}>
        {renderVessel({ fill, unknown, easeFill: canAnimate && Boolean(arrival?.travelled), arrival })}
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
        <span className="vessel-index" aria-hidden="true">{String(staggerIndex + 1).padStart(2, '0')}</span>
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
    </div>
    <Button href={category.ctaUrl} external variant="secondary" className="floating-vessel-cta">{category.ctaLabel}</Button>
  </article>;
}
