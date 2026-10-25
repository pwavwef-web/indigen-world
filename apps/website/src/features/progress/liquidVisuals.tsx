import type { CSSProperties } from 'react';
import { liquidAppearance } from './liquidAppearance';

export function getLiquidVisuals(fillPercentage: number, isTargetSetting = false) {
  const appearance = liquidAppearance(fillPercentage, isTargetSetting);

  return {
    fill: appearance.fillPercent / 100,
    colour: appearance.colour,
    gradient: [appearance.deep, appearance.colour, appearance.light, appearance.surface],
    bubbleCount: appearance.bubbleCount,
    bubbleScale: appearance.bubbleScale,
    stage: appearance.stage,
  };
}

interface LiquidBubbleLayerProps {
  fillPercentage: number;
  /** The liquid below its surface, in the vessel's drawing units. */
  area: { x: number; y: number; width: number; height: number };
  /** The vessel drawing's own size: [width, height]. */
  frame: [number, number];
  horizontal?: boolean;
}

/**
 * Deterministic bubbles inside the true liquid bounds, even when paused.
 *
 * Plain elements rather than drawing: each one only moves by transform, so the
 * browser composites the motion instead of repainting the vessel each frame.
 */
export function LiquidBubbleLayer({ fillPercentage, area, frame, horizontal = false }: LiquidBubbleLayerProps) {
  const visual = getLiquidVisuals(fillPercentage);
  if (!visual.bubbleCount || area.width < 4 || area.height < 4) return null;
  const [frameWidth, frameHeight] = frame;
  // The liquid's rounded ends: the jar's base, or both caps of the tank.
  const corner = horizontal
    ? { borderRadius: `${(27 / area.width) * 100}% ${(27 / area.width) * 100}% ${(27 / area.width) * 100}% ${(27 / area.width) * 100}% / 46% 46% 46% 46%` }
    : { borderRadius: `0 0 ${(24 / area.width) * 100}% ${(24 / area.width) * 100}% / 0 0 ${(Math.min(22, area.height) / area.height) * 100}% ${(Math.min(22, area.height) / area.height) * 100}%` };
  const style = {
    left: `${(area.x / frameWidth) * 100}%`,
    top: `${(area.y / frameHeight) * 100}%`,
    width: `${(area.width / frameWidth) * 100}%`,
    height: `${(area.height / frameHeight) * 100}%`,
    ...corner,
  } as CSSProperties;
  return (
    <div className={`liquid-bubble-layer${horizontal ? ' liquid-bubble-layer--tank' : ''}`} data-bubble-count={visual.bubbleCount} style={style}>
      {Array.from({ length: visual.bubbleCount }, (_, index) => {
        const size = Math.min((1.8 + (index % 4) * 0.8) * visual.bubbleScale * 2, area.width / 5, area.height / 5);
        const left = ((index * 0.61803398875) % 1) * Math.max(0, area.width - size);
        const top = ((index * 0.38196601125 + 0.2) % 1) * Math.max(0, area.height - size);
        const bubble = {
          left: `${(left / area.width) * 100}%`,
          top: `${(top / area.height) * 100}%`,
          width: `${(size / area.width) * 100}%`,
          // Travel, as a share of the bubble's own size: up through the liquid, or along the tank.
          '--rise': horizontal ? '0%' : `${(-area.height * 0.8 / size) * 100}%`,
          '--drift': horizontal ? `${(area.width * 0.45 / size) * 100}%` : `${((5 + (index % 3) * 2) / size) * 100}%`,
          animationDelay: `${-index * 0.47}s`,
          animationDuration: `${2.8 + (index % 5) * 0.55 - visual.fill * 0.6}s`,
        } as CSSProperties;
        return <span key={index} className="liquid-bubble-dot" style={bubble} />;
      })}
    </div>
  );
}
