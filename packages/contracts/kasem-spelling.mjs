// Shared comparison rules. Offsets always refer to the original UTF-16 text.
export function spellingKey(value) {
  return value.normalize('NFC').toLowerCase().normalize('NFC').replace(/[’ʼ]/gu, "'");
}

export function kasemTokens(text) {
  return [...text.matchAll(/\p{L}[\p{L}\p{M}]*(?:['’ʼ-]\p{L}[\p{L}\p{M}]*)*/gu)].map(match => ({
    text: match[0], key: spellingKey(match[0]), start: match.index, end: match.index + match[0].length,
  }));
}

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
export function spellingDistance(left, right) {
  const a = [...segmenter.segment(spellingKey(left))].map(s => s.segment);
  const b = [...segmenter.segment(spellingKey(right))].map(s => s.segment);
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  let beforePrevious = previous;
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(row[j - 1] + 1, previous[j] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        row[j] = Math.min(row[j], beforePrevious[j - 2] + 1);
      }
    }
    beforePrevious = previous; previous = row;
  }
  return previous[b.length];
}

export function similarSpellings(word, approved, limit = 5) {
  const key = spellingKey(word);
  const length = [...segmenter.segment(key)].length;
  const maximum = length < 5 ? 1 : 2;
  const seen = new Set();
  return approved.filter(entry => {
    const candidate = spellingKey(entry.word);
    if (seen.has(candidate) || candidate === key || kasemTokens(entry.word).length !== 1) return false;
    seen.add(candidate); return true;
  }).filter(entry => Math.abs([...segmenter.segment(spellingKey(entry.word))].length - length) <= maximum)
    .map(entry => ({ ...entry, distance: spellingDistance(word, entry.word) }))
    .filter(entry => entry.distance <= maximum)
    .sort((a, b) => a.distance - b.distance || a.word.localeCompare(b.word))
    .slice(0, limit).map(({ id, word }) => ({ id, word }));
}

export function replaceOccurrence(text, token, replacement) {
  if (text.slice(token.start, token.end) !== token.text) return null;
  return text.slice(0, token.start) + replacement + text.slice(token.end);
}
