// Pure unit tests for Kasem morphology — no emulator, no network.
//
//   npm run build:functions && node --test firebase/tests/kasemMorphology.test.mjs
//
// The subject is the small module that lets the dictionary record what a word
// actually does — the forms a noun takes, the times a verb is said at — and
// stop asking members for the Kasem for "the". Three things here are
// load-bearing and none of them is obvious from the function signatures:
//
//   * The indefinite is DERIVED and never stored, so a rule stays one rule
//     instead of becoming fifteen thousand copies of itself.
//   * A noun class is INDUCED from a form a speaker gave, and returns null
//     rather than a guess. That is the test that matters most: a fabricated
//     class in a language with few written sources gets published, taught and
//     repeated, and nothing downstream can tell it from a real one.
//   * READING a marker off a form is not INDUCING a class from it. `articleIn`
//     and `numeralSeriesIn` restate what a speaker wrote; `induceNounClass`
//     makes a claim about the language. The last test in this file is the one
//     that holds those two apart.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  DEFINITE_ARTICLES,
  KASEM_INDEFINITE_PARTICLE,
  MAX_FORM_LENGTH,
  NOUN_CLASSES,
  DETERMINER_PRONOUNS,
  NUMERAL_TWO_FORMS,
  articleIn,
  hasLexicalForms,
  indefiniteForm,
  induceNounClass,
  numeralSeriesIn,
  parseLexicalForms,
  pronounCheck,
  pronounForArticle,
  pronounForDefinite,
  readStoredForms,
  storableForms,
} from '../../services/functions/lib/kasem-morphology.js';

// ── The rule that needs no data ─────────────────────────────────────────────

test('the disputed blanket indefinite rule does not synthesize forms', () => {
  assert.equal(KASEM_INDEFINITE_PARTICLE, 'mo');
  assert.equal(indefiniteForm('bu'), '');
  assert.equal(indefiniteForm('  nia  '), '');
  assert.equal(indefiniteForm('rain water'), '');
});

test('an entry with no headword gets no indefinite rather than a bare particle', () => {
  // "mo" on its own is not the indefinite of anything, and rendering it would
  // state something false about the language on an entry nobody can fix.
  assert.equal(indefiniteForm(''), '');
  assert.equal(indefiniteForm('   '), '');
  assert.equal(indefiniteForm(null), '');
  assert.equal(indefiniteForm(undefined), '');
  assert.equal(indefiniteForm(42), '');
  assert.equal(indefiniteForm({}), '');
});

test('deriving is total, so a legacy row cannot take a screen down', () => {
  // Every noun already in dictionaryEntries gets its indefinite form the day
  // the client ships, with no backfill. That only holds if this never throws.
  for (const input of [[], {}, 0, false, NaN, Symbol.iterator.toString()]) {
    assert.doesNotThrow(() => indefiniteForm(input));
  }
});

// ── The class table, and the refusal to invent one ──────────────────────────

test('the class table is well-formed however many entries it has', () => {
  // Deliberately empty today — see the comment on NOUN_CLASSES. This test is
  // written to grow teeth on its own: the moment somebody adds an attested
  // class, these invariants start being checked against it.
  const ids = new Set();
  for (const entry of NOUN_CLASSES) {
    assert.equal(typeof entry.id, 'string');
    assert.ok(entry.id.length > 0, 'a class needs a storable id');
    assert.equal(entry.id, entry.id.toLowerCase(), 'ids are stored and queried');
    assert.ok(entry.label.length > 0, 'a class needs a label somebody can read');
    assert.ok(entry.definiteMarker.length > 0, 'a class without its marker cannot be induced');
    assert.equal(ids.has(entry.id), false, `duplicate class id: ${entry.id}`);
    ids.add(entry.id);
  }
});

test('an unrecognised ending yields null, never a fallback class', () => {
  // THE guard. If this ever starts returning a class for nonsense, somebody
  // has added a default and the dictionary has begun manufacturing grammar.
  assert.equal(induceNounClass('bu', 'zzqxvw'), null);
  assert.equal(induceNounClass('bu', 'bu-something-nobody-said'), null);
  assert.equal(induceNounClass('', ''), null);
  assert.equal(induceNounClass('bu', null), null);
  assert.equal(induceNounClass(null, undefined), null);
});

test('an echoed headword is not evidence of anything', () => {
  // A member who retypes the word into "say it with the" has told us nothing.
  // Treating that as a match would file the whole dictionary under whichever
  // class happened to be listed first.
  assert.equal(induceNounClass('bu', 'bu'), null);
  assert.equal(induceNounClass('Bu', '  bu  '), null);
});

test('every attested class is recoverable from a form built with its marker', () => {
  // Vacuous while NOUN_CLASSES is empty, and self-checking afterwards: it
  // proves induction can actually find each class that has been written down,
  // both suffixed and written as a separate word, which are the two spellings
  // members use.
  for (const entry of NOUN_CLASSES) {
    assert.deepEqual(induceNounClass('stem', `stem${entry.definiteMarker}`), {
      id: entry.id,
      marker: entry.definiteMarker,
    });
    assert.deepEqual(induceNounClass('stem', `stem ${entry.definiteMarker}`), {
      id: entry.id,
      marker: entry.definiteMarker,
    });
  }
});

// ── What the contribution form is allowed to record ─────────────────────────

/** Every slot empty — the shape a class with no paradigm collapses to. */
const EMPTY_FORMS = {
  definite: '',
  plural: '',
  pluralDefinite: '',
  counted: '',
  pronoun: '',
  article: '',
  present: '',
  past: '',
  future: '',
  pluralSubject: '',
  imperative: '',
  agreeingOne: '',
  agreeingTwo: '',
};

const NOUN_ANSWER = {
  definite: 'bukam',
  plural: 'buga',
  pluralDefinite: 'buga bam',
  counted: 'buga balei',
  pronoun: 'o',
  article: 'kam',
};

const VERB_ANSWER = {
  present: 'di',
  past: 'di-PAST',
  future: 'di-FUT',
  pluralSubject: 'di-PL',
  imperative: 'di-IMP',
};

test('a noun keeps the noun paradigm and none of the verb one', () => {
  assert.deepEqual(parseLexicalForms({ ...NOUN_ANSWER, ...VERB_ANSWER }, 'noun'), {
    ...EMPTY_FORMS,
    ...NOUN_ANSWER,
  });
});

test('a verb keeps the tenses and none of the noun paradigm', () => {
  assert.deepEqual(parseLexicalForms({ ...NOUN_ANSWER, ...VERB_ANSWER }, 'verb'), {
    ...EMPTY_FORMS,
    ...VERB_ANSWER,
  });
});

test('a word used both ways keeps both halves', () => {
  // THE reason the paradigm is one flat map rather than a noun object beside a
  // verb object. A Kasem word is routinely both, and making the data model
  // choose forces a choice the language does not make — the entry that is
  // genuinely both would be recorded as whichever the dropdown named first.
  assert.deepEqual(
    parseLexicalForms({ ...NOUN_ANSWER, ...VERB_ANSWER }, ['noun', 'verb']),
    { ...EMPTY_FORMS, ...NOUN_ANSWER, ...VERB_ANSWER },
  );
});

test('an auxiliary takes the verb paradigm, from an id or from a label', () => {
  // The class arrives as an id from the queue and as a label from the open
  // form, and dropping the tenses for every auxiliary whose client sent a
  // label would be invisible until somebody compared two entries.
  for (const spelling of ['auxiliary-verb', 'Auxiliary verb', 'auxiliary_verb']) {
    assert.equal(parseLexicalForms(VERB_ANSWER, spelling).past, 'di-PAST');
  }
});

const AGREEMENT_ANSWER = {
  agreeingOne: 'te maama',
  agreeingTwo: 'ya maama',
};

test('forms are quietly dropped for a class that has no paradigm', () => {
  // Not an error. The fields only render for the class they belong to, so
  // their presence elsewhere is stale client state, and a member's good answer
  // must not fail over it.
  //
  // `ideophone` is the deliberate one on this list. Gur ideophones often do
  // carry intensive and reduplicated forms — but nobody has attested which,
  // for Kasem, and inventing a paradigm for this language's largest
  // poorly-described class is the exact failure the module exists to avoid.
  for (const other of ['adverb', 'preposition', 'ideophone', 'proverb', 'unknown', '', null]) {
    assert.deepEqual(
      parseLexicalForms({ ...NOUN_ANSWER, ...VERB_ANSWER, ...AGREEMENT_ANSWER }, other),
      EMPTY_FORMS,
    );
  }
});

test('a word whose form is chosen by what it goes with is asked about it', () => {
  // The gap this closes: before these two slots, an adjective, a quantifier, a
  // numeral, a determiner, an article and a pronoun were all asked NOTHING —
  // a quantifier got exactly what a preposition got. That is most of the words
  // a learner needs in order to say anything *about* a noun.
  //
  // Francis, 2026-09-06, unprompted: "everything will be either te maama, ya
  // maama, se maama, de maama etc depending on what you are talking about …
  // it is just like the numbers".
  for (const agreeing of [
    'adjective',
    'quantifier',
    'numeral',
    'determiner',
    'article',
    'pronoun',
  ]) {
    assert.deepEqual(parseLexicalForms(AGREEMENT_ANSWER, agreeing), {
      ...EMPTY_FORMS,
      ...AGREEMENT_ANSWER,
    });
  }
});

test('an agreeing class is not handed the noun or verb paradigm', () => {
  // A quantifier has no plural of its own and no tenses. Offering it either
  // would be asking a contributor to invent one.
  const parsed = parseLexicalForms(
    { ...NOUN_ANSWER, ...VERB_ANSWER, ...AGREEMENT_ANSWER },
    'quantifier',
  );
  assert.deepEqual(parsed, { ...EMPTY_FORMS, ...AGREEMENT_ANSWER });
});

test('a noun is not asked the agreement question', () => {
  // It is asked the other half of the same concord — "say it for two", "what
  // do you call it afterwards" — from the noun's side. Asking both would be
  // collecting the same fact twice under two names.
  const parsed = parseLexicalForms({ ...NOUN_ANSWER, ...AGREEMENT_ANSWER }, 'noun');
  assert.equal(parsed.agreeingOne, '');
  assert.equal(parsed.agreeingTwo, '');
});

test('a client that predates a slot still submits cleanly', () => {
  // Every phone in the field today sends two or three keys. The new ones have
  // to read as "not asked" rather than as a rejected payload, or shipping a
  // question breaks every member who has not updated.
  assert.deepEqual(parseLexicalForms({ definite: 'bukam', plural: 'buga' }, 'noun'), {
    ...EMPTY_FORMS,
    definite: 'bukam',
    plural: 'buga',
  });
});

test('the counted form is recorded and nothing is inferred from it', () => {
  // Six forms of *two* are attested — balei, yalei, nlei, selei, telei, delei
  // — and which one a given noun takes is exactly what nobody knows yet. So
  // this is stored beside the definite form and NOT fed to induceNounClass: a
  // form a speaker said is a record, a class derived from two of them is a
  // claim, and a claim goes through the review path in kasem-claims.ts.
  const parsed = parseLexicalForms({ counted: 'da yalei' }, 'noun');
  assert.equal(parsed.counted, 'da yalei');
  assert.equal(induceNounClass('da', parsed.counted), null);
  assert.equal(induceNounClass('da', parsed.definite), null);
});

test('a stored indefinite is refused even when a client offers one', () => {
  // It is derived — or, while the blanket rule is disputed, not produced at
  // all. Accepting a copy would let the copy and the rule disagree, and the
  // copy would win on the display path.
  const parsed = parseLexicalForms(
    { definite: 'bukam', plural: 'buga', indefinite: 'bu mo' },
    'noun',
  );
  assert.equal('indefinite' in parsed, false);
  assert.equal(Object.keys(parsed).length, Object.keys(EMPTY_FORMS).length);
});

test('junk in the forms map is nothing, not a crash', () => {
  assert.deepEqual(parseLexicalForms(null, 'noun'), EMPTY_FORMS);
  assert.deepEqual(parseLexicalForms('bukam', 'noun'), EMPTY_FORMS);
  assert.deepEqual(parseLexicalForms(42, 'noun'), EMPTY_FORMS);
  assert.deepEqual(parseLexicalForms([], 'noun'), EMPTY_FORMS);
  assert.deepEqual(
    parseLexicalForms({ definite: 7, plural: [], counted: {}, past: null }, 'noun'),
    EMPTY_FORMS,
  );
  assert.deepEqual(parseLexicalForms({}, 'noun'), EMPTY_FORMS);
});

test('whitespace is collapsed and a pasted paragraph is truncated', () => {
  assert.deepEqual(
    parseLexicalForms({ definite: '  bu   kam ', plural: '\tbuga\n' }, 'noun'),
    { ...EMPTY_FORMS, definite: 'bu kam', plural: 'buga' },
  );
  const long = parseLexicalForms(
    { definite: 'x'.repeat(400), plural: '', counted: 'y'.repeat(400) },
    'noun',
  );
  assert.equal(long.definite.length, MAX_FORM_LENGTH);
  assert.equal(long.counted.length, MAX_FORM_LENGTH);
});

test('nothing worth storing is reported as nothing to store', () => {
  // What keeps an empty `forms: {}` map off every adjective in the collection.
  assert.equal(hasLexicalForms(EMPTY_FORMS), false);
  assert.equal(hasLexicalForms(null), false);
  assert.equal(hasLexicalForms({ ...EMPTY_FORMS, definite: 'bukam' }), true);
  assert.equal(hasLexicalForms({ ...EMPTY_FORMS, past: 'di-PAST' }), true);
  // The counted form alone is worth a row. A member who answered only "two
  // boys" has still said something about the class, and dropping it would lose
  // the half of the pair that is hardest to come by.
  assert.equal(hasLexicalForms({ ...EMPTY_FORMS, counted: 'buga balei' }), true);
});

test('only the answered slots are stored', () => {
  // Eleven keys of which the median word fills none would put ten empty
  // strings on fifteen thousand documents, and — worse — make an unanswered
  // question indistinguishable from one answered with nothing.
  assert.deepEqual(
    storableForms(parseLexicalForms({ definite: 'bukam', plural: '' }, 'noun')),
    { definite: 'bukam' },
  );
  assert.deepEqual(storableForms(EMPTY_FORMS), {});
});

test('a stored map reads back into the full shape', () => {
  assert.deepEqual(readStoredForms({ definite: 'bukam' }), {
    ...EMPTY_FORMS,
    definite: 'bukam',
  });
  assert.deepEqual(readStoredForms(null), EMPTY_FORMS);
  assert.deepEqual(readStoredForms('bukam'), EMPTY_FORMS);
});

// ── Reading a marker off a form, without concluding anything ────────────────

test('the article set is exactly the eight a speaker stated', () => {
  assert.deepEqual([...DEFINITE_ARTICLES].sort(), [
    'bam', 'dem', 'kam', 'kom', 'sem', 'tem', 'wom', 'yam',
  ]);
});

test('the numeral set is exactly the seven a speaker stated', () => {
  // `kalei` joined on 2026-09-06, on Francis's direct answer to a direct
  // question. For a day this list held six and refused it — *because* it was
  // the shape the pattern predicted, and a shape being predicted is not
  // evidence that anybody says it. The prediction landing does not make the
  // guess sound in hindsight, which is why this test asserts the exact set
  // rather than a rule for generating it.
  assert.deepEqual(NUMERAL_TWO_FORMS.map((entry) => entry.form).sort(), [
    'balei', 'delei', 'kalei', 'nlei', 'selei', 'telei', 'yalei',
  ]);
  assert.equal(NUMERAL_TWO_FORMS.length, 7);
});

test('the numeral list is still not the article list', () => {
  // Six of seven prefixes match an article, and on 2026-09-08 `n-` stopped
  // being a counter-example: "nlei is often used in countdowns" — counting
  // where there is no noun to agree with. It stays on the list and stays
  // recognised, because "often used in countdowns" is not "never agrees".
  // Two articles still have no numeral at all, so the marker lists remain
  // related rather than identical. The day this test can be deleted is the day
  // somebody has actually established the class system.
  const prefixes = NUMERAL_TWO_FORMS.map((entry) => entry.prefix);
  assert.ok(prefixes.includes('n'));
  assert.equal(DEFINITE_ARTICLES.some((article) => article.startsWith('n')), false);
  // Nothing has been attested for `kom` or `wom`, and nothing may be invented
  // for them. If this ever fails, somebody completed the pattern by hand.
  for (const orphan of ['kom', 'wom']) {
    assert.equal(
      prefixes.some((prefix) => orphan.startsWith(prefix)),
      false,
      `a numeral prefix was invented for ${orphan}`,
    );
  }
});

test('an article is read off a definite form, written solid or apart', () => {
  assert.equal(articleIn('bu kam'), 'kam');
  assert.equal(articleIn('bukam'), 'kam');
  assert.equal(articleIn('  DA  YAM '), 'yam');
});

test('an article on its own is not a noun said with one', () => {
  // Without this guard the dictionary entry for `kam` would list itself as its
  // own determiner.
  assert.equal(articleIn('kam'), null);
  assert.equal(articleIn(' yam '), null);
});

test('an unrecognised definite form yields no article, never a guess', () => {
  assert.equal(articleIn('bu zzq'), null);
  assert.equal(articleIn(''), null);
  assert.equal(articleIn(null), null);
  assert.equal(articleIn(42), null);
});

test('a numeral series is read off a counted form', () => {
  assert.deepEqual(numeralSeriesIn('da yalei'), { form: 'yalei', prefix: 'ya' });
  assert.deepEqual(numeralSeriesIn('buga, balei'), { form: 'balei', prefix: 'ba' });
  // Kasem is written with ɩ ʋ ɛ ɔ ŋ, so the tokeniser has to be Unicode-aware
  // or it cuts a word in half and then fails to recognise it.
  assert.deepEqual(numeralSeriesIn('dɩɩ nlei'), { form: 'nlei', prefix: 'n' });
});

test('a newly attested form is recognised as soon as it is on the list', () => {
  // The path a speaker's answer takes: it goes on NUMERAL_TWO_FORMS and every
  // reader picks it up, with no separate registration anywhere.
  assert.deepEqual(numeralSeriesIn('da kalei'), { form: 'kalei', prefix: 'ka' });
});

test('an unrecognised counted form yields no series, never a guess', () => {
  // The shapes the pattern would predict for the two orphan articles. Neither
  // has been said by anybody, so neither is recognised — and the fact that
  // `kalei` turned out to be real is not a reason to pre-empt these.
  assert.equal(numeralSeriesIn('da kolei'), null, 'kolei is not attested');
  assert.equal(numeralSeriesIn('da wolei'), null, 'wolei is not attested');
  assert.equal(numeralSeriesIn('two days'), null);
  assert.equal(numeralSeriesIn(''), null);
  assert.equal(numeralSeriesIn(null), null);
});

test('reading a marker never becomes inducing a class', () => {
  // THE guard, restated for the two readers added with the advanced entry.
  // `articleIn` and `numeralSeriesIn` describe what a speaker wrote;
  // `induceNounClass` makes a claim about the language, and it must stay
  // unable to see either of them while NOUN_CLASSES is empty.
  const forms = parseLexicalForms({ definite: 'bukam', counted: 'buga balei' }, 'noun');
  assert.equal(articleIn(forms.definite), 'kam');
  assert.deepEqual(numeralSeriesIn(forms.counted), { form: 'balei', prefix: 'ba' });
  assert.equal(induceNounClass('bu', forms.definite), null);
  assert.equal(induceNounClass('bu', forms.counted), null);
});

// ── The determiner decides the pronoun ──────────────────────────────────────
//
// A rule a speaker stated outright, which is why it may be applied at all. The
// tests below are mostly about the four determiners it does NOT cover: the
// table is half empty, and the half that is empty has to stay empty rather
// than be completed by the pattern the filled half suggests.

test('a pronoun is read off the determiner in a definite form', () => {
  assert.equal(pronounForDefinite('bu wom'), 'o');
  assert.equal(pronounForDefinite('bukam'), 'ka');
  assert.equal(pronounForDefinite('dɩɩ dem'), 'de');
  assert.equal(pronounForDefinite('ka sem'), 'se');
});

test('every determiner a speaker stated has the pronoun he gave for it', () => {
  // All eight, completed on 2026-09-08. Written out rather than looped so that
  // changing one is a visible edit to a stated fact and not a passing test.
  assert.deepEqual(
    Object.fromEntries(DETERMINER_PRONOUNS.map((e) => [e.article, e.pronoun])),
    { kam: 'ka', kom: 'ko', dem: 'de', tem: 'te', bam: 'ba', yam: 'ya', sem: 'se', wom: 'o' },
  );
  for (const article of DEFINITE_ARTICLES) {
    assert.ok(pronounForArticle(article), `${article} has a pronoun on record`);
  }
});

test('the pronoun is stored per determiner, not computed off the spelling', () => {
  // THE test that keeps this a record instead of a generalisation. Seven of
  // the eight are the article minus its `-m`, and `wom` is not — so an
  // implementation that sliced the last letter would pass every other case
  // here and be wrong about exactly one real word.
  assert.equal(pronounForArticle('wom'), 'o', 'not "wo"');
  // And it must stay silent about a determiner nobody has attested, rather
  // than confidently slicing an `-m` off it.
  assert.equal(pronounForArticle('nam'), null, 'nam is not an attested determiner');
  assert.equal(pronounForArticle('zom'), null);
});

test('the pronoun table only ever names a real determiner', () => {
  // Guards the drift that would break `pronounForDefinite` silently: the
  // lookup runs through `articleIn`, so a row naming an article that is not on
  // DEFINITE_ARTICLES could never be reached and would read as a working rule.
  for (const { article, pronoun } of DETERMINER_PRONOUNS) {
    assert.ok(DEFINITE_ARTICLES.includes(article), `${article} is on the article list`);
    assert.ok(pronoun.length > 0, `${article} has a pronoun`);
  }
  assert.equal(DETERMINER_PRONOUNS.length, DEFINITE_ARTICLES.length);
});

test('an unrecognised or absent definite form yields no pronoun', () => {
  assert.equal(pronounForDefinite('the boy'), null);
  assert.equal(pronounForDefinite(''), null);
  assert.equal(pronounForDefinite(null), null);
  // A bare article is the article itself, not a noun said with one — the same
  // rule `articleIn` applies, inherited rather than restated.
  assert.equal(pronounForDefinite('kam'), null);
});

test('the check reports on a written pronoun and never replaces it', () => {
  assert.deepEqual(pronounCheck('bukam', 'ka'), { status: 'agrees', expected: 'ka' });
  assert.deepEqual(pronounCheck('bukam', ''), { status: 'absent', expected: 'ka' });
  assert.deepEqual(pronounCheck('bukam', 'de'), {
    status: 'differs', expected: 'ka', given: 'de',
  });
  // The case that must never become an error: no determiner is recognised, so
  // whatever a speaker wrote stands unquestioned.
  assert.deepEqual(pronounCheck('the boy', 'he'), { status: 'unknown' });
  assert.deepEqual(pronounCheck('', 'ka'), { status: 'unknown' });
});
