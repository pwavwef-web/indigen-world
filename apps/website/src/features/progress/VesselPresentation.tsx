import { type CSSProperties, type ReactNode } from 'react';
import { Button } from '../../components/Button';
import { Icon } from '../../components/Icon';
import { getLiquidVisuals } from './liquidVisuals';
import type { CategoryProgress } from './progressTypes';

export interface VesselProps {
  progress: CategoryProgress;
  canAnimate: boolean;
  staggerIndex?: number;
  onOpenBreakdown?: (progress: CategoryProgress) => void;
  onOpenShare?: (progress: CategoryProgress) => void;
  onOpenAudit?: (progress: CategoryProgress) => void;
  onOpenPledge?: (progress: CategoryProgress) => void;
}

export function VesselPresentation({ progress, canAnimate, staggerIndex = 0, onOpenBreakdown, kind, children }: VesselProps & {
  kind: 'vertical' | 'horizontal' | 'cultural'; children: ReactNode;
}) {
  const { category, approvedCount, target, percentage, isTargetSetting, isTargetReached, isBeyondTarget } = progress;
  const liquid = getLiquidVisuals(progress.fillPercentage, isTargetSetting);
  const titleId = `vessel-title-${category.id}`;
  return <article className={`floating-vessel floating-vessel--${kind}`} aria-labelledby={titleId}
    data-motion={canAnimate ? 'animated' : 'static'} data-liquid-stage={liquid.stage}
    style={{ '--vessel-index': staggerIndex, '--liquid-colour': liquid.colour } as CSSProperties}>
    <div className="floating-vessel-heading">
      <span className="vessel-index" aria-hidden="true">{String(staggerIndex + 1).padStart(2, '0')}</span>
      <h2 id={titleId}>{category.title}</h2>
      {isTargetReached && <span className="vessel-complete" title={isBeyondTarget ? 'Beyond target' : 'Target reached'}><Icon name="check" size={13} /></span>}
    </div>
    <button type="button" className="vessel-inspect" aria-haspopup="dialog" aria-label={`Explore ${category.title} details`} onClick={() => onOpenBreakdown?.(progress)}>
      <div className="vessel-stage">
        <div className="vessel-ground" aria-hidden="true" />
        <div className="vessel-volume" role="progressbar" aria-label={`${category.title} approved contributions`}
          aria-valuemin={0} aria-valuemax={target ?? undefined}
          aria-valuenow={isTargetSetting ? undefined : Math.min(approvedCount, target ?? 0)}
          aria-valuetext={isTargetSetting ? `${approvedCount} ${category.unitPlural} approved; target is being set` : `${approvedCount} of ${target} ${category.unitPlural} approved (${percentage}%)`}>
          {children}
        </div>
        <span className="vessel-readout">{isTargetSetting ? 'Target being set' : <>{percentage}<small>%</small></>}<Icon name="context" size={12} /></span>
      </div>
      <span className="vessel-counter"><strong>{approvedCount.toLocaleString()}</strong> <span>{category.unitPlural} verified</span></span>
      <span className="vessel-target">{isTargetSetting ? 'Tap for details' : <>of {target?.toLocaleString()} · <span>Explore <Icon name="arrow" size={11} /></span></>}</span>
    </button>
    <Button href={category.ctaUrl} external variant="secondary" className="floating-vessel-cta">{category.ctaLabel}</Button>
  </article>;
}
