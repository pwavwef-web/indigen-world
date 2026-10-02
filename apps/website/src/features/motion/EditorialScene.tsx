import { useId } from 'react';
import type { MotionTheme } from './themes';

/** Shared still and timeline artwork. All movement comes from a Remotion frame. */
export function EditorialScene({ theme, progress = 0.25 }: { theme: MotionTheme; progress?: number }) {
  const id = useId().replaceAll(':', '');
  const phase = progress * Math.PI * 2;
  const drift = Math.sin(phase) * 8;
  const pulse = 0.65 + Math.sin(phase) * 0.2;
  const ink = '#dceaff', accent = '#67e8df';
  const points = [[170, 110], [340, 70], [520, 135], [560, 285], [330, 340], [140, 280]];
  const trace = (delay = 0) => ({ strokeDasharray: '24 460', strokeDashoffset: -(progress * 480 + delay) });

  return <svg viewBox="0 0 720 420" width="100%" height="100%" fill="none" aria-hidden="true">
    <defs>
      <radialGradient id={`${id}-glow`}><stop stopColor="#35b9db" stopOpacity=".2" /><stop offset="1" stopColor="#35b9db" stopOpacity="0" /></radialGradient>
      <linearGradient id={`${id}-glass`} x2="1" y2="1"><stop stopColor="#92baff" stopOpacity=".16" /><stop offset="1" stopColor="#243f81" stopOpacity=".12" /></linearGradient>
    </defs>
    <ellipse cx="360" cy="220" rx="315" ry="195" fill={`url(#${id}-glow)`} />
    <g stroke={ink} strokeWidth="1" opacity=".1">
      {[100, 180, 260, 340].map(y => <path key={y} d={`M80 ${y} H640`} />)}
      {[120, 240, 360, 480, 600].map(x => <path key={x} d={`M${x} 50 V370`} />)}
    </g>

    {theme === 'weave' && <g strokeWidth="2">
      {Array.from({ length: 7 }, (_, i) => <g key={i}>
        <path d={`M70 ${100 + i * 32} C230 ${40 + i * 32 + drift}, 420 ${340 - i * 24}, 650 ${110 + i * 26}`} stroke={i % 2 ? ink : accent} opacity=".5" />
        <path d={`M70 ${100 + i * 32} C230 ${40 + i * 32 + drift}, 420 ${340 - i * 24}, 650 ${110 + i * 26}`} stroke={accent} {...trace(i * 70)} />
      </g>)}
      <circle cx="360" cy="210" r="64" fill={`url(#${id}-glass)`} stroke={ink} strokeOpacity=".35" />
      <path d="M334 190 L386 230 M334 210 L360 230 L386 190 M334 230 L386 190" stroke={accent} strokeWidth="2" />
    </g>}

    {theme === 'roots' && <g strokeWidth="2" strokeLinecap="round">
      <path d="M360 350 V230 C360 155 260 155 210 80 M360 230 C360 155 460 155 510 80 M360 260 C290 260 250 290 160 290 M360 260 C430 260 470 290 560 290" stroke={ink} opacity=".4" />
      <path d="M360 350 V230 C360 155 260 155 210 80 M360 230 C360 155 460 155 510 80" stroke={accent} {...trace()} />
      {[[210, 80], [510, 80], [160, 290], [560, 290]].map(([x, y], i) => <g key={x} style={{ translate: `0px ${Math.sin(phase + i) * 5}px` }}>
        <ellipse cx={x} cy={y} rx="34" ry="17" fill={`url(#${id}-glass)`} stroke={accent} />
        <circle cx={x} cy={y} r="4" fill={accent} />
      </g>)}
      <circle cx="360" cy="240" r="36" fill={`url(#${id}-glass)`} stroke={ink} />
      <circle cx="360" cy="240" r="8" fill={accent} />
    </g>}

    {(theme === 'network' || theme === 'community' || theme === 'paths') && <g strokeWidth="1.5">
      {points.map(([x, y], i) => <g key={x}>
        <path d={`M${x} ${y} Q360 ${180 + drift} 360 210`} stroke={ink} opacity=".28" />
        <path d={`M${x} ${y} Q360 ${180 + drift} 360 210`} stroke={accent} {...trace(i * 55)} />
        <circle cx={x} cy={y} r={theme === 'community' ? 33 : 24} fill={`url(#${id}-glass)`} stroke={ink} strokeOpacity=".5" />
        {theme === 'community' ? <><circle cx={x} cy={y - 6} r="6" stroke={accent} /><path d={`M${x - 12} ${y + 12} Q${x} ${y - 2} ${x + 12} ${y + 12}`} stroke={accent} /></> : <circle cx={x} cy={y} r="5" fill={accent} opacity={0.7 + Math.sin(phase + i) * .3} />}
      </g>)}
      <circle cx="360" cy="210" r={52 + drift * .3} fill={`url(#${id}-glass)`} stroke={accent} />
      {theme === 'paths' ? <path d="M335 210 H385 M373 198 L385 210 L373 222" stroke={accent} strokeWidth="3" /> : <><circle cx="360" cy="210" r="20" stroke={ink} /><path d="M340 210 H380 M360 190 V230" stroke={ink} /></>}
    </g>}

    {(theme === 'language' || theme === 'story') && <g strokeWidth="1.5" strokeLinecap="round">
      <g style={{ translate: `0px ${drift * .45}px` }}>
        <path d="M360 145 Q280 110 160 140 V310 Q280 280 360 315 Q440 280 560 310 V140 Q440 110 360 145 Z" fill={`url(#${id}-glass)`} stroke={ink} strokeOpacity=".7" />
        <path d="M360 145 V315" stroke={accent} />
        {[170, 200, 230, 260].map((y, i) => <g key={y} opacity={.35 + Math.sin(phase + i) * .12}><path d={`M195 ${y} Q260 ${y - 12} 325 ${y + 4} M395 ${y + 4} Q460 ${y - 12} 525 ${y}`} stroke={ink} /></g>)}
      </g>
      {theme === 'language' ? Array.from({ length: 17 }, (_, i) => <path key={i} d={`M${232 + i * 16} ${65 - (8 + (1 + Math.sin(phase + i * .7)) * 14)} V${65 + (8 + (1 + Math.sin(phase + i * .7)) * 14)}`} stroke={accent} strokeWidth="3" />) : <path d={`M265 70 Q360 ${35 + drift} 455 70`} stroke={accent} {...trace()} />}
    </g>}

    {(theme === 'review' || theme === 'complete') && <g strokeWidth="1.5">
      <path d="M170 210 H550" stroke={ink} opacity=".4" /><path d="M170 210 H550" stroke={accent} {...trace()} />
      {[150, 310, 470].map((x, i) => <g key={x} style={{ translate: `0px ${Math.sin(phase - i * .9) * 5}px` }}>
        <rect x={x - 25} y="128" width="140" height="172" rx="18" fill={`url(#${id}-glass)`} stroke={ink} strokeOpacity=".55" />
        <circle cx={x + 45} cy="176" r="21" stroke={accent} opacity={pulse + i * .08} />
        {i === 2 ? <path d={`M${x + 34} 176 L${x + 43} 185 L${x + 59} 166`} stroke={accent} strokeWidth="3" /> : <path d={`M${x + 36} 176 H${x + 54} M${x + 45} 167 V185`} stroke={accent} />}
        <path d={`M${x} 224 H${x + 90} M${x} 244 H${x + 70} M${x} 264 H${x + 48}`} stroke={ink} opacity=".4" />
      </g>)}
    </g>}

    {theme === 'care' && <g strokeWidth="1.5">
      {[105, 143, 180].map((r, i) => <ellipse key={r} cx="360" cy="215" rx={r} ry={r * .78} stroke={ink} strokeOpacity=".18" style={{ rotate: `${Math.sin(phase) * (i + 1) * 3}deg`, transformOrigin: '360px 215px' }} />)}
      <path d="M360 100 L445 138 V218 Q442 289 360 332 Q278 289 275 218 V138 Z" fill={`url(#${id}-glass)`} stroke={accent} />
      <path d="M360 100 L445 138 V218 Q442 289 360 332 Q278 289 275 218 V138 Z" stroke={ink} {...trace()} />
      <rect x="332" y="195" width="56" height="47" rx="10" stroke={ink} /><path d="M343 195 V177 A17 17 0 0 1 377 177 V195" stroke={ink} /><circle cx="360" cy="217" r="4" fill={accent} />
    </g>}

    {theme === 'message' && <g strokeWidth="1.5">
      <g style={{ translate: `0px ${drift}px` }}><rect x="165" y="115" width="290" height="170" rx="24" fill={`url(#${id}-glass)`} stroke={ink} /><path d="M200 160 H405 M200 190 H360 M200 220 H315 M225 285 L210 322 L285 285" stroke={ink} strokeOpacity=".5" /></g>
      <g style={{ translate: `0px ${-drift}px` }}><rect x="375" y="210" width="175" height="98" rx="20" fill="#224174" stroke={accent} />{[420, 462, 504].map((x, i) => <circle key={x} cx={x} cy="259" r="6" fill={accent} opacity={.6 + Math.sin(phase + i) * .35} />)}</g>
      <path d="M465 155 Q565 120 580 210" stroke={accent} {...trace()} />
    </g>}

    {(theme === 'discovery' || theme === 'compass') && <g strokeWidth="1.5">
      <circle cx="360" cy="210" r="140" stroke={ink} strokeOpacity=".25" />
      <ellipse cx="360" cy="210" rx="200" ry="72" stroke={accent} strokeOpacity=".5" style={{ rotate: `${-25 + drift * .3}deg`, transformOrigin: '360px 210px' }} />
      <circle cx="360" cy="210" r="85" fill={`url(#${id}-glass)`} stroke={ink} />
      <g style={{ rotate: `${drift * 2}deg`, transformOrigin: '360px 210px' }}><path d="M360 140 L387 210 L360 280 L333 210 Z" stroke={accent} fill="#67e8df" fillOpacity=".12" /><path d="M360 140 V280" stroke={ink} /></g>
      {[0, 1, 2].map(i => <circle key={i} cx={360 + Math.cos(phase + i * 2.094) * 172} cy={210 + Math.sin(phase + i * 2.094) * 120} r="8" fill={accent} />)}
    </g>}
    <g fill={accent} opacity=".4"><circle cx="95" cy="65" r="2" /><circle cx="625" cy="340" r="2" /><circle cx="590" cy="70" r="2" /></g>
  </svg>;
}
