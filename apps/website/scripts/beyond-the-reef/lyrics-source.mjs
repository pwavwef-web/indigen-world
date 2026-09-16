/**
 * Reads lyrics.txt — the song's words exactly as supplied — into ordered lines.
 *
 * `[Section]` headings name the part of the song a line belongs to and are never
 * shown as lyrics. A blank line closes a stanza; the page uses stanza breaks for
 * breathing room in the rising lyric stream.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { HERE } from "./shared.mjs";

export function readLyricLines(path = resolve(HERE, "lyrics.txt")) {
  const raw = readFileSync(path, "utf8").replace(/\r\n/g, "\n");
  const lines = [];
  let section = "";
  let stanza = 0;
  let stanzaOpen = false;
  for (const rawLine of raw.split("\n")) {
    const text = rawLine.trimEnd();
    const heading = /^\[(.+)\]$/.exec(text.trim());
    if (heading) {
      section = heading[1];
      if (stanzaOpen) stanza += 1;
      stanzaOpen = false;
      continue;
    }
    if (text.trim() === "") {
      if (stanzaOpen) stanza += 1;
      stanzaOpen = false;
      continue;
    }
    lines.push({ id: lines.length, section, stanza, text });
    stanzaOpen = true;
  }
  return lines;
}
