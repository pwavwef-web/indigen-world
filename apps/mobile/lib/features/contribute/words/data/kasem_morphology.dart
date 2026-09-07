/// The Kasem morphology the phone knows about.
///
/// ── This file mirrors `services/functions/src/kasem-morphology.ts` ────────
/// The server is the canonical implementation; this is the same facts in Dart,
/// because the entry screen has to render a paradigm without a round trip and
/// the contribution form has to label its boxes before anything is sent. The
/// two must agree, and where they disagree the server wins — it is the one
/// that decides what is stored.
///
/// Nothing here generates a form. Every function below either recognises
/// something a speaker has written down, or returns nothing. That asymmetry is
/// the whole discipline of this project's language work: a plausible-looking
/// invented form gets published, taught, copied into lessons and repeated back
/// by Kawuri, and it is indistinguishable downstream from a real one.
library;

/// The particle the withdrawn indefinite rule was built on.
///
/// Kept as a named constant rather than deleted because the contribution form
/// still explains to a member why they are not being asked for a plain form,
/// and because the rule may yet be restored — a speaker confirmed on
/// 2026-09-05 that `mo` is a FOCUS particle, which is what killed the blanket
/// reading, not a statement that `mo` does nothing.
const String kIndefiniteParticle = 'mo';

/// No indefinite form is synthesized while the blanket rule is disputed.
String indefiniteForm(String headword) => '';

/// The definite determiners a Kasem speaker has stated, and nothing else.
///
/// Eight of them, given by Francis on 2026-09-05 and 2026-09-06. Which noun
/// takes which is the open question; this list says only what the set is.
const List<String> kDefiniteArticles = [
  'kam',
  'kom',
  'dem',
  'tem',
  'bam',
  'yam',
  'sem',
  'wom',
];

/// One attested word for *two*, and the class prefix it carries.
class KasemNumeralSeries {
  const KasemNumeralSeries(this.form, this.prefix);

  /// The whole word — `yalei`.
  final String form;

  /// The prefix a noun is said to "count with" — `ya`.
  final String prefix;
}

/// The seven attested Ghana-Kasem forms of *two*.
///
/// ── Seven, and only the seven that were said ─────────────────────────────
/// `kalei` joined the list on 2026-09-06 when Francis, asked directly,
/// answered "kalei does exist". It is here because he said so and for no
/// other reason. For a day the list held six and `kalei` was refused
/// *precisely because* the pattern predicted it — `kam` is an article, so a
/// `ka-` numeral ought to follow — and a shape being predicted is not
/// evidence that it is said. The prediction landing does not make the guess
/// sound in hindsight; the next one may not.
///
/// Still missing: any form for the `kom` and `wom` articles. `n-` still
/// matches no article at all, so the marker lists remain related rather than
/// identical.
const List<KasemNumeralSeries> kNumeralTwoForms = [
  KasemNumeralSeries('balei', 'ba'),
  KasemNumeralSeries('yalei', 'ya'),
  KasemNumeralSeries('nlei', 'n'),
  KasemNumeralSeries('selei', 'se'),
  KasemNumeralSeries('telei', 'te'),
  KasemNumeralSeries('delei', 'de'),
  KasemNumeralSeries('kalei', 'ka'),
];

/// The determiner inside a recorded definite form, or null.
///
/// Reading, not inferring. A member answered "say it with *the*" and wrote
/// `bu kam` or `bukam`; saying which article is in that string restates what
/// they typed. It is not a claim about which article the noun *takes*, which
/// is a generalisation over many speakers that only the review path may make.
///
/// Null renders as nothing at all, never as a guess.
String? articleIn(String definite) {
  final form = _fold(definite);
  if (form.isEmpty) return null;
  final tokens = form.split(' ').where((token) => token.isNotEmpty).toList();
  if (tokens.isEmpty) return null;
  final last = tokens.last;
  final ordered = [...kDefiniteArticles]
    ..sort((a, b) => b.length.compareTo(a.length));
  for (final article in ordered) {
    // A bare `kam` on its own is the article, not a noun said with it. Without
    // this guard the dictionary entry for the article would list itself as its
    // own determiner.
    if (last == article && tokens.length > 1) return article;
    if (last != article && last.endsWith(article)) return article;
  }
  return null;
}

/// The numeral series a recorded counted form uses, or null.
///
/// Same discipline as [articleIn]. Nothing here writes a noun class, and
/// nothing derives one: the correspondence between the article and the numeral
/// prefix is a live hypothesis with a single direct observation behind it —
/// `da yam` "the days" beside `da yalei` "two days" — and it stays falsifiable
/// only for as long as the two are collected separately.
KasemNumeralSeries? numeralSeriesIn(String counted) {
  final form = _fold(counted);
  if (form.isEmpty) return null;
  for (final token in form.split(_notLetters)) {
    if (token.isEmpty) continue;
    for (final series in kNumeralTwoForms) {
      if (series.form == token) return series;
    }
  }
  return null;
}

/// Splits on anything that is not a letter.
///
/// The Unicode class matters: Kasem is written with ɩ ʋ ɛ ɔ ŋ, and an
/// ASCII-only split would cut a word in half and then fail to recognise it.
final _notLetters = RegExp(r'[^\p{L}]+', unicode: true);

String _fold(String value) =>
    value.trim().toLowerCase().replaceAll(RegExp(r'[\s_]+'), ' ');
