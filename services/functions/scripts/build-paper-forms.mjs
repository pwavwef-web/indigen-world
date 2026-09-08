/**
 * Turns a batch of `wordQueue` rows into a printable paper form.
 *
 * ── Why paper ─────────────────────────────────────────────────────────────
 * The people who know this language best are not the people who type fastest.
 * A form that costs twenty minutes of hunting for ɩ on a phone keyboard is a
 * form that collects three words from somebody who could have given fifty, and
 * the loss is silent: it looks like the vocabulary was not known rather than
 * that it was not typeable. So the same questions the app asks are printed,
 * answered by hand, scanned, and typed once by somebody for whom typing is
 * cheap. The archive cannot tell the difference; the contributor can.
 *
 * ── What this file guarantees ─────────────────────────────────────────────
 * That the paper asks exactly what the record can store, in the same order and
 * with the same words. Every label here is copied from
 * `apps/tribestudio/src/creator/lexicon.ts` and
 * `services/functions/src/lexical-senses.ts`, and the register and subject
 * codes resolve back to the stored ids in `CODES` below. A sheet that asked a
 * question the schema has no field for would produce handwriting nobody can
 * seed, which is worse than not asking.
 *
 * ── Why the queue id is printed on every sheet ────────────────────────────
 * A scan is an image. Without an identifier on the page, matching twenty
 * returned sheets back to twenty queue rows is done by reading the English
 * word off each one and hoping no two batches ever used the same word — which
 * they will, because the queue is fifteen thousand words long and this process
 * is meant to run many times. The sheet code and the queue id are printed
 * small at the top of every page, and repeated in the JSON manifest written
 * beside the HTML, so the seeding step never has to guess.
 *
 *     node services/functions/scripts/build-paper-forms.mjs
 *
 * Writes data/paper-forms/<batch>.html and <batch>.json. Deterministic.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const queuePath = join(root, 'data', 'word-seed', 'word-queue.ndjson');
const outDir = join(root, 'data', 'paper-forms');

/**
 * The batch.
 *
 * Twenty concrete, high-frequency nouns, chosen so that the first sheets a
 * community ever sees are ones anybody can answer without thinking. That is a
 * deliberate property of a *test* batch: if a sheet comes back empty, the
 * reason has to be the form, because it cannot be the word. "water" and
 * "mother" fail for no other reason.
 *
 * They also exercise the noun paradigm harder than abstractions would. "two
 * houses" and "two waters" are different questions, and a batch of abstract
 * nouns would have answered neither.
 */
const BATCH = {
  id: 'nouns-001-020',
  prefix: 'N',
  title: 'Kasem word sheets — nouns',
  subtitle: 'Batch 1 · twenty words',
  partOfSpeech: 'noun',
  words: [
    'water', 'child', 'house', 'woman', 'man',
    'food', 'name', 'hand', 'eye', 'day',
    'night', 'fire', 'dog', 'tree', 'road',
    'mother', 'father', 'head', 'money', 'village',
  ],
};

/**
 * The two closed lists, as codes a person writes into a box.
 *
 * ── Why codes and not tick-boxes on every page ────────────────────────────
 * Ten registers and eighteen subject fields printed under every meaning on
 * every page is twenty-eight boxes per meaning, sixty per sheet, twelve
 * hundred across the batch — and the page has no room left for the answers.
 * Printed once on a reference page and referred to by code, they cost two
 * small boxes per meaning. The trade is that somebody has to look a code up,
 * which is a real cost and is why the reference page is designed to be kept
 * beside the sheets rather than bound in front of them.
 *
 * The ids are the stored values from SENSE_REGISTERS and SENSE_DOMAINS in
 * services/functions/src/lexical-senses.ts. If either list changes there this
 * one has to change with it — the codes are positional, and a silently
 * re-ordered list would seed a whole batch under the wrong labels.
 */
const CODES = {
  register: [
    ['R1', 'everyday', 'Everyday speech'],
    ['R2', 'respectful', 'Said with respect'],
    ['R3', 'formal', 'Formal or ceremonial'],
    ['R4', 'colloquial', 'Casual, among friends'],
    ['R5', 'old', 'Old people’s word'],
    ['R6', 'new', 'Newer word'],
    ['R7', 'joking', 'Said jokingly'],
    ['R8', 'figurative', 'Figurative'],
    ['R9', 'childspeak', 'Said to children'],
    ['R10', 'avoided', 'Not said in front of elders'],
  ],
  domain: [
    ['S1', 'farming', 'Farming and land'],
    ['S2', 'food', 'Food and cooking'],
    ['S3', 'kinship', 'Family and kinship'],
    ['S4', 'body', 'The body and health'],
    ['S5', 'animals', 'Animals'],
    ['S6', 'plants', 'Plants and trees'],
    ['S7', 'weather', 'Weather and seasons'],
    ['S8', 'market', 'Market and trade'],
    ['S9', 'house', 'House and compound'],
    ['S10', 'clothing', 'Clothing and adornment'],
    ['S11', 'ritual', 'Ritual and belief'],
    ['S12', 'chieftaincy', 'Chieftaincy and custom'],
    ['S13', 'greeting', 'Greetings and address'],
    ['S14', 'music', 'Music and dance'],
    ['S15', 'work', 'Work and craft'],
    ['S16', 'travel', 'Travel and place'],
    ['S17', 'time', 'Time and counting'],
    ['S18', 'speech', 'Speech and storytelling'],
  ],
};

/**
 * The noun paradigm, worded as the app words it.
 *
 * "Say it with the" is a question every Kasem speaker answers without
 * thinking; "give the definite form of the noun, class III" is a question
 * about grammar that almost nobody can answer about their own language. The
 * server induces the class from the answer. Copied from FORM_SLOTS in
 * apps/tribestudio/src/creator/lexicon.ts, noun group only — `article` is
 * storable but no screen asks for it, and a paper form that asked a question
 * no screen asks would produce answers with nowhere to go.
 */
const NOUN_SLOTS = [
  ['definite', 'Say it with “the”', 'the boy'],
  ['plural', 'Say it for many', 'boys'],
  ['pluralDefinite', 'Say the many with “the”', 'the boys'],
  ['counted', 'Say it with “two”', 'two boys'],
  ['pronoun', 'What you call it afterwards', 'he, it'],
];

/** The letters no desk or phone keyboard produces, for the reference page. */
const KASEM_LETTERS = [
  ['ɛ', 'open e'], ['Ɛ', 'open E'], ['ɩ', 'iota'], ['Ɩ', 'capital iota'],
  ['ŋ', 'eng'], ['Ŋ', 'capital eng'], ['ɔ', 'open o'], ['Ɔ', 'open O'],
  ['ʋ', 'v with hook'], ['Ʋ', 'capital v'], ['ə', 'schwa'], ['ɣ', 'gamma'],
];

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The queue rows for this batch, in the order the batch names them. */
function loadBatch() {
  const byLookup = new Map();
  for (const raw of readFileSync(queuePath, 'utf8').split('\n')) {
    if (!raw.trim()) continue;
    const row = JSON.parse(raw);
    // First writer wins: the queue is frequency-ordered, so the first row for
    // a lookup is the best-ranked one and carries the sentence worth printing.
    if (!byLookup.has(row.lookup)) byLookup.set(row.lookup, row);
  }
  return BATCH.words.map((word, i) => {
    const row = byLookup.get(word);
    if (!row) throw new Error(`"${word}" is not in the word queue`);
    return { ...row, sheet: `${BATCH.prefix}${String(i + 1).padStart(2, '0')}` };
  });
}

/**
 * The Tatoeba credit for one sentence, or nothing.
 *
 * Not optional politeness: the sentences are CC BY 2.0 FR and attribution is a
 * licence condition, which does not stop applying because the medium is paper.
 * Ten of the fifteen thousand rows carry no attribution in the source; those
 * print no credit rather than an invented one.
 */
function credit(row) {
  if (row.sentenceSource !== 'tatoeba' || !row.tatoebaId) return '';
  const who = row.tatoebaContributor ? `, ${esc(row.tatoebaContributor)}` : '';
  return `<div class="credit">Tatoeba #${esc(row.tatoebaId)}${who} · CC BY 2.0 FR</div>`;
}

/** One labelled writing line: a label column, then a rule to the right margin. */
const line = (label, hint = '', w = 46, h = 9) =>
  `<div class="row" style="height:${h}mm">
     <div class="lab" style="width:${w}mm">${label}${hint ? `<i>${hint}</i>` : ''}</div>
     <div class="rule"></div>
   </div>`;

/** A full-width writing area with its label sitting above it. */
const block = (label, count = 1, h = 8) =>
  `<div class="blk"><div class="lab wide">${label}</div>${
    Array.from({ length: count }, () => `<div class="rule solo" style="height:${h}mm"></div>`).join('')
  }</div>`;

/** The small box a register or subject code is written into. */
const codeBox = (label) =>
  `<span class="code"><span class="code-lab">${label}</span><span class="box"></span></span>`;

/**
 * One meaning.
 *
 * The second is compact and dashed on purpose. A full-size second block invites
 * somebody to fill it because it is there, and a dictionary that records a
 * second sense for every word has invented half of them; a visibly optional
 * block asks the question without pressing for an answer.
 */
function meaningBlock(n, compact) {
  return `
    <div class="meaning${compact ? ' compact' : ''}">
      <div class="mhead">Meaning ${n}${compact ? ' <em>— only if the word means a second, different thing</em>' : ''}</div>
      ${line('What it means in English', '', 46, 9)}
      <div class="row codes" style="height:8mm">
        <div class="lab" style="width:46mm">How it is said · what it is about<i>codes from the front page</i></div>
        ${codeBox('R')}${codeBox('S')}
      </div>
      ${compact ? '' : block('Say what it means <b>in Kasem</b>', 2)}
      ${compact ? '' : line('When it is said, when it is not', '', 46, 9)}
      ${line('Example sentence in Kasem', '', 46, 9)}
      ${line('…and what that sentence means', '', 46, 9)}
      ${compact ? '' : `<div class="row" style="height:9mm">
        <div class="lab" style="width:46mm">Words that mean nearly the same</div><div class="rule"></div>
        <div class="lab mid" style="width:26mm">…and the opposite</div><div class="rule"></div>
      </div>`}
    </div>`;
}

function wordPage(row, total) {
  return `
  <section class="page">
    <header class="phead">
      <div>${esc(BATCH.title)} · ${esc(BATCH.subtitle)}</div>
      <div>Sheet <b>${esc(row.sheet)}</b> of ${total} <span class="qid">${esc(row.id)}</span></div>
    </header>

    <div class="prompt">
      <div class="pw">${esc(row.word)}</div>
      <div class="ps">
        <div class="ps-lab">the word as it is used here —</div>
        <div class="ps-sent">“${esc(row.sentence)}”</div>
        ${credit(row)}
      </div>
    </div>

    ${line('<b>The word in Kasem</b>', 'write it large and clearly', 46, 13)}
    ${line('How it sounds, if you can write it', 'leave blank if unsure', 46, 9)}

    <div class="sect">The forms of the word <em>— say each one out loud, then write down what you said</em></div>
    ${NOUN_SLOTS.map(([, label, hint]) => line(label, hint, 46, 9)).join('')}

    ${meaningBlock(1, false)}
    ${meaningBlock(2, true)}

    <div class="row" style="height:8mm">
      <div class="lab" style="width:46mm">Is the word also used as</div>
      <div class="ticks">
        <span>☐ verb</span><span>☐ adjective</span><span>☐ adverb</span>
        <span>☐ a name</span><span>☐ something else:</span>
      </div>
      <div class="rule"></div>
    </div>
    ${line('Where the word comes from, if known', 'a borrowing, two words joined', 46, 9)}

    <footer class="pfoot">
      <div class="row" style="height:9mm">
        <div class="lab" style="width:26mm">Written by</div><div class="rule"></div>
        <div class="lab mid" style="width:24mm">Community</div><div class="rule"></div>
        <div class="lab mid" style="width:12mm">Date</div><div class="rule" style="max-width:26mm"></div>
      </div>
      <div class="consent">☐ Anyone whose knowledge this is has agreed to it being shared.</div>
    </footer>
  </section>`;
}

/**
 * A filled-in sheet, worked in English.
 *
 * ── Why the example is in English ─────────────────────────────────────────
 * Because a specimen answer in Kasem would be this project printing invented
 * word forms, on a page whose whole purpose is to be copied. Somebody unsure
 * of a plural would copy the pattern off the example, and a fabrication would
 * propagate into the archive wearing the authority of the instructions. The
 * English demonstration teaches the *shape* of an answer — which is the only
 * thing anybody is confused about — and can teach nothing false about Kasem,
 * because it makes no claim about Kasem at all. It is labelled as such twice.
 *
 * "boy" rather than one of the twenty, so that nobody reads the example as a
 * head start on a sheet they are about to fill in.
 */
function workedExample() {
  const rows = [
    ['Say it with “the”', 'the boy'],
    ['Say it for many', 'boys'],
    ['Say the many with “the”', 'the boys'],
    ['Say it with “two”', 'two boys'],
    ['What you call it afterwards', 'he'],
  ];
  return `
    <div class="worked">
      <h2>What a filled-in sheet looks like <span class="k">in English — yours will be in Kasem</span></h2>
      <div class="wgrid">
        <div>
          <div class="wword">boy</div>
          <div class="wnote">Every answer below is written the way it is
            <b>said</b>, as a whole phrase.</div>
        </div>
        <div>
          ${rows.map(([q, a]) => `<div class="wrow"><span>${q}</span><b>${a}</b></div>`).join('')}
        </div>
        <div>
          <div class="wrow"><span>What it means</span><b>a young male child</b></div>
          <div class="wrow"><span>How it is said</span><b>R1</b></div>
          <div class="wrow"><span>What it is about</span><b>S3</b></div>
          <div class="wnote">Nothing was known about where the word comes from,
            so that line was <b>left empty</b> — which is the right answer.</div>
        </div>
      </div>
    </div>`;
}

function coverPage(rows) {
  const half = Math.ceil(CODES.domain.length / 2);
  return `
  <section class="page cover">
    <h1>${esc(BATCH.title)}</h1>
    <p class="lede">${esc(BATCH.subtitle)} · one word to a page · keep this page beside you while you write</p>

    <div class="two">
      <div>
        <h2>How to fill in a sheet</h2>
        <ol>
          <li>Read the English word at the top, then read the sentence under it.
              The sentence is there to show <b>which</b> meaning is being asked
              about — “water” the thing you drink, not “water” the garden.</li>
          <li>Write the Kasem word on the first line, large.</li>
          <li>For each form, <b>say the whole phrase out loud first</b>, then write
              down exactly what you said. Do not try to work it out as grammar.</li>
          <li>Write <b>the whole phrase</b>, not only the part that changed. The
              word that goes with a noun changes to match it, and that is most of
              what these lines are for — writing only the noun throws it away.</li>
          <li>Fill in Meaning 1. Use Meaning 2 only if the word really means a
              second, different thing.</li>
          <li>Any line you are not sure about, <b>leave it empty</b>. An empty line
              is honest. A guess becomes a dictionary entry that teaches somebody
              the wrong thing.</li>
          <li>Sign the bottom and write where you are from. If more than one person
              worked on a sheet, write both names.</li>
        </ol>
        <h2>If you run out of room</h2>
        <p class="small">Write on the back of the sheet, and put the sheet code
           (<b>N01</b>, <b>N02</b>…) at the top of what you write there.</p>
        <h2>When the batch is done</h2>
        <p class="small">Keep the sheets in order and send them back together. Do
           not throw away a sheet you could not answer — an unanswered word is
           something worth knowing too.</p>
      </div>
      <div>
        <h2>The Kasem letters</h2>
        <p class="small">Write these by hand exactly as they are printed. Using the
           nearest English letter instead files the word under a spelling that is a
           different word.</p>
        <div class="letters">
          ${KASEM_LETTERS.map(([c, n]) => `<div><span class="glyph">${c}</span><span>${n}</span></div>`).join('')}
        </div>
        <h2>Tone marks</h2>
        <p class="small">They sit on top of the letter before them. Only mark tone
           where it changes the word.</p>
        <div class="letters tones">
          <div><span class="glyph">a&#769;</span><span>high</span></div>
          <div><span class="glyph">a&#768;</span><span>low</span></div>
          <div><span class="glyph">a&#772;</span><span>mid</span></div>
        </div>
      </div>
    </div>

    <div class="ref">
      <div>
        <h2>How it is said <span class="k">write the R code</span></h2>
        <ul class="codes-list">
          ${CODES.register.map(([c, , l]) => `<li><b>${c}</b> ${esc(l)}</li>`).join('')}
        </ul>
      </div>
      <div>
        <h2>What it is about <span class="k">write the S code</span></h2>
        <ul class="codes-list">
          ${CODES.domain.slice(0, half).map(([c, , l]) => `<li><b>${c}</b> ${esc(l)}</li>`).join('')}
        </ul>
      </div>
      <div>
        <h2 class="blank">&nbsp;</h2>
        <ul class="codes-list">
          ${CODES.domain.slice(half).map(([c, , l]) => `<li><b>${c}</b> ${esc(l)}</li>`).join('')}
        </ul>
      </div>
    </div>

    ${workedExample()}

    <div class="contents">
      <h2>The twenty words in this batch</h2>
      <p class="small">${rows.map((r) => `<b>${esc(r.sheet)}</b>&nbsp;${esc(r.word)}`).join(' · ')}</p>
    </div>
  </section>`;
}

const CSS = `
@page { size: A4; margin: 11mm 12mm; }
* { box-sizing: border-box; }
body {
  margin: 0; background: #fff; color: #000;
  /* A stack that actually carries ɩ ʋ ə ɣ ŋ ɔ ɛ. Most of these live in the IPA
     Extensions block, which Times New Roman ships on Windows and macOS; the SIL
     faces are named first for anybody who has them installed. */
  font-family: 'Charis SIL', 'Gentium Plus', 'Doulos SIL', 'Times New Roman', serif;
  font-size: 10pt; line-height: 1.25;
}
.page { page-break-after: always; height: 275mm; display: flex; flex-direction: column; }
.page:last-child { page-break-after: auto; }

.phead { display: flex; justify-content: space-between; align-items: baseline;
  border-bottom: 0.5pt solid #000; padding-bottom: 1.5mm; font-size: 7.5pt;
  letter-spacing: .02em; text-transform: uppercase; }
.phead b { font-size: 9.5pt; }
.qid { font-family: 'Courier New', monospace; font-size: 6.5pt; color: #555;
  margin-left: 3mm; text-transform: none; letter-spacing: 0; }

.prompt { display: flex; gap: 5mm; align-items: flex-start; border: 0.8pt solid #000;
  padding: 2.5mm 3mm; margin: 3mm 0 3.5mm; }
.pw { font-size: 21pt; font-weight: 700; line-height: 1; white-space: nowrap; }
.ps { flex: 1; }
.ps-lab { font-size: 7pt; text-transform: uppercase; letter-spacing: .04em; color: #444; }
.ps-sent { font-size: 9.5pt; font-style: italic; }
.credit { font-size: 6.5pt; color: #666; margin-top: 0.5mm; }

.row { display: flex; align-items: flex-end; gap: 2mm; }
.lab { font-size: 8pt; padding-bottom: 0.8mm; line-height: 1.1; flex: none; }
.lab.mid { text-align: right; }
.lab.wide { width: auto; }
.lab i { display: block; font-size: 6.8pt; color: #666; font-style: italic; }
.rule { flex: 1; border-bottom: 0.5pt solid #000; height: 100%; }
.rule.solo { width: 100%; }
.blk .lab { padding-bottom: 0.3mm; }

.sect { font-size: 7.5pt; text-transform: uppercase; letter-spacing: .06em;
  border-bottom: 0.8pt solid #000; margin: 3mm 0 1.5mm; padding-bottom: 1mm; font-weight: 700; }
.sect em { text-transform: none; letter-spacing: 0; font-weight: 400; color: #555; }

.meaning { border: 0.5pt solid #999; padding: 2mm 2.5mm 1.5mm; margin-top: 3mm; }
.meaning.compact { border-style: dashed; margin-top: 2mm; }
.mhead { font-size: 8.5pt; font-weight: 700; margin-bottom: 1mm; }
.mhead em { font-weight: 400; font-style: italic; color: #555; font-size: 7.5pt; }
.codes .code { display: inline-flex; align-items: flex-end; gap: 1.5mm; margin-right: 9mm; }
.code-lab { font-size: 8pt; font-weight: 700; padding-bottom: 0.8mm; }
.box { display: inline-block; width: 17mm; height: 7mm; border: 0.5pt solid #000; }

.ticks { display: flex; gap: 3.5mm; font-size: 8pt; align-items: flex-end;
  padding-bottom: 0.8mm; flex: none; }

.pfoot { margin-top: auto; border-top: 0.8pt solid #000; padding-top: 2mm; }
.consent { font-size: 8pt; margin-top: 1mm; }

/* ── the front page ── */
.cover h1 { font-size: 19pt; margin: 0; }
.cover .lede { font-size: 9.5pt; color: #444; margin: 1mm 0 4mm; }
.cover h2 { font-size: 9.5pt; text-transform: uppercase; letter-spacing: .05em;
  border-bottom: 0.8pt solid #000; padding-bottom: 1mm; margin: 0 0 2mm; overflow: hidden; }
.cover h2.blank { border-color: #fff; }
.cover h2 .k { text-transform: none; letter-spacing: 0; font-weight: 400;
  font-size: 8pt; color: #555; float: right; font-style: italic; }
.cover h2 + h2 { margin-top: 4mm; }
.two { display: grid; grid-template-columns: 1.15fr 1fr; gap: 8mm; }
.two ol { margin: 0 0 4mm; padding-left: 5mm; font-size: 9pt; }
.two li { margin-bottom: 1.6mm; }
.two p { margin: 0 0 3mm; }
.small { font-size: 8pt; color: #333; }
.letters { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1.5mm; margin-bottom: 4mm; }
.letters div { border: 0.5pt solid #000; text-align: center; padding: 1mm 0 1.5mm; }
.glyph { display: block; font-size: 17pt; line-height: 1.1; }
.letters span:last-child { font-size: 6.5pt; color: #555; }
.tones { grid-template-columns: repeat(3, 1fr); width: 62%; }
.ref { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6mm; margin-top: 5mm; }
.codes-list { list-style: none; margin: 0; padding: 0; font-size: 8.5pt; }
.codes-list li { margin-bottom: 0.9mm; }
.codes-list b { display: inline-block; width: 8mm; }
.worked { margin-top: 5mm; }
.wgrid { display: grid; grid-template-columns: 0.7fr 1.15fr 1.15fr; gap: 6mm;
  border: 0.5pt solid #999; padding: 2.5mm 3mm; }
.wword { font-size: 15pt; font-weight: 700; line-height: 1; }
.wnote { font-size: 7.5pt; color: #444; margin-top: 1.5mm; line-height: 1.3; }
.wrow { display: flex; justify-content: space-between; gap: 3mm; font-size: 8.5pt;
  border-bottom: 0.4pt dotted #999; padding-bottom: 0.6mm; margin-bottom: 1.2mm; }
.wrow span { color: #555; }
.wrow b { text-align: right; }

.contents { margin-top: auto; border-top: 0.8pt solid #000; padding-top: 2mm; }
.contents h2 { border: 0; margin-bottom: 1mm; }
`;

function build() {
  const rows = loadBatch();
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>${esc(BATCH.title)} — ${esc(BATCH.subtitle)}</title>
<style>${CSS}</style></head>
<body>
${coverPage(rows)}
${rows.map((r) => wordPage(r, rows.length)).join('\n')}
</body></html>`;

  /**
   * The manifest the seeding step reads.
   *
   * Written beside the HTML rather than parsed back out of it later, because
   * recovering a sheet code from a printed page is exactly the guessing this
   * file exists to avoid. `answers` is null on purpose: it is the slot a typist
   * fills from the scan, and its shape is the published record's shape, so the
   * seeder has no mapping layer left to get wrong.
   */
  const manifest = {
    batch: BATCH.id,
    partOfSpeech: BATCH.partOfSpeech,
    builtFrom: 'data/word-seed/word-queue.ndjson',
    codes: CODES,
    formSlots: NOUN_SLOTS.map(([id, label]) => ({ id, label })),
    sheets: rows.map((r) => ({
      sheet: r.sheet,
      wordQueueId: r.id,
      word: r.word,
      sentence: r.sentence,
      attribution:
        r.sentenceSource === 'tatoeba'
          ? { tatoebaId: r.tatoebaId, contributor: r.tatoebaContributor, licence: r.licence }
          : null,
      answers: null,
    })),
  };

  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, `${BATCH.id}.html`), html, 'utf8');
  writeFileSync(join(outDir, `${BATCH.id}.json`), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(`${rows.length} sheets -> data/paper-forms/${BATCH.id}.html`);
  console.log(`manifest    -> data/paper-forms/${BATCH.id}.json`);
}

build();
