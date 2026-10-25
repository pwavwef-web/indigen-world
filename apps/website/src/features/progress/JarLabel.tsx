import { Icon, type IconName } from '../../components/Icon';

export interface JarLabelInfo {
  /** Catalogue number, 1-based: "No. 01". Never changes when the floor is sorted. */
  number: number;
  /** Printed large across the label: "LEXICON". */
  name: string;
  /** The collection's full title in small print. */
  title: string;
  icon: IconName;
  /** The collection's own ink colour. */
  accent: string;
}

// The label sits high on the straight part of the jar (y 147–272), just under
// the shoulders, and narrower than the glass: liquid below it and at both of
// its sides stays in view, so the label never hides a jar's level for long.
// A cylinder seen from a little above shows a printed horizontal line as a
// shallow smile: lowest at the front.
const LEFT = 72;
const RIGHT = 168;
const MID = (LEFT + RIGHT) / 2;
const HALF = (RIGHT - LEFT) / 2;
const TOP = 150;
const BOTTOM = 212;
const SAG = 4.5;

/** How far the printed surface sags at x, so print follows the curve. */
const sag = (x: number) => SAG * (1 - ((x - MID) / HALF) ** 2);
const smile = (y: number, inset = 0) => `M${LEFT + inset} ${y} Q${MID} ${y + SAG * 2} ${RIGHT - inset} ${y}`;

/**
 * A paper label printed for each collection: a zigzag band after the painted
 * walls of Kasena compounds, the catalogue number, the collection's emblem
 * and name. Decorative — the same facts are in the page's own text — so it
 * lives inside the vessel's hidden artwork.
 */
export function JarLabel({ id, label, sealed }: { id: string; label: JarLabelInfo; sealed: boolean }) {
  const outline = `M${LEFT} ${TOP} Q${MID} ${TOP + SAG * 2} ${RIGHT} ${TOP} L${RIGHT} ${BOTTOM} Q${MID} ${BOTTOM + SAG * 2} ${LEFT} ${BOTTOM} Z`;
  const name = label.name.toUpperCase();
  const nameSize = name.length <= 8 ? 14 : name.length <= 10 ? 12.5 : 11;
  const teeth = 12;
  const toothWidth = (RIGHT - LEFT) / teeth;
  const bandTop = TOP + 3.5;
  const bandHeight = 7;

  return <g className="jar-label">
    <defs>
      <linearGradient id={`label-paper-${id}`} x1="0" x2="1">
        <stop className="jar-label__paper-edge" offset="0" />
        <stop className="jar-label__paper-mid" offset=".16" />
        <stop className="jar-label__paper-light" offset=".44" />
        <stop className="jar-label__paper-mid" offset=".78" />
        <stop className="jar-label__paper-edge" offset="1" />
      </linearGradient>
      <linearGradient id={`label-sheen-${id}`} x1="0" x2="1">
        <stop offset=".18" stopColor="#fff" stopOpacity="0" />
        <stop offset=".27" stopColor="#fff" stopOpacity=".42" />
        <stop offset=".34" stopColor="#fff" stopOpacity="0" />
      </linearGradient>
      <clipPath id={`label-clip-${id}`}><path d={outline} /></clipPath>
      <path id={`label-name-path-${id}`} d={smile(TOP + 35, 3)} />
      <path id={`label-title-path-${id}`} d={smile(TOP + 45, 5)} />
      <path id={`label-foot-path-${id}`} d={smile(TOP + 55, 9)} />
    </defs>
    <path className="jar-label__shadow" d={outline} transform="translate(0 1.4)" />
    <path d={outline} fill={`url(#label-paper-${id})`} />
    <g clipPath={`url(#label-clip-${id})`}>
      {/* Zigzag band: ink triangles pointing up, ochre ones pointing down. */}
      {Array.from({ length: teeth }, (_, index) => {
        const x = LEFT + index * toothWidth;
        const lift = sag(x + toothWidth / 2);
        const top = bandTop + lift;
        return <g key={index}>
          <path className="jar-label__tooth-ink" d={`M${x} ${top + bandHeight} L${x + toothWidth / 2} ${top} L${x + toothWidth} ${top + bandHeight} Z`} />
          <path className="jar-label__tooth-ochre" d={`M${x + toothWidth / 2} ${top} L${x + toothWidth} ${top + bandHeight} L${x + toothWidth * 1.5} ${top} Z`} />
        </g>;
      })}
      <path d={smile(bandTop + bandHeight + 1.6)} fill="none" stroke={label.accent} strokeWidth="1.1" />
      <path d={smile(BOTTOM - 4)} fill="none" stroke={label.accent} strokeWidth=".8" opacity=".75" />
      <text className="jar-label__number" x={LEFT + 6} y={TOP + 21 + sag(LEFT + 12)}>No. {String(label.number).padStart(2, '0')}</text>
      <g transform={`translate(${RIGHT - 18} ${TOP + 13 + sag(RIGHT - 12)})`}>
        <circle cx="6" cy="6" r="6.2" fill={label.accent} />
        <g transform="translate(1.9 1.9)" style={{ color: '#fff9ec' }}><Icon name={label.icon} size={8.2} /></g>
      </g>
      <text className="jar-label__name" fontSize={nameSize} textLength={name.length > 9 ? 86 : undefined} lengthAdjust="spacingAndGlyphs">
        <textPath href={`#label-name-path-${id}`} startOffset="50%" textAnchor="middle">{name}</textPath>
      </text>
      <text className="jar-label__title"><textPath href={`#label-title-path-${id}`} startOffset="50%" textAnchor="middle">{label.title}</textPath></text>
      <text className="jar-label__foot" fill={label.accent}><textPath href={`#label-foot-path-${id}`} startOffset="50%" textAnchor="middle">◆ KASEM HERITAGE ◆</textPath></text>
      {sealed && <g className="jar-label__stamp" transform={`rotate(-14 ${RIGHT - 19} ${BOTTOM - 15})`}>
        <circle cx={RIGHT - 19} cy={BOTTOM - 15} r="13" />
        <circle cx={RIGHT - 19} cy={BOTTOM - 15} r="10.4" />
        <text x={RIGHT - 19} y={BOTTOM - 16.4}>SEALED</text>
        <text x={RIGHT - 19} y={BOTTOM - 11} className="jar-label__stamp-small">TARGET MET</text>
      </g>}
      <path d={outline} fill={`url(#label-sheen-${id})`} />
    </g>
  </g>;
}
