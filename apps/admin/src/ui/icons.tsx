import type { ReactNode } from 'react';
// TribeStudio's icon family is the admin console's too: same 24px grid, round
// caps and 1.75 stroke. It is a pure React module, so it is read from the
// studio directly and the two products can never drift apart.
import { Icon as StudioIcon, type IconName as StudioIconName } from '../../../tribestudio/src/ui/icons';

/** Glyphs the console needs that the studio has no use for, drawn to the same rules. */
const EXTRA: Record<string, ReactNode> = {
  coins: <><ellipse cx="12" cy="6" rx="7" ry="2.5" /><path d="M5 6v4c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V6" /><path d="M5 10v4c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-4" /><path d="M5 14v4c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-4" /></>,
  chart: <><path d="M4 20.5h16" /><path d="M7 17v-5M12 17V7M17 17v-8" /></>,
  headphones: <><path d="M4 15v-3a8 8 0 0 1 16 0v3" /><rect x="3.5" y="14" width="4" height="6.5" rx="1.5" /><rect x="16.5" y="14" width="4" height="6.5" rx="1.5" /></>,
  bag: <><path d="M5.5 8h13l-1 12.5h-11Z" /><path d="M9 10.5V7a3 3 0 0 1 6 0v3.5" /></>,
  mail: <><rect x="3" y="5.5" width="18" height="13" rx="2" /><path d="m4 7 8 6 8-6" /></>,
  flask: <><path d="M9.5 3.5h5M10.5 3.5v5.2L5 18.2a1.6 1.6 0 0 0 1.4 2.3h11.2a1.6 1.6 0 0 0 1.4-2.3l-5.5-9.5V3.5" /><path d="M7.5 14.5h9" /></>,
  cap: <><path d="m2.5 9 9.5-4.5L21.5 9 12 13.5Z" /><path d="M6.5 11v4.5c1.5 1.5 3.5 2.2 5.5 2.2s4-.7 5.5-2.2V11" /><path d="M21.5 9v5" /></>,
};

export type IconName = StudioIconName | keyof typeof EXTRA;

export function Icon({ name, className = '', title }: { name: IconName; className?: string; title?: string }) {
  const extra = EXTRA[name];
  if (!extra) return <StudioIcon name={name as StudioIconName} className={className} title={title} />;
  return (
    <svg
      className={`ts-icon ts-icon--${name}${className ? ` ${className}` : ''}`}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      aria-label={title}
      focusable="false"
    >
      {extra}
    </svg>
  );
}
