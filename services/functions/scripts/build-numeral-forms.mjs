/**
 * Printable sheets for collecting the Kasem numerals 1–10, one noun to a page.
 *
 * ── What this batch is actually asking ────────────────────────────────────
 * Francis, 2026-09-05: "balei, yalei, nlei, selei, telei and delei all mean 2
 * and are used in Ghana Kasem. The word that comes before influences which one
 * to use." So "how do you say two" has no answer on its own — the answer is a
 * table, and the table has a row for every class of noun and a column for every
 * number. Seven forms of *two* are attested and the rest of the series is known
 * from one text (Genesis 1) in one series only. Nothing selects a form.
 *
 * The instrument that fills a table like that is not a questionnaire about
 * grammar. It is: **pick a thing, and count it out loud from one to ten.** Every
 * speaker can do that; almost nobody can answer "what class is this noun". So a
 * page is a noun, and its ten lines are one fluent task. Comparing the pages
 * afterwards is where the classes fall out — and that comparison is the whole
 * point, which is why the nouns are chosen to be ordinary and unlike each other
 * rather than to be interesting.
 *
 * ── Why the sheets print no Kasem at all ──────────────────────────────────
 * Not caution for its own sake. This form's entire subject is *which* form of a
 * number somebody reaches for, and a printed specimen answer is the one thing
 * that can change that: a filler who has just read `yalei` on the cover writes
 * `yalei` on the sheet, and the contamination is undetectable afterwards
 * because it looks exactly like data. The worked example is therefore in
 * English, where it can teach the shape of an answer and nothing about Kasem —
 * the same discipline, and the same reason, as build-paper-forms.mjs.
 *
 * The seven attested forms of *two* are in the JSON manifest instead, under
 * `reference`, for whoever types the scans up. That is after the answering is
 * done, where knowing them can only help.
 *
 * ── Why sheet C1 counts backwards as well as forwards ─────────────────────
 * Francis, 2026-09-08: "nlei is often used in countdowns." `n-` is the one
 * prefix of the seven that matches no article and no pronoun, and a form used
 * when counting *is* the activity — with no noun present to agree with — would
 * explain that. The backwards column is the cheapest possible test of it.
 *
 *     node services/functions/scripts/build-numeral-forms.mjs
 *
 * Writes data/paper-forms/<batch>.html and <batch>.json. Deterministic. Print
 * the HTML to PDF with any browser (A4, no headers, background graphics off).
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const outDir = join(root, 'data', 'paper-forms');

const BATCH = {
  id: 'numerals-001-010',
  title: 'Kasem number sheets — counting one to ten',
  subtitle: 'Batch 1 · ten things to count · one page each',
};

/**
 * The things being counted.
 *
 * ── How these ten were chosen ─────────────────────────────────────────────
 * Ordinary, countable, and as unlike one another as ten everyday words can be:
 * people, an animal, a building, a plant, a stone, and two stretches of time.
 * The reason is that a class only becomes visible when two nouns disagree, so a
 * batch of ten nouns that all behaved alike would be ten pages of nothing. A
 * list of ten *interesting* nouns would have the opposite fault — it would be
 * this project deciding in advance where the boundaries are, which is exactly
 * the thing being asked.
 *
 * `day` is here because it is the one noun in the whole Genesis 1 harvest
 * observed with both an article (`da yam`) and a numeral (`da yalei`). Whatever
 * else these sheets settle, that page can be checked against something.
 *
 * Mass nouns — water, food, money — are deliberately absent. "Two waters" is a
 * question about measure words, which is a different batch and a much harder
 * one, and putting it here would make several sheets unanswerable in a way the
 * filler would read as their own failure.
 */
const NOUNS = [
  { sheet: 'N01', word: 'child', plural: 'children' },
  { sheet: 'N02', word: 'woman', plural: 'women' },
  { sheet: 'N03', word: 'man', plural: 'men' },
  { sheet: 'N04', word: 'house', plural: 'houses' },
  { sheet: 'N05', word: 'dog', plural: 'dogs' },
  { sheet: 'N06', word: 'goat', plural: 'goats' },
  { sheet: 'N07', word: 'tree', plural: 'trees' },
  { sheet: 'N08', word: 'stone', plural: 'stones' },
  { sheet: 'N09', word: 'day', plural: 'days' },
  { sheet: 'N10', word: 'year', plural: 'years' },
];

/**
 * Two pages where the filler picks the noun.
 *
 * A speaker who knows that some particular word counts oddly has, on a fixed
 * list, nowhere to put it — and that word is worth more than any of the ten,
 * because somebody noticed it. Two blank pages cost two sheets of paper.
 */
const OPEN_SHEETS = [
  { sheet: 'N11', word: null, plural: null },
  { sheet: 'N12', word: null, plural: null },
];

const NUMBERS = [
  [1, 'one'], [2, 'two'], [3, 'three'], [4, 'four'], [5, 'five'],
  [6, 'six'], [7, 'seven'], [8, 'eight'], [9, 'nine'], [10, 'ten'],
];

/**
 * The other things a noun's page asks, and why they are on a numeral form.
 *
 * The definite article, the pronoun and the quantifier are the *other two*
 * surfaces the same class marker appears on — article `yam`, prefix `ya-`,
 * quantifier `ya maama`, pronoun `ya`. Asking for them beside the count costs
 * five lines and turns each page from one reading of a noun's class into four
 * independent ones. A count on its own can only be compared with other counts;
 * a count beside an article can be checked against everything already collected
 * through the app. Wording copied from FORM_SLOTS in
 * apps/tribestudio/src/creator/lexicon.ts so the answers seed without mapping.
 */
const nounSlots = (w, p) => [
  ['definite', 'Say it with “the”', `the ${w}`],
  ['plural', 'Say it for many', p],
  ['pluralDefinite', 'Say the many with “the”', `the ${p}`],
  ['pronoun', 'What you call it afterwards', 'he, she, it'],
  ['quantifier', 'Say “all of them”', `all the ${p}`],
];

/** The letters no desk or phone keyboard produces, for the reference page. */
const KASEM_LETTERS = [
  ['ɛ', 'open e'], ['Ɛ', 'open E'], ['ɩ', 'iota'], ['Ɩ', 'capital iota'],
  ['ŋ', 'eng'], ['Ŋ', 'capital eng'], ['ɔ', 'open o'], ['Ɔ', 'open O'],
  ['ʋ', 'v with hook'], ['Ʋ', 'capital v'], ['ə', 'schwa'], ['ɣ', 'gamma'],
];

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** One labelled writing line: a label column, then a rule to the right margin. */
const line = (label, hint = '', w = 52, h = 9) =>
  `<div class="row" style="height:${h}mm">
     <div class="lab" style="width:${w}mm">${label}${hint ? `<i>${hint}</i>` : ''}</div>
     <div class="rule"></div>
   </div>`;

/**
 * One line of the count: the figure, the English phrase, then the rule.
 *
 * On sheet C1 there is no phrase — the numbers are being said with nothing
 * attached — so the label column collapses and the rule takes the width back.
 * A 34mm blank gap in front of every line would read as somewhere to write.
 */
const countLine = (n, phrase) =>
  `<div class="row cnt" style="height:11.4mm">
     <div class="num">${n}</div>
     <div class="lab" style="width:${phrase ? 34 : 2}mm">${esc(phrase)}</div>
     <div class="rule"></div>
   </div>`;

const footer = () => `
    <footer class="pfoot">
      <div class="row" style="height:9mm">
        <div class="lab" style="width:26mm">Written by</div><div class="rule"></div>
        <div class="lab mid" style="width:24mm">Community</div><div class="rule"></div>
        <div class="lab mid" style="width:12mm">Date</div><div class="rule" style="max-width:26mm"></div>
      </div>
      <div class="consent">☐ Anyone whose knowledge this is has agreed to it being shared.</div>
    </footer>`;

function nounPage(row, total) {
  const named = Boolean(row.word);
  const w = row.word ?? '_____';
  const p = row.plural ?? '_____';
  return `
  <section class="page">
    <header class="phead">
      <div>${esc(BATCH.title)}</div>
      <div>Sheet <b>${esc(row.sheet)}</b> of ${total}</div>
    </header>

    <div class="prompt">
      <div class="pw">${named ? esc(row.word) : 'your own word'}</div>
      <div class="ps">
        <div class="ps-lab">count these from one to ten</div>
        <div class="ps-sent">${
          named
            ? `Say each whole phrase out loud first — <i>${esc(`one ${w}`)}, ${esc(`two ${p}`)}, ${esc(`three ${p}`)}</i> — then write down what you said.`
            : 'Choose any word you like — best of all, one you know is counted differently from the words on the other sheets. Write it below, then count it.'
        }</div>
      </div>
    </div>

    ${named
      ? line('<b>The word in Kasem</b>', 'write it large and clearly', 52, 12)
      : `${line('<b>The English word</b>', 'what you are counting', 52, 10)}
         ${line('<b>The word in Kasem</b>', 'write it large and clearly', 52, 12)}`}

    <div class="sect">The word itself <em>— say each one out loud, then write down what you said</em></div>
    ${nounSlots(w, p).map(([, label, hint]) => line(label, hint, 52, 10)).join('')}

    <div class="sect">Counting them <em>— write the whole thing, the word and the number together</em></div>
    ${NUMBERS.map(([n, name]) => countLine(n, `${name} ${n === 1 ? w : p}`)).join('')}

    <div class="sect">Anything else</div>
    ${line('Is any of these also said another way?', 'write both, and say when each is used', 52, 10)}
    ${line('', '', 52, 10)}
${footer()}
  </section>`;
}

/**
 * Sheet C1 — the numbers with nothing attached to them.
 *
 * Every other page asks what a number sounds like beside a noun. This one asks
 * what it sounds like beside nothing, which is a different question and may
 * have a different answer; if it does not, that is worth knowing too. The three
 * short sections after the two columns exist because "how many?" answered on
 * its own, and counting money or people or days, are the three places a speaker
 * is most likely to say "ah, but there I would say it differently" — and there
 * has to be a line there when they do.
 */
function countingPage(total) {
  return `
  <section class="page">
    <header class="phead">
      <div>${esc(BATCH.title)}</div>
      <div>Sheet <b>C1</b> of ${total}</div>
    </header>

    <div class="prompt">
      <div class="pw">1 &ndash; 10</div>
      <div class="ps">
        <div class="ps-lab">the numbers with nothing attached to them</div>
        <div class="ps-sent">Count out loud, as you would when you are just
          counting — nothing being counted, only the numbers.</div>
      </div>
    </div>

    <div class="sect">Counting <em>— up, and then back down again</em></div>
    <div class="cols">
      <div>
        <div class="colhead">Counting up, one to ten</div>
        ${NUMBERS.map(([n]) => countLine(n, '')).join('')}
      </div>
      <div>
        <div class="colhead">Counting down, ten to one</div>
        ${[...NUMBERS].reverse().map(([n]) => countLine(n, '')).join('')}
      </div>
    </div>

    <div class="sect">Answering “how many?” <em>— the number said on its own, as an answer</em></div>
    ${line('“How many children are there?” — <b>one</b>', '', 62, 9.4)}
    ${line('“How many children are there?” — <b>two</b>', '', 62, 9.4)}
    ${line('“How many children are there?” — <b>three</b>', '', 62, 9.4)}

    <div class="sect">Counting particular things <em>— only if you would say these differently</em></div>
    ${line('Counting money — one, two, three', '', 52, 10)}
    ${line('Counting people — one, two, three', '', 52, 10)}
    ${line('Counting days — one, two, three', '', 52, 10)}

    <div class="sect">Another way <em>— only if there is one</em></div>
    ${line('Is any number said in more than one way?', 'write both, and say when each is used', 52, 10)}
    ${line('', '', 52, 10)}
${footer()}
  </section>`;
}

/**
 * The worked example, in English, and the one thing it has to teach.
 *
 * English counts by leaving the number alone and changing the noun — *one dog,
 * two dogs*. A filler who writes only the part that changed will therefore
 * write only the noun, and throw away the entire content of these sheets. So
 * the example shows the whole phrase written out, with the point spelled out
 * underneath: here it may be the number that changes, and it cannot be seen
 * unless it is written down.
 */
function workedExample() {
  return `
    <div class="worked">
      <h2>What a filled-in line looks like <span class="k">in English — yours will be in Kasem</span></h2>
      <div class="wgrid">
        <div>
          <div class="wword">dog</div>
          <div class="wnote">Written out <b>in full every time</b>, the number and
            the word together — never just the part that changed.</div>
        </div>
        <div>
          ${[['1', 'one dog'], ['2', 'two dogs'], ['3', 'three dogs'], ['4', 'four dogs']]
            .map(([n, a]) => `<div class="wrow"><span>${n}</span><b>${a}</b></div>`).join('')}
        </div>
        <div>
          <div class="wnote"><b>Why in full.</b> In English the number never
            changes — <i>two</i> is <i>two</i> whatever is being counted, and only
            the word for the thing changes. That is the part these sheets cannot
            assume. If the number itself sounds different when you count
            different things, the only way anybody will ever know is if you have
            written the number out each time.</div>
          <div class="wnote">If you are unsure of a line, <b>leave it empty</b>.
            An empty line is honest.</div>
        </div>
      </div>
    </div>`;
}

function coverPage(total) {
  return `
  <section class="page cover">
    <h1>${esc(BATCH.title)}</h1>
    <p class="lede">${esc(BATCH.subtitle)} · keep this page beside you while you write</p>

    <div class="two">
      <div>
        <h2>What these sheets are for</h2>
        <p class="small">A number in Kasem is not always said the same way. Which
          way it is said depends on <b>what is being counted</b> — so the question
          “how do you say two?” has no single answer, and nobody has ever written
          down the whole of it. Each sheet gives you one ordinary thing and asks
          you to count it from one to ten. Put side by side afterwards, the twelve
          sheets show something no single sheet can.</p>
        <h2>How to fill in a sheet</h2>
        <ol>
          <li>Read the word at the top of the sheet. Write it in Kasem on the
              first line, large.</li>
          <li>Answer the short questions about the word itself.</li>
          <li>Then count. <b>Say the whole phrase out loud first</b>, then write
              down exactly what you said. Do not work it out as grammar — say it.</li>
          <li>Write <b>the number and the word together</b>, every line, even when
              it feels repetitive. Writing only the part that changed is what
              would make these sheets worthless.</li>
          <li>If a number can be said in more than one way for that word, write
              both, and say underneath when each one is used.</li>
          <li>Any line you are not sure about, <b>leave it empty</b>. A guess
              becomes a dictionary entry that teaches somebody the wrong thing.</li>
          <li>Sign the bottom and write where you are from. If more than one
              person worked on a sheet, write both names.</li>
        </ol>
        <h2>The last two sheets are yours</h2>
        <p class="small"><b>N11</b> and <b>N12</b> have no word printed on them.
          Choose your own — and if you know a word that is counted differently
          from the ten here, that is the one worth writing. A word somebody
          noticed is worth more than a word off a list.</p>
        <h2>If you run out of room</h2>
        <p class="small">Write on the back, and put the sheet code
          (<b>C1</b>, <b>N01</b>, <b>N02</b>…) at the top of what you write there.
          Keep the sheets in order and send them back together — including any you
          could not answer. A sheet nobody could fill in is something worth
          knowing too.</p>
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
        <h2>The sheets in this batch</h2>
        <ul class="sheets">
          <li><b>C1</b> the numbers alone</li>
          ${NOUNS.map((n) => `<li><b>${n.sheet}</b> ${esc(n.word)}</li>`).join('')}
          ${OPEN_SHEETS.map((n) => `<li><b>${n.sheet}</b> <i>a word you choose</i></li>`).join('')}
        </ul>
        <p class="small">${total} pages of writing in all. They do not have to be
          done in one sitting, or in order, or by one person.</p>
      </div>
    </div>

    ${workedExample()}
  </section>`;
}

/*
 * The visual language is deliberately identical to build-paper-forms.mjs: the
 * two batches will be in the same hands in the same week, and a form that looks
 * like a different project's form is a form somebody has to learn twice. The
 * rules below diverge only where this batch does — the counting columns and the
 * figure in front of each line.
 */
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

.prompt { display: flex; gap: 5mm; align-items: flex-start; border: 0.8pt solid #000;
  padding: 2.5mm 3mm; margin: 3mm 0 3.5mm; }
.pw { font-size: 21pt; font-weight: 700; line-height: 1; white-space: nowrap; }
.ps { flex: 1; }
.ps-lab { font-size: 7pt; text-transform: uppercase; letter-spacing: .04em; color: #444; }
.ps-sent { font-size: 9pt; }

.row { display: flex; align-items: flex-end; gap: 2mm; }
.lab { font-size: 8pt; padding-bottom: 0.8mm; line-height: 1.1; flex: none; }
.lab.mid { text-align: right; }
.lab i { display: block; font-size: 6.8pt; color: #666; font-style: italic; }
.rule { flex: 1; border-bottom: 0.5pt solid #000; height: 100%; }

/* The figure in front of a counting line. Set in the same serif as everything
   else and not boxed: it is a label on a line, not an answer to be written in. */
.cnt .num { width: 7mm; flex: none; font-size: 10.5pt; font-weight: 700;
  text-align: right; padding-bottom: 0.8mm; }

.sect { font-size: 7.5pt; text-transform: uppercase; letter-spacing: .06em;
  border-bottom: 0.8pt solid #000; margin: 3.5mm 0 1.5mm; padding-bottom: 1mm; font-weight: 700; }
.sect em { text-transform: none; letter-spacing: 0; font-weight: 400; color: #555; }

.cols { display: grid; grid-template-columns: 1fr 1fr; gap: 8mm; }
.colhead { font-size: 7.5pt; color: #555; font-style: italic; margin-bottom: 1mm; }

.pfoot { margin-top: auto; border-top: 0.8pt solid #000; padding-top: 2mm; }
.consent { font-size: 8pt; margin-top: 1mm; }

/* ── the front page ── */
.cover h1 { font-size: 19pt; margin: 0; }
.cover .lede { font-size: 9.5pt; color: #444; margin: 1mm 0 4mm; }
.cover h2 { font-size: 9.5pt; text-transform: uppercase; letter-spacing: .05em;
  border-bottom: 0.8pt solid #000; padding-bottom: 1mm; margin: 0 0 2mm; overflow: hidden; }
.cover h2 .k { text-transform: none; letter-spacing: 0; font-weight: 400;
  font-size: 8pt; color: #555; float: right; font-style: italic; }
.cover h2 + h2, .cover ol + h2, .cover p + h2, .cover ul + h2,
.cover .letters + h2 { margin-top: 4mm; }
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
/* One column, not two: at two the C1 row wraps mid-phrase, and a contents
   list that breaks its own lines reads as a mistake on a page whose whole job
   is to look like it was made carefully. */
.sheets { list-style: none; margin: 0 0 3mm; padding: 0; font-size: 8.5pt; }
.sheets li { margin-bottom: 0.8mm; }
.sheets b { display: inline-block; width: 9mm; }
.worked { margin-top: auto; }
.wgrid { display: grid; grid-template-columns: 0.7fr 0.9fr 1.4fr; gap: 6mm;
  border: 0.5pt solid #999; padding: 2.5mm 3mm; }
.wword { font-size: 15pt; font-weight: 700; line-height: 1; }
.wnote { font-size: 7.5pt; color: #444; margin-top: 1.5mm; line-height: 1.3; }
.wrow { display: flex; justify-content: space-between; gap: 3mm; font-size: 8.5pt;
  border-bottom: 0.4pt dotted #999; padding-bottom: 0.6mm; margin-bottom: 1.2mm; }
.wrow span { color: #555; }
.wrow b { text-align: right; }
`;

function build() {
  const sheets = [...NOUNS, ...OPEN_SHEETS];
  const total = sheets.length + 1; // + the numbers-on-their-own sheet
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>${esc(BATCH.title)} — ${esc(BATCH.subtitle)}</title>
<style>${CSS}</style></head>
<body>
${coverPage(total)}
${countingPage(total)}
${sheets.map((row) => nounPage(row, total)).join('\n')}
</body></html>`;

  /**
   * The manifest the typist and the seeder read.
   *
   * `answers` is null on every sheet: that is the slot a typist fills from the
   * scan, and its keys are the stored keys — `forms.definite`, `forms.plural`
   * and the rest go straight through submitCollectionContribution with no
   * mapping layer, and `counts` is the new material this batch exists for.
   *
   * `reference` is here and not on the paper. It is what is already attested,
   * and a typist checking a scan against it is doing quality control; a filler
   * reading it before answering would be copying. Same facts, opposite effect,
   * and the only difference is which side of the answering it sits on.
   */
  const manifest = {
    batch: BATCH.id,
    target: 'numeral-concord',
    builtBy: 'services/functions/scripts/build-numeral-forms.mjs',
    formSlots: nounSlots('X', 'Xs').map(([id, label]) => ({ id, label })),
    numbers: NUMBERS.map(([n]) => n),
    reference: {
      note:
        'Attested already — for checking a scan against, never for printing on a sheet. '
        + 'Mirrors NUMERAL_TWO_FORMS and DETERMINER_PRONOUNS in '
        + 'services/functions/src/kasem-morphology.ts.',
      twoForms: ['balei', 'yalei', 'nlei', 'selei', 'telei', 'delei', 'kalei'],
      definiteArticles: ['kam', 'kom', 'dem', 'tem', 'bam', 'yam', 'sem', 'wom'],
      countdownNote: 'nlei is often used in countdowns (speaker, 2026-09-08).',
    },
    sheets: [
      { sheet: 'C1', kind: 'numerals-alone', word: null, answers: null },
      ...sheets.map((row) => ({
        sheet: row.sheet,
        kind: row.word ? 'counted-noun' : 'counted-noun-open',
        word: row.word,
        answers: null,
      })),
    ],
  };

  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, `${BATCH.id}.html`), html, 'utf8');
  writeFileSync(join(outDir, `${BATCH.id}.json`), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(`${total + 1} pages -> data/paper-forms/${BATCH.id}.html`);
  console.log(`manifest    -> data/paper-forms/${BATCH.id}.json`);
}

build();
