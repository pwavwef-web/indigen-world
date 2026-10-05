export type LiquidStage = 'empty' | 'filling' | 'full' | 'unknown';

// One water-blue family: a fuller vessel reads a little deeper, never a new colour.
const shallow = { colour: '#45b4f0', deep: '#1874c5', light: '#a5e3ff', surface: '#e6f8ff' };
const deep = { colour: '#1688dc', deep: '#0a4c97', light: '#68cbff', surface: '#d5f1ff' };
const neutral = { colour: '#94a3b8', deep: '#475569', light: '#cbd5e1', surface: '#f1f5f9' };

function mixColour(from: string, to: string, amount: number): string {
  const channel = (offset: number) => {
    const start = Number.parseInt(from.slice(offset, offset + 2), 16);
    const end = Number.parseInt(to.slice(offset, offset + 2), 16);
    return Math.round(start + (end - start) * amount).toString(16).padStart(2, '0');
  };
  return `#${channel(1)}${channel(3)}${channel(5)}`;
}

/** Visual styling follows approved fill; missing targets never imply progress. */
export function liquidAppearance(fillPercent: number, targetSetting = false) {
  const fill = targetSetting || !Number.isFinite(fillPercent)
    ? 0
    : Math.min(100, Math.max(0, fillPercent));
  const stage: LiquidStage = targetSetting ? 'unknown' : fill === 0 ? 'empty' : fill >= 100 ? 'full' : 'filling';
  const amount = fill / 100;
  const palette = targetSetting
    ? neutral
    : {
        colour: mixColour(shallow.colour, deep.colour, amount),
        deep: mixColour(shallow.deep, deep.deep, amount),
        light: mixColour(shallow.light, deep.light, amount),
        surface: mixColour(shallow.surface, deep.surface, amount),
      };

  return {
    fillPercent: fill,
    stage,
    ...palette,
    // At most 14 SVG circles per vessel, with no bubbles in empty vessels.
    bubbleCount: fill === 0 ? 0 : 2 + Math.ceil(fill * 0.12),
    bubbleScale: 0.7 + fill * 0.009,
    bubbleDuration: 7 - fill * 0.035,
  };
}
