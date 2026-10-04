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

interface LiquidBubblesProps {
  fillPercentage: number;
  x: number;
  y: number;
  width: number;
  height: number;
  horizontal?: boolean;
}

/** Deterministic particles remain inside the true liquid bounds, even when paused. */
export function LiquidBubbles({ fillPercentage, x, y, width, height, horizontal = false }: LiquidBubblesProps) {
  const visual = getLiquidVisuals(fillPercentage);
  return (
    <g className="liquid-bubbles" data-bubble-count={visual.bubbleCount} aria-hidden="true">
      {Array.from({ length: visual.bubbleCount }, (_, index) => {
        const radius = Math.min(
          (1.8 + (index % 4) * 0.8) * visual.bubbleScale,
          width / 5,
          height / 5,
        );
        const cx = x + radius + ((index * 0.61803398875) % 1) * Math.max(0, width - radius * 2);
        const cy = y + radius + ((index * 0.38196601125 + 0.2) % 1) * Math.max(0, height - radius * 2);
        const style = {
          '--bubble-rise': `${-height * 0.8}px`,
          '--bubble-drift': `${horizontal ? width * 0.45 : 5 + (index % 3) * 2}px`,
          animationDelay: `${-index * 0.47}s`,
          animationDuration: `${2.8 + (index % 5) * 0.55 - visual.fill * 0.6}s`,
        } as CSSProperties;
        return (
          <circle
            key={index}
            className={`liquid-bubble${horizontal ? ' liquid-bubble--horizontal' : ''}`}
            cx={cx}
            cy={cy}
            r={radius}
            fill="rgba(255,255,255,0.36)"
            stroke="rgba(255,255,255,0.65)"
            strokeWidth="0.7"
            style={style}
          />
        );
      })}
    </g>
  );
}
