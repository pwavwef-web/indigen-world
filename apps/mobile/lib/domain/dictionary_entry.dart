import 'package:freezed_annotation/freezed_annotation.dart';
import 'package:indigen_world_mobile/domain/entry_sense.dart';
import 'package:indigen_world_mobile/domain/kasem_orthography.dart';
import 'package:indigen_world_mobile/features/contribute/words/data/kasem_morphology.dart';

part 'dictionary_entry.freezed.dart';
part 'dictionary_entry.g.dart';

@freezed
abstract class DictionaryEntry with _$DictionaryEntry {
  const DictionaryEntry._();

  const factory DictionaryEntry({
    required String id,
    required String headword,

    /// The first meaning, as one string.
    ///
    /// Kept required, and kept singular, because every caller written before an
    /// entry could have more than one meaning reads this field — the home
    /// screen's word of the day, the saved-words list, the contribute deep link.
    /// Replacing it with the list outright was the obvious tidy-up and it was
    /// the wrong one: it would have rewritten six screens across four features
    /// this change has no business touching, to say the same thing they already
    /// say. [primaryTranslation] is what new code should read.
    required String translation,

    /// Every meaning this entry carries, in the order the contributor gave them.
    ///
    /// A Kasem word rarely maps onto exactly one English word, and members have
    /// always answered the "what does it mean" box with lists — "greeting,
    /// hello", "water / rain water". Storing that answer whole made the meaning
    /// of the entry literally the string "water / rain water", which no learner
    /// will ever type into a search box and no query will ever match.
    ///
    /// Empty on an entry nobody has parsed yet — the demo vocabulary in
    /// `repositories.dart`, an entry built by hand in a test — which is why
    /// [primaryTranslation] falls back to [translation] rather than reaching
    /// for `first` and throwing on an empty list.
    @Default(<String>[]) List<String> translations,

    /// Every Kasem rendering of this entry, in the order the contributor gave
    /// them — the *other* axis on which an entry can be plural.
    ///
    /// ── Why this is not [translations] ─────────────────────────────────────
    /// Because they are opposite sides of the same entry, and conflating them
    /// was a real bug rather than a hypothetical one. An entry is a Kasem
    /// [headword] with an English [translation]; both halves can carry several
    /// values, and they are not interchangeable. "greeting, hello" is two
    /// English senses of one Kasem word. "nia, nyu" is two Kasem words for one
    /// English sense — which is exactly what the guided queue produces, because
    /// it hands somebody an English word and asks what the Kasem for it is.
    ///
    /// The backend writes these to `dictionaryEntries.translations`, derived
    /// from the contribution's Kasem body. Reading them as English meanings
    /// would have printed Kasem in the meaning column; reading them as nothing
    /// at all — which is what happened first, because the reader defended
    /// itself by rejecting a list that merely restated the headword — meant the
    /// several answers a member typed were stored, reviewed, published, and
    /// then never shown to anybody.
    ///
    /// Empty on the whole legacy dictionary, where [headword] is the single
    /// rendering there has ever been.
    @Default(<String>[]) List<String> renderings,
    required String partOfSpeech,
    required String dialect,
    required String pronunciation,
    required String example,
    required String exampleTranslation,

    /// Where the example sentence came from: `'tatoeba'`, `'unattributed'`, or
    /// empty on an entry that predates the guided queue.
    ///
    /// Kept as it arrived rather than reduced to a bool, for the same reason
    /// the word queue keeps it — see `QueueWord.sentenceSource`. A second
    /// sentence pool will eventually exist and a field named `isTatoeba` is one
    /// that has to be found and widened later.
    @Default('') String sentenceSource,

    /// The Tatoeba sentence id, or empty where none is owed.
    ///
    /// ── This is a licence condition, not decoration ────────────────────────
    /// The guided queue's example sentences are Tatoeba, CC BY 2.0 FR, which
    /// requires attribution wherever the sentence is shown — and a published
    /// dictionary entry is very much a place the sentence is shown. The three
    /// fields below travel with the entry precisely so the phone cannot fail to
    /// have them; the design where the client "knows to go and look the credit
    /// up" is how attribution silently stops happening.
    ///
    /// Empty means no credit is owed, and no credit must then be rendered. Not
    /// a blank line, not a guess, not a plausible-looking id: inventing a
    /// contributor for a sentence nobody contributed is a worse licensing
    /// failure than omitting one that was never owed. [exampleCredit] returns
    /// null in that case and a test holds it there.
    @Default('') String tatoebaId,

    /// May be empty even on an attributed entry — a Tatoeba sentence whose
    /// contributor is not recorded still carries its id and its licence, and
    /// the credit line simply leaves the name out rather than writing "by ".
    @Default('') String tatoebaContributor,
    @Default('') String sentenceLicence,
    required String attribution,
    String? culturalNote,

    /// A published recording of the headword being said, or empty where the
    /// entry has none.
    ///
    /// Separate from [pronunciation], which is the written guide. The two used
    /// to share one field, so an entry with audio showed a download URL where
    /// its phonetics belonged and still had nothing to play.
    @Default('') String audioUrl,

    /// The noun said with *the*, and said for many.
    ///
    /// ── Why these two and not "the" ──────────────────────────────────────
    /// Definiteness in Kasem is a property of the noun rather than a word of
    /// its own, so there is no Kasem for "the" to record and never was. There
    /// is only the form a speaker says, which is what these hold. Empty on
    /// every entry contributed before the queue started asking, and on every
    /// entry that is not a noun.
    @Default('') String definiteForm,
    @Default('') String pluralForm,

    /// The plural said with *the* — "the boys".
    ///
    /// ── Why the plural needs its own definite ────────────────────────────
    /// Because the singular and the plural may well sit in *different*
    /// classes. `dɛ dem` "the day" beside `da yam` "the days", if `dɛ` and
    /// `da` are one lexeme, is ordinary Gur singular/plural class pairing —
    /// and without this form the pairing is unobservable, because the definite
    /// form reads the singular's class while the numeral agrees with the
    /// plural. The two probes were describing different halves of the word and
    /// nothing on the entry said so.
    @Default('') String pluralDefiniteForm,

    /// The noun said with *two* — "two boys".
    ///
    /// A Kasem numeral agrees with what it counts: six forms of *two* are
    /// attested — balei, yalei, nlei, selei, telei, delei — and which one a
    /// speaker uses is chosen by the noun in front of it. So this is the same
    /// class the definite form points at, read off a second surface, and the
    /// two together are checkable in a way either alone is not.
    ///
    /// Shown here rather than kept on the contribution because a form nobody
    /// can see is a form nobody can correct, and correcting it is the point.
    @Default('') String countedForm,

    /// The pronoun that stands in for this noun — "the boy … *he*".
    ///
    /// The third surface the same class marker appears on, and by some way the
    /// easiest to elicit: a speaker who has just written "the boy" produces
    /// "he came" without stopping, where "two boys" makes some people count.
    ///
    /// Stored as the word, never as a person/number label. "Third person
    /// singular animate" is a question about grammar that almost nobody can
    /// answer about their own language; "what do you call him afterwards" is a
    /// question about talking.
    @Default('') String pronounForm,

    /// The determiner alone — `kam`, `kom`, `dem` … — where one is known.
    ///
    /// Usually read off [definiteForm] by `articleIn` rather than stored, and
    /// stored only when a contributor or a reviewer said it separately. Empty
    /// means *nothing matched*, which on this field is extremely common and
    /// entirely honest: most definite forms in the archive were never
    /// collected at all.
    @Default('') String definiteArticle,

    /// Which attested word for *two* the counted form used — `yalei` — and the
    /// class prefix it carries — `ya`.
    ///
    /// Both empty unless the counted form contained one of the six words a
    /// speaker has actually given. Never completed by pattern: no form is
    /// attested for the `kam` or `kom` articles, and `nlei` matches no article
    /// at all, so the three marker lists are related rather than identical and
    /// filling the gaps in would be inventing grammar.
    @Default('') String numeralSeries,
    @Default('') String numeralPrefix,

    /// The verb said now, yesterday and tomorrow.
    ///
    /// ── Why three tenses and not a tense system ─────────────────────────
    /// Because three is what a speaker can answer and a tense system is not.
    /// Kasem marks aspect as well as time, and the full picture is a research
    /// question; "say it for now / for yesterday / for tomorrow" are three
    /// questions anybody who speaks the language answers in seconds. Three
    /// filled boxes per verb is a paradigm this dictionary has never had a
    /// single row of.
    ///
    /// What comes back is evidence, not a conjugation table. Nothing in the
    /// app generates a fourth form from these three.
    @Default('') String presentForm,
    @Default('') String pastForm,
    @Default('') String futureForm,

    /// The verb said of several doers — "they eat".
    ///
    /// Kept apart from [pluralForm], which is a noun's plural, because an
    /// entry can be both a noun and a verb and folding the two together would
    /// put a noun's plural and a verb's agreement in one field.
    @Default('') String pluralSubjectForm,

    /// The verb said as an instruction — "eat!".
    @Default('') String imperativeForm,

    /// The word used with one thing, then with a different thing.
    ///
    /// ── For every word whose form is chosen by what it attaches to ──────
    /// An adjective, a quantifier, a numeral, a determiner, an article and a
    /// pronoun all change with the noun in front of them, and until these two
    /// existed the dictionary had nowhere to record that for any of them — a
    /// quantifier got exactly what a preposition got, which was nothing.
    ///
    /// Francis said it outright on 2026-09-06: *"everything will be either te
    /// maama, ya maama, se maama, de maama etc depending on what you are
    /// talking about … it is just like the numbers"*.
    ///
    /// ── Two examples, not a set of named cells ─────────────────────────
    /// Naming the cells would mean naming the classes, and nobody has written
    /// the inventory down. An adjective paradigm with invented cells would be
    /// this project publishing a structure it made up, on entries a learner
    /// has no reason to doubt. Two examples of the same word beside two
    /// different nouns are a record; what they have in common is a question
    /// for the review path, not for a render.
    @Default('') String agreeingOneForm,
    @Default('') String agreeingTwoForm,

    /// The other word classes this entry is also used as.
    ///
    /// Most often `verb` on a noun, which is the case that prompted the field:
    /// a learner who looks up a noun and is told only that it is a noun has
    /// been told something incomplete about their own language, and until now
    /// the app had no way to record the rest even when the contributor knew
    /// it.
    ///
    /// Stable ids, never labels, and never containing this entry's own class.
    @Default(<String>[]) List<String> alsoUsedAs,

    /// How the headword is said, in IPA, stored **without** its delimiters.
    ///
    /// ── Why the slashes are not in the data ─────────────────────────────
    /// Because they are notation rather than content, and half the people who
    /// fill this in will type them while the other half will not. Storing what
    /// was typed renders `/bàkéːrà/` beside `//bàkéːrà//` beside `bàkéːrà` on
    /// one screen and makes the field unqueryable. [ipaDisplay] is the one
    /// place the delimiters are added.
    ///
    /// Not a substitute for [audioUrl] and not ranked above it: a learner
    /// plays the sound, and the transcription is what survives when there is
    /// no speaker to ask. Both, wherever both can be had.
    @Default('') String ipa,

    /// What the word means, said in Kasem.
    ///
    /// ── The field that changes what this archive is ─────────────────────
    /// A dictionary that explains Kasem only in English is a dictionary that
    /// treats English as the language you think in. This is the entry's
    /// meaning as a speaker would put it to a child who asked — the only text
    /// on the record written *in* the language rather than about it. It also
    /// carries usage, register and collocation that a one-word English
    /// equivalent throws away, which is exactly what anything later hoping to
    /// learn Kasem from this archive needs and cannot get from a gloss.
    @Default('') String kasemDefinition,

    /// Where the word comes from, where anybody knows.
    ///
    /// Empty on nearly everything, and empty is the honest answer: for most of
    /// this vocabulary nobody has written the origin down. An empty field says
    /// so. A plausible one would not, and would be repeated.
    @Default('') String etymology,

    /// The noun class, worked out from [definiteForm] when it could be.
    ///
    /// Empty means *not established*, which is the honest answer and by far
    /// the common one — the class inventory is being built from contributed
    /// forms rather than assumed in advance. It never means "no class".
    @Default('') String nounClass,

    /// Which sense of this spelling the entry is — 1, 2, 3 — or 0 where none
    /// has been assigned.
    ///
    /// ── Zero, never one, for "not numbered" ─────────────────────────────
    /// A default of 1 would be the natural-looking choice and it is a trap: it
    /// says "this is the first of several" about every entry in the archive,
    /// including the thousands that are the only word under their spelling.
    /// Zero says nothing, which is the truth for a row the backfill has not
    /// reached, and [homographDisplay] draws nothing for it.
    ///
    /// The number is assigned once, on the server, at first publication, and
    /// is never reassigned — see `services/functions/src/kasem-homographs.ts`.
    /// It is an identity rather than a fact about the language: a learner
    /// writing `mo²` in their notes is making a citation, and a citation whose
    /// target moves is worse than none. Whether it is *shown* is the derived
    /// half, and depends on how many entries share the headword.
    @Default(0) int homographIndex,

    /// The several things this word means, each with its own examples.
    ///
    /// -- Why this is not simply a longer [translations] ------------------
    /// Because [translations] is a list of English *words* and this is a list
    /// of *meanings*, and the difference is everything the entry is for.
    /// English *toy* is a plaything, a trinket and a small breed of dog before
    /// it is a verb, and each of those takes a different example sentence.
    /// Flattened into one comma-separated line the sentences have nowhere to
    /// attach, and a learner cannot tell which meaning is being illustrated.
    ///
    /// Empty on every entry published before the field existed -- which is all
    /// of them -- so nothing reads this directly. [displaySenses] lifts the
    /// legacy shape into a single sense on read, which is why no row had to be
    /// migrated and an entry approved last year still renders as it did.
    ///
    /// Not to be confused with [homographIndex], which numbers entries that
    /// are *different words* sharing one spelling. Both draw "1." and "2." on
    /// the page and only one of them is a stable identity.
    @EntrySenseListConverter()
    @Default(<EntrySense>[])
    List<EntrySense> senses,

    /// Whether this entry is in the dictionary.
    ///
    /// ── Why a reader that only ever sees published rows needs this ───────
    /// Because staff do not only see published rows. The list query is
    /// `where('isPublished', isEqualTo: true)` and always will be, but a
    /// validator opening one entry reads the document directly — and the
    /// editor's Published switch has to open showing what the entry actually
    /// is, or a reviewer who came to fix a typo republishes a word somebody
    /// had deliberately withdrawn.
    ///
    /// Defaults to true because every caller that built an entry before this
    /// field existed was, by construction, holding a published one.
    @Default(true) bool isPublished,

    /// The entry this one was folded into, or empty.
    ///
    /// ── A forwarding address, not a tombstone ───────────────────────────
    /// A duplicate merged away is unpublished and keeps this pointer, because
    /// every saved word, shared `/entry/…` link and Kawuri citation that named
    /// it is still out there. A reader who follows one is sent to the word it
    /// became rather than shown a missing page — which is the whole reason
    /// merging retires the duplicate instead of deleting it.
    @Default('') String mergedIntoId,
  }) = _DictionaryEntry;

  factory DictionaryEntry.fromJson(Map<String, Object?> json) =>
      _$DictionaryEntryFromJson(json);

  /// No form is generated while the blanket indefinite rule is disputed.
  /// The nullable API keeps existing callers from displaying unsupported forms.
  String? get indefinite {
    if (partOfSpeech.trim().toLowerCase() != 'noun') return null;
    final form = indefiniteForm(headword);
    return form.isEmpty ? null : form;
  }

  /// Whether anybody has actually recorded a form for this entry.
  ///
  /// Deliberately not `nounForms.isNotEmpty`. [nounForms] opens with the
  /// headword — a paradigm that starts at its *second* form is one a learner
  /// has to assemble in their head — so on every noun in the archive that list
  /// has one row in it whether or not a single form was ever collected.
  /// Reading this from that list would report the entire legacy dictionary as
  /// having morphology it does not have.
  bool get hasForms =>
      definiteForm.isNotEmpty ||
      pluralForm.isNotEmpty ||
      pluralDefiniteForm.isNotEmpty ||
      countedForm.isNotEmpty ||
      pronounForm.isNotEmpty ||
      verbForms.isNotEmpty ||
      agreementForms.isNotEmpty;

  /// Every word class this entry claims — its own first, then the others.
  ///
  /// One list so no screen has to write `[partOfSpeech, ...alsoUsedAs]` and
  /// get the de-duplication wrong the third time. The declared class leads
  /// because it is the one the contributor chose when asked outright.
  List<String> get wordClasses {
    final own = partOfSpeech.trim().toLowerCase();
    return [
      if (own.isNotEmpty) own,
      for (final id in alsoUsedAs)
        if (id.trim().toLowerCase() != own) id.trim().toLowerCase(),
    ];
  }

  /// Whether this entry behaves as a noun — declared, or said to be also used
  /// as one.
  bool get isNoun =>
      wordClasses.contains('noun') || wordClasses.contains('proper-noun');

  /// Whether this entry behaves as a verb, by either route.
  bool get isVerb =>
      wordClasses.contains('verb') || wordClasses.contains('auxiliary-verb');

  /// Whether this entry's form is chosen by the word it attaches to.
  ///
  /// The list is the one in `kasem-morphology.ts`, and it is short on purpose:
  /// every class on it is covered by a speaker's own statement, and the ten
  /// that are not — adverb, preposition, particle, ideophone and the rest —
  /// stay off it rather than being given an invented paradigm.
  bool get agrees => wordClasses.any(
    (id) => const {
      'adjective',
      'quantifier',
      'numeral',
      'determiner',
      'article',
      'pronoun',
    }.contains(id),
  );

  /// The word beside two different nouns, where anybody has recorded it.
  ///
  /// Labelled by what they are — two uses — rather than by a grammatical cell,
  /// because which cells exist is exactly what is not known. See
  /// [agreeingOneForm].
  List<({String label, String form})> get agreementForms => [
    if (agreeingOneForm.isNotEmpty) (label: 'Used with', form: agreeingOneForm),
    if (agreeingTwoForm.isNotEmpty)
      (label: 'And with', form: agreeingTwoForm),
  ].where((row) => row.form.trim().isNotEmpty).toList(growable: false);

  /// The noun paradigm, as label/form pairs, in the order a reader wants them.
  ///
  /// ── Why the order is singular → definite → plural → counted ───────────
  /// It is the order somebody learns a noun in, not the order the fields were
  /// added. The headword first because it is what they looked up; the definite
  /// next because "the boy" is the first thing anybody says about a boy; the
  /// plural and then the counted plural because counting starts from the
  /// plural. A table sorted by when the questions were invented reads as a
  /// changelog.
  ///
  /// The headword itself is in here rather than left implicit. A paradigm that
  /// begins at the *second* form is a paradigm a learner has to assemble in
  /// their head from two places on the screen.
  List<({String label, String form})> get nounForms => [
    if (isNoun) (label: 'One', form: headword),
    if (definiteForm.isNotEmpty) (label: 'The one', form: definiteForm),
    if (pluralForm.isNotEmpty) (label: 'Many', form: pluralForm),
    if (pluralDefiniteForm.isNotEmpty)
      (label: 'The many', form: pluralDefiniteForm),
    if (countedForm.isNotEmpty) (label: 'Two', form: countedForm),
    if (pronounForm.isNotEmpty) (label: 'Stands for it', form: pronounForm),
  ].where((row) => row.form.trim().isNotEmpty).toList(growable: false);

  /// The verb paradigm, in the order a reader wants them.
  List<({String label, String form})> get verbForms => [
    if (presentForm.isNotEmpty) (label: 'Now', form: presentForm),
    if (pastForm.isNotEmpty) (label: 'Yesterday', form: pastForm),
    if (futureForm.isNotEmpty) (label: 'Tomorrow', form: futureForm),
    if (pluralSubjectForm.isNotEmpty)
      (label: 'Several doing it', form: pluralSubjectForm),
    if (imperativeForm.isNotEmpty) (label: 'Telling somebody', form: imperativeForm),
  ].where((row) => row.form.trim().isNotEmpty).toList(growable: false);

  /// Whether the noun table has anything in it beyond the headword.
  ///
  /// Guards the card: a lone "One: bakeira" row is the headword restated an
  /// inch below itself, which is furniture rather than grammar.
  bool get hasNounParadigm => nounForms.length > 1;

  /// The determiner this noun was recorded with, or null.
  ///
  /// Stored where a contributor gave it separately, read off the definite form
  /// otherwise, and null when neither says anything — which is the common case
  /// and must render as *nothing*, not as a guess.
  String? get article {
    if (definiteArticle.trim().isNotEmpty) return definiteArticle.trim();
    return articleIn(definiteForm);
  }

  /// The word for *two* this noun was counted with, or null.
  ///
  /// ── Stated as an observation, never as a rule ────────────────────────
  /// The entry says "counted with `yalei`" because that is the word somebody
  /// wrote in the counted form. It does not say the noun *takes* the `ya`
  /// series, which would be a generalisation over speakers that only the
  /// review path in `kasem-claims.ts` may make. The wording on screen carries
  /// that distinction and it is not decoration: the correspondence between
  /// the article and the numeral prefix is a live hypothesis with one direct
  /// observation behind it, and it stays falsifiable only while the two are
  /// reported separately.
  KasemNumeralSeries? get numeral {
    if (numeralSeries.trim().isNotEmpty) {
      final stored = numeralSeries.trim().toLowerCase();
      for (final series in kNumeralTwoForms) {
        if (series.form == stored) return series;
      }
      // A stored series this build has never heard of is still what somebody
      // recorded. It renders with the prefix the document carries rather than
      // being dropped for failing to match a list that may simply be older
      // than the data.
      return KasemNumeralSeries(stored, numeralPrefix.trim().toLowerCase());
    }
    return numeralSeriesIn(countedForm);
  }

  /// The transcription with its delimiters, or null where there is none.
  ///
  /// The slashes live here and nowhere else — see [ipa] for why they are not
  /// in the data. Null rather than empty so a caller cannot accidentally
  /// render a bare `//`.
  String? get ipaDisplay => ipa.trim().isEmpty ? null : '/${ipa.trim()}/';

  /// The meaning to show when there is only room for one.
  ///
  /// Exists so that no screen has to write `translations.isEmpty ? ... : ...`
  /// — a ternary that is easy to get right once and certain to be got wrong the
  /// fourth time somebody copies it.
  String get primaryTranslation =>
      translations.isEmpty ? translation : translations.first;

  /// The meanings after the first, for the surfaces that show all of them.
  List<String> get furtherTranslations =>
      translations.length < 2 ? const <String>[] : translations.sublist(1);

  /// The senses to render, whichever shape this entry actually carries.
  ///
  /// -- The whole back-compatibility story is this one getter --------------
  /// An entry contributed before senses existed has one meaning, possibly
  /// several English words for it, and one example sentence. That *is* a
  /// single-sense entry, so rather than teach every screen a second code path,
  /// the legacy shape is lifted into the new one here: on read, costing
  /// nothing, and changeable without touching a single stored row.
  ///
  /// The consequence worth stating plainly is that a screen written against
  /// this getter renders the entire archive correctly on the day it ships,
  /// including the fifteen thousand entries nobody is ever going to
  /// re-contribute.
  ///
  /// Mirrors `sensesOrLegacy` in `services/functions/src/lexical-senses.ts`.
  List<EntrySense> get displaySenses {
    if (senses.isNotEmpty) return senses;
    final gloss = translations.isEmpty ? translation : translations.join(', ');
    if (gloss.trim().isEmpty) return const <EntrySense>[];
    return [
      EntrySense(
        definition: gloss,
        kasemDefinition: kasemDefinition,
        examples: example.isEmpty && exampleTranslation.isEmpty
            ? const <SenseExample>[]
            : [SenseExample(kasem: example, english: exampleTranslation)],
      ),
    ];
  }

  /// Whether somebody actually distinguished this entry's meanings.
  ///
  /// Deliberately not `displaySenses.length > 1`. A legacy entry with three
  /// comma-separated glosses lifts into ONE sense, and `TranslationList`
  /// already numbers those perfectly well; drawing the senses block for it
  /// would print the same three words twice on one screen. This asks the
  /// narrower question the block exists to answer -- did a contributor
  /// separate the meanings, and give any of them its own example or label?
  bool get hasStructuredSenses =>
      senses.length > 1 || (senses.length == 1 && senses.first.hasDetail);

  /// The senses grouped by the word class each belongs to, the entry's own
  /// class leading.
  ///
  /// -- Why the grouping lives here rather than in the widget --------------
  /// Because "noun senses before verb senses" is a fact about the entry, not a
  /// layout preference, and more than one screen needs it. A word that is a
  /// noun in its first two senses and a verb in its third is the ordinary case
  /// -- it is the reason [EntrySense.partOfSpeech] exists at all -- and a
  /// reader scanning the entry needs the classes kept apart, exactly as a
  /// printed dictionary keeps them.
  ///
  /// A sense that names no class of its own belongs to the entry's declared
  /// class, which is what the great majority of senses say. Order is the order
  /// the contributor gave, except that the declared class leads: the class
  /// somebody chose when asked outright is the one the learner came for.
  List<({String partOfSpeech, List<EntrySense> senses})> get sensesByClass {
    final all = displaySenses;
    if (all.isEmpty) return const [];
    final own = partOfSpeech.trim().toLowerCase();
    final grouped = <String, List<EntrySense>>{};
    final order = <String>[];
    for (final sense in all) {
      final key = sense.partOfSpeech.isEmpty ? own : sense.partOfSpeech;
      if (!grouped.containsKey(key)) {
        grouped[key] = <EntrySense>[];
        order.add(key);
      }
      grouped[key]!.add(sense);
    }
    // A stable partition rather than a sort: the declared class first, then
    // everything else in the order it was given. `sort` on a comparator that
    // returns 0 for unrelated pairs is not stable in Dart, so the groups are
    // partitioned by hand instead.
    final ordered = <String>[
      for (final key in order)
        if (key == own) key,
      for (final key in order)
        if (key != own) key,
    ];
    return [
      for (final key in ordered)
        (
          partOfSpeech: key,
          senses: List<EntrySense>.unmodifiable(grouped[key]!),
        ),
    ];
  }

  /// Whether any sense carries an example of its own.
  ///
  /// Guards the old entry-level Example card: a modern entry prints its
  /// sentences under the senses they illustrate, and printing the first one
  /// again lower down would have a reader wondering which sense it belonged
  /// to -- which is the exact confusion senses were added to remove.
  bool get hasSenseExamples =>
      senses.any((sense) => sense.examples.isNotEmpty);

  /// Every meaning as one line, for a semantic label.
  ///
  /// A screen reader never runs out of horizontal space, so the "+2 more" a
  /// narrow list row has to fall back to is a worse answer for it than simply
  /// saying all three. Every list row that describes an entry to a reader
  /// should read this rather than [translation], which is one meaning wearing
  /// the name of all of them.
  String get allTranslations =>
      translations.isEmpty ? translation : translations.join(', ');

  /// Whether this entry is one of the ones worth spending vertical space on.
  ///
  /// The common case is a single meaning and it must keep looking exactly as it
  /// looks today, so every list widget asks this before it reaches for the
  /// numbered layout.
  bool get hasSeveralTranslations => translations.length > 1;

  /// The Kasem renderings after the first, for the surfaces that show them.
  ///
  /// The first is already the [headword]: a guided contribution arrives as one
  /// string — "nia, nyu" — and if the whole string became the headword, the
  /// dictionary would list a word nobody can look up and the alphabetical sort
  /// would file it under a comma.
  List<String> get furtherRenderings =>
      renderings.length < 2 ? const <String>[] : renderings.sublist(1);

  bool get hasSeveralRenderings => renderings.length > 1;

  /// The whole Tatoeba credit as one quiet line, or null where none is owed.
  ///
  /// Assembled here rather than in the widget so the exact wording is testable
  /// without pumping a frame, and so the two places that need it — the visible
  /// line and the screen-reader label — cannot drift apart. Mirrors
  /// `QueueWordAttribution.line`, which renders the same credit under the same
  /// sentence while a member is still answering it; a sentence must not be
  /// credited one way in the queue and another way in the dictionary.
  String? get exampleCredit {
    if (tatoebaId.isEmpty) return null;
    return [
      'Tatoeba #$tatoebaId',
      if (tatoebaContributor.isNotEmpty) tatoebaContributor,
      if (sentenceLicence.isNotEmpty) sentenceLicence,
    ].join(' · ');
  }

  /// Every meaning is searched, not just the first.
  ///
  /// Searching [translation] alone meant an entry whose second sense was the
  /// one somebody wanted simply did not exist for them: "rain water" is in the
  /// dictionary, and typing it returned nothing, because the field held
  /// "water / rain water" only until the parser split it and then held the
  /// first piece.
  ///
  /// ── And every letter is reachable from a phone keyboard ──────────────
  /// The comparison used to be `toLowerCase().contains()`, which is correct
  /// for English and unusable for Kasem: 785 of the 1200 published entries
  /// carry a letter no stock keyboard can produce. A learner who had heard
  /// `dɩ`, could not type ɩ, and typed `di` was told the dictionary had no
  /// matching words — for two thirds of the archive the search box did not
  /// work. [foldForSearch] is what makes the two comparable.
  bool matches(String query) {
    return rankFor(foldForSearch(query)) != null;
  }

  /// How well this entry answers an already-folded query, lower being better,
  /// or null when it does not answer it at all.
  ///
  /// Exposed beside [matches] so a list can order its results rather than only
  /// filter them, and so the folding of the query happens once per keystroke
  /// instead of once per entry per keystroke — at 1200 entries that difference
  /// is the whole cost of the search.
  int? rankFor(String foldedQuery) {
    final direct = searchRank(
      foldedQuery: foldedQuery,
      headword: headword,
      renderings: renderings,
      // The split list where there is one, and the raw gloss where there is
      // not -- the same fallback [primaryTranslation] makes, so a legacy row
      // whose meanings were never split is still searchable by what it says.
      translations: translations.isEmpty ? [translation] : translations,
      dialect: dialect,
      definiteForm: definiteForm,
      pluralForm: pluralForm,
    );
    if (direct != null) return direct;

    // -- Every meaning is searchable, not only the summary line ----------
    // A three-sense entry whose SECOND meaning is the one somebody wanted did
    // not exist for them until this branch. `translations` carries the flat
    // summary; a sense's own Kasem gloss, its usage note and its synonyms are
    // not in it, and those are exactly the words a learner reaches for when
    // they half-remember a meaning.
    //
    // Ranked below every direct hit on purpose. A word whose headword matches
    // must always outrank a word that merely mentions the query in a note four
    // senses down, or the search stops answering the question it was asked.
    if (foldedQuery.isEmpty) return null;
    for (final sense in senses) {
      if (foldForSearch(sense.searchableText).contains(foldedQuery)) {
        return kSenseMatchRank;
      }
    }
    return null;
  }

  /// The headword in Kasem alphabetical order, where ɛ files after e, ɩ after
  /// i, ŋ after n, ɔ after o and ʋ after u.
  ///
  /// Sorting on the plain string put every word beginning with an extended
  /// letter after z, because those code points are all above U+0100 — several
  /// hundred entries in a heap past the end of the alphabet, where a reader
  /// scrolling to find them never looks.
  String get sortKey => collationKey(headword);
}

/// The most meanings one entry may carry, and the longest any one of them may
/// be. Mirrors `MAX_TRANSLATIONS` / `MAX_TRANSLATION_LENGTH` in
/// `services/functions/src/lexical-kinds.ts`.
const kMaxTranslations = 8;
const kMaxTranslationLength = 120;

/// Turns what a member typed into the list of meanings they meant.
///
/// ── This function has a twin, and they must agree ─────────────────────────
/// `parseTranslations` in `services/functions/src/lexical-kinds.ts` is the
/// canonical implementation; this is the same rules in Dart, because the phone
/// has to reconstruct the list for the fifteen thousand entries that were
/// published before the field existed and are never going to be back-filled.
/// Deriving on read rather than migrating is deliberate: a projection that can
/// rebuild the field on demand means no historical row has to be rewritten, and
/// an entry approved last year renders byte-for-byte as it did then.
///
/// The rules, and why each one is here:
///
///   * Commas and forward slashes split, because those are what people
///     actually use. Newlines split too: a phone keyboard's return key is a
///     separator in everybody's head, and treating it as part of a word
///     produces a meaning with an invisible line break in the middle of it.
///   * Internal whitespace collapses, so "good   morning" and "good morning"
///     are the same answer.
///   * De-duplication is case-insensitive and keeps the FIRST spelling seen.
///     The first is the one the member reached for without thinking, which is
///     better evidence about the language than a later repetition — and
///     keeping the first makes this order-stable, so re-parsing text that has
///     already been parsed is a no-op.
///   * Over-long pieces are truncated rather than dropped. A 400-character
///     "meaning" is a sentence pasted into the wrong box, and losing the whole
///     entry over it would also lose the six good meanings beside it.
///
/// Pure, total, and never throws. It runs on every row of a list a member is
/// scrolling, and a parser that threw on junk would take down a screen over
/// one bad import.
List<String> splitTranslations(String raw) {
  if (raw.isEmpty) return const <String>[];
  final seen = <String>{};
  final out = <String>[];
  for (final piece in raw.split(_translationSeparators)) {
    var value = piece.trim().replaceAll(_runsOfSpace, ' ');
    if (value.length > kMaxTranslationLength) {
      value = value.substring(0, kMaxTranslationLength).trim();
    }
    if (value.isEmpty) continue;
    if (!seen.add(value.toLowerCase())) continue;
    out.add(value);
    if (out.length >= kMaxTranslations) break;
  }
  return List.unmodifiable(out);
}

final _translationSeparators = RegExp(r'[,/\n\r]+');
final _runsOfSpace = RegExp(r'\s+');
