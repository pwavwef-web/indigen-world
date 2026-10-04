/**
 * src/features/progress/VerticalJar.tsx
 *
 * Upright transparent glass jar component for the "Vertical jars" view.
 *
 * Visual highlights:
 *  - Accurate SVG liquid fill geometry from 0% (empty) to 100% (full).
 *  - Continuous rising bubbles with varied sizes and speeds, clipped inside the jar.
 *  - Gentle sinusoidal liquid surface wave.
 *  - Glass edge highlights, internal reflections, and depth shadows.
 *  - Calibrated volume gauge marks.
 *  - Category icon, count, target, and percentage.
 *  - Direct contribution CTA button beneath the vessel.
 *  - Celebratory glow and badge when target is reached or exceeded.
 */

import React, { useId } from 'react';
import type { CategoryProgress } from './progressTypes';
import { Icon } from '../../components/Icon';
import { Button } from '../../components/Button';

interface VerticalJarProps {
  progress: CategoryProgress;
  canAnimate: boolean;
  staggerIndex?: number;
}

export function VerticalJar({ progress, canAnimate, staggerIndex = 0 }: VerticalJarProps) {
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

  // Jar internal cavity geometry
  // Top of interior cavity: Y = 76
  // Bottom of interior cavity: Y = 286
  // Total fillable height: 210px
  const interiorBottomY = 286;
  const maxFillHeight = 210;
  const currentFillHeight = isTargetSetting ? 0 : (fillPercentage / 100) * maxFillHeight;
  const surfaceY = interiorBottomY - currentFillHeight;

  // Staggered entrance delay
  const entranceStyle: React.CSSProperties = {
    animationDelay: `${staggerIndex * 70}ms`,
  };

  return (
    <article
      className={`vessel-card vessel-card--vertical ${isTargetReached ? 'vessel-card--reached' : ''} ${needsContributions ? 'vessel-card--highlighted' : ''}`}
      style={entranceStyle}
      aria-labelledby={`jar-title-${category.id}`}
    >
      {/* Target status banner */}
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
      </div>

      {/* SVG Jar Illustration */}
      <div
        className="vessel-graphic vessel-graphic--vertical"
        role="progressbar"
        aria-valuenow={approvedCount}
        aria-valuemin={0}
        aria-valuemax={target ?? undefined}
        aria-valuetext={
          isTargetSetting
            ? `${approvedCount} ${approvedCount === 1 ? category.unit : category.unitPlural} approved; target is being set`
            : `${approvedCount} of ${target} ${category.unitPlural} approved (${percentage}%)`
        }
      >
        <svg
          viewBox="0 0 240 330"
          className={`jar-svg ${canAnimate ? 'jar-svg--animated' : 'jar-svg--static'}`}
          aria-hidden="true"
        >
          <defs>
            {/* Liquid linear gradient */}
            <linearGradient id={`liquid-grad-${clipId}`} x1="0%" y1="100%" x2="0%" y2="0%">
              <stop offset="0%" stopColor="#0f3b70" stopOpacity="0.94" />
              <stop offset="40%" stopColor="#0284c7" stopOpacity="0.88" />
              <stop offset="85%" stopColor="#38bdf8" stopOpacity="0.90" />
              <stop offset="100%" stopColor="#7dd3fc" stopOpacity="0.96" />
            </linearGradient>

            {/* Surface wave gradient */}
            <linearGradient id={`surface-grad-${clipId}`} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#7dd3fc" stopOpacity="0.95" />
              <stop offset="50%" stopColor="#e0f2fe" stopOpacity="1" />
              <stop offset="100%" stopColor="#7dd3fc" stopOpacity="0.95" />
            </linearGradient>

            {/* Glass body reflections */}
            <linearGradient id={`glass-reflection-${clipId}`} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.45" />
              <stop offset="15%" stopColor="#ffffff" stopOpacity="0.12" />
              <stop offset="80%" stopColor="#ffffff" stopOpacity="0.04" />
              <stop offset="95%" stopColor="#ffffff" stopOpacity="0.30" />
            </linearGradient>

            {/* Specular gleam along left curved edge */}
            <linearGradient id={`gleam-${clipId}`} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.6" />
              <stop offset="60%" stopColor="#ffffff" stopOpacity="0.1" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
            </linearGradient>

            {/* Jar interior clip path - clips liquid & bubbles completely to interior */}
            <clipPath id={`cavity-${clipId}`}>
              <path
                d="M 52,86
                   C 52,72 88,48 94,48
                   L 146,48
                   C 152,48 188,72 188,86
                   L 188,266
                   C 188,280 178,290 162,290
                   L 78,290
                   C 62,290 52,280 52,266
                   Z"
              />
            </clipPath>
          </defs>

          {/* Jar base drop shadow */}
          <ellipse cx="120" cy="308" rx="72" ry="10" fill="rgba(20, 37, 67, 0.12)" />
          <ellipse cx="120" cy="306" rx="58" ry="6" fill="rgba(2, 132, 199, 0.15)" />

          {/* Rear glass wall */}
          <path
            d="M 50,86
               C 50,70 86,46 94,46
               L 146,46
               C 154,46 190,70 190,86
               L 190,268
               C 190,284 180,294 164,294
               L 76,294
               C 60,294 50,284 50,268
               Z"
            fill="rgba(240, 249, 255, 0.45)"
            stroke="rgba(30, 58, 102, 0.16)"
            strokeWidth="2"
          />

          {/* Liquid and Bubbles (strictly inside cavity) */}
          <g clipPath={`url(#cavity-${clipId})`}>
            {currentFillHeight > 0 ? (
              <>
                {/* Liquid Body */}
                <rect
                  x="48"
                  y={surfaceY}
                  width="144"
                  height={currentFillHeight + 10}
                  fill={`url(#liquid-grad-${clipId})`}
                  className="jar-liquid-fill"
                />

                {/* Moving Liquid Surface Wave */}
                <path
                  d={`M 48,${surfaceY}
                     Q 84,${surfaceY - (canAnimate ? 4 : 2)} 120,${surfaceY}
                     T 192,${surfaceY}
                     L 192,${surfaceY + 8}
                     L 48,${surfaceY + 8}
                     Z`}
                  fill={`url(#surface-grad-${clipId})`}
                  className={canAnimate ? 'jar-surface-wave' : ''}
                />

                {/* Sub-surface glow line */}
                <line
                  x1="52"
                  y1={surfaceY + 1}
                  x2="188"
                  y2={surfaceY + 1}
                  stroke="rgba(255, 255, 255, 0.85)"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />

                {/* Bubbles rising vertically through liquid */}
                {canAnimate ? (
                  <g className="jar-bubbles" aria-hidden="true">
                    <circle cx="85" cy={interiorBottomY - 15} r="3.5" className="bubble bubble--1" />
                    <circle cx="140" cy={interiorBottomY - 25} r="5" className="bubble bubble--2" />
                    <circle cx="110" cy={interiorBottomY - 10} r="2.5" className="bubble bubble--3" />
                    <circle cx="165" cy={interiorBottomY - 40} r="4" className="bubble bubble--4" />
                    <circle cx="70" cy={interiorBottomY - 35} r="3" className="bubble bubble--5" />
                    <circle cx="125" cy={interiorBottomY - 50} r="4.5" className="bubble bubble--6" />
                    <circle cx="95" cy={interiorBottomY - 60} r="2" className="bubble bubble--7" />
                  </g>
                ) : (
                  <g className="jar-bubbles--static" aria-hidden="true">
                    <circle cx="85" cy={surfaceY + 30} r="3" fill="rgba(255, 255, 255, 0.4)" />
                    <circle cx="140" cy={surfaceY + 50} r="4" fill="rgba(255, 255, 255, 0.4)" />
                    <circle cx="110" cy={surfaceY + 70} r="2.5" fill="rgba(255, 255, 255, 0.35)" />
                  </g>
                )}
              </>
            ) : null}

            {/* Subtle internal depth shadow */}
            <path
              d="M 52,86 L 52,266 C 52,280 62,290 76,290 L 164,290 C 178,290 188,280 188,266 L 188,86 Z"
              fill={`url(#glass-reflection-${clipId})`}
              style={{ mixBlendMode: 'overlay' }}
            />
          </g>

          {/* Calibrated measurement hash marks */}
          <g className="jar-gauges" opacity="0.45" stroke="rgba(30, 58, 102, 0.6)" strokeWidth="1.2">
            {/* 100% mark */}
            <line x1="176" y1="76" x2="188" y2="76" />
            {/* 75% mark */}
            <line x1="179" y1="128" x2="188" y2="128" />
            {/* 50% mark */}
            <line x1="176" y1="181" x2="188" y2="181" />
            {/* 25% mark */}
            <line x1="179" y1="233" x2="188" y2="233" />
          </g>

          {/* Foreground Glass Vessel Outlines and Rim */}
          {/* Glass body outer wall */}
          <path
            d="M 48,86
               C 48,70 86,44 94,44
               L 146,44
               C 154,44 192,70 192,86
               L 192,268
               C 192,284 180,296 164,296
               L 76,296
               C 60,296 48,284 48,268
               Z"
            fill="none"
            stroke="rgba(255, 255, 255, 0.85)"
            strokeWidth="3"
          />
          <path
            d="M 48,86
               C 48,70 86,44 94,44
               L 146,44
               C 154,44 192,70 192,86
               L 192,268
               C 192,284 180,296 164,296
               L 76,296
               C 60,296 48,284 48,268
               Z"
            fill="none"
            stroke="rgba(30, 58, 102, 0.22)"
            strokeWidth="1.5"
          />

          {/* Left specular reflection stripe */}
          <path
            d="M 56,92 L 56,260"
            stroke={`url(#gleam-${clipId})`}
            strokeWidth="3.5"
            strokeLinecap="round"
          />

          {/* Jar Neck and Collar Rim */}
          <rect
            x="84"
            y="26"
            width="72"
            height="18"
            rx="4"
            fill="#ffffff"
            stroke="rgba(30, 58, 102, 0.2)"
            strokeWidth="1.5"
          />
          <rect
            x="78"
            y="18"
            width="84"
            height="12"
            rx="5"
            fill="#f8fafc"
            stroke="rgba(30, 58, 102, 0.28)"
            strokeWidth="1.5"
          />

          {/* Lid Seal / Accent band */}
          <line
            x1="86"
            y1="35"
            x2="154"
            y2="35"
            stroke={isTargetReached ? '#d97706' : '#0284c7'}
            strokeWidth="2.5"
            strokeLinecap="round"
          />

          {/* Category Icon Badge centered on Jar Neck */}
          <circle
            cx="120"
            cy="35"
            r="11"
            fill={isTargetReached ? '#fef3c7' : '#e0f2fe'}
            stroke={isTargetReached ? '#d97706' : '#0284c7'}
            strokeWidth="1.5"
          />
          <g transform="translate(112, 27) scale(0.65)">
            <Icon name={category.iconName} size={24} />
          </g>

          {/* Target Reached celebration stars / glow */}
          {isTargetReached ? (
            <g className="jar-celebration-stars" aria-hidden="true">
              <path
                d="M 45,60 L 48,68 L 56,71 L 48,74 L 45,82 L 42,74 L 34,71 L 42,68 Z"
                fill="#f59e0b"
                opacity="0.9"
              />
              <path
                d="M 195,65 L 197,71 L 203,73 L 197,75 L 195,81 L 193,75 L 187,73 L 193,71 Z"
                fill="#fbbf24"
                opacity="0.9"
              />
            </g>
          ) : null}
        </svg>

        {/* Floating Percentage / Fill Badge Overlay */}
        <div className="jar-percentage-badge">
          {isTargetSetting ? (
            <span className="jar-percentage-badge__setting">Target setting</span>
          ) : (
            <span className="jar-percentage-badge__value">
              {percentage}%
            </span>
          )}
        </div>
      </div>

      {/* Category Info Header */}
      <div className="vessel-info">
        <h3 id={`jar-title-${category.id}`} className="vessel-title">
          {category.title}
        </h3>
        <p className="vessel-description">{category.description}</p>

        {/* Count and Target Display */}
        <div className="vessel-metric">
          <div className="vessel-metric__main">
            <span className="vessel-metric__count">{approvedCount.toLocaleString()}</span>
            <span className="vessel-metric__unit">
              {approvedCount === 1 ? category.unit : category.unitPlural}
            </span>
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

          {awaitingReviewCount != null && awaitingReviewCount > 0 ? (
            <p className="vessel-review-note" title="Submissions currently in the community review queue">
              <span className="vessel-review-note__dot" aria-hidden="true" />
              {awaitingReviewCount} awaiting review
            </p>
          ) : null}
        </div>
      </div>

      {/* Direct Contribution CTA Button */}
      <div className="vessel-action">
        <Button
          href={category.ctaUrl}
          external
          variant={needsContributions ? 'primary' : 'secondary'}
          className="vessel-cta-button"
        >
          {category.ctaLabel}
        </Button>
      </div>

      {/* Accessible Details Expander for Review Criteria */}
      <details className="vessel-details">
        <summary className="vessel-details__summary">How this is counted</summary>
        <div className="vessel-details__content">
          <p>{category.explanation}</p>
          <p className="tiny muted">
            <strong>Eligibility rule:</strong> {category.countingRule}. Unapproved or withdrawn submissions do not inflate progress.
          </p>
        </div>
      </details>
    </article>
  );
}
