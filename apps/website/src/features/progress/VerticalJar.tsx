/**
 * src/features/progress/VerticalJar.tsx
 *
 * Upright transparent glass jar component for the "Vertical jars" view.
 *
 * Visual highlights:
 *  - Accurate SVG liquid fill geometry from 0% (empty) to 100% (full).
 *  - Category-specific cultural palette gradients.
 *  - Liquid-in-flight review queue droplets in headspace.
 *  - 100% completion celebratory wax seal.
 *  - 30-day growth sparkline.
 *  - Active direct queue task prompt.
 *  - Audio sample preview and modal actions (Breakdown, Pledge, Share, Audit).
 */

import React, { useId, useState } from 'react';
import type { CategoryProgress } from './progressTypes';
import { Icon } from '../../components/Icon';
import { Button } from '../../components/Button';
import { playSampleAudioPreview, playVesselChime } from './progressAudio';
import { getLiquidVisuals, LiquidBubbles } from './liquidVisuals';

interface VerticalJarProps {
  progress: CategoryProgress;
  canAnimate: boolean;
  staggerIndex?: number;
  onOpenBreakdown?: (progress: CategoryProgress) => void;
  onOpenShare?: (progress: CategoryProgress) => void;
  onOpenAudit?: (progress: CategoryProgress) => void;
  onOpenPledge?: (progress: CategoryProgress) => void;
}

export function VerticalJar({
  progress,
  canAnimate,
  staggerIndex = 0,
  onOpenBreakdown,
  onOpenShare,
  onOpenAudit,
  onOpenPledge,
}: VerticalJarProps) {
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

  // Jar internal cavity geometry
  const interiorBottomY = 286;
  const maxFillHeight = 210;
  const liquid = getLiquidVisuals(fillPercentage, isTargetSetting);
  const currentFillHeight = liquid.fill * maxFillHeight;
  const surfaceY = interiorBottomY - currentFillHeight;

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
    animationDelay: `${staggerIndex * 70}ms`,
    animation: canAnimate ? undefined : 'none',
    '--liquid-colour': liquid.colour,
    '--liquid-glow': `color-mix(in srgb, ${liquid.colour} 18%, transparent)`,
  } as React.CSSProperties;

  const palette = category.culturalPalette;

  return (
    <article
      className={`vessel-card vessel-card--vertical ${isTargetReached ? 'vessel-card--reached' : ''} ${needsContributions ? 'vessel-card--highlighted' : ''}`}
      style={entranceStyle}
      data-motion={canAnimate ? 'animated' : 'static'}
      data-liquid-stage={liquid.stage}
      aria-labelledby={`jar-title-${category.id}`}
      onClick={handleCardClick}
    >
      {/* Target status & velocity banner */}
      <div className="vessel-badge-row">
        {needsContributions ? (
          <span className="vessel-badge vessel-badge--need" aria-label="Most needs contributions">
            <span className="vessel-badge__dot" aria-hidden="true" />
            Needs help
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

      {/* SVG Jar Illustration */}
      <div
        className="vessel-graphic vessel-graphic--vertical"
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
          viewBox="0 0 240 330"
          className={`jar-svg ${canAnimate ? 'jar-svg--animated' : 'jar-svg--static'}`}
          aria-hidden="true"
        >
          <defs>
            {/* Cultural liquid gradient */}
            <linearGradient id={`liquid-grad-${clipId}`} x1="0%" y1="100%" x2="0%" y2="0%">
              <stop offset="0%" stopColor={liquid.gradient[0]} stopOpacity="0.94" />
              <stop offset="40%" stopColor={liquid.gradient[1]} stopOpacity="0.88" />
              <stop offset="85%" stopColor={liquid.gradient[2]} stopOpacity="0.90" />
              <stop offset="100%" stopColor={liquid.gradient[3]} stopOpacity="0.96" />
            </linearGradient>

            {/* Surface wave gradient */}
            <linearGradient id={`surface-grad-${clipId}`} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={liquid.gradient[3]} stopOpacity="0.95" />
              <stop offset="50%" stopColor="#ffffff" stopOpacity="1" />
              <stop offset="100%" stopColor={liquid.gradient[3]} stopOpacity="0.9" />
            </linearGradient>

            {/* Glass highlight gradient */}
            <linearGradient id={`glass-glare-${clipId}`} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.45" />
              <stop offset="25%" stopColor="#ffffff" stopOpacity="0.08" />
              <stop offset="80%" stopColor="#ffffff" stopOpacity="0.0" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0.25" />
            </linearGradient>

            {/* Clip path defining internal jar cavity */}
            <clipPath id={`cavity-${clipId}`}>
              <rect x="36" y="76" width="168" height="210" rx="22" ry="22" />
            </clipPath>
            <clipPath id={`liquid-bounds-${clipId}`}>
              <rect x="36" y={surfaceY} width="168" height={currentFillHeight} />
            </clipPath>
          </defs>

          {/* Jar Base Shadow */}
          <ellipse cx="120" cy="302" rx="72" ry="10" fill="rgba(15, 23, 42, 0.14)" />

          {/* Glass Jar Body Background */}
          <rect
            x="34"
            y="74"
            width="172"
            height="214"
            rx="24"
            ry="24"
            fill="rgba(240, 249, 255, 0.45)"
            stroke="rgba(186, 230, 253, 0.85)"
            strokeWidth="2.5"
          />

          {/* Jar Neck and Rim */}
          <path
            d="M 64 74 L 64 48 C 64 44 68 40 74 40 L 166 40 C 172 40 176 44 176 48 L 176 74 Z"
            fill="rgba(240, 249, 255, 0.4)"
            stroke="rgba(186, 230, 253, 0.85)"
            strokeWidth="2.5"
          />
          <ellipse cx="120" cy="40" rx="46" ry="7" fill="rgba(224, 242, 254, 0.6)" stroke="rgba(186, 230, 253, 0.95)" strokeWidth="2.5" />

          {/* 100% Completion Wax Seal */}
          {isTargetReached && (
            <g className="jar-completion-seal">
              <ellipse cx="120" cy="40" rx="36" ry="9" fill="#d97706" stroke="#92400e" strokeWidth="2" />
              <circle cx="120" cy="39" r="6" fill="#f59e0b" />
            </g>
          )}

          {/* Clipped Internal Liquid and Bubbles */}
          <g clipPath={`url(#cavity-${clipId})`}>
            {/* Liquid Fill */}
            {!isTargetSetting && currentFillHeight > 0 && (
              <g className="jar-liquid-group">
                <rect
                  className="liquid-fill"
                  x="36"
                  y={surfaceY}
                  width="168"
                  height={currentFillHeight + 10}
                  fill={`url(#liquid-grad-${clipId})`}
                />

                {/* Oscillating Surface Wave */}
                <path
                  d={`M 30 ${surfaceY} Q 75 ${surfaceY - 5} 120 ${surfaceY} T 210 ${surfaceY} L 210 ${surfaceY + 6} Q 165 ${surfaceY + 10} 120 ${surfaceY + 6} T 30 ${surfaceY + 6} Z`}
                  fill={`url(#surface-grad-${clipId})`}
                  opacity="0.8"
                  className="liquid-wave liquid-wave--top"
                />
                <ellipse className="liquid-ripple" cx="120" cy={surfaceY + 3} rx="53" ry="3" fill="none" stroke={liquid.gradient[3]} strokeWidth="1.2" opacity="0.6" />

                {/* Rising Living Bubbles */}
                  <g className="jar-bubbles" clipPath={`url(#liquid-bounds-${clipId})`}>
                    <LiquidBubbles fillPercentage={liquid.fill * 100} x={42} y={surfaceY} width={156} height={currentFillHeight} />
                  </g>
              </g>
            )}

            {/* Submissions in flight: Review Queue droplets in headspace */}
            {awaitingReviewCount !== null && awaitingReviewCount !== undefined && awaitingReviewCount > 0 && (
              <g className="review-vapor-layer" opacity="0.8">
                <ellipse cx="120" cy={Math.max(90, surfaceY - 14)} rx="32" ry="6" fill="#fef08a" opacity="0.35" />
                <circle cx="105" cy={Math.max(86, surfaceY - 12)} r="2.5" fill="#facc15" />
                <circle cx="132" cy={Math.max(88, surfaceY - 15)} r="2" fill="#facc15" />
              </g>
            )}
          </g>

          {/* Calibrated Gauge Marks on Glass */}
          <g className="jar-gauge-marks" stroke="rgba(14, 116, 144, 0.4)" strokeWidth="1.5" strokeLinecap="round">
            <line x1="42" y1="128" x2="52" y2="128" />
            <line x1="42" y1="180" x2="56" y2="180" />
            <line x1="42" y1="232" x2="52" y2="232" />
          </g>

          {/* Vertical Glass Reflection Highlight */}
          <rect
            x="48"
            y="82"
            width="22"
            height="198"
            rx="11"
            ry="11"
            fill={`url(#glass-glare-${clipId})`}
            pointerEvents="none"
          />
        </svg>

        {/* Floating Percentage Badge Overlay */}
        <div className="jar-percentage-badge">
          {isTargetSetting ? (
            <span className="jar-percentage-badge__setting">Setting target</span>
          ) : (
            <span className="jar-percentage-badge__value">{percentage}%</span>
          )}
        </div>
      </div>

      {/* Category Info Header */}
      <div className="vessel-info">
        <div className="vessel-meta-header">
          <div className="vessel-meta-icon" style={{ backgroundColor: `${palette.primary}18`, color: palette.primary }}>
            <Icon name={category.iconName} size={18} />
          </div>
          <div>
            <h3 id={`jar-title-${category.id}`} className="vessel-title">
              {category.title}
            </h3>
            <span className="vessel-unit-label">
              {category.shortLabel} · {category.unitPlural}
            </span>
          </div>
        </div>

        {/* Count and Target Display with Sparkline */}
        <div className="vessel-metric">
          <div className="vessel-metric__main">
            <span className="vessel-metric__count">{approvedCount.toLocaleString()}</span>
            <span className="vessel-metric__unit">{category.unitPlural}</span>
          </div>

          <div className="vessel-metric__sub">
            {isTargetSetting ? (
              <span className="vessel-target-state">Launch target being set</span>
            ) : (
              <span className="vessel-target-state">
                of <strong>{target?.toLocaleString()}</strong> targeted
              </span>
            )}
          </div>

          {/* 30-Day Growth Sparkline */}
          {sparklineData.length > 1 && <div className="vessel-sparkline-row">
            <span className="tiny muted">30d Growth:</span>
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

        {/* Active Direct Queue Task Prompt */}
        <button type="button" className="vessel-info-button" onClick={(event) => { event.stopPropagation(); onOpenBreakdown?.(progress); }}>
          <Icon name="context" size={14} /> About &amp; how to help
        </button>

        {/* Interactive Utility Action Bar */}
        <div className="vessel-actions-strip" onClick={(e) => e.stopPropagation()}>
          {category.hasAudioSample && (
            <button
              type="button"
              className={`vessel-tool-btn ${isPlayingAudio ? 'is-playing' : ''}`}
              onClick={handleAudioPreview}
              title={`Listen to sample ${category.sampleAudioLabel}`}
              aria-label={`Listen to sample audio for ${category.title}`}
            >
              <Icon name="volume" size={13} />
              {isPlayingAudio ? 'Playing…' : 'Sample'}
            </button>
          )}

          <button
            type="button"
            className="vessel-tool-btn"
            onClick={() => onOpenBreakdown?.(progress)}
            title="Inspect composition breakdown"
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

        {/* Direct Contribution CTA Button */}
        <div className="vessel-action" onClick={(e) => e.stopPropagation()}>
          <Button
            href={category.ctaUrl}
            external
            variant={needsContributions ? 'primary' : 'secondary'}
            className="vessel-cta-button"
          >
            {category.ctaLabel}
          </Button>
        </div>
      </div>
    </article>
  );
}
