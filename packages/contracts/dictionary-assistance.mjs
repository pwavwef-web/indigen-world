import { spellingKey, kasemTokens } from './kasem-spelling.mjs';

// BGL Kasem Orthography (1997), pp. 26–29; data/orthography-seed/rules.json.
// This comparison policy is deliberately configurable. Never strip all marks:
// vowel quality, nasalization, length and every non-tone character survive.
export const KASEM_ORTHOGRAPHY = Object.freeze({ id: 'bgl-1997-acute-grave', toneMarks: Object.freeze(['\u0300', '\u0301']) });
export function toneKey(text, orthography = KASEM_ORTHOGRAPHY) {
  const marks = new Set(orthography.toneMarks);
  return [...spellingKey(text).normalize('NFD')].filter(char => !marks.has(char)).join('').normalize('NFC');
}
export function hasTone(text) { return [...text.normalize('NFD')].some(char => KASEM_ORTHOGRAPHY.toneMarks.includes(char)); }
export function missingToneMatch(input, candidate) {
  if (spellingKey(input) === spellingKey(candidate) || toneKey(input) !== toneKey(candidate)) return false;
  const clusters = text => [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(spellingKey(text))].map(s => s.segment.normalize('NFD'));
  const left = clusters(input), right = clusters(candidate);
  // Only offer additions. Never suggest changing an already supplied tone.
  return left.length === right.length && left.every((part, i) => KASEM_ORTHOGRAPHY.toneMarks.every(mark => !part.includes(mark) || right[i].includes(mark)));
}

/** Tokens and contiguous phrases, preserving offsets in the original string. */
export function dictionarySpans(text, maxWords = 6) {
  const tokens = kasemTokens(text), spans = [...tokens];
  for (let i = 0; i < tokens.length; i++) {
    for (let n = 2; n <= maxWords && i + n <= tokens.length; n++) {
      if (!/^\s+$/u.test(text.slice(tokens[i + n - 2].end, tokens[i + n - 1].start))) break;
      const start = tokens[i].start, end = tokens[i + n - 1].end, value = text.slice(start, end);
      if (value.length > 160) break;
      spans.push({ text: value, key: assistanceKey(value), start, end });
    }
  }
  return spans;
}
export function assistanceKey(value) { return spellingKey(value).replace(/\s+/gu, ' ').trim(); }

/** Prefer matched phrases to their overlapping component words. */
export function reviewedSpans(text, results) {
  const byKey = new Map(results.map(row => [row.key, row]));
  const all = dictionarySpans(text).map(token => ({ ...token, result: byKey.get(assistanceKey(token.text)) }));
  const phrases = all.filter(t => t.result && ['approved', 'review'].includes(t.result.status))
    .sort((a, b) => (b.end - b.start) - (a.end - a.start));
  const chosen = [];
  for (const token of phrases) if (!chosen.some(t => t.start < token.end && token.start < t.end)) chosen.push(token);
  for (const token of all.filter(t => kasemTokens(t.text).length === 1)) {
    if (!chosen.some(t => t.start < token.end && token.start < t.end)) chosen.push(token);
  }
  return chosen.sort((a, b) => a.start - b.start);
}

// Session decisions follow unaffected occurrences through edits, not global keys.
export function rebaseDecisions(previous, next, decisions) {
  let start = 0;
  while (start < previous.length && start < next.length && previous[start] === next[start]) start++;
  let oldEnd = previous.length, newEnd = next.length;
  while (oldEnd > start && newEnd > start && previous[oldEnd - 1] === next[newEnd - 1]) { oldEnd--; newEnd--; }
  const delta = newEnd - oldEnd;
  return decisions.flatMap(token => {
    const shifted = token.end <= start ? token : token.start >= oldEnd ? { ...token, start: token.start + delta, end: token.end + delta } : null;
    return shifted && next.slice(shifted.start, shifted.end) === shifted.text ? [shifted] : [];
  });
}
