/** Writes the aligned lines as the page's lyric data module. */
import { writeFileSync } from "node:fs";

const quote = (text) => JSON.stringify(text);

export function writeLyricsModule(lines, target, duration) {
  const rows = lines.map(
    (line) =>
      `  { start: ${line.start.toFixed(2)}, end: ${line.end.toFixed(2)}, section: ${quote(line.section)}, stanza: ${line.stanza}, text: ${quote(line.text)} },`
  );
  const source = `/**
 * Beyond the Reef — lyric timeline.
 *
 * The words are exactly as written (scripts/beyond-the-reef/lyrics.txt). Times
 * are seconds into beyond-the-reef.mp3: \`start\` is the first sung syllable,
 * \`end\` the last. They were aligned from the recording by
 * scripts/beyond-the-reef/align-lyrics.mjs and can be corrected here by ear —
 * nothing else needs to change when a number does.
 */
import type { LyricLine } from "./types";

/** Length of the recording, used until the audio element reports its own. */
export const SONG_DURATION = ${duration.toFixed(2)};

export const LYRICS: LyricLine[] = [
${rows.join("\n")}
];
`;
  writeFileSync(target, source, "utf8");
}
