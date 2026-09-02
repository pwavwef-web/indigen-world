/**
 * Turns the two supplied English word lists into the seed for `wordQueue`.
 *
 * ── Why there are two sources ─────────────────────────────────────────────
 * `15000-english-words-with-sentences.txt` supplies the words and, crucially,
 * a real sentence for each: a translator handed the bare word "light" cannot
 * know whether it is the noun, the verb or the adjective, and Kasem will not
 * use one word for all three. The sentence is what makes the ask answerable.
 *
 * `1000-english-words.docx` supplies the *order*. It is a frequency-ranked
 * list, and frequency is the whole difference between a dictionary somebody
 * can use and a curiosity: "water", "mother" and "eat" have to be translated
 * before "abalone". Without it the queue would run alphabetically and the
 * first three hundred words a member ever saw would all begin with A.
 *
 * ── Licence ───────────────────────────────────────────────────────────────
 * The sentences are from Tatoeba, under CC BY 2.0 FR, which requires
 * attribution. Every row therefore carries the Tatoeba sentence id and the
 * contributor's name, and the app shows them wherever the sentence is shown.
 * Ten of the fifteen thousand rows carry no attribution in the source; those
 * are seeded with `sentenceSource: 'unattributed'` so the app can withhold a
 * credit it cannot make rather than invent one.
 *
 *     node services/functions/scripts/build-word-queue.mjs
 *
 * Writes data/word-seed/word-queue.ndjson. Deterministic: the same inputs
 * always produce the same ids and the same ranks, so re-running it and
 * re-seeding is a no-op rather than a reshuffle.
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateRawSync } from 'node:zlib';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const seedDir = join(root, 'data', 'word-seed');

/** `00001. word — sentence [Tatoeba #123; contributor: NAME]` */
const ENTRY = /^(\d{5})\.\s+(.+?)\s+—\s+(.*?)(?:\s*\[Tatoeba #(\d+); contributor: ([^\]]+)\])?\s*$/;

/**
 * The frequency list, read out of the .docx without a library.
 *
 * A .docx is a zip of XML, and the only part that matters here is the numbered
 * `N. word` runs inside document.xml. The file is a four-column table, so its
 * reading order interleaves the columns — 1, 251, 501, 751, 2, 252, … — which
 * is exactly why the rank is taken from the printed number rather than from
 * the position in the file.
 */
function frequencyRanks(docxPath) {
  const text = extractDocxText(readFileSync(docxPath));
  const ranks = new Map();
  for (const match of text.matchAll(/(\d{1,4})\.\s*([A-Za-z][A-Za-z'-]*)/g)) {
    const rank = Number(match[1]);
    const word = match[2].toLowerCase();
    if (rank < 1 || rank > 1000) continue;
    // First writer wins: a word that appears twice keeps its better rank.
    if (!ranks.has(word)) ranks.set(word, rank);
  }
  return ranks;
}

/** The text of word/document.xml, with paragraph breaks preserved. */
function extractDocxText(buffer) {
  const xml = readZipEntry(buffer, 'word/document.xml');
  return decodeEntities(
    xml.replace(/<\/w:p>/g, '\n').replace(/<[^>]+>/g, ' '),
  );
}

/**
 * One entry out of a zip, by name.
 *
 * Hand-rolled rather than pulled from npm: this script runs once, at seed
 * time, and a dependency added to the functions package for it would ship to
 * production for the rest of its life. Only the two storage methods a .docx
 * actually uses are supported — stored and deflated.
 *
 * Separators are normalised because this particular .docx was written with
 * backslashes in its entry names (`word\document.xml`), which is legal enough
 * that Word reads it and unusual enough that `unzip` warns about it. Matching
 * the literal name found nothing at all.
 */
function readZipEntry(buffer, name) {
  const wanted = name.replace(/\\/g, '/');
  for (let i = 0; i <= buffer.length - 46; i += 1) {
    if (buffer.readUInt32LE(i) !== 0x02014b50) continue; // central directory
    const nameLength = buffer.readUInt16LE(i + 28);
    const entry = buffer
      .subarray(i + 46, i + 46 + nameLength)
      .toString('utf8')
      .replace(/\\/g, '/');
    if (entry !== wanted) continue;

    const method = buffer.readUInt16LE(i + 10);
    const compressedSize = buffer.readUInt32LE(i + 20);
    const offset = buffer.readUInt32LE(i + 42);
    const localNameLength = buffer.readUInt16LE(offset + 26);
    const localExtraLength = buffer.readUInt16LE(offset + 28);
    const start = offset + 30 + localNameLength + localExtraLength;
    const raw = buffer.subarray(start, start + compressedSize);
    // `inflateRawSync`, not `unzipSync`: a zip member is a *raw* deflate
    // stream with no zlib or gzip header on it, and the auto-detecting
    // inflater rejects it outright as a bad header.
    const bytes = method === 0 ? raw : inflateRawSync(raw);
    return bytes.toString('utf8');
  }
  throw new Error(`${name} is not in the archive.`);
}

function decodeEntities(value) {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/**
 * A stable document id for a word.
 *
 * The word itself, folded to something Firestore accepts, plus a short hash so
 * that "re-run" and "re-slug" can never collide two different words onto one
 * document. Deterministic, so re-seeding updates rows instead of duplicating
 * them.
 */
export function wordQueueId(word) {
  const slug = word.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const digest = createHash('sha1').update(word.toLowerCase()).digest('hex').slice(0, 6);
  return `${slug || 'word'}-${digest}`;
}

/**
 * Where a word outside the frequency list sits in the queue.
 *
 * A deterministic spread rather than the source order, which is alphabetical.
 * Left alphabetical, everybody who exhausted the core thousand would then be
 * asked for "aardvark, aah, abalone, abandon" in a row — fifteen thousand
 * words served worst-first, by accident of spelling. This is not a claim about
 * frequency, which the source does not carry; it is a refusal to let spelling
 * stand in for one.
 */
function extendedRank(word) {
  const digest = createHash('sha1').update(word.toLowerCase()).digest();
  return 1000 + (digest.readUInt32BE(0) % 1_000_000);
}

function main() {
  const ranks = frequencyRanks(join(seedDir, '1000-english-words.docx'));
  const lines = readFileSync(
    join(seedDir, '15000-english-words-with-sentences.txt'),
    'utf8',
  ).replace(/^﻿/, '').split(/\r?\n/);

  const rows = [];
  const seen = new Set();
  let unattributed = 0;

  for (const line of lines) {
    const match = ENTRY.exec(line.trim());
    if (!match) continue;
    const [, , rawWord, sentence, tatoebaId, contributor] = match;
    const word = rawWord.trim();
    const key = word.toLowerCase();
    if (!word || !sentence.trim() || seen.has(key)) continue;
    seen.add(key);

    const coreRank = ranks.get(key);
    if (!tatoebaId) unattributed += 1;

    rows.push({
      id: wordQueueId(word),
      word,
      // Lowercased alongside the original so a lookup never has to guess which
      // casing the source used — "I" and "a" both appear as printed.
      lookup: key,
      sentence: sentence.trim(),
      sentenceSource: tatoebaId ? 'tatoeba' : 'unattributed',
      tatoebaId: tatoebaId ?? null,
      tatoebaContributor: contributor?.trim() ?? null,
      licence: tatoebaId ? 'CC BY 2.0 FR' : null,
      tier: coreRank ? 'core' : 'extended',
      rank: coreRank ?? extendedRank(word),
      status: 'open',
      approvedCount: 0,
      pendingCount: 0,
      skipCount: 0,
    });
  }

  rows.sort((left, right) => left.rank - right.rank);

  const out = join(seedDir, 'word-queue.ndjson');
  writeFileSync(out, `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`, 'utf8');

  const core = rows.filter((row) => row.tier === 'core').length;
  console.log(`wrote ${rows.length} rows to ${out}`);
  console.log(`  core (frequency-ranked): ${core}`);
  console.log(`  extended:                ${rows.length - core}`);
  console.log(`  without attribution:     ${unattributed}`);
  console.log(`  first five: ${rows.slice(0, 5).map((row) => row.word).join(', ')}`);
}

main();
