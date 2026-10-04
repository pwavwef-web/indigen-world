/**
 * src/features/progress/CulturalPot.tsx
 *
 * Traditional Kasena earthenware clay cooler (Chambala) and calabash vessel skin.
 * Embellished with authentic Tiébélé architectural geometric friezes (chevrons,
 * diamonds, and triangles) and responsive SVG liquid interior.
 */

import React, { useId, useState } from 'react';
import type { CategoryProgress } from './progressTypes';
import { Icon } from '../../components/Icon';
import { Button } from '../../components/Button';
import { playSampleAudioPreview, playVesselChime } from './progressAudio';
import { getLiquidVisuals, LiquidBubbles } from './liquidVisuals';

interface CulturalPotProps {
  progress: CategoryProgress;
  canAnimate: boolean;
  staggerIndex?: number;
  onOpenBreakdown?: (progress: CategoryProgress) => void;
  onOpenShare?: (progress: CategoryProgress) => void;
  onOpenAudit?: (progress: CategoryProgress) => void;
  onOpenPledge?: (progress: CategoryProgress) => void;
}

export function CulturalPot({
  progress,
  canAnimate,
  staggerIndex = 0,
  onOpenBreakdown,
  onOpenShare,
  onOpenAudit,
  onOpenPledge,
}: CulturalPotProps) {
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

  // Earthen pot interior cavity:
  // Top: Y = 95
  // Bottom: Y = 280
  // Fillable height: 185px
  const interiorBottomY = 280;
  const maxFillHeight = 185;
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

  // Sparkline SVG points generator
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
      className={`vessel-card vessel-card--cultural ${isTargetReached ? 'vessel-card--reached' : ''} ${needsContributions ? 'vessel-card--highlighted' : ''}`}
      style={entranceStyle}
      data-motion={canAnimate ? 'animated' : 'static'}
      data-liquid-stage={liquid.stage}
      aria-labelledby={`pot-title-${category.id}`}
      onClick={handleCardClick}
    >
      {/* Target status & velocity banner */}
      <div className="vessel-badge-row">
        {needsContributions ? (
          <span className="vessel-badge vessel-badge--need">
            <span className="vessel-badge__dot" aria-hidden="true" />
            Needs help
          </span>
        ) : isBeyondTarget ? (
          <span className="vessel-badge vessel-badge--beyond">
            <Icon name="check" size={12} /> Target exceeded
          </span>
        ) : isTargetReached ? (
          <span className="vessel-badge vessel-badge--reached">
            <Icon name="check" size={12} /> Harvest reached
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

      {/* SVG Traditional Pot Graphic */}
      <div
        className="vessel-graphic vessel-graphic--cultural"
        role="progressbar"
        aria-label={`${category.title} approved contributions`}
        aria-valuenow={isTargetSetting ? undefined : Math.min(approvedCount, target ?? 0)}
        aria-valuemin={0}
        aria-valuemax={target ?? undefined}
        aria-valuetext={
          isTargetSetting
            ? `${approvedCount} ${category.unitPlural} approved; target being set`
            : `${approvedCount} of ${target} ${category.unitPlural} (${percentage}%)`
        }
      >
        <svg
          viewBox="0 0 240 330"
          className={`pot-svg ${canAnimate ? 'pot-svg--animated' : 'pot-svg--static'}`}
          aria-hidden="true"
        >
          <defs>
            {/* Clay pot body gradient */}
            <linearGradient id={`clay-body-${clipId}`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#8c3d1f" />
              <stop offset="40%" stopColor="#b45309" />
              <stop offset="85%" stopColor="#78350f" />
              <stop offset="100%" stopColor="#451a03" />
            </linearGradient>

            {/* Cultural category liquid gradient */}
            <linearGradient id={`pot-liquid-${clipId}`} x1="0%" y1="100%" x2="0%" y2="0%">
              <stop offset="0%" stopColor={liquid.gradient[0]} stopOpacity="0.95" />
              <stop offset="40%" stopColor={liquid.gradient[1]} stopOpacity="0.9" />
              <stop offset="85%" stopColor={liquid.gradient[2]} stopOpacity="0.92" />
              <stop offset="100%" stopColor={liquid.gradient[3]} stopOpacity="0.96" />
            </linearGradient>

            {/* Interior cavity clip path */}
            <clipPath id={`pot-clip-${clipId}`}>
              {/* Rounded amphora / calabash cavity path */}
              <path d="M 72 95 Q 50 140 42 205 Q 36 270 120 280 Q 204 270 198 205 Q 190 140 168 95 Z" />
            </clipPath>
            <clipPath id={`pot-liquid-bounds-${clipId}`}>
              <rect x="35" y={surfaceY} width="170" height={currentFillHeight} />
            </clipPath>
          </defs>

          {/* Clay Vessel Base & Shadow */}
          <ellipse cx="120" cy="305" rx="65" ry="12" fill="rgba(15, 23, 42, 0.28)" />

          {/* Outer Earthen Clay Pot Outline */}
          <path
            d="M 68 85 L 60 70 L 180 70 L 172 85 Q 215 140 205 220 Q 195 295 120 295 Q 45 295 35 220 Q 25 140 68 85 Z"
            fill={`url(#clay-body-${clipId})`}
            stroke="#291307"
            strokeWidth="3.5"
          />

          {/* Tiébélé Geometric Chevron Neck Border (White & Black slip painting) */}
          <g className="tiebele-neck-patterns" opacity="0.9">
            <rect x="62" y="70" width="116" height="12" fill="#1e1b18" />
            <path
              d="M 64 82 L 72 70 L 80 82 L 88 70 L 96 82 L 104 70 L 112 82 L 120 70 L 128 82 L 136 70 L 144 82 L 152 70 L 160 82 L 168 70 L 176 82"
              fill="none"
              stroke="#fef3c7"
              strokeWidth="2.5"
            />
          </g>

          {/* Interior Cutaway Window displaying Liquid */}
          <g clipPath={`url(#pot-clip-${clipId})`}>
            {/* Background inside earthenware */}
            <rect x="35" y="90" width="170" height="200" fill="#261208" />

            {/* Liquid Fill */}
            {!isTargetSetting && currentFillHeight > 0 && (
              <g className="pot-liquid-group">
                <rect
                  className="liquid-fill"
                  x="35"
                  y={surfaceY}
                  width="170"
                  height={currentFillHeight + 20}
                  fill={`url(#pot-liquid-${clipId})`}
                />

                {/* Oscillating Surface Wave */}
                <path
                  d={`M 30 ${surfaceY} Q 75 ${surfaceY - 5} 120 ${surfaceY} T 210 ${surfaceY} L 210 ${surfaceY + 6} Q 165 ${surfaceY + 10} 120 ${surfaceY + 6} T 30 ${surfaceY + 6} Z`}
                  fill={liquid.gradient[3]}
                  opacity="0.65"
                  className="liquid-wave liquid-wave--top"
                />
                <ellipse className="liquid-ripple" cx="120" cy={surfaceY + 3} rx="50" ry="3" fill="none" stroke={liquid.gradient[3]} strokeWidth="1.2" opacity="0.6" />

                {/* Rising Living Bubbles */}
                  <g className="pot-bubbles" clipPath={`url(#pot-liquid-bounds-${clipId})`}>
                    <LiquidBubbles fillPercentage={liquid.fill * 100} x={47} y={surfaceY} width={146} height={currentFillHeight} />
                  </g>
              </g>
            )}

            {/* Submissions in flight: Review Queue droplets/vapor */}
            {awaitingReviewCount !== null && awaitingReviewCount !== undefined && awaitingReviewCount > 0 && (
              <g className="review-vapor-layer" opacity="0.75">
                <ellipse cx="120" cy={Math.max(105, surfaceY - 14)} rx="30" ry="6" fill="#fef08a" opacity="0.4" />
                <circle cx="112" cy={Math.max(100, surfaceY - 12)} r="2.5" fill="#fef08a" />
                <circle cx="128" cy={Math.max(103, surfaceY - 16)} r="2" fill="#fef08a" />
              </g>
            )}
          </g>

          {/* Tiébélé Diamond Wall Motifs on Clay Pot Exterior */}
          <path
            d="M 120 185 L 132 205 L 120 225 L 108 205 Z"
            fill="#fef3c7"
            stroke="#1c1917"
            strokeWidth="1.5"
            opacity="0.85"
          />
          <path
            d="M 75 190 L 83 205 L 75 220 L 67 205 Z"
            fill="#fef3c7"
            stroke="#1c1917"
            strokeWidth="1.5"
            opacity="0.85"
          />
          <path
            d="M 165 190 L 173 205 L 165 220 L 157 205 Z"
            fill="#fef3c7"
            stroke="#1c1917"
            strokeWidth="1.5"
            opacity="0.85"
          />

          {/* 100% Target Completion Woven Grass Lid & Seal */}
          {isTargetReached && (
            <g className="pot-completion-seal">
              <ellipse cx="120" cy="68" rx="42" ry="14" fill="#d97706" stroke="#78350f" strokeWidth="2.5" />
              <path d="M 100 68 Q 120 52 140 68" stroke="#fef3c7" strokeWidth="2" fill="none" />
              <circle cx="120" cy="62" r="5" fill="#f59e0b" />
            </g>
          )}
        </svg>

        {/* Central percentage overlay */}
        <div className="vessel-percent-tag">
          {isTargetSetting ? (
            <span className="vessel-percent-tag__setting">Setting target</span>
          ) : (
            <span className="vessel-percent-tag__value">{percentage}%</span>
          )}
        </div>
      </div>

      {/* Vessel Details & Metadata */}
      <div className="vessel-meta">
        <div className="vessel-meta-header">
          <div className="vessel-meta-icon" style={{ backgroundColor: `${palette.primary}20`, color: palette.primary }}>
            <Icon name={category.iconName} size={18} />
          </div>
          <div>
            <h3 id={`pot-title-${category.id}`} className="vessel-title">
              {category.title}
            </h3>
            <span className="vessel-unit-label">
              {category.shortLabel} · {category.unitPlural}
            </span>
          </div>
        </div>

        {/* Counts & Sparkline Row */}
        <div className="vessel-stats-row">
          <div className="vessel-counts">
            <span className="vessel-current-count">
              {approvedCount.toLocaleString()}
            </span>
            <span className="vessel-target-count">
              / {target ? target.toLocaleString() : 'Target being set'}
            </span>
          </div>

          {/* 30-Day Growth Sparkline */}
          {sparklineData.length > 1 && <div className="vessel-sparkline" title="30-day verified growth">
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
            <span className="sparkline-label">30d</span>
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
              aria-label={`Listen to sample ${category.sampleAudioLabel}`}
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
            aria-label="Inspect sub-category composition"
          >
            <Icon name="layers" size={13} /> Breakdown
          </button>

          <button
            type="button"
            className="vessel-tool-btn"
            onClick={() => onOpenPledge?.(progress)}
            title={`Pledge contributions (${pledgeCount} pledged)`}
            aria-label={`Pledge to help with ${category.title}`}
          >
            <Icon name="check" size={13} /> Pledge
          </button>

          <button
            type="button"
            className="vessel-tool-btn"
            onClick={() => onOpenShare?.(progress)}
            title="Share progress"
            aria-label={`Share ${category.title} progress`}
          >
            <Icon name="chat" size={13} /> Share
          </button>

          <button
            type="button"
            className="vessel-tool-btn"
            onClick={() => onOpenAudit?.(progress)}
            title="Inspect query math"
            aria-label="Inspect query verification"
          >
            <Icon name="source" size={13} /> Audit
          </button>

        </div>

        {/* Primary CTA */}
        <div className="vessel-footer-cta" onClick={(e) => e.stopPropagation()}>
          <Button href={category.ctaUrl} external variant={needsContributions ? 'primary' : 'secondary'}>
            {category.ctaLabel}
          </Button>
        </div>
      </div>
    </article>
  );
}
