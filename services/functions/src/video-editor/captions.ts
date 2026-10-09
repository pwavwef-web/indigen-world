/**
 * Timing captions and lyrics to the audio they belong to.
 *
 * ── Two honest methods, and what each can claim ─────────────────────────────
 * 1. Supplied words (a script, lyrics, a Kasem transcript): the words are the
 *    creator's and are never changed. FFmpeg finds where speech actually is
 *    (`silencedetect`), and the words are laid over that speech in proportion
 *    to how long each takes to say, with cue edges snapped into the pauses.
 *    Where the number of lines matches the number of spoken phrases, each line
 *    simply takes one phrase. This works for any language — including Kasem,
 *    which no speech model transcribes reliably — because it listens for
 *    *when* something is said, not *what*.
 * 2. No words, in English or French: a transcription model writes them and
 *    says roughly when; the times are then snapped to the speech FFmpeg found.
 *
 * Either way the result is labelled as a first pass. The editor shows every
 * cue on the timeline to be dragged, split or retyped, and has a tap-along
 * mode for correcting timing by ear.
 */

export interface Segment {
  start: number;
  end: number;
}

export interface CaptionWord {
  text: string;
  start: number;
  end: number;
}

export interface CaptionCue {
  start: number;
  end: number;
  text: string;
  words: CaptionWord[];
}

const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** Silences from `silencedetect`'s stderr, then the speech between them. */
export function speechSegments(stderr: string, duration: number, minSpeech = 0.12): Segment[] {
  const silences: Segment[] = [];
  let open: number | null = null;
  for (const line of stderr.split('\n')) {
    const s = /silence_start:\s*(-?[\d.]+)/.exec(line);
    if (s) open = Math.max(0, Number(s[1]));
    const e = /silence_end:\s*([\d.]+)/.exec(line);
    if (e) {
      silences.push({ start: open ?? 0, end: Number(e[1]) });
      open = null;
    }
  }
  if (open !== null) silences.push({ start: open, end: duration });
  const speech: Segment[] = [];
  let at = 0;
  for (const silence of silences.sort((a, b) => a.start - b.start)) {
    if (silence.start - at >= minSpeech) speech.push({ start: r3(at), end: r3(silence.start) });
    at = Math.max(at, silence.end);
  }
  if (duration - at >= minSpeech) speech.push({ start: r3(at), end: r3(duration) });
  return speech;
}

/**
 * Splits text into caption lines: the creator's own line breaks first, then
 * any line too long to read at once is split at a word boundary.
 */
export function captionLines(text: string, maxChars = 42): string[] {
  const out: string[] = [];
  for (const raw of text.replace(/\r/g, '').split(/\n+/)) {
    const line = raw.trim().replace(/\s+/g, ' ');
    if (!line) continue;
    if (line.length <= maxChars) {
      out.push(line);
      continue;
    }
    // Sentence ends first, then fill up to the limit.
    const sentences = line.split(/(?<=[.!?;:])\s+/);
    for (const sentence of sentences) {
      if (sentence.length <= maxChars) {
        out.push(sentence);
        continue;
      }
      let current = '';
      for (const word of sentence.split(' ')) {
        if (current && `${current} ${word}`.length > maxChars) {
          out.push(current);
          current = word;
        } else {
          current = current ? `${current} ${word}` : word;
        }
      }
      if (current) out.push(current);
    }
  }
  return out;
}

/**
 * Roughly how long a word takes to say, in syllable-like units: groups of
 * vowels (including the extended vowels Kasem writes: ɛ ɔ ɩ ʋ and accented
 * forms), with a floor of one. Good enough to share a phrase's time between
 * its words; nobody reads more into it than that.
 */
export function wordWeight(word: string): number {
  const letters = word.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const groups = letters.match(/[aeiouyɛɔɩʋəɪʊ]+/gu);
  return Math.max(1, groups ? groups.length : Math.ceil(letters.replace(/[^\p{L}\p{N}]/gu, '').length / 3));
}

function wordsIn(start: number, end: number, text: string): CaptionWord[] {
  const words = text.split(/\s+/).filter(Boolean);
  const weights = words.map(wordWeight);
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  let at = start;
  return words.map((w, i) => {
    const d = ((end - start) * weights[i]!) / total;
    const word = { text: w, start: r3(at), end: r3(at + d) };
    at += d;
    return word;
  });
}

/** Maps a fraction of all voiced time to a moment on the clock. */
function voicedClock(segments: Segment[]): (fraction: number) => number {
  const lengths = segments.map((s) => s.end - s.start);
  const total = lengths.reduce((a, b) => a + b, 0);
  return (fraction: number) => {
    let remaining = Math.min(1, Math.max(0, fraction)) * total;
    for (let i = 0; i < segments.length; i += 1) {
      if (remaining <= lengths[i]! + 1e-9) return segments[i]!.start + remaining;
      remaining -= lengths[i]!;
    }
    return segments[segments.length - 1]!.end;
  };
}

/**
 * Lays supplied lines over the detected speech.
 *
 * [offset] is where the audio sits on the video's timeline, so the cues come
 * back in timeline time.
 */
export function alignToSpeech(lines: string[], speech: Segment[], opts: { offset?: number; duration: number; minCue?: number }): CaptionCue[] {
  const offset = opts.offset ?? 0;
  const minCue = opts.minCue ?? 0.6;
  if (lines.length === 0) return [];
  const segments = speech.length > 0 ? speech : [{ start: 0, end: opts.duration }];
  let cues: { start: number; end: number; text: string }[];
  if (segments.length === lines.length) {
    // One line per spoken phrase: the common case for a script read with
    // pauses, or lyrics sung line by line.
    cues = lines.map((text, i) => ({ start: segments[i]!.start, end: segments[i]!.end, text }));
  } else {
    const weights = lines.map((l) => l.split(/\s+/).filter(Boolean).map(wordWeight).reduce((a, b) => a + b, 0) || 1);
    const total = weights.reduce((a, b) => a + b, 0);
    const at = voicedClock(segments);
    let acc = 0;
    cues = lines.map((text, i) => {
      const from = at(acc / total);
      acc += weights[i]!;
      return { start: from, end: at(acc / total), text };
    });
    // Where a line break lands near a real pause, it belongs in that pause:
    // the line before ends where the speech stops and the next begins where it
    // starts again. A break with no pause near it — a line split mid-sentence —
    // keeps its proportional place. Each pause is used once, in order.
    const pauses = segments.slice(1).map((seg, i) => ({ start: segments[i]!.end, end: seg.start }));
    let nextPause = 0;
    for (let i = 0; i < cues.length - 1; i += 1) {
      const boundary = cues[i]!.end;
      const reach = Math.min(1.0, 0.45 * Math.min(cues[i]!.end - cues[i]!.start, cues[i + 1]!.end - cues[i + 1]!.start));
      let best = -1;
      for (let p = nextPause; p < pauses.length; p += 1) {
        const distance = boundary < pauses[p]!.start ? pauses[p]!.start - boundary : boundary > pauses[p]!.end ? boundary - pauses[p]!.end : 0;
        if (distance <= reach && (best < 0 || distance < (boundary < pauses[best]!.start ? pauses[best]!.start - boundary : boundary - pauses[best]!.end))) best = p;
        if (pauses[p]!.start > boundary + reach) break;
      }
      if (best >= 0 && pauses[best]!.start > cues[i]!.start && pauses[best]!.end < cues[i + 1]!.end) {
        cues[i]!.end = pauses[best]!.start;
        cues[i + 1]!.start = pauses[best]!.end;
        nextPause = best + 1;
      }
    }
    cues[0]!.start = Math.max(cues[0]!.start, segments[0]!.start);
    cues[cues.length - 1]!.end = Math.min(Math.max(cues[cues.length - 1]!.end, segments[segments.length - 1]!.end), opts.duration);
  }
  // Readable minimums without overlapping the next cue.
  for (let i = 0; i < cues.length; i += 1) {
    const cue = cues[i]!;
    const next = cues[i + 1];
    if (cue.end - cue.start < minCue) cue.end = Math.min(next ? next.start : opts.duration, cue.start + minCue);
    if (next && cue.end > next.start) cue.end = next.start;
  }
  return cues
    .filter((c) => c.end - c.start > 0.05)
    .map((c) => ({
      start: r3(c.start + offset),
      end: r3(c.end + offset),
      text: c.text,
      words: wordsIn(c.start + offset, c.end + offset, c.text),
    }));
}

/**
 * Snaps model-timed segments (a transcription) to the speech FFmpeg found, so
 * a cue does not start a beat before anyone speaks.
 */
export function snapToSpeech(segments: { start: number; end: number; text: string }[], speech: Segment[], opts: { offset?: number; duration: number }): CaptionCue[] {
  const offset = opts.offset ?? 0;
  const cleaned = segments
    .map((s) => ({ start: Math.max(0, s.start), end: Math.min(opts.duration, s.end), text: s.text.trim().replace(/\s+/g, ' ') }))
    .filter((s) => s.text && s.end > s.start)
    .sort((a, b) => a.start - b.start);
  const nearest = (t: number, edges: number[]) => edges.reduce((best, e) => (Math.abs(e - t) < Math.abs(best - t) ? e : best), Number.POSITIVE_INFINITY);
  const starts = speech.map((s) => s.start);
  const ends = speech.map((s) => s.end);
  for (const cue of cleaned) {
    const s = nearest(cue.start, starts);
    const e = nearest(cue.end, ends);
    if (Math.abs(s - cue.start) < 0.5) cue.start = s;
    if (Math.abs(e - cue.end) < 0.5) cue.end = e;
    cue.end = Math.max(cue.start + 0.3, cue.end);
  }
  for (let i = 0; i < cleaned.length - 1; i += 1) {
    if (cleaned[i]!.end > cleaned[i + 1]!.start) cleaned[i]!.end = cleaned[i + 1]!.start;
  }
  return cleaned.filter((c) => c.end - c.start > 0.05).map((c) => ({
    start: r3(c.start + offset),
    end: r3(c.end + offset),
    text: c.text,
    words: wordsIn(c.start + offset, c.end + offset, c.text),
  }));
}

/** What the transcription model is asked to return. */
export const TRANSCRIPT_SCHEMA = {
  type: 'object',
  properties: {
    segments: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          start: { type: 'number', description: 'Seconds from the start of the audio when this phrase begins.' },
          end: { type: 'number', description: 'Seconds from the start of the audio when this phrase ends.' },
          text: { type: 'string', description: 'Exactly what is said, in the spoken language.' },
        },
        required: ['start', 'end', 'text'],
      },
    },
  },
  required: ['segments'],
} as const;

export const TRANSCRIPT_INSTRUCTION = 'You transcribe speech for video captions. Return every spoken phrase in order with start and end times in seconds from the start of the audio. Phrases are short: one sentence or clause, at most about seven words. Write exactly what is said. If nothing is spoken, return an empty list. Never translate, summarise or invent words.';
