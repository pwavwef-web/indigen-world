export type LiquidStage = 'red' | 'yellow' | 'blue' | 'green' | 'unknown';

const palettes = {
  red: { colour: '#f05265', deep: '#991c43', light: '#ff9a8b', surface: '#ffe4de' },
  yellow: { colour: '#eab72f', deep: '#a86513', light: '#ffe578', surface: '#fff7ca' },
  blue: { colour: '#329ee8', deep: '#14528e', light: '#79d8ff', surface: '#dcf7ff' },
  green: { colour: '#27ba89', deep: '#11644c', light: '#81efbc', surface: '#dcfff0' },
  unknown: { colour: '#94a3b8', deep: '#475569', light: '#cbd5e1', surface: '#f1f5f9' },
};

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
  const stage: LiquidStage = targetSetting ? 'unknown'
    : fill < 25 ? 'red' : fill < 50 ? 'yellow' : fill < 75 ? 'blue' : 'green';
  const nextStage: LiquidStage = stage === 'red' ? 'yellow' : stage === 'yellow' ? 'blue'
    : stage === 'blue' ? 'green' : stage;
  const transition = stage === 'green' || stage === 'unknown' ? 0 : (fill % 25) / 25;
  const from = palettes[stage];
  const to = palettes[nextStage];

  return {
    fillPercent: fill,
    stage,
    // Continuous colour variation: red at 0%, yellow at 25%, blue at 50%, green at 75%.
    colour: mixColour(from.colour, to.colour, transition),
    deep: mixColour(from.deep, to.deep, transition),
    light: mixColour(from.light, to.light, transition),
    surface: mixColour(from.surface, to.surface, transition),
    // At most 14 SVG circles per vessel, with no bubbles in empty vessels.
    bubbleCount: fill === 0 ? 0 : 2 + Math.ceil(fill * 0.12),
    bubbleScale: 0.7 + fill * 0.009,
    bubbleDuration: 7 - fill * 0.035,
  };
}
