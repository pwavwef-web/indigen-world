/**
 * Builds the lyric timing map for Beyond the Reef.
 *
 *   python apps/website/scripts/beyond-the-reef/whisper-words.py   # word timestamps (local)
 *   node apps/website/scripts/beyond-the-reef/align-lyrics.mjs      # align + verify
 *   node apps/website/scripts/beyond-the-reef/align-lyrics.mjs --write   # also write lyrics.ts
 *
 * How the times are found
 *
 * 1. Whisper's word timestamps are aligned to the lyric sheet with a global
 *    sequence alignment, so a misheard word ("reefer", "the real") still lands
 *    on its lyric neighbour and choruses cannot be confused with each other.
 *    A line starts at its first recognised word; unrecognised leading words
 *    are allowed for. Whisper stretches the first word after an instrumental
 *    gap back into the silence, so an over-long first word is trimmed.
 * 2. Lines Whisper did not hear at all are spaced evenly between their
 *    recognised neighbours.
 * 3. Gemini checks the result: for every line a 2.6-second cut is taken at the
 *    computed start and the project's analysis model writes down the words it
 *    hears. A cut that does not open on the line's first words is flagged.
 *
 * Why not ask Gemini for the timestamps directly: tried first. Over the whole
 * song it invented evenly spaced times running past the end of the recording;
 * on short windows it heard the words correctly but placed them about 1.5 s
 * late — the cuts in step 3 confirmed Whisper's times against its own.
 *
 * The result is plain data (`lyrics.ts`), separate from every component, so a
 * correction heard by ear is a one-number edit.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { readLyricLines } from "./lyrics-source.mjs";
import {
  FEATURE_DIR,
  SOURCE_AUDIO,
  WORK_DIR,
  ensureDir,
  ffmpeg,
  genai,
  labels,
  mediaDuration,
  readJson,
  responseJson,
  vertexConfig,
  withQuotaRetry,
} from "./shared.mjs";

const WRITE = process.argv.includes("--write");
const SKIP_VERIFY = process.argv.includes("--no-verify");
const workDir = ensureDir(resolve(WORK_DIR, "align"));
const lines = readLyricLines();
const duration = mediaDuration(SOURCE_AUDIO);

const whisper = readJson(resolve(workDir, "whisper-words.json"));
if (!whisper?.words?.length) {
  throw new Error("Run whisper-words.py first: it writes align/whisper-words.json in the work directory.");
}

// ── 1. Sequence alignment ───────────────────────────────────────────────────
const normalise = (word) =>
  word
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/[^a-z0-9']/g, "")
    .replace(/'/g, "");

function similarity(a, b) {
  if (a === b) return 1;
  if (!a || !b) return 0;
  const rows = a.length + 1;
  const cols = b.length + 1;
  const d = Array.from({ length: rows }, (_, i) => [i, ...new Array(cols - 1).fill(0)]);
  for (let j = 1; j < cols; j += 1) d[0][j] = j;
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return 1 - d[rows - 1][cols - 1] / Math.max(a.length, b.length);
}

const lyricWords = [];
for (const line of lines) {
  const words = line.text.split(/[\s—-]+/).map(normalise).filter(Boolean);
  words.forEach((word, position) => lyricWords.push({ line: line.id, position, count: words.length, word }));
}
const heard = whisper.words.map((entry) => ({ ...entry, norm: normalise(entry.word) })).filter((entry) => entry.norm);

const GAP = -1;
const n = lyricWords.length;
const m = heard.length;
const score = new Float64Array((n + 1) * (m + 1));
const trace = new Uint8Array((n + 1) * (m + 1)); // 1 diagonal, 2 skip lyric word, 3 skip heard word
const at = (i, j) => i * (m + 1) + j;
for (let i = 1; i <= n; i += 1) {
  score[at(i, 0)] = i * GAP;
  trace[at(i, 0)] = 2;
}
for (let j = 1; j <= m; j += 1) {
  score[at(0, j)] = j * GAP;
  trace[at(0, j)] = 3;
}
for (let i = 1; i <= n; i += 1) {
  for (let j = 1; j <= m; j += 1) {
    const sim = similarity(lyricWords[i - 1].word, heard[j - 1].norm);
    const pair = sim === 1 ? 2 : sim >= 0.55 ? 1 : -1.2;
    const diagonal = score[at(i - 1, j - 1)] + pair;
    const up = score[at(i - 1, j)] + GAP;
    const left = score[at(i, j - 1)] + GAP;
    if (diagonal >= up && diagonal >= left) {
      score[at(i, j)] = diagonal;
      trace[at(i, j)] = 1;
    } else if (up >= left) {
      score[at(i, j)] = up;
      trace[at(i, j)] = 2;
    } else {
      score[at(i, j)] = left;
      trace[at(i, j)] = 3;
    }
  }
}
for (let i = n, j = m; i > 0 || j > 0; ) {
  const step = trace[at(i, j)];
  if (step === 1) {
    if (similarity(lyricWords[i - 1].word, heard[j - 1].norm) >= 0.55) lyricWords[i - 1].heard = heard[j - 1];
    i -= 1;
    j -= 1;
  } else if (step === 2) {
    i -= 1;
  } else {
    j -= 1;
  }
}

// ── Line times from matched words ───────────────────────────────────────────
const SECONDS_PER_WORD = 0.3;
const LONGEST_FIRST_WORD = 0.55;

/** A sung line has no pauses this long inside it; a match beyond one is an ad-lib. */
const LONGEST_PAUSE = 1.6;

/** The longest run of matched words without an ad-lib-sized pause in it. */
function contiguous(matched) {
  let best = [];
  let run = [];
  for (const word of matched) {
    const previous = run.at(-1);
    if (previous && word.heard.start - previous.heard.end > LONGEST_PAUSE) run = [];
    run.push(word);
    if (run.length > best.length) best = [...run];
  }
  return best;
}

const timed = lines.map((line) => {
  const words = lyricWords.filter((word) => word.line === line.id);
  const matched = contiguous(words.filter((word) => word.heard));
  if (matched.length === 0) return { ...line, start: null, end: null, matched: 0, words: words.length };
  const first = matched[0];
  const last = matched.at(-1);
  let start = first.heard.start;
  const firstLength = first.heard.end - first.heard.start;
  if (first.position === 0 && firstLength > LONGEST_FIRST_WORD) {
    start = first.heard.end - LONGEST_FIRST_WORD;
  }
  start -= first.position * SECONDS_PER_WORD;
  const end = last.heard.end + (last.count - 1 - last.position) * SECONDS_PER_WORD;
  return {
    ...line,
    start,
    end,
    matched: matched.length,
    words: words.length,
    firstHeard: `${first.heard.word}@${first.heard.start.toFixed(2)}-${first.heard.end.toFixed(2)}`,
  };
});

// ── 2. Fill lines Whisper missed ────────────────────────────────────────────
for (let index = 0; index < timed.length; index += 1) {
  if (timed[index].start !== null) continue;
  let runEnd = index;
  while (runEnd + 1 < timed.length && timed[runEnd + 1].start === null) runEnd += 1;
  const before = timed[index - 1];
  const after = timed[runEnd + 1];
  const from = before ? before.end + 0.15 : 0.5;
  const to = after ? after.start - 0.15 : duration - 1;
  const slot = (to - from) / (runEnd - index + 1);
  for (let k = index; k <= runEnd; k += 1) {
    timed[k].start = from + slot * (k - index);
    timed[k].end = timed[k].start + slot * 0.85;
    timed[k].flag = "interpolated";
  }
  index = runEnd;
}

// ── Corrections from listening evidence ─────────────────────────────────────
// Each was settled by comparing Whisper's words with short Gemini cuts around
// the line. Keep the reason with the number.
const OVERRIDES = {
  // Whisper heard the ad-libbed "yeah" as "started here?".
  82: { start: 207.3, reason: 'Whisper word "here?" at 207.30 is the sung "...Yeah."' },
  // The choir's post-chorus: Whisper heard "carry the land / we've carried the
  // storm / we've carried the people / ain't until tomorrow / thundery ×3".
  107: { start: 268.45, reason: "choir: \"Carry\" 268.28 (low confidence); Gemini cut 268.5 heard \"Heavy the land\"" },
  108: { start: 270.1, reason: 'choir: "we\'ve carried the storm" begins 270.10' },
  109: { start: 271.28, reason: 'choir: "we\'ve carried the people" begins 271.28' },
  110: { start: 274.5, end: 275.9, reason: '"ain\'t until tomorrow" 274.50–275.50; Gemini cut 274.5 heard "into my heart"' },
  111: { start: 276.16, end: 277.3, reason: 'first "thundery" (Beyond the reef) 276.16' },
  112: { start: 277.42, end: 279.45, reason: 'second "thundery" 277.42; Gemini cut 278.5 heard "on the real, we"' },
  // Whisper stretched "I built" across an instrumental bar; Gemini cuts from
  // 288 to 292.6 hear only humming and instruments.
  114: { start: 291.3, reason: 'Gemini cuts 288–292.6 hear no lyric; "a boat from restless dreams" 292.54–294.44' },
};
for (const [id, fix] of Object.entries(OVERRIDES)) {
  const line = timed[Number(id)];
  if (fix.start !== undefined) line.start = fix.start;
  if (fix.end !== undefined) line.end = fix.end;
  line.flag = [line.flag, "override"].filter(Boolean).join(", ");
}

// A lyric display should lead the voice slightly, never trail it.
const LEAD_SECONDS = 0.15;
for (const line of timed) line.start = Math.max(0, line.start - LEAD_SECONDS);

// Order, overlap and minimum length.
for (let index = 0; index < timed.length; index += 1) {
  const line = timed[index];
  const previous = timed[index - 1];
  if (previous && line.start < previous.start + 0.25) {
    line.start = previous.start + 0.25;
    line.flag = [line.flag, "reordered"].filter(Boolean).join(", ");
  }
}
for (let index = 0; index < timed.length; index += 1) {
  const line = timed[index];
  const next = timed[index + 1];
  const ceiling = next ? next.start - 0.02 : duration;
  line.end = Math.min(Math.max(line.end, line.start + 0.5), ceiling);
  line.start = Number(line.start.toFixed(2));
  line.end = Number(line.end.toFixed(2));
}

// ── 3. Verify with Gemini ───────────────────────────────────────────────────
async function verify() {
  const cfg = await vertexConfig();
  const ai = await genai(cfg.project, cfg.location);
  const fullPath = resolve(workDir, "full.mp3");
  ffmpeg(["-y", "-i", SOURCE_AUDIO, "-map", "0:a", "-ac", "1", "-ar", "24000", "-b:a", "96k", fullPath]);
  let next = 0;
  const results = new Array(timed.length);
  await Promise.all(
    Array.from({ length: 3 }, async () => {
      while (next < timed.length) {
        const index = next++;
        const line = timed[index];
        const clip = resolve(workDir, `verify-${String(index).padStart(3, "0")}.mp3`);
        ffmpeg(["-y", "-ss", line.start.toFixed(2), "-t", "2.6", "-i", fullPath, "-ac", "1", "-b:a", "96k", clip]);
        const model = cfg.analysisModels[0];
        const response = await withQuotaRetry(`verify line ${index}`, () => ai.models.generateContent({
          model,
          contents: [
            {
              role: "user",
              parts: [
                { inlineData: { mimeType: "audio/mpeg", data: readFileSync(clip).toString("base64") } },
                {
                  text: "This is a short cut from a song. Write down exactly the sung words you hear, in order, including partial words at the very start (mark a partial word with a hyphen). Do not guess words you cannot hear.",
                },
              ],
            },
          ],
          config: {
            responseMimeType: "application/json",
            responseJsonSchema: { type: "object", properties: { words: { type: "string" } }, required: ["words"] },
            temperature: 0,
            maxOutputTokens: 2048,
            thinkingConfig: { thinkingLevel: "LOW" },
            labels: labels("lyric-verification"),
            httpOptions: { timeout: 120_000 },
          },
        }));
        const heardWords = responseJson(response).words.split(/\s+/).map(normalise).filter(Boolean);
        const expected = line.text.split(/[\s—-]+/).map(normalise).filter(Boolean);
        const opening = expected.slice(0, 2);
        const found = heardWords.slice(0, 4).findIndex((word) => similarity(word, opening[0]) >= 0.6);
        results[index] = {
          heard: heardWords.join(" "),
          opensOnLine: found === 0,
          lineLaterInCut: found > 0,
        };
      }
    })
  );
  return results;
}

const checks = SKIP_VERIFY ? [] : await verify();
timed.forEach((line, index) => {
  line.check = checks[index] ?? null;
});
writeFileSync(resolve(workDir, "timed.json"), JSON.stringify(timed, null, 2));

const clock = (seconds) => `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(2).padStart(5, "0")}`;
for (const line of timed) {
  const verdict = !line.check
    ? ""
    : line.check.opensOnLine
      ? "✓"
      : line.check.lineLaterInCut
        ? `⚠ late-start? heard "${line.check.heard}"`
        : `⚠ heard "${line.check.heard}"`;
  console.log(
    `${String(line.id).padStart(3)} ${clock(line.start)}–${clock(line.end)} ${line.matched}/${line.words} ${line.text}` +
      `${line.flag ? ` [${line.flag}]` : ""} ${verdict}`
  );
}
const flagged = timed.filter((line) => line.check && !line.check.opensOnLine).length;
console.log(`\n${timed.length} lines; ${timed.filter((line) => line.flag?.includes("interpolated")).length} interpolated; ${flagged} flagged by the Gemini check.`);

if (WRITE) {
  const { writeLyricsModule } = await import("./write-lyrics-module.mjs");
  writeLyricsModule(timed, resolve(FEATURE_DIR, "lyrics.ts"), duration);
  console.log(`Wrote ${resolve(FEATURE_DIR, "lyrics.ts")}`);
}
