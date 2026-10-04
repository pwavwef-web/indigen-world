/**
 * src/features/progress/HorizontalTank.tsx
 *
 * Horizontal transparent vessel / tank component for the "Horizontal tanks" view.
 *
 * Visual highlights:
 *  - Accurate SVG liquid fill geometry from left to right [0% to 100%].
 *  - Advancing vertical meniscus curve.
 *  - Bubbles drifting horizontally toward the advancing fill edge.
 *  - Translucent glass walls, specular gleams, and mounting hardware.
 *  - Clear surrounding metadata, count, target, and percentage.
 *  - Prominent contribution CTA directly below the vessel.
 *  - Responsive without horizontal scroll on mobile viewports.
 */

import React, { useId } from 'react';
import type { CategoryProgress } from './progressTypes';
import { Icon } from '../../components/Icon';
import { Button } from '../../components/Button';
import { liquidAppearance } from './liquidAppearance';
import '../../styles/progressLiquid.css';

interface HorizontalTankProps {
  progress: CategoryProgress;
  canAnimate: boolean;
  staggerIndex?: number;
  onInfo: (progress: CategoryProgress) => void;
}

export function HorizontalTank({ progress, canAnimate, staggerIndex = 0, onInfo }: HorizontalTankProps) {
  const {
    category,
    approvedCount,
    awaitingReviewCount,
    target,
    percentage,
    fillPercentage,
    isTargetReached,
    isBeyondTarget,
    isTargetSetting,
    needsContributions,
  } = progress;

  const clipId = useId();
  const appearance = liquidAppearance(fillPercentage, isTargetSetting);

  // Horizontal chamber geometry
  // Left interior: X = 34
  // Total fillable width: 332px
  // Height: 72px (Y = 28 to 100)
  const interiorLeftX = 34;
  const maxFillWidth = 332;
  const currentFillWidth = (appearance.fillPercent / 100) * maxFillWidth;
  const advancingEdgeX = interiorLeftX + currentFillWidth;

  const entranceStyle: React.CSSProperties = {
    animationDelay: `${staggerIndex * 60}ms`,
    '--liquid-colour': appearance.colour,
    '--liquid-deep': appearance.deep,
    '--liquid-light': appearance.light,
  } as React.CSSProperties;

  return (
    <article
      className={`vessel-card vessel-card--horizontal ${isTargetReached ? 'vessel-card--reached' : ''} ${needsContributions ? 'vessel-card--highlighted' : ''}`}
      style={entranceStyle}
      data-motion={canAnimate ? 'active' : 'paused'}
      data-liquid-stage={appearance.stage}
      aria-labelledby={`tank-title-${category.id}`}
    >
      <div className="tank-layout">
        {/* Left / Top Info Header */}
        <div className="tank-header">
          <div className="tank-header__icon-title">
            <div className="vessel-icon-badge" aria-hidden="true">
              <Icon name={category.iconName} size={22} />
            </div>
            <div>
              <div className="tank-title-badge-row">
                <h3 id={`tank-title-${category.id}`} className="vessel-title">
                  {category.title}
                </h3>
                {needsContributions ? (
                  <span className="vessel-badge vessel-badge--need">
                    <span className="vessel-badge__dot" aria-hidden="true" /> Needs help
                  </span>
                ) : isBeyondTarget ? (
                  <span className="vessel-badge vessel-badge--beyond">
                    <Icon name="check" size={12} /> Beyond target
                  </span>
                ) : isTargetReached ? (
                  <span className="vessel-badge vessel-badge--reached">
                    <Icon name="check" size={12} /> Target reached
                  </span>
                ) : isTargetSetting ? (
                  <span className="vessel-badge vessel-badge--setting">
                    Target being set
                  </span>
                ) : (
                  <span className="vessel-badge vessel-badge--progress">
                    In progress
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Counts & Percentage readout */}
          <div className="tank-metrics">
            <div className="vessel-metric__main">
              <span className="vessel-metric__count">{approvedCount.toLocaleString()}</span>
              <span className="vessel-metric__unit">
                {approvedCount === 1 ? category.unit : category.unitPlural}
              </span>
            </div>
            <div className="tank-metrics__status">
              {isTargetSetting ? (
                <span className="vessel-target-state">Launch target being set</span>
              ) : (
                <span className="vessel-target-state">
                  of <strong>{target?.toLocaleString()}</strong> targeted ({percentage}%)
                </span>
              )}
              {awaitingReviewCount != null && awaitingReviewCount > 0 ? (
                <span className="vessel-review-note" title="Submissions awaiting review">
                  <span className="vessel-review-note__dot" aria-hidden="true" />
                  {awaitingReviewCount} awaiting review
                </span>
              ) : null}
            </div>
          </div>
        </div>

        {/* SVG Horizontal Tank Graphic */}
        <div
          className="vessel-graphic vessel-graphic--horizontal"
          role="progressbar"
          aria-label={`${category.title} approved contributions`}
          aria-valuenow={isTargetSetting ? undefined : Math.min(approvedCount, target ?? 0)}
          aria-valuemin={0}
          aria-valuemax={target ?? undefined}
          aria-valuetext={
            isTargetSetting
              ? `${approvedCount} ${category.unitPlural} approved; target is being set`
              : `${approvedCount} of ${target} ${category.unitPlural} approved (${percentage}%)`
          }
        >
          <svg
            viewBox="0 0 400 130"
            className={`tank-svg ${canAnimate ? 'tank-svg--animated' : 'tank-svg--static'}`}
            aria-hidden="true"
          >
            <defs>
              {/* Horizontal liquid gradient */}
              <linearGradient className="liquid-volume" id={`tank-liquid-${clipId}`} x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor={appearance.deep} stopOpacity="0.98" />
                <stop offset="60%" stopColor={appearance.colour} stopOpacity="0.94" />
                <stop offset="90%" stopColor={appearance.light} stopOpacity="0.92" />
                <stop offset="100%" stopColor={appearance.surface} stopOpacity="0.98" />
              </linearGradient>

              {/* Advancing meniscus gradient */}
              <linearGradient id={`meniscus-grad-${clipId}`} x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor={appearance.light} stopOpacity="0.8" />
                <stop offset="100%" stopColor="#ffffff" stopOpacity="0.95" />
              </linearGradient>

              {/* Glass surface reflection */}
              <linearGradient id={`tank-glass-${clipId}`} x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#ffffff" stopOpacity="0.4" />
                <stop offset="25%" stopColor="#ffffff" stopOpacity="0.1" />
                <stop offset="75%" stopColor="#ffffff" stopOpacity="0.04" />
                <stop offset="100%" stopColor="#ffffff" stopOpacity="0.25" />
              </linearGradient>

              {/* Chamber interior clip path */}
              <clipPath id={`tank-cavity-${clipId}`}>
                <rect x="34" y="28" width="332" height="74" rx="20" />
              </clipPath>
              <clipPath id={`tank-fill-${clipId}`}>
                <rect x="34" y="28" width={currentFillWidth} height="74" />
              </clipPath>
            </defs>

            {/* Rear shadow */}
            <ellipse cx="200" cy="116" rx="160" ry="8" fill="rgba(20, 37, 67, 0.10)" />
            <ellipse className="liquid-glow" cx="200" cy="114" rx="145" ry="6" fill={appearance.colour} />

            {/* Left & Right mounting hardware / end-caps */}
            <rect x="18" y="42" width="16" height="46" rx="4" fill="#94a3b8" />
            <rect x="14" y="46" width="6" height="38" rx="2" fill="#64748b" />
            <rect x="366" y="42" width="16" height="46" rx="4" fill="#94a3b8" />
            <rect x="380" y="46" width="6" height="38" rx="2" fill="#64748b" />

            {/* Rear chamber wall */}
            <rect
              x="32"
              y="26"
              width="336"
              height="78"
              rx="22"
              fill="rgba(240, 249, 255, 0.45)"
              stroke="rgba(30, 58, 102, 0.16)"
              strokeWidth="2"
            />

            {/* Liquid & Horizontal Bubbles */}
            <g clipPath={`url(#tank-cavity-${clipId})`}>
              {currentFillWidth > 0 ? (
                <g clipPath={`url(#tank-fill-${clipId})`}>
                  {/* Liquid fill block */}
                  <rect
                    x="34"
                    y="28"
                    width={currentFillWidth}
                    height="74"
                    fill={`url(#tank-liquid-${clipId})`}
                    className="tank-liquid-fill"
                  />

                  {/* Advancing liquid meniscus curve */}
                  <path
                    d={`M ${advancingEdgeX - 4},28
                       Q ${advancingEdgeX + (canAnimate ? 4 : 2)},65 ${advancingEdgeX - 4},102
                       L ${advancingEdgeX},102
                       L ${advancingEdgeX},28
                       Z`}
                    fill={`url(#meniscus-grad-${clipId})`}
                    className="liquid-surface liquid-surface--horizontal"
                  />

                  {/* Horizontal Bubbles drifting right toward the advancing edge */}
                  <g className="tank-bubbles" aria-hidden="true">
                    {Array.from({ length: appearance.bubbleCount }, (_, index) => (
                      <circle
                        key={index}
                        cx={canAnimate ? interiorLeftX + 3 : interiorLeftX + currentFillWidth * (0.12 + ((index * 17) % 76) / 100)}
                        cy={42 + ((index * 13) % 43)}
                        r={(1.5 + (index % 4) * 0.65) * appearance.bubbleScale}
                        className="liquid-bubble liquid-bubble--horizontal"
                        style={{
                          '--bubble-duration': `${appearance.bubbleDuration + (index % 4) * 0.4}s`,
                          '--bubble-delay': `${-index * 0.71}s`,
                          '--bubble-drift': `${currentFillWidth}px`,
                        } as React.CSSProperties}
                      />
                    ))}
                  </g>
                </g>
              ) : null}

              {/* Glass internal depth */}
              <rect
                x="34"
                y="28"
                width="332"
                height="74"
                rx="20"
                fill={`url(#tank-glass-${clipId})`}
                style={{ mixBlendMode: 'overlay' }}
              />
            </g>

            {/* Calibrated measurement tick marks along bottom rail */}
            <g className="tank-gauges" opacity="0.45" stroke="rgba(30, 58, 102, 0.6)" strokeWidth="1.2">
              {/* 25% */}
              <line x1="117" y1="94" x2="117" y2="102" />
              {/* 50% */}
              <line x1="200" y1="92" x2="200" y2="102" />
              {/* 75% */}
              <line x1="283" y1="94" x2="283" y2="102" />
              {/* 100% */}
              <line x1="366" y1="90" x2="366" y2="102" />
            </g>

            {/* Foreground Glass Outlines */}
            <rect
              x="32"
              y="26"
              width="336"
              height="78"
              rx="22"
              fill="none"
              stroke="rgba(255, 255, 255, 0.85)"
              strokeWidth="3"
            />
            <rect
              x="32"
              y="26"
              width="336"
              height="78"
              rx="22"
              fill="none"
              stroke="rgba(30, 58, 102, 0.22)"
              strokeWidth="1.5"
            />

            {/* Top horizontal specular gleam */}
            <line
              x1="52"
              y1="34"
              x2="348"
              y2="34"
              stroke="rgba(255, 255, 255, 0.75)"
              strokeWidth="2.5"
              strokeLinecap="round"
            />

            {/* Target Reached celebration stars */}
            {isTargetReached ? (
              <g className="tank-celebration-stars" aria-hidden="true">
                <path
                  d="M 366,22 L 369,28 L 375,30 L 369,32 L 366,38 L 364,32 L 358,30 L 364,28 Z"
                  fill="#f59e0b"
                />
              </g>
            ) : null}
          </svg>
        </div>

        {/* Action and details row */}
        <div className="tank-footer">
          <Button
            href={category.ctaUrl}
            external
            variant={needsContributions ? 'primary' : 'secondary'}
            className="vessel-cta-button"
          >
            {category.ctaLabel}
          </Button>

          <button type="button" className="vessel-info-button" aria-haspopup="dialog" aria-label={`About ${category.title} and how it is counted`} onClick={() => onInfo(progress)}>
            About &amp; counting
          </button>
        </div>
      </div>
    </article>
  );
}
