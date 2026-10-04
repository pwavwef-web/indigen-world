import type { CSSProperties } from 'react';

/**
 * The Indigen World mark (roof line, three bars, the sun) on a navy tile, in
 * the website's palette: pale-blue frame, white bars, cyan sun. `draw`
 * animates the strokes in, for entry screens; `live` lets the sun breathe.
 */
export function BrandMark({ size, draw = false, live = false, className = '' }: { size?: string; draw?: boolean; live?: boolean; className?: string }) {
  return (
    <span
      className={`ts-mark${draw ? ' ts-mark--draw' : ''}${live ? ' ts-mark--live' : ''}${className ? ` ${className}` : ''}`}
      style={size ? ({ ['--mark' as string]: size } as CSSProperties) : undefined}
      aria-hidden="true"
    >
      <svg viewBox="0 0 64 64">
        <path className="ts-mark__frame" d="M15 47V23l17-9 17 9v24" />
        <path className="ts-mark__line" d="M24 44V29m8 15V24m8 20V29" />
        <circle className="ts-mark__sun" cx="32" cy="14" r="4" />
      </svg>
    </span>
  );
}
