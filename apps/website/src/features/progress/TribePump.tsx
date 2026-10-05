import { useId } from 'react';
import { STUDIO_HOME_URL } from '../../content/creatorLinks';

/**
 * TribeStudio as the source pump. A real link: the whole machine opens the
 * studio by pointer, touch or keyboard, and nothing about it is drawn on a
 * canvas behind an invisible target.
 *
 * Three kinds of motion are kept apart. The idle rotor and breathing ring are
 * decoration and stop with motion. A brief spin-up plays only when an actual
 * approval leaves (`pulse` changes). Connection status is separate text beside
 * the pump, never implied by its glow.
 */
export function TribePump({ outlet, pulse, motion }: {
  /** Where the outlet nozzle leaves the machine: under the middle, or under the left flange. */
  outlet: 'center' | 'left' | 'none';
  /** Increments once per approval leaving the pump. */
  pulse: number;
  /** Decorative motion allowed. */
  motion: boolean;
}) {
  const id = useId().replace(/:/g, '');
  const outletX = outlet === 'left' ? 22 : 160;
  const blades = Array.from({ length: 7 }, (_, index) => index * (360 / 7));
  return (
    <div className={`tribe-pump tribe-pump--outlet-${outlet}`} data-motion={motion ? 'on' : 'off'}>
      <a className="tribe-pump__link" href={STUDIO_HOME_URL} target="_blank" rel="noopener noreferrer"
        aria-label="TribeStudio, Open studio (opens in a new tab)">
        <svg className="tribe-pump__machine" viewBox="0 0 320 132" aria-hidden="true" focusable="false">
          <defs>
            <linearGradient id={`${id}-enamel`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#ffffff" />
              <stop offset=".46" stopColor="#f3f8fb" />
              <stop offset=".82" stopColor="#dce8ef" />
              <stop offset="1" stopColor="#c9d9e3" />
            </linearGradient>
            <linearGradient id={`${id}-metal`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#5d8299" />
              <stop offset=".16" stopColor="#d7e9f1" />
              <stop offset=".34" stopColor="#f7fcfe" />
              <stop offset=".56" stopColor="#8cadbf" />
              <stop offset=".8" stopColor="#c3dbe6" />
              <stop offset="1" stopColor="#57798e" />
            </linearGradient>
            <linearGradient id={`${id}-metal-x`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#6f93a8" />
              <stop offset=".3" stopColor="#eef7fb" />
              <stop offset=".6" stopColor="#a6c3d2" />
              <stop offset="1" stopColor="#5f8399" />
            </linearGradient>
            <radialGradient id={`${id}-chamber`} cx=".42" cy=".38" r=".7">
              <stop offset="0" stopColor="#4fc3ff" />
              <stop offset=".45" stopColor="#1683d6" />
              <stop offset="1" stopColor="#08376d" />
            </radialGradient>
            <linearGradient id={`${id}-blade`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#e4f8ff" />
              <stop offset=".55" stopColor="#7fd6ff" />
              <stop offset="1" stopColor="#1f8fe0" />
            </linearGradient>
            <radialGradient id={`${id}-shadow`} cx=".5" cy=".5" r=".5">
              <stop offset="0" stopColor="#2c5f7c" stopOpacity=".22" />
              <stop offset="1" stopColor="#2c5f7c" stopOpacity="0" />
            </radialGradient>
            <linearGradient id={`${id}-glass`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#9cc3d6" />
              <stop offset=".25" stopColor="#f2fbff" />
              <stop offset=".7" stopColor="#d9eef7" />
              <stop offset="1" stopColor="#8db7cb" />
            </linearGradient>
          </defs>

          <ellipse cx="160" cy="118" rx="132" ry="9" fill={`url(#${id}-shadow)`} />

          {outlet !== 'none' && <g className="tribe-pump__outlet-nozzle">
            <rect x={outletX - 6.5} y={outlet === 'left' ? 84 : 104} width="13" height={outlet === 'left' ? 48 : 28} fill={`url(#${id}-glass)`} stroke="#93b9cc" strokeWidth="1" />
            <rect x={outletX - 10} y={outlet === 'left' ? 82 : 102} width="20" height="8" rx="2" fill={`url(#${id}-metal)`} stroke="#5f879c" strokeWidth=".8" />
          </g>}

          {[12, 288].map((x) => <g key={x}>
            <rect x={x} y="44" width="20" height="40" rx="9" fill={`url(#${id}-metal)`} stroke="#5d8398" strokeWidth="1" />
            <circle cx={x + 10} cy="52" r="1.8" fill="#6f92a6" />
            <circle cx={x + 10} cy="76" r="1.8" fill="#6f92a6" />
          </g>)}

          <rect x="24" y="18" width="272" height="92" rx="42" fill={`url(#${id}-enamel)`} stroke="#b4ccd9" strokeWidth="1.4" />
          <rect x="52" y="24" width="214" height="16" rx="8" fill="#ffffff" opacity=".78" />
          <path d="M60 104 H262" stroke="#b9cfdb" strokeWidth="1" opacity=".8" />

          <g className="tribe-pump__rotor-housing">
            <circle cx="90" cy="64" r="44" fill={`url(#${id}-metal)`} stroke="#7a9fb3" strokeWidth="1.2" />
            <circle cx="90" cy="64" r="37" fill={`url(#${id}-chamber)`} />
            <circle className="tribe-pump__ring-halo" cx="90" cy="64" r="34" fill="none" stroke="#7dd3fc" strokeWidth="7" opacity=".28" />
            <circle className="tribe-pump__ring" cx="90" cy="64" r="34" fill="none" stroke="#bff0ff" strokeWidth="1.8" />
            <g className="tribe-pump__rotor">
              <g className={pulse > 0 ? 'tribe-pump__spin is-spinning' : 'tribe-pump__spin'} key={pulse}>
                {blades.map((angle) => (
                  <path key={angle} transform={`rotate(${angle} 90 64)`}
                    d="M90 64 C95 55 104 46 115 44 C111 52 104 60 94 66 Z"
                    fill={`url(#${id}-blade)`} stroke="#0b5fa6" strokeWidth=".5" strokeOpacity=".5" />
                ))}
              </g>
            </g>
            <circle cx="90" cy="64" r="8.5" fill={`url(#${id}-metal-x)`} stroke="#4d758c" strokeWidth=".8" />
            <circle cx="90" cy="64" r="2.6" fill="#e9f7fd" />
            <ellipse cx="76" cy="46" rx="15" ry="7" fill="#ffffff" opacity=".35" transform="rotate(-28 76 46)" />
          </g>
          {pulse > 0 && <circle key={`flash-${pulse}`} className="tribe-pump__flash" cx="90" cy="64" r="34" fill="none" stroke="#e0f7ff" strokeWidth="4" />}
        </svg>
        <span className="tribe-pump__label">
          <span className="tribe-pump__name">TribeStudio</span>
          <span className="tribe-pump__cta">Open studio
            <svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true" focusable="false"><path d="M4 2h6v6M10 2 3 9" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </span>
        </span>
      </a>
      {outlet !== 'none' && <span className="tribe-pump__outlet-anchor" data-pipe-outlet aria-hidden="true" />}
    </div>
  );
}
