// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint, type=warning, deprecated_member_use, deprecated_member_use_from_same_package
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'dictionary_entry.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// dart format off
T _$identity<T>(T value) => value;

/// @nodoc
mixin _$DictionaryEntry {

 String get id; String get headword;/// The first meaning, as one string.
///
/// Kept required, and kept singular, because every caller written before an
/// entry could have more than one meaning reads this field — the home
/// screen's word of the day, the saved-words list, the contribute deep link.
/// Replacing it with the list outright was the obvious tidy-up and it was
/// the wrong one: it would have rewritten six screens across four features
/// this change has no business touching, to say the same thing they already
/// say. [primaryTranslation] is what new code should read.
 String get translation;/// Every meaning this entry carries, in the order the contributor gave them.
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
 List<String> get translations;/// Every Kasem rendering of this entry, in the order the contributor gave
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
 List<String> get renderings; String get partOfSpeech; String get dialect; String get pronunciation; String get example; String get exampleTranslation;/// Where the example sentence came from: `'tatoeba'`, `'unattributed'`, or
/// empty on an entry that predates the guided queue.
///
/// Kept as it arrived rather than reduced to a bool, for the same reason
/// the word queue keeps it — see `QueueWord.sentenceSource`. A second
/// sentence pool will eventually exist and a field named `isTatoeba` is one
/// that has to be found and widened later.
 String get sentenceSource;/// The Tatoeba sentence id, or empty where none is owed.
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
 String get tatoebaId;/// May be empty even on an attributed entry — a Tatoeba sentence whose
/// contributor is not recorded still carries its id and its licence, and
/// the credit line simply leaves the name out rather than writing "by ".
 String get tatoebaContributor; String get sentenceLicence; String get attribution; String? get culturalNote;/// A published recording of the headword being said, or empty where the
/// entry has none.
///
/// Separate from [pronunciation], which is the written guide. The two used
/// to share one field, so an entry with audio showed a download URL where
/// its phonetics belonged and still had nothing to play.
 String get audioUrl;/// The noun said with *the*, and said for many.
///
/// ── Why these two and not "the" ──────────────────────────────────────
/// Definiteness in Kasem is a property of the noun rather than a word of
/// its own, so there is no Kasem for "the" to record and never was. There
/// is only the form a speaker says, which is what these hold. Empty on
/// every entry contributed before the queue started asking, and on every
/// entry that is not a noun.
 String get definiteForm; String get pluralForm;/// The plural said with *the* — "the boys".
///
/// ── Why the plural needs its own definite ────────────────────────────
/// Because the singular and the plural may well sit in *different*
/// classes. `dɛ dem` "the day" beside `da yam` "the days", if `dɛ` and
/// `da` are one lexeme, is ordinary Gur singular/plural class pairing —
/// and without this form the pairing is unobservable, because the definite
/// form reads the singular's class while the numeral agrees with the
/// plural. The two probes were describing different halves of the word and
/// nothing on the entry said so.
 String get pluralDefiniteForm;/// The noun said with *two* — "two boys".
///
/// A Kasem numeral agrees with what it counts: six forms of *two* are
/// attested — balei, yalei, nlei, selei, telei, delei — and which one a
/// speaker uses is chosen by the noun in front of it. So this is the same
/// class the definite form points at, read off a second surface, and the
/// two together are checkable in a way either alone is not.
///
/// Shown here rather than kept on the contribution because a form nobody
/// can see is a form nobody can correct, and correcting it is the point.
 String get countedForm;/// The pronoun that stands in for this noun — "the boy … *he*".
///
/// The third surface the same class marker appears on, and by some way the
/// easiest to elicit: a speaker who has just written "the boy" produces
/// "he came" without stopping, where "two boys" makes some people count.
///
/// Stored as the word, never as a person/number label. "Third person
/// singular animate" is a question about grammar that almost nobody can
/// answer about their own language; "what do you call him afterwards" is a
/// question about talking.
 String get pronounForm;/// The determiner alone — `kam`, `kom`, `dem` … — where one is known.
///
/// Usually read off [definiteForm] by `articleIn` rather than stored, and
/// stored only when a contributor or a reviewer said it separately. Empty
/// means *nothing matched*, which on this field is extremely common and
/// entirely honest: most definite forms in the archive were never
/// collected at all.
 String get definiteArticle;/// Which attested word for *two* the counted form used — `yalei` — and the
/// class prefix it carries — `ya`.
///
/// Both empty unless the counted form contained one of the six words a
/// speaker has actually given. Never completed by pattern: no form is
/// attested for the `kam` or `kom` articles, and `nlei` matches no article
/// at all, so the three marker lists are related rather than identical and
/// filling the gaps in would be inventing grammar.
 String get numeralSeries; String get numeralPrefix;/// The verb said now, yesterday and tomorrow.
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
 String get presentForm; String get pastForm; String get futureForm;/// The verb said of several doers — "they eat".
///
/// Kept apart from [pluralForm], which is a noun's plural, because an
/// entry can be both a noun and a verb and folding the two together would
/// put a noun's plural and a verb's agreement in one field.
 String get pluralSubjectForm;/// The verb said as an instruction — "eat!".
 String get imperativeForm;/// The word used with one thing, then with a different thing.
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
 String get agreeingOneForm; String get agreeingTwoForm;/// The other word classes this entry is also used as.
///
/// Most often `verb` on a noun, which is the case that prompted the field:
/// a learner who looks up a noun and is told only that it is a noun has
/// been told something incomplete about their own language, and until now
/// the app had no way to record the rest even when the contributor knew
/// it.
///
/// Stable ids, never labels, and never containing this entry's own class.
 List<String> get alsoUsedAs;/// How the headword is said, in IPA, stored **without** its delimiters.
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
 String get ipa;/// What the word means, said in Kasem.
///
/// ── The field that changes what this archive is ─────────────────────
/// A dictionary that explains Kasem only in English is a dictionary that
/// treats English as the language you think in. This is the entry's
/// meaning as a speaker would put it to a child who asked — the only text
/// on the record written *in* the language rather than about it. It also
/// carries usage, register and collocation that a one-word English
/// equivalent throws away, which is exactly what anything later hoping to
/// learn Kasem from this archive needs and cannot get from a gloss.
 String get kasemDefinition;/// Where the word comes from, where anybody knows.
///
/// Empty on nearly everything, and empty is the honest answer: for most of
/// this vocabulary nobody has written the origin down. An empty field says
/// so. A plausible one would not, and would be repeated.
 String get etymology;/// The noun class, worked out from [definiteForm] when it could be.
///
/// Empty means *not established*, which is the honest answer and by far
/// the common one — the class inventory is being built from contributed
/// forms rather than assumed in advance. It never means "no class".
 String get nounClass;/// Which sense of this spelling the entry is — 1, 2, 3 — or 0 where none
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
 int get homographIndex;/// The several things this word means, each with its own examples.
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
@EntrySenseListConverter() List<EntrySense> get senses;
/// Create a copy of DictionaryEntry
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$DictionaryEntryCopyWith<DictionaryEntry> get copyWith => _$DictionaryEntryCopyWithImpl<DictionaryEntry>(this as DictionaryEntry, _$identity);

  /// Serializes this DictionaryEntry to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is DictionaryEntry&&(identical(other.id, id) || other.id == id)&&(identical(other.headword, headword) || other.headword == headword)&&(identical(other.translation, translation) || other.translation == translation)&&const DeepCollectionEquality().equals(other.translations, translations)&&const DeepCollectionEquality().equals(other.renderings, renderings)&&(identical(other.partOfSpeech, partOfSpeech) || other.partOfSpeech == partOfSpeech)&&(identical(other.dialect, dialect) || other.dialect == dialect)&&(identical(other.pronunciation, pronunciation) || other.pronunciation == pronunciation)&&(identical(other.example, example) || other.example == example)&&(identical(other.exampleTranslation, exampleTranslation) || other.exampleTranslation == exampleTranslation)&&(identical(other.sentenceSource, sentenceSource) || other.sentenceSource == sentenceSource)&&(identical(other.tatoebaId, tatoebaId) || other.tatoebaId == tatoebaId)&&(identical(other.tatoebaContributor, tatoebaContributor) || other.tatoebaContributor == tatoebaContributor)&&(identical(other.sentenceLicence, sentenceLicence) || other.sentenceLicence == sentenceLicence)&&(identical(other.attribution, attribution) || other.attribution == attribution)&&(identical(other.culturalNote, culturalNote) || other.culturalNote == culturalNote)&&(identical(other.audioUrl, audioUrl) || other.audioUrl == audioUrl)&&(identical(other.definiteForm, definiteForm) || other.definiteForm == definiteForm)&&(identical(other.pluralForm, pluralForm) || other.pluralForm == pluralForm)&&(identical(other.pluralDefiniteForm, pluralDefiniteForm) || other.pluralDefiniteForm == pluralDefiniteForm)&&(identical(other.countedForm, countedForm) || other.countedForm == countedForm)&&(identical(other.pronounForm, pronounForm) || other.pronounForm == pronounForm)&&(identical(other.definiteArticle, definiteArticle) || other.definiteArticle == definiteArticle)&&(identical(other.numeralSeries, numeralSeries) || other.numeralSeries == numeralSeries)&&(identical(other.numeralPrefix, numeralPrefix) || other.numeralPrefix == numeralPrefix)&&(identical(other.presentForm, presentForm) || other.presentForm == presentForm)&&(identical(other.pastForm, pastForm) || other.pastForm == pastForm)&&(identical(other.futureForm, futureForm) || other.futureForm == futureForm)&&(identical(other.pluralSubjectForm, pluralSubjectForm) || other.pluralSubjectForm == pluralSubjectForm)&&(identical(other.imperativeForm, imperativeForm) || other.imperativeForm == imperativeForm)&&(identical(other.agreeingOneForm, agreeingOneForm) || other.agreeingOneForm == agreeingOneForm)&&(identical(other.agreeingTwoForm, agreeingTwoForm) || other.agreeingTwoForm == agreeingTwoForm)&&const DeepCollectionEquality().equals(other.alsoUsedAs, alsoUsedAs)&&(identical(other.ipa, ipa) || other.ipa == ipa)&&(identical(other.kasemDefinition, kasemDefinition) || other.kasemDefinition == kasemDefinition)&&(identical(other.etymology, etymology) || other.etymology == etymology)&&(identical(other.nounClass, nounClass) || other.nounClass == nounClass)&&(identical(other.homographIndex, homographIndex) || other.homographIndex == homographIndex)&&const DeepCollectionEquality().equals(other.senses, senses));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hashAll([runtimeType,id,headword,translation,const DeepCollectionEquality().hash(translations),const DeepCollectionEquality().hash(renderings),partOfSpeech,dialect,pronunciation,example,exampleTranslation,sentenceSource,tatoebaId,tatoebaContributor,sentenceLicence,attribution,culturalNote,audioUrl,definiteForm,pluralForm,pluralDefiniteForm,countedForm,pronounForm,definiteArticle,numeralSeries,numeralPrefix,presentForm,pastForm,futureForm,pluralSubjectForm,imperativeForm,agreeingOneForm,agreeingTwoForm,const DeepCollectionEquality().hash(alsoUsedAs),ipa,kasemDefinition,etymology,nounClass,homographIndex,const DeepCollectionEquality().hash(senses)]);

@override
String toString() {
  return 'DictionaryEntry(id: $id, headword: $headword, translation: $translation, translations: $translations, renderings: $renderings, partOfSpeech: $partOfSpeech, dialect: $dialect, pronunciation: $pronunciation, example: $example, exampleTranslation: $exampleTranslation, sentenceSource: $sentenceSource, tatoebaId: $tatoebaId, tatoebaContributor: $tatoebaContributor, sentenceLicence: $sentenceLicence, attribution: $attribution, culturalNote: $culturalNote, audioUrl: $audioUrl, definiteForm: $definiteForm, pluralForm: $pluralForm, pluralDefiniteForm: $pluralDefiniteForm, countedForm: $countedForm, pronounForm: $pronounForm, definiteArticle: $definiteArticle, numeralSeries: $numeralSeries, numeralPrefix: $numeralPrefix, presentForm: $presentForm, pastForm: $pastForm, futureForm: $futureForm, pluralSubjectForm: $pluralSubjectForm, imperativeForm: $imperativeForm, agreeingOneForm: $agreeingOneForm, agreeingTwoForm: $agreeingTwoForm, alsoUsedAs: $alsoUsedAs, ipa: $ipa, kasemDefinition: $kasemDefinition, etymology: $etymology, nounClass: $nounClass, homographIndex: $homographIndex, senses: $senses)';
}


}

/// @nodoc
abstract mixin class $DictionaryEntryCopyWith<$Res>  {
  factory $DictionaryEntryCopyWith(DictionaryEntry value, $Res Function(DictionaryEntry) _then) = _$DictionaryEntryCopyWithImpl;
@useResult
$Res call({
 String id, String headword, String translation, List<String> translations, List<String> renderings, String partOfSpeech, String dialect, String pronunciation, String example, String exampleTranslation, String sentenceSource, String tatoebaId, String tatoebaContributor, String sentenceLicence, String attribution, String? culturalNote, String audioUrl, String definiteForm, String pluralForm, String pluralDefiniteForm, String countedForm, String pronounForm, String definiteArticle, String numeralSeries, String numeralPrefix, String presentForm, String pastForm, String futureForm, String pluralSubjectForm, String imperativeForm, String agreeingOneForm, String agreeingTwoForm, List<String> alsoUsedAs, String ipa, String kasemDefinition, String etymology, String nounClass, int homographIndex,@EntrySenseListConverter() List<EntrySense> senses
});




}
/// @nodoc
class _$DictionaryEntryCopyWithImpl<$Res>
    implements $DictionaryEntryCopyWith<$Res> {
  _$DictionaryEntryCopyWithImpl(this._self, this._then);

  final DictionaryEntry _self;
  final $Res Function(DictionaryEntry) _then;

/// Create a copy of DictionaryEntry
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? id = null,Object? headword = null,Object? translation = null,Object? translations = null,Object? renderings = null,Object? partOfSpeech = null,Object? dialect = null,Object? pronunciation = null,Object? example = null,Object? exampleTranslation = null,Object? sentenceSource = null,Object? tatoebaId = null,Object? tatoebaContributor = null,Object? sentenceLicence = null,Object? attribution = null,Object? culturalNote = freezed,Object? audioUrl = null,Object? definiteForm = null,Object? pluralForm = null,Object? pluralDefiniteForm = null,Object? countedForm = null,Object? pronounForm = null,Object? definiteArticle = null,Object? numeralSeries = null,Object? numeralPrefix = null,Object? presentForm = null,Object? pastForm = null,Object? futureForm = null,Object? pluralSubjectForm = null,Object? imperativeForm = null,Object? agreeingOneForm = null,Object? agreeingTwoForm = null,Object? alsoUsedAs = null,Object? ipa = null,Object? kasemDefinition = null,Object? etymology = null,Object? nounClass = null,Object? homographIndex = null,Object? senses = null,}) {
  return _then(DictionaryEntry(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,headword: null == headword ? _self.headword : headword // ignore: cast_nullable_to_non_nullable
as String,translation: null == translation ? _self.translation : translation // ignore: cast_nullable_to_non_nullable
as String,translations: null == translations ? _self.translations : translations // ignore: cast_nullable_to_non_nullable
as List<String>,renderings: null == renderings ? _self.renderings : renderings // ignore: cast_nullable_to_non_nullable
as List<String>,partOfSpeech: null == partOfSpeech ? _self.partOfSpeech : partOfSpeech // ignore: cast_nullable_to_non_nullable
as String,dialect: null == dialect ? _self.dialect : dialect // ignore: cast_nullable_to_non_nullable
as String,pronunciation: null == pronunciation ? _self.pronunciation : pronunciation // ignore: cast_nullable_to_non_nullable
as String,example: null == example ? _self.example : example // ignore: cast_nullable_to_non_nullable
as String,exampleTranslation: null == exampleTranslation ? _self.exampleTranslation : exampleTranslation // ignore: cast_nullable_to_non_nullable
as String,sentenceSource: null == sentenceSource ? _self.sentenceSource : sentenceSource // ignore: cast_nullable_to_non_nullable
as String,tatoebaId: null == tatoebaId ? _self.tatoebaId : tatoebaId // ignore: cast_nullable_to_non_nullable
as String,tatoebaContributor: null == tatoebaContributor ? _self.tatoebaContributor : tatoebaContributor // ignore: cast_nullable_to_non_nullable
as String,sentenceLicence: null == sentenceLicence ? _self.sentenceLicence : sentenceLicence // ignore: cast_nullable_to_non_nullable
as String,attribution: null == attribution ? _self.attribution : attribution // ignore: cast_nullable_to_non_nullable
as String,culturalNote: freezed == culturalNote ? _self.culturalNote : culturalNote // ignore: cast_nullable_to_non_nullable
as String?,audioUrl: null == audioUrl ? _self.audioUrl : audioUrl // ignore: cast_nullable_to_non_nullable
as String,definiteForm: null == definiteForm ? _self.definiteForm : definiteForm // ignore: cast_nullable_to_non_nullable
as String,pluralForm: null == pluralForm ? _self.pluralForm : pluralForm // ignore: cast_nullable_to_non_nullable
as String,pluralDefiniteForm: null == pluralDefiniteForm ? _self.pluralDefiniteForm : pluralDefiniteForm // ignore: cast_nullable_to_non_nullable
as String,countedForm: null == countedForm ? _self.countedForm : countedForm // ignore: cast_nullable_to_non_nullable
as String,pronounForm: null == pronounForm ? _self.pronounForm : pronounForm // ignore: cast_nullable_to_non_nullable
as String,definiteArticle: null == definiteArticle ? _self.definiteArticle : definiteArticle // ignore: cast_nullable_to_non_nullable
as String,numeralSeries: null == numeralSeries ? _self.numeralSeries : numeralSeries // ignore: cast_nullable_to_non_nullable
as String,numeralPrefix: null == numeralPrefix ? _self.numeralPrefix : numeralPrefix // ignore: cast_nullable_to_non_nullable
as String,presentForm: null == presentForm ? _self.presentForm : presentForm // ignore: cast_nullable_to_non_nullable
as String,pastForm: null == pastForm ? _self.pastForm : pastForm // ignore: cast_nullable_to_non_nullable
as String,futureForm: null == futureForm ? _self.futureForm : futureForm // ignore: cast_nullable_to_non_nullable
as String,pluralSubjectForm: null == pluralSubjectForm ? _self.pluralSubjectForm : pluralSubjectForm // ignore: cast_nullable_to_non_nullable
as String,imperativeForm: null == imperativeForm ? _self.imperativeForm : imperativeForm // ignore: cast_nullable_to_non_nullable
as String,agreeingOneForm: null == agreeingOneForm ? _self.agreeingOneForm : agreeingOneForm // ignore: cast_nullable_to_non_nullable
as String,agreeingTwoForm: null == agreeingTwoForm ? _self.agreeingTwoForm : agreeingTwoForm // ignore: cast_nullable_to_non_nullable
as String,alsoUsedAs: null == alsoUsedAs ? _self.alsoUsedAs : alsoUsedAs // ignore: cast_nullable_to_non_nullable
as List<String>,ipa: null == ipa ? _self.ipa : ipa // ignore: cast_nullable_to_non_nullable
as String,kasemDefinition: null == kasemDefinition ? _self.kasemDefinition : kasemDefinition // ignore: cast_nullable_to_non_nullable
as String,etymology: null == etymology ? _self.etymology : etymology // ignore: cast_nullable_to_non_nullable
as String,nounClass: null == nounClass ? _self.nounClass : nounClass // ignore: cast_nullable_to_non_nullable
as String,homographIndex: null == homographIndex ? _self.homographIndex : homographIndex // ignore: cast_nullable_to_non_nullable
as int,senses: null == senses ? _self.senses : senses // ignore: cast_nullable_to_non_nullable
as List<EntrySense>,
  ));
}

}


/// Adds pattern-matching-related methods to [DictionaryEntry].
extension DictionaryEntryPatterns on DictionaryEntry {
/// A variant of `map` that fallback to returning `orElse`.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case _:
///     return orElse();
/// }
/// ```

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _DictionaryEntry value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _DictionaryEntry() when $default != null:
return $default(_that);case _:
  return orElse();

}
}
/// A `switch`-like method, using callbacks.
///
/// Callbacks receives the raw object, upcasted.
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case final Subclass2 value:
///     return ...;
/// }
/// ```

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _DictionaryEntry value)  $default,){
final _that = this;
switch (_that) {
case _DictionaryEntry():
return $default(_that);case _:
  throw StateError('Unexpected subclass');

}
}
/// A variant of `map` that fallback to returning `null`.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case _:
///     return null;
/// }
/// ```

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _DictionaryEntry value)?  $default,){
final _that = this;
switch (_that) {
case _DictionaryEntry() when $default != null:
return $default(_that);case _:
  return null;

}
}
/// A variant of `when` that fallback to an `orElse` callback.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case _:
///     return orElse();
/// }
/// ```

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String id,  String headword,  String translation,  List<String> translations,  List<String> renderings,  String partOfSpeech,  String dialect,  String pronunciation,  String example,  String exampleTranslation,  String sentenceSource,  String tatoebaId,  String tatoebaContributor,  String sentenceLicence,  String attribution,  String? culturalNote,  String audioUrl,  String definiteForm,  String pluralForm,  String pluralDefiniteForm,  String countedForm,  String pronounForm,  String definiteArticle,  String numeralSeries,  String numeralPrefix,  String presentForm,  String pastForm,  String futureForm,  String pluralSubjectForm,  String imperativeForm,  String agreeingOneForm,  String agreeingTwoForm,  List<String> alsoUsedAs,  String ipa,  String kasemDefinition,  String etymology,  String nounClass,  int homographIndex, @EntrySenseListConverter()  List<EntrySense> senses)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _DictionaryEntry() when $default != null:
return $default(_that.id,_that.headword,_that.translation,_that.translations,_that.renderings,_that.partOfSpeech,_that.dialect,_that.pronunciation,_that.example,_that.exampleTranslation,_that.sentenceSource,_that.tatoebaId,_that.tatoebaContributor,_that.sentenceLicence,_that.attribution,_that.culturalNote,_that.audioUrl,_that.definiteForm,_that.pluralForm,_that.pluralDefiniteForm,_that.countedForm,_that.pronounForm,_that.definiteArticle,_that.numeralSeries,_that.numeralPrefix,_that.presentForm,_that.pastForm,_that.futureForm,_that.pluralSubjectForm,_that.imperativeForm,_that.agreeingOneForm,_that.agreeingTwoForm,_that.alsoUsedAs,_that.ipa,_that.kasemDefinition,_that.etymology,_that.nounClass,_that.homographIndex,_that.senses);case _:
  return orElse();

}
}
/// A `switch`-like method, using callbacks.
///
/// As opposed to `map`, this offers destructuring.
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case Subclass2(:final field2):
///     return ...;
/// }
/// ```

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String id,  String headword,  String translation,  List<String> translations,  List<String> renderings,  String partOfSpeech,  String dialect,  String pronunciation,  String example,  String exampleTranslation,  String sentenceSource,  String tatoebaId,  String tatoebaContributor,  String sentenceLicence,  String attribution,  String? culturalNote,  String audioUrl,  String definiteForm,  String pluralForm,  String pluralDefiniteForm,  String countedForm,  String pronounForm,  String definiteArticle,  String numeralSeries,  String numeralPrefix,  String presentForm,  String pastForm,  String futureForm,  String pluralSubjectForm,  String imperativeForm,  String agreeingOneForm,  String agreeingTwoForm,  List<String> alsoUsedAs,  String ipa,  String kasemDefinition,  String etymology,  String nounClass,  int homographIndex, @EntrySenseListConverter()  List<EntrySense> senses)  $default,) {final _that = this;
switch (_that) {
case _DictionaryEntry():
return $default(_that.id,_that.headword,_that.translation,_that.translations,_that.renderings,_that.partOfSpeech,_that.dialect,_that.pronunciation,_that.example,_that.exampleTranslation,_that.sentenceSource,_that.tatoebaId,_that.tatoebaContributor,_that.sentenceLicence,_that.attribution,_that.culturalNote,_that.audioUrl,_that.definiteForm,_that.pluralForm,_that.pluralDefiniteForm,_that.countedForm,_that.pronounForm,_that.definiteArticle,_that.numeralSeries,_that.numeralPrefix,_that.presentForm,_that.pastForm,_that.futureForm,_that.pluralSubjectForm,_that.imperativeForm,_that.agreeingOneForm,_that.agreeingTwoForm,_that.alsoUsedAs,_that.ipa,_that.kasemDefinition,_that.etymology,_that.nounClass,_that.homographIndex,_that.senses);case _:
  throw StateError('Unexpected subclass');

}
}
/// A variant of `when` that fallback to returning `null`
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case _:
///     return null;
/// }
/// ```

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String id,  String headword,  String translation,  List<String> translations,  List<String> renderings,  String partOfSpeech,  String dialect,  String pronunciation,  String example,  String exampleTranslation,  String sentenceSource,  String tatoebaId,  String tatoebaContributor,  String sentenceLicence,  String attribution,  String? culturalNote,  String audioUrl,  String definiteForm,  String pluralForm,  String pluralDefiniteForm,  String countedForm,  String pronounForm,  String definiteArticle,  String numeralSeries,  String numeralPrefix,  String presentForm,  String pastForm,  String futureForm,  String pluralSubjectForm,  String imperativeForm,  String agreeingOneForm,  String agreeingTwoForm,  List<String> alsoUsedAs,  String ipa,  String kasemDefinition,  String etymology,  String nounClass,  int homographIndex, @EntrySenseListConverter()  List<EntrySense> senses)?  $default,) {final _that = this;
switch (_that) {
case _DictionaryEntry() when $default != null:
return $default(_that.id,_that.headword,_that.translation,_that.translations,_that.renderings,_that.partOfSpeech,_that.dialect,_that.pronunciation,_that.example,_that.exampleTranslation,_that.sentenceSource,_that.tatoebaId,_that.tatoebaContributor,_that.sentenceLicence,_that.attribution,_that.culturalNote,_that.audioUrl,_that.definiteForm,_that.pluralForm,_that.pluralDefiniteForm,_that.countedForm,_that.pronounForm,_that.definiteArticle,_that.numeralSeries,_that.numeralPrefix,_that.presentForm,_that.pastForm,_that.futureForm,_that.pluralSubjectForm,_that.imperativeForm,_that.agreeingOneForm,_that.agreeingTwoForm,_that.alsoUsedAs,_that.ipa,_that.kasemDefinition,_that.etymology,_that.nounClass,_that.homographIndex,_that.senses);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _DictionaryEntry extends DictionaryEntry {
  const _DictionaryEntry({required this.id, required this.headword, required this.translation,  List<String> translations = const <String>[],  List<String> renderings = const <String>[], required this.partOfSpeech, required this.dialect, required this.pronunciation, required this.example, required this.exampleTranslation, this.sentenceSource = '', this.tatoebaId = '', this.tatoebaContributor = '', this.sentenceLicence = '', required this.attribution, this.culturalNote, this.audioUrl = '', this.definiteForm = '', this.pluralForm = '', this.pluralDefiniteForm = '', this.countedForm = '', this.pronounForm = '', this.definiteArticle = '', this.numeralSeries = '', this.numeralPrefix = '', this.presentForm = '', this.pastForm = '', this.futureForm = '', this.pluralSubjectForm = '', this.imperativeForm = '', this.agreeingOneForm = '', this.agreeingTwoForm = '',  List<String> alsoUsedAs = const <String>[], this.ipa = '', this.kasemDefinition = '', this.etymology = '', this.nounClass = '', this.homographIndex = 0, @EntrySenseListConverter()  List<EntrySense> senses = const <EntrySense>[]}): _translations = translations,_renderings = renderings,_alsoUsedAs = alsoUsedAs,_senses = senses,super._();
  factory _DictionaryEntry.fromJson(Map<String, dynamic> json) => _$DictionaryEntryFromJson(json);

@override final  String id;
@override final  String headword;
/// The first meaning, as one string.
///
/// Kept required, and kept singular, because every caller written before an
/// entry could have more than one meaning reads this field — the home
/// screen's word of the day, the saved-words list, the contribute deep link.
/// Replacing it with the list outright was the obvious tidy-up and it was
/// the wrong one: it would have rewritten six screens across four features
/// this change has no business touching, to say the same thing they already
/// say. [primaryTranslation] is what new code should read.
@override final  String translation;
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
 final  List<String> _translations;
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
@override@JsonKey() List<String> get translations {
  if (_translations is EqualUnmodifiableListView) return _translations;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_translations);
}

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
 final  List<String> _renderings;
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
@override@JsonKey() List<String> get renderings {
  if (_renderings is EqualUnmodifiableListView) return _renderings;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_renderings);
}

@override final  String partOfSpeech;
@override final  String dialect;
@override final  String pronunciation;
@override final  String example;
@override final  String exampleTranslation;
/// Where the example sentence came from: `'tatoeba'`, `'unattributed'`, or
/// empty on an entry that predates the guided queue.
///
/// Kept as it arrived rather than reduced to a bool, for the same reason
/// the word queue keeps it — see `QueueWord.sentenceSource`. A second
/// sentence pool will eventually exist and a field named `isTatoeba` is one
/// that has to be found and widened later.
@override@JsonKey() final  String sentenceSource;
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
@override@JsonKey() final  String tatoebaId;
/// May be empty even on an attributed entry — a Tatoeba sentence whose
/// contributor is not recorded still carries its id and its licence, and
/// the credit line simply leaves the name out rather than writing "by ".
@override@JsonKey() final  String tatoebaContributor;
@override@JsonKey() final  String sentenceLicence;
@override final  String attribution;
@override final  String? culturalNote;
/// A published recording of the headword being said, or empty where the
/// entry has none.
///
/// Separate from [pronunciation], which is the written guide. The two used
/// to share one field, so an entry with audio showed a download URL where
/// its phonetics belonged and still had nothing to play.
@override@JsonKey() final  String audioUrl;
/// The noun said with *the*, and said for many.
///
/// ── Why these two and not "the" ──────────────────────────────────────
/// Definiteness in Kasem is a property of the noun rather than a word of
/// its own, so there is no Kasem for "the" to record and never was. There
/// is only the form a speaker says, which is what these hold. Empty on
/// every entry contributed before the queue started asking, and on every
/// entry that is not a noun.
@override@JsonKey() final  String definiteForm;
@override@JsonKey() final  String pluralForm;
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
@override@JsonKey() final  String pluralDefiniteForm;
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
@override@JsonKey() final  String countedForm;
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
@override@JsonKey() final  String pronounForm;
/// The determiner alone — `kam`, `kom`, `dem` … — where one is known.
///
/// Usually read off [definiteForm] by `articleIn` rather than stored, and
/// stored only when a contributor or a reviewer said it separately. Empty
/// means *nothing matched*, which on this field is extremely common and
/// entirely honest: most definite forms in the archive were never
/// collected at all.
@override@JsonKey() final  String definiteArticle;
/// Which attested word for *two* the counted form used — `yalei` — and the
/// class prefix it carries — `ya`.
///
/// Both empty unless the counted form contained one of the six words a
/// speaker has actually given. Never completed by pattern: no form is
/// attested for the `kam` or `kom` articles, and `nlei` matches no article
/// at all, so the three marker lists are related rather than identical and
/// filling the gaps in would be inventing grammar.
@override@JsonKey() final  String numeralSeries;
@override@JsonKey() final  String numeralPrefix;
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
@override@JsonKey() final  String presentForm;
@override@JsonKey() final  String pastForm;
@override@JsonKey() final  String futureForm;
/// The verb said of several doers — "they eat".
///
/// Kept apart from [pluralForm], which is a noun's plural, because an
/// entry can be both a noun and a verb and folding the two together would
/// put a noun's plural and a verb's agreement in one field.
@override@JsonKey() final  String pluralSubjectForm;
/// The verb said as an instruction — "eat!".
@override@JsonKey() final  String imperativeForm;
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
@override@JsonKey() final  String agreeingOneForm;
@override@JsonKey() final  String agreeingTwoForm;
/// The other word classes this entry is also used as.
///
/// Most often `verb` on a noun, which is the case that prompted the field:
/// a learner who looks up a noun and is told only that it is a noun has
/// been told something incomplete about their own language, and until now
/// the app had no way to record the rest even when the contributor knew
/// it.
///
/// Stable ids, never labels, and never containing this entry's own class.
 final  List<String> _alsoUsedAs;
/// The other word classes this entry is also used as.
///
/// Most often `verb` on a noun, which is the case that prompted the field:
/// a learner who looks up a noun and is told only that it is a noun has
/// been told something incomplete about their own language, and until now
/// the app had no way to record the rest even when the contributor knew
/// it.
///
/// Stable ids, never labels, and never containing this entry's own class.
@override@JsonKey() List<String> get alsoUsedAs {
  if (_alsoUsedAs is EqualUnmodifiableListView) return _alsoUsedAs;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_alsoUsedAs);
}

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
@override@JsonKey() final  String ipa;
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
@override@JsonKey() final  String kasemDefinition;
/// Where the word comes from, where anybody knows.
///
/// Empty on nearly everything, and empty is the honest answer: for most of
/// this vocabulary nobody has written the origin down. An empty field says
/// so. A plausible one would not, and would be repeated.
@override@JsonKey() final  String etymology;
/// The noun class, worked out from [definiteForm] when it could be.
///
/// Empty means *not established*, which is the honest answer and by far
/// the common one — the class inventory is being built from contributed
/// forms rather than assumed in advance. It never means "no class".
@override@JsonKey() final  String nounClass;
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
@override@JsonKey() final  int homographIndex;
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
 final  List<EntrySense> _senses;
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
@override@JsonKey()@EntrySenseListConverter() List<EntrySense> get senses {
  if (_senses is EqualUnmodifiableListView) return _senses;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_senses);
}


/// Create a copy of DictionaryEntry
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$DictionaryEntryCopyWith<_DictionaryEntry> get copyWith => __$DictionaryEntryCopyWithImpl<_DictionaryEntry>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$DictionaryEntryToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _DictionaryEntry&&(identical(other.id, id) || other.id == id)&&(identical(other.headword, headword) || other.headword == headword)&&(identical(other.translation, translation) || other.translation == translation)&&const DeepCollectionEquality().equals(other._translations, _translations)&&const DeepCollectionEquality().equals(other._renderings, _renderings)&&(identical(other.partOfSpeech, partOfSpeech) || other.partOfSpeech == partOfSpeech)&&(identical(other.dialect, dialect) || other.dialect == dialect)&&(identical(other.pronunciation, pronunciation) || other.pronunciation == pronunciation)&&(identical(other.example, example) || other.example == example)&&(identical(other.exampleTranslation, exampleTranslation) || other.exampleTranslation == exampleTranslation)&&(identical(other.sentenceSource, sentenceSource) || other.sentenceSource == sentenceSource)&&(identical(other.tatoebaId, tatoebaId) || other.tatoebaId == tatoebaId)&&(identical(other.tatoebaContributor, tatoebaContributor) || other.tatoebaContributor == tatoebaContributor)&&(identical(other.sentenceLicence, sentenceLicence) || other.sentenceLicence == sentenceLicence)&&(identical(other.attribution, attribution) || other.attribution == attribution)&&(identical(other.culturalNote, culturalNote) || other.culturalNote == culturalNote)&&(identical(other.audioUrl, audioUrl) || other.audioUrl == audioUrl)&&(identical(other.definiteForm, definiteForm) || other.definiteForm == definiteForm)&&(identical(other.pluralForm, pluralForm) || other.pluralForm == pluralForm)&&(identical(other.pluralDefiniteForm, pluralDefiniteForm) || other.pluralDefiniteForm == pluralDefiniteForm)&&(identical(other.countedForm, countedForm) || other.countedForm == countedForm)&&(identical(other.pronounForm, pronounForm) || other.pronounForm == pronounForm)&&(identical(other.definiteArticle, definiteArticle) || other.definiteArticle == definiteArticle)&&(identical(other.numeralSeries, numeralSeries) || other.numeralSeries == numeralSeries)&&(identical(other.numeralPrefix, numeralPrefix) || other.numeralPrefix == numeralPrefix)&&(identical(other.presentForm, presentForm) || other.presentForm == presentForm)&&(identical(other.pastForm, pastForm) || other.pastForm == pastForm)&&(identical(other.futureForm, futureForm) || other.futureForm == futureForm)&&(identical(other.pluralSubjectForm, pluralSubjectForm) || other.pluralSubjectForm == pluralSubjectForm)&&(identical(other.imperativeForm, imperativeForm) || other.imperativeForm == imperativeForm)&&(identical(other.agreeingOneForm, agreeingOneForm) || other.agreeingOneForm == agreeingOneForm)&&(identical(other.agreeingTwoForm, agreeingTwoForm) || other.agreeingTwoForm == agreeingTwoForm)&&const DeepCollectionEquality().equals(other._alsoUsedAs, _alsoUsedAs)&&(identical(other.ipa, ipa) || other.ipa == ipa)&&(identical(other.kasemDefinition, kasemDefinition) || other.kasemDefinition == kasemDefinition)&&(identical(other.etymology, etymology) || other.etymology == etymology)&&(identical(other.nounClass, nounClass) || other.nounClass == nounClass)&&(identical(other.homographIndex, homographIndex) || other.homographIndex == homographIndex)&&const DeepCollectionEquality().equals(other._senses, _senses));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hashAll([runtimeType,id,headword,translation,const DeepCollectionEquality().hash(_translations),const DeepCollectionEquality().hash(_renderings),partOfSpeech,dialect,pronunciation,example,exampleTranslation,sentenceSource,tatoebaId,tatoebaContributor,sentenceLicence,attribution,culturalNote,audioUrl,definiteForm,pluralForm,pluralDefiniteForm,countedForm,pronounForm,definiteArticle,numeralSeries,numeralPrefix,presentForm,pastForm,futureForm,pluralSubjectForm,imperativeForm,agreeingOneForm,agreeingTwoForm,const DeepCollectionEquality().hash(_alsoUsedAs),ipa,kasemDefinition,etymology,nounClass,homographIndex,const DeepCollectionEquality().hash(_senses)]);

@override
String toString() {
  return 'DictionaryEntry(id: $id, headword: $headword, translation: $translation, translations: $translations, renderings: $renderings, partOfSpeech: $partOfSpeech, dialect: $dialect, pronunciation: $pronunciation, example: $example, exampleTranslation: $exampleTranslation, sentenceSource: $sentenceSource, tatoebaId: $tatoebaId, tatoebaContributor: $tatoebaContributor, sentenceLicence: $sentenceLicence, attribution: $attribution, culturalNote: $culturalNote, audioUrl: $audioUrl, definiteForm: $definiteForm, pluralForm: $pluralForm, pluralDefiniteForm: $pluralDefiniteForm, countedForm: $countedForm, pronounForm: $pronounForm, definiteArticle: $definiteArticle, numeralSeries: $numeralSeries, numeralPrefix: $numeralPrefix, presentForm: $presentForm, pastForm: $pastForm, futureForm: $futureForm, pluralSubjectForm: $pluralSubjectForm, imperativeForm: $imperativeForm, agreeingOneForm: $agreeingOneForm, agreeingTwoForm: $agreeingTwoForm, alsoUsedAs: $alsoUsedAs, ipa: $ipa, kasemDefinition: $kasemDefinition, etymology: $etymology, nounClass: $nounClass, homographIndex: $homographIndex, senses: $senses)';
}


}

/// @nodoc
abstract mixin class _$DictionaryEntryCopyWith<$Res> implements $DictionaryEntryCopyWith<$Res> {
  factory _$DictionaryEntryCopyWith(_DictionaryEntry value, $Res Function(_DictionaryEntry) _then) = __$DictionaryEntryCopyWithImpl;
@override @useResult
$Res call({
 String id, String headword, String translation, List<String> translations, List<String> renderings, String partOfSpeech, String dialect, String pronunciation, String example, String exampleTranslation, String sentenceSource, String tatoebaId, String tatoebaContributor, String sentenceLicence, String attribution, String? culturalNote, String audioUrl, String definiteForm, String pluralForm, String pluralDefiniteForm, String countedForm, String pronounForm, String definiteArticle, String numeralSeries, String numeralPrefix, String presentForm, String pastForm, String futureForm, String pluralSubjectForm, String imperativeForm, String agreeingOneForm, String agreeingTwoForm, List<String> alsoUsedAs, String ipa, String kasemDefinition, String etymology, String nounClass, int homographIndex,@EntrySenseListConverter() List<EntrySense> senses
});




}
/// @nodoc
class __$DictionaryEntryCopyWithImpl<$Res>
    implements _$DictionaryEntryCopyWith<$Res> {
  __$DictionaryEntryCopyWithImpl(this._self, this._then);

  final _DictionaryEntry _self;
  final $Res Function(_DictionaryEntry) _then;

/// Create a copy of DictionaryEntry
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? id = null,Object? headword = null,Object? translation = null,Object? translations = null,Object? renderings = null,Object? partOfSpeech = null,Object? dialect = null,Object? pronunciation = null,Object? example = null,Object? exampleTranslation = null,Object? sentenceSource = null,Object? tatoebaId = null,Object? tatoebaContributor = null,Object? sentenceLicence = null,Object? attribution = null,Object? culturalNote = freezed,Object? audioUrl = null,Object? definiteForm = null,Object? pluralForm = null,Object? pluralDefiniteForm = null,Object? countedForm = null,Object? pronounForm = null,Object? definiteArticle = null,Object? numeralSeries = null,Object? numeralPrefix = null,Object? presentForm = null,Object? pastForm = null,Object? futureForm = null,Object? pluralSubjectForm = null,Object? imperativeForm = null,Object? agreeingOneForm = null,Object? agreeingTwoForm = null,Object? alsoUsedAs = null,Object? ipa = null,Object? kasemDefinition = null,Object? etymology = null,Object? nounClass = null,Object? homographIndex = null,Object? senses = null,}) {
  return _then(_DictionaryEntry(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,headword: null == headword ? _self.headword : headword // ignore: cast_nullable_to_non_nullable
as String,translation: null == translation ? _self.translation : translation // ignore: cast_nullable_to_non_nullable
as String,translations: null == translations ? _self._translations : translations // ignore: cast_nullable_to_non_nullable
as List<String>,renderings: null == renderings ? _self._renderings : renderings // ignore: cast_nullable_to_non_nullable
as List<String>,partOfSpeech: null == partOfSpeech ? _self.partOfSpeech : partOfSpeech // ignore: cast_nullable_to_non_nullable
as String,dialect: null == dialect ? _self.dialect : dialect // ignore: cast_nullable_to_non_nullable
as String,pronunciation: null == pronunciation ? _self.pronunciation : pronunciation // ignore: cast_nullable_to_non_nullable
as String,example: null == example ? _self.example : example // ignore: cast_nullable_to_non_nullable
as String,exampleTranslation: null == exampleTranslation ? _self.exampleTranslation : exampleTranslation // ignore: cast_nullable_to_non_nullable
as String,sentenceSource: null == sentenceSource ? _self.sentenceSource : sentenceSource // ignore: cast_nullable_to_non_nullable
as String,tatoebaId: null == tatoebaId ? _self.tatoebaId : tatoebaId // ignore: cast_nullable_to_non_nullable
as String,tatoebaContributor: null == tatoebaContributor ? _self.tatoebaContributor : tatoebaContributor // ignore: cast_nullable_to_non_nullable
as String,sentenceLicence: null == sentenceLicence ? _self.sentenceLicence : sentenceLicence // ignore: cast_nullable_to_non_nullable
as String,attribution: null == attribution ? _self.attribution : attribution // ignore: cast_nullable_to_non_nullable
as String,culturalNote: freezed == culturalNote ? _self.culturalNote : culturalNote // ignore: cast_nullable_to_non_nullable
as String?,audioUrl: null == audioUrl ? _self.audioUrl : audioUrl // ignore: cast_nullable_to_non_nullable
as String,definiteForm: null == definiteForm ? _self.definiteForm : definiteForm // ignore: cast_nullable_to_non_nullable
as String,pluralForm: null == pluralForm ? _self.pluralForm : pluralForm // ignore: cast_nullable_to_non_nullable
as String,pluralDefiniteForm: null == pluralDefiniteForm ? _self.pluralDefiniteForm : pluralDefiniteForm // ignore: cast_nullable_to_non_nullable
as String,countedForm: null == countedForm ? _self.countedForm : countedForm // ignore: cast_nullable_to_non_nullable
as String,pronounForm: null == pronounForm ? _self.pronounForm : pronounForm // ignore: cast_nullable_to_non_nullable
as String,definiteArticle: null == definiteArticle ? _self.definiteArticle : definiteArticle // ignore: cast_nullable_to_non_nullable
as String,numeralSeries: null == numeralSeries ? _self.numeralSeries : numeralSeries // ignore: cast_nullable_to_non_nullable
as String,numeralPrefix: null == numeralPrefix ? _self.numeralPrefix : numeralPrefix // ignore: cast_nullable_to_non_nullable
as String,presentForm: null == presentForm ? _self.presentForm : presentForm // ignore: cast_nullable_to_non_nullable
as String,pastForm: null == pastForm ? _self.pastForm : pastForm // ignore: cast_nullable_to_non_nullable
as String,futureForm: null == futureForm ? _self.futureForm : futureForm // ignore: cast_nullable_to_non_nullable
as String,pluralSubjectForm: null == pluralSubjectForm ? _self.pluralSubjectForm : pluralSubjectForm // ignore: cast_nullable_to_non_nullable
as String,imperativeForm: null == imperativeForm ? _self.imperativeForm : imperativeForm // ignore: cast_nullable_to_non_nullable
as String,agreeingOneForm: null == agreeingOneForm ? _self.agreeingOneForm : agreeingOneForm // ignore: cast_nullable_to_non_nullable
as String,agreeingTwoForm: null == agreeingTwoForm ? _self.agreeingTwoForm : agreeingTwoForm // ignore: cast_nullable_to_non_nullable
as String,alsoUsedAs: null == alsoUsedAs ? _self._alsoUsedAs : alsoUsedAs // ignore: cast_nullable_to_non_nullable
as List<String>,ipa: null == ipa ? _self.ipa : ipa // ignore: cast_nullable_to_non_nullable
as String,kasemDefinition: null == kasemDefinition ? _self.kasemDefinition : kasemDefinition // ignore: cast_nullable_to_non_nullable
as String,etymology: null == etymology ? _self.etymology : etymology // ignore: cast_nullable_to_non_nullable
as String,nounClass: null == nounClass ? _self.nounClass : nounClass // ignore: cast_nullable_to_non_nullable
as String,homographIndex: null == homographIndex ? _self.homographIndex : homographIndex // ignore: cast_nullable_to_non_nullable
as int,senses: null == senses ? _self._senses : senses // ignore: cast_nullable_to_non_nullable
as List<EntrySense>,
  ));
}


}

// dart format on
