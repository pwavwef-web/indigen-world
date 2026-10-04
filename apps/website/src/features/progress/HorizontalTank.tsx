/**
 * src/features/progress/HorizontalTank.tsx
 *
 * Horizontal transparent vessel / tank component for the "Horizontal tanks" view.
 *
 * Visual highlights:
 *  - Accurate SVG liquid fill geometry from left to right [0% to 100%].
 *  - Category-specific cultural palette gradients.
 *  - Review queue vapor layer on advancing edge.
 *  - 30-day growth sparkline and velocity tags.
 *  - Active direct queue task prompt.
 *  - Audio sample preview and modal actions (Breakdown, Pledge, Share, Audit).
 */

import React, { useId, useState } from 'react';
import type { CategoryProgress } from './progressTypes';
import { Icon } from '../../components/Icon';
import { Button } from '../../components/Button';
import { playSampleAudioPreview, playVesselChime } from './progressAudio';
import { getLiquidVisuals, LiquidBubbles } from './liquidVisuals';

interface HorizontalTankProps {
  progress: CategoryProgress;
  canAnimate: boolean;
  staggerIndex?: number;
  onOpenBreakdown?: (progress: CategoryProgress) => void;
  onOpenShare?: (progress: CategoryProgress) => void;
  onOpenAudit?: (progress: CategoryProgress) => void;
  onOpenPledge?: (progress: CategoryProgress) => void;
}

export function HorizontalTank({
  progress,
  canAnimate,
  staggerIndex = 0,
  onOpenBreakdown,
  onOpenShare,
  onOpenAudit,
  onOpenPledge,
}: HorizontalTankProps) {
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
    velocityWeek,
    sparklineData,
    pledgeCount,
  } = progress;

  const clipId = useId();
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);

  // Horizontal chamber geometry
  const interiorLeftX = 34;
  const maxFillWidth = 332;
  const liquid = getLiquidVisuals(fillPercentage, isTargetSetting);
  const currentFillWidth = liquid.fill * maxFillWidth;
  const advancingEdgeX = interiorLeftX + currentFillWidth;

  const handleAudioPreview = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsPlayingAudio(true);
    playSampleAudioPreview(category.sampleAudioType || 'word');
    setTimeout(() => setIsPlayingAudio(false), 1200);
  };

  const handleCardClick = () => {
    playVesselChime();
    onOpenBreakdown?.(progress);
  };

  // Sparkline points
  const sparkMin = Math.min(...sparklineData, 0);
  const sparkMax = Math.max(...sparklineData, target ?? 100);
  const sparkRange = Math.max(1, sparkMax - sparkMin);
  const sparkPoints = sparklineData
    .map((val, idx) => {
      const x = 10 + (idx / Math.max(1, sparklineData.length - 1)) * 60;
      const y = 28 - ((val - sparkMin) / sparkRange) * 20;
      return `${x},${y}`;
    })
    .join(' ');

  const entranceStyle: React.CSSProperties = {
    animationDelay: `${staggerIndex * 60}ms`,
    animation: canAnimate ? undefined : 'none',
    '--liquid-colour': liquid.colour,
    '--liquid-glow': `color-mix(in srgb, ${liquid.colour} 18%, transparent)`,
  } as React.CSSProperties;

  const palette = category.culturalPalette;

  return (
    <article
      className={`vessel-card vessel-card--horizontal ${isTargetReached ? 'vessel-card--reached' : ''} ${needsContributions ? 'vessel-card--highlighted' : ''}`}
      style={entranceStyle}
      data-motion={canAnimate ? 'animated' : 'static'}
      data-liquid-stage={liquid.stage}
      aria-labelledby={`tank-title-${category.id}`}
      onClick={handleCardClick}
    >
      <div className="tank-layout">
        {/* Left / Top Info Header */}
        <div className="tank-header">
          <div className="tank-header__icon-title">
            <div className="vessel-icon-badge" style={{ backgroundColor: `${palette.primary}18`, color: palette.primary }} aria-hidden="true">
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

                {velocityWeek > 0 && (
                  <span className="vessel-velocity-pill" title={`${velocityWeek} approved this week`}>
                    +{velocityWeek}/wk
                  </span>
                )}
              </div>
              <button type="button" className="vessel-info-button" onClick={(event) => { event.stopPropagation(); onOpenBreakdown?.(progress); }}>
                <Icon name="context" size={14} /> About &amp; how to help
              </button>
            </div>
          </div>

          {/* Counts & Percentage readout */}
          <div className="tank-header__readout">
            <div className="tank-metric-counts">
              <span className="tank-metric__approved">{approvedCount.toLocaleString()}</span>
              <span className="tank-metric__target">
                {isTargetSetting ? 'Target setting' : `/ ${target?.toLocaleString()} ${category.unitPlural}`}
              </span>
            </div>

            <div className="tank-metric-percent">
              {isTargetSetting ? (
                <span className="tank-percent-setting">Target setting</span>
              ) : (
                <span className="tank-percent-value">{percentage}%</span>
              )}
            </div>

            {/* Sparkline */}
            {sparklineData.length > 1 && <div className="tank-sparkline-box" title="30-day verified growth">
              <svg viewBox="0 0 80 32" className="sparkline-svg" aria-hidden="true">
                <polyline
                  fill="none"
                  stroke={palette.primary}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={sparkPoints}
                />
              </svg>
            </div>}
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
              ? `${approvedCount} ${category.unitPlural} approved; target being set`
              : `${approvedCount} of ${target} ${category.unitPlural} approved (${percentage}%)`
          }
        >
          <svg
            viewBox="0 0 400 128"
            className={`tank-svg ${canAnimate ? 'tank-svg--animated' : 'tank-svg--static'}`}
            aria-hidden="true"
          >
            <defs>
              {/* Cultural liquid gradient */}
              <linearGradient id={`tank-grad-${clipId}`} x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor={liquid.gradient[0]} stopOpacity="0.94" />
                <stop offset="45%" stopColor={liquid.gradient[1]} stopOpacity="0.9" />
                <stop offset="85%" stopColor={liquid.gradient[2]} stopOpacity="0.92" />
                <stop offset="100%" stopColor={liquid.gradient[3]} stopOpacity="0.96" />
              </linearGradient>

              {/* Glass glare highlight */}
              <linearGradient id={`tank-glare-${clipId}`} x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#ffffff" stopOpacity="0.5" />
                <stop offset="35%" stopColor="#ffffff" stopOpacity="0.1" />
                <stop offset="80%" stopColor="#ffffff" stopOpacity="0.0" />
                <stop offset="100%" stopColor="#ffffff" stopOpacity="0.25" />
              </linearGradient>

              {/* Tank interior cavity clip path */}
              <clipPath id={`tank-cavity-${clipId}`}>
                <rect x="34" y="28" width="332" height="72" rx="36" ry="36" />
              </clipPath>
              <clipPath id={`tank-liquid-bounds-${clipId}`}>
                <rect x="34" y="28" width={currentFillWidth} height="72" />
              </clipPath>
            </defs>

            {/* Tank Mounting Hardware Feet */}
            <rect x="68" y="96" width="18" height="18" rx="4" fill="#64748b" />
            <rect x="314" y="96" width="18" height="18" rx="4" fill="#64748b" />
            <ellipse cx="77" cy="114" rx="14" ry="4" fill="rgba(15, 23, 42, 0.2)" />
            <ellipse cx="323" cy="114" rx="14" ry="4" fill="rgba(15, 23, 42, 0.2)" />

            {/* Glass Tank Shell Background */}
            <rect
              x="32"
              y="26"
              width="336"
              height="76"
              rx="38"
              ry="38"
              fill="rgba(240, 249, 255, 0.45)"
              stroke="rgba(186, 230, 253, 0.85)"
              strokeWidth="2.5"
            />

            {/* Clipped Liquid Fill and Meniscus */}
            <g clipPath={`url(#tank-cavity-${clipId})`}>
              {/* Liquid Fill */}
              {!isTargetSetting && currentFillWidth > 0 && (
                <g className="tank-liquid-group">
                  <rect
                    className="liquid-fill"
                    x="34"
                    y="28"
                    width={currentFillWidth}
                    height="72"
                    fill={`url(#tank-grad-${clipId})`}
                  />

                  {/* Advancing Liquid Meniscus Wave */}
                  <path
                    d={`M ${advancingEdgeX} 28 Q ${advancingEdgeX + 6} 64 ${advancingEdgeX} 100 L ${advancingEdgeX - 6} 100 L ${advancingEdgeX - 6} 28 Z`}
                    fill={liquid.gradient[3]}
                    opacity="0.85"
                    className="tank-meniscus-wave"
                  />

                  {/* Drifting horizontal bubbles */}
                    <g className="tank-bubbles" clipPath={`url(#tank-liquid-bounds-${clipId})`}>
                      <LiquidBubbles fillPercentage={liquid.fill * 100} x={34} y={32} width={currentFillWidth} height={64} horizontal />
                    </g>
                </g>
              )}

              {/* Review Queue droplets on advancing edge */}
              {awaitingReviewCount !== null && awaitingReviewCount !== undefined && awaitingReviewCount > 0 && (
                <g className="tank-review-droplets" opacity="0.8">
                  <circle cx={Math.min(355, advancingEdgeX + 16)} cy="64" r="3" fill="#facc15" />
                  <circle cx={Math.min(360, advancingEdgeX + 26)} cy="56" r="2" fill="#facc15" />
                </g>
              )}
            </g>

            {/* Tank Cap End Ring Accents */}
            <ellipse cx="48" cy="64" rx="10" ry="34" fill="none" stroke="rgba(186, 230, 253, 0.7)" strokeWidth="2" />
            <ellipse cx="352" cy="64" rx="10" ry="34" fill="none" stroke="rgba(186, 230, 253, 0.7)" strokeWidth="2" />

            {/* Longitudinal Glass Reflection Glare */}
            <rect
              x="52"
              y="32"
              width="296"
              height="18"
              rx="9"
              ry="9"
              fill={`url(#tank-glare-${clipId})`}
              pointerEvents="none"
            />
          </svg>
        </div>

        {/* Active Direct Queue Task Prompt */}

        {/* Footer actions and CTA */}
        <div className="tank-footer" onClick={(e) => e.stopPropagation()}>
          <div className="vessel-actions-strip">
            {category.hasAudioSample && (
              <button
                type="button"
                className={`vessel-tool-btn ${isPlayingAudio ? 'is-playing' : ''}`}
                onClick={handleAudioPreview}
                title={`Listen to sample ${category.sampleAudioLabel}`}
              >
                <Icon name="volume" size={13} />
                {isPlayingAudio ? 'Playing…' : 'Sample'}
              </button>
            )}

            <button
              type="button"
              className="vessel-tool-btn"
              onClick={() => onOpenBreakdown?.(progress)}
              title="Inspect composition"
            >
              <Icon name="layers" size={13} /> Breakdown
            </button>

            <button
              type="button"
              className="vessel-tool-btn"
              onClick={() => onOpenPledge?.(progress)}
              title={`Pledge contributions (${pledgeCount} pledged)`}
            >
              <Icon name="check" size={13} /> Pledge
            </button>

            <button
              type="button"
              className="vessel-tool-btn"
              onClick={() => onOpenShare?.(progress)}
              title="Share progress"
            >
              <Icon name="chat" size={13} /> Share
            </button>

            <button
              type="button"
              className="vessel-tool-btn"
              onClick={() => onOpenAudit?.(progress)}
              title="Inspect query math"
            >
              <Icon name="source" size={13} /> Audit
            </button>
          </div>

          <div className="tank-cta-group">
            <Button
              href={category.ctaUrl}
              external
              variant={needsContributions ? 'primary' : 'secondary'}
            >
              {category.ctaLabel}
            </Button>
          </div>
        </div>
      </div>
    </article>
  );
}
