import { useId } from 'react';
import type { CategoryProgress } from './progressTypes';
import { getLiquidVisuals, LiquidBubbles } from './liquidVisuals';

/** Layered glass optics and a clipped, data-driven liquid volume. */
export function GlassVessel({ progress, horizontal = false }: { progress: CategoryProgress; horizontal?: boolean }) {
  const id = useId();
  const liquid = getLiquidVisuals(progress.fillPercentage, progress.isTargetSetting);
  const body = 'M64 67 L64 88 C64 112 34 114 34 145 L34 272 Q34 301 64 302 L176 302 Q206 301 206 272 L206 145 C206 114 176 112 176 88 L176 67 Z';
  const cavity = 'M70 85 L70 93 C70 115 41 121 41 147 L41 272 Q41 294 65 294 L175 294 Q199 294 199 272 L199 147 C199 121 170 115 170 93 L170 85 Z';
  const x = horizontal ? 32 : 41;
  const y = horizontal ? 28 : 294 - 209 * liquid.fill;
  const width = horizontal ? 536 * liquid.fill : 158;
  const height = horizontal ? 74 : 209 * liquid.fill;
  return <svg className={`glass-vessel-svg ${horizontal ? 'glass-vessel-svg--tank' : ''}`} viewBox={horizontal ? '0 0 600 130' : '0 0 240 330'} aria-hidden="true">
    <defs>
      <linearGradient id={`glass-${id}`} x1="0" x2="1">
        <stop stopColor="#6296b3" stopOpacity=".55" /><stop offset=".07" stopColor="#e5faff" stopOpacity=".75" />
        <stop offset=".19" stopColor="#b6e0ef" stopOpacity=".14" /><stop offset=".5" stopColor="#f4fcff" stopOpacity=".08" />
        <stop offset=".83" stopColor="#a9d4e7" stopOpacity=".13" /><stop offset=".94" stopColor="#f0fdff" stopOpacity=".85" /><stop offset="1" stopColor="#537f98" stopOpacity=".65" />
      </linearGradient>
      <linearGradient id={`metal-${id}`} x1="0" y1="0" x2="0" y2="1">
        <stop stopColor="#456e85" /><stop offset=".12" stopColor="#cde8f2" /><stop offset=".28" stopColor="#f4feff" />
        <stop offset=".46" stopColor="#78a6bd" /><stop offset=".66" stopColor="#395f78" /><stop offset=".85" stopColor="#b0d9e9" /><stop offset="1" stopColor="#517a93" />
      </linearGradient>
      <linearGradient id={`liquid-${id}`} x1="0" y1="1" x2=".8" y2="0">
        {liquid.gradient.map((colour, index) => <stop key={index} offset={`${index * 100 / 3}%`} stopColor={colour} stopOpacity={index === 3 ? '.8' : '.96'} />)}
      </linearGradient>
      <clipPath id={`cavity-${id}`}>{horizontal ? <rect x="32" y="28" width="536" height="74" rx="30" /> : <path d={cavity} />}</clipPath>
      <clipPath id={`fill-${id}`}><rect x={x} y={y} width={width} height={height} /></clipPath>
    </defs>
    {horizontal ? <rect x="26" y="23" width="548" height="84" rx="37" fill={`url(#glass-${id})`} stroke="#8fbacd" strokeWidth="1.6" /> : <path d={body} fill={`url(#glass-${id})`} stroke="#85aebf" strokeWidth="1.6" />}
    <g clipPath={`url(#cavity-${id})`}>
      {liquid.fill > 0 && <g clipPath={`url(#fill-${id})`}>
        <rect className="liquid-fill" x={x} y={y} width={width} height={height} fill={`url(#liquid-${id})`} />
        {horizontal ? <>
          <ellipse className="tank-meniscus-wave" cx={x + width} cy="65" rx="13" ry="37" fill={liquid.gradient[3]} opacity=".65" />
          <path d={`M32 95 Q${x + width - 24} 115 ${x + width} 34`} fill="none" stroke={liquid.gradient[3]} strokeWidth="3" opacity=".85" />
        </> : <>
          <ellipse className="liquid-wave" cx="120" cy={y + 2} rx="80" ry="7" fill={liquid.gradient[3]} opacity=".8" />
          <ellipse className="liquid-ripple" cx="120" cy={y + 2} rx="62" ry="4" fill="none" stroke="white" strokeWidth=".8" opacity=".7" />
          <path d={`M42 ${y + 9} Q120 ${y + 22} 199 ${y + 9}`} stroke="white" fill="none" opacity=".4" />
        </>}
        <LiquidBubbles fillPercentage={liquid.fill * 100} x={x + 4} y={y + 4} width={Math.max(0, width - 8)} height={Math.max(0, height - 8)} horizontal={horizontal} />
      </g>}
      {horizontal ? <>
        <rect x="36" y="31" width="528" height="7" rx="4" fill="white" opacity=".65" />
        <rect x="36" y="96" width="528" height="3" rx="2" fill="#c5f5ff" opacity=".8" />
        <rect x="46" y="42" width="510" height="14" rx="7" fill="white" opacity=".12" />
      </> : <>
        <path d="M78 101 C78 125 51 122 51 155 V255" stroke="white" strokeWidth="9" fill="none" opacity=".7" strokeLinecap="round" />
        <path d="M185 137 Q191 150 191 165 V270 Q190 285 177 286" stroke="#e5faff" strokeWidth="4" fill="none" opacity=".75" strokeLinecap="round" />
        <path d="M65 289 Q120 302 176 289" stroke="#e8ffff" strokeWidth="3" fill="none" opacity=".75" />
        {[137, 183, 229].map(mark => <path key={mark} d={`M174 ${mark} h13`} stroke="#4f879e" strokeWidth="1" opacity=".5" />)}
      </>}
    </g>
    {horizontal ? <>
      {[15, 24, 563, 572].map(cap => <rect key={cap} x={cap} y="20" width="13" height="90" rx="5" fill={`url(#metal-${id})`} stroke="#527f98" strokeWidth="1" />)}
      <path d="M41 24 H558" stroke="white" strokeWidth="1.6" opacity=".9" />
    </> : <>
      <rect x="61" y="57" width="118" height="31" rx="7" fill={`url(#glass-${id})`} stroke="#79a2b7" />
      {[58, 67, 77].map(ring => <ellipse key={ring} cx="120" cy={ring} rx="59" ry="8" fill={`url(#metal-${id})`} stroke="#6c97ad" />)}
      <ellipse cx="120" cy="56" rx="59" ry="10" fill={`url(#metal-${id})`} stroke="#608ba1" />
      <ellipse cx="120" cy="55" rx="51" ry="6" fill="#7facc0" />
      <ellipse cx="120" cy="56" rx="47" ry="4" fill="#dff2f8" opacity=".8" />
      <path d="M75 53 Q120 46 165 53" stroke="white" strokeWidth="2" fill="none" opacity=".9" />
      <path d="M39 273 Q39 306 70 306 H172 Q200 306 202 278" stroke="#98c4d4" strokeWidth="2.5" fill="none" opacity=".7" />
    </>}
  </svg>;
}
