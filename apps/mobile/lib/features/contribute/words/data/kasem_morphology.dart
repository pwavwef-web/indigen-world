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

/// The pronoun that goes with each definite determiner.
///
/// Stated by Francis on 2026-09-08: "the pronoun is determined by the
/// determiner. so if the definite determiner of a noun is wom, the pronoun is
/// o / kam — ka / dem — de / sem — se".
///
/// The remaining four — `kom` → `ko`, `tem` → `te`, `bam` → `ba`, `yam` → `ya`
/// — came the same day in answer to a direct question, so all eight
/// determiners are covered and every row is something a speaker said. For a
/// few hours the map held only four, and the rest were withheld *precisely
/// because* they were the shape the pattern predicted; being right in the end
/// does not license the guess.
///
/// ── Why this is a map and not `article.substring(0, article.length - 1)` ──
/// Seven of the eight are the article minus its `-m`. The eighth is not:
/// `wom` gives **o**, not `wo`. A string operation would answer confidently
/// for a ninth determiner nobody has found yet, which is the one thing this
/// file exists to refuse.
const Map<String, String> kDeterminerPronouns = {
  'kam': 'ka',
  'kom': 'ko',
  'dem': 'de',
  'tem': 'te',
  'bam': 'ba',
  'yam': 'ya',
  'sem': 'se',
  // The one that is not the article minus its `-m`, and the reason the seven
  // above are stored rather than computed.
  'wom': 'o',
};

/// The pronoun a noun takes, read out of its definite form, or null.
///
/// Null for the four determiners nobody has given a pronoun for, and null for
/// a definite form carrying no recognised determiner. Never a guess.
String? pronounForDefinite(String definite) {
  final article = articleIn(definite);
  if (article == null) return null;
  return kDeterminerPronouns[article];
}

/// What the determiner rule makes of a pronoun somebody typed.
enum PronounCheck {
  /// No determiner recognised, or none with a pronoun on record.
  unknown,

  /// The rule predicts a pronoun and the box is empty.
  absent,

  /// What was typed is what the rule predicts.
  agrees,

  /// What was typed is not what the rule predicts. Worth asking about.
  differs,
}

/// Compares a typed pronoun against the determiner rule.
///
/// ── Reports, never corrects ──────────────────────────────────────────────
/// The obvious use of the rule is to fill the box in, and it is the one thing
/// this must not do. A prefilled box is accepted without being read, and a
/// derivation then sits in the archive as an attestation — indistinguishable
/// afterwards from a form somebody actually said, and so useless as the
/// evidence that would ever correct the rule. A speaker who writes a pronoun
/// the table does not predict is the most valuable row this project can
/// collect: either a slip, or the counter-example that narrows the rule.
PronounCheck pronounCheck(String definite, String pronoun) {
  final expected = pronounForDefinite(definite);
  if (expected == null) return PronounCheck.unknown;
  final given = _fold(pronoun);
  if (given.isEmpty) return PronounCheck.absent;
  return given == expected ? PronounCheck.agrees : PronounCheck.differs;
}

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
/// Still missing: any form for the `kom` and `wom` articles.
///
/// `n-` matches no article, and on 2026-09-08 Francis said why: "nlei is often
/// used in countdowns". The other six are chosen by the noun being counted;
/// this one is reached for when counting itself is the activity and there is
/// no noun to agree with. It stays on the list and is still recognised — "often
/// used in countdowns" is not "never agrees with a noun" — but its absence from
/// the article list is no longer evidence against the correspondence.
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
