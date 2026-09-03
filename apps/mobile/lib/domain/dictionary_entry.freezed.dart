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
 String get definiteForm; String get pluralForm;/// The noun class, worked out from [definiteForm] when it could be.
///
/// Empty means *not established*, which is the honest answer and by far
/// the common one — the class inventory is being built from contributed
/// forms rather than assumed in advance. It never means "no class".
 String get nounClass; bool get isSynthetic;
/// Create a copy of DictionaryEntry
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$DictionaryEntryCopyWith<DictionaryEntry> get copyWith => _$DictionaryEntryCopyWithImpl<DictionaryEntry>(this as DictionaryEntry, _$identity);

  /// Serializes this DictionaryEntry to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is DictionaryEntry&&(identical(other.id, id) || other.id == id)&&(identical(other.headword, headword) || other.headword == headword)&&(identical(other.translation, translation) || other.translation == translation)&&const DeepCollectionEquality().equals(other.translations, translations)&&const DeepCollectionEquality().equals(other.renderings, renderings)&&(identical(other.partOfSpeech, partOfSpeech) || other.partOfSpeech == partOfSpeech)&&(identical(other.dialect, dialect) || other.dialect == dialect)&&(identical(other.pronunciation, pronunciation) || other.pronunciation == pronunciation)&&(identical(other.example, example) || other.example == example)&&(identical(other.exampleTranslation, exampleTranslation) || other.exampleTranslation == exampleTranslation)&&(identical(other.sentenceSource, sentenceSource) || other.sentenceSource == sentenceSource)&&(identical(other.tatoebaId, tatoebaId) || other.tatoebaId == tatoebaId)&&(identical(other.tatoebaContributor, tatoebaContributor) || other.tatoebaContributor == tatoebaContributor)&&(identical(other.sentenceLicence, sentenceLicence) || other.sentenceLicence == sentenceLicence)&&(identical(other.attribution, attribution) || other.attribution == attribution)&&(identical(other.culturalNote, culturalNote) || other.culturalNote == culturalNote)&&(identical(other.audioUrl, audioUrl) || other.audioUrl == audioUrl)&&(identical(other.definiteForm, definiteForm) || other.definiteForm == definiteForm)&&(identical(other.pluralForm, pluralForm) || other.pluralForm == pluralForm)&&(identical(other.nounClass, nounClass) || other.nounClass == nounClass)&&(identical(other.isSynthetic, isSynthetic) || other.isSynthetic == isSynthetic));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hashAll([runtimeType,id,headword,translation,const DeepCollectionEquality().hash(translations),const DeepCollectionEquality().hash(renderings),partOfSpeech,dialect,pronunciation,example,exampleTranslation,sentenceSource,tatoebaId,tatoebaContributor,sentenceLicence,attribution,culturalNote,audioUrl,definiteForm,pluralForm,nounClass,isSynthetic]);

@override
String toString() {
  return 'DictionaryEntry(id: $id, headword: $headword, translation: $translation, translations: $translations, renderings: $renderings, partOfSpeech: $partOfSpeech, dialect: $dialect, pronunciation: $pronunciation, example: $example, exampleTranslation: $exampleTranslation, sentenceSource: $sentenceSource, tatoebaId: $tatoebaId, tatoebaContributor: $tatoebaContributor, sentenceLicence: $sentenceLicence, attribution: $attribution, culturalNote: $culturalNote, audioUrl: $audioUrl, definiteForm: $definiteForm, pluralForm: $pluralForm, nounClass: $nounClass, isSynthetic: $isSynthetic)';
}


}

/// @nodoc
abstract mixin class $DictionaryEntryCopyWith<$Res>  {
  factory $DictionaryEntryCopyWith(DictionaryEntry value, $Res Function(DictionaryEntry) _then) = _$DictionaryEntryCopyWithImpl;
@useResult
$Res call({
 String id, String headword, String translation, List<String> translations, List<String> renderings, String partOfSpeech, String dialect, String pronunciation, String example, String exampleTranslation, String sentenceSource, String tatoebaId, String tatoebaContributor, String sentenceLicence, String attribution, String? culturalNote, String audioUrl, String definiteForm, String pluralForm, String nounClass, bool isSynthetic
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
@pragma('vm:prefer-inline') @override $Res call({Object? id = null,Object? headword = null,Object? translation = null,Object? translations = null,Object? renderings = null,Object? partOfSpeech = null,Object? dialect = null,Object? pronunciation = null,Object? example = null,Object? exampleTranslation = null,Object? sentenceSource = null,Object? tatoebaId = null,Object? tatoebaContributor = null,Object? sentenceLicence = null,Object? attribution = null,Object? culturalNote = freezed,Object? audioUrl = null,Object? definiteForm = null,Object? pluralForm = null,Object? nounClass = null,Object? isSynthetic = null,}) {
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
as String,nounClass: null == nounClass ? _self.nounClass : nounClass // ignore: cast_nullable_to_non_nullable
as String,isSynthetic: null == isSynthetic ? _self.isSynthetic : isSynthetic // ignore: cast_nullable_to_non_nullable
as bool,
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String id,  String headword,  String translation,  List<String> translations,  List<String> renderings,  String partOfSpeech,  String dialect,  String pronunciation,  String example,  String exampleTranslation,  String sentenceSource,  String tatoebaId,  String tatoebaContributor,  String sentenceLicence,  String attribution,  String? culturalNote,  String audioUrl,  String definiteForm,  String pluralForm,  String nounClass,  bool isSynthetic)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _DictionaryEntry() when $default != null:
return $default(_that.id,_that.headword,_that.translation,_that.translations,_that.renderings,_that.partOfSpeech,_that.dialect,_that.pronunciation,_that.example,_that.exampleTranslation,_that.sentenceSource,_that.tatoebaId,_that.tatoebaContributor,_that.sentenceLicence,_that.attribution,_that.culturalNote,_that.audioUrl,_that.definiteForm,_that.pluralForm,_that.nounClass,_that.isSynthetic);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String id,  String headword,  String translation,  List<String> translations,  List<String> renderings,  String partOfSpeech,  String dialect,  String pronunciation,  String example,  String exampleTranslation,  String sentenceSource,  String tatoebaId,  String tatoebaContributor,  String sentenceLicence,  String attribution,  String? culturalNote,  String audioUrl,  String definiteForm,  String pluralForm,  String nounClass,  bool isSynthetic)  $default,) {final _that = this;
switch (_that) {
case _DictionaryEntry():
return $default(_that.id,_that.headword,_that.translation,_that.translations,_that.renderings,_that.partOfSpeech,_that.dialect,_that.pronunciation,_that.example,_that.exampleTranslation,_that.sentenceSource,_that.tatoebaId,_that.tatoebaContributor,_that.sentenceLicence,_that.attribution,_that.culturalNote,_that.audioUrl,_that.definiteForm,_that.pluralForm,_that.nounClass,_that.isSynthetic);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String id,  String headword,  String translation,  List<String> translations,  List<String> renderings,  String partOfSpeech,  String dialect,  String pronunciation,  String example,  String exampleTranslation,  String sentenceSource,  String tatoebaId,  String tatoebaContributor,  String sentenceLicence,  String attribution,  String? culturalNote,  String audioUrl,  String definiteForm,  String pluralForm,  String nounClass,  bool isSynthetic)?  $default,) {final _that = this;
switch (_that) {
case _DictionaryEntry() when $default != null:
return $default(_that.id,_that.headword,_that.translation,_that.translations,_that.renderings,_that.partOfSpeech,_that.dialect,_that.pronunciation,_that.example,_that.exampleTranslation,_that.sentenceSource,_that.tatoebaId,_that.tatoebaContributor,_that.sentenceLicence,_that.attribution,_that.culturalNote,_that.audioUrl,_that.definiteForm,_that.pluralForm,_that.nounClass,_that.isSynthetic);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _DictionaryEntry extends DictionaryEntry {
  const _DictionaryEntry({required this.id, required this.headword, required this.translation,  List<String> translations = const <String>[],  List<String> renderings = const <String>[], required this.partOfSpeech, required this.dialect, required this.pronunciation, required this.example, required this.exampleTranslation, this.sentenceSource = '', this.tatoebaId = '', this.tatoebaContributor = '', this.sentenceLicence = '', required this.attribution, this.culturalNote, this.audioUrl = '', this.definiteForm = '', this.pluralForm = '', this.nounClass = '', this.isSynthetic = true}): _translations = translations,_renderings = renderings,super._();
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
/// The noun class, worked out from [definiteForm] when it could be.
///
/// Empty means *not established*, which is the honest answer and by far
/// the common one — the class inventory is being built from contributed
/// forms rather than assumed in advance. It never means "no class".
@override@JsonKey() final  String nounClass;
@override@JsonKey() final  bool isSynthetic;

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
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _DictionaryEntry&&(identical(other.id, id) || other.id == id)&&(identical(other.headword, headword) || other.headword == headword)&&(identical(other.translation, translation) || other.translation == translation)&&const DeepCollectionEquality().equals(other._translations, _translations)&&const DeepCollectionEquality().equals(other._renderings, _renderings)&&(identical(other.partOfSpeech, partOfSpeech) || other.partOfSpeech == partOfSpeech)&&(identical(other.dialect, dialect) || other.dialect == dialect)&&(identical(other.pronunciation, pronunciation) || other.pronunciation == pronunciation)&&(identical(other.example, example) || other.example == example)&&(identical(other.exampleTranslation, exampleTranslation) || other.exampleTranslation == exampleTranslation)&&(identical(other.sentenceSource, sentenceSource) || other.sentenceSource == sentenceSource)&&(identical(other.tatoebaId, tatoebaId) || other.tatoebaId == tatoebaId)&&(identical(other.tatoebaContributor, tatoebaContributor) || other.tatoebaContributor == tatoebaContributor)&&(identical(other.sentenceLicence, sentenceLicence) || other.sentenceLicence == sentenceLicence)&&(identical(other.attribution, attribution) || other.attribution == attribution)&&(identical(other.culturalNote, culturalNote) || other.culturalNote == culturalNote)&&(identical(other.audioUrl, audioUrl) || other.audioUrl == audioUrl)&&(identical(other.definiteForm, definiteForm) || other.definiteForm == definiteForm)&&(identical(other.pluralForm, pluralForm) || other.pluralForm == pluralForm)&&(identical(other.nounClass, nounClass) || other.nounClass == nounClass)&&(identical(other.isSynthetic, isSynthetic) || other.isSynthetic == isSynthetic));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hashAll([runtimeType,id,headword,translation,const DeepCollectionEquality().hash(_translations),const DeepCollectionEquality().hash(_renderings),partOfSpeech,dialect,pronunciation,example,exampleTranslation,sentenceSource,tatoebaId,tatoebaContributor,sentenceLicence,attribution,culturalNote,audioUrl,definiteForm,pluralForm,nounClass,isSynthetic]);

@override
String toString() {
  return 'DictionaryEntry(id: $id, headword: $headword, translation: $translation, translations: $translations, renderings: $renderings, partOfSpeech: $partOfSpeech, dialect: $dialect, pronunciation: $pronunciation, example: $example, exampleTranslation: $exampleTranslation, sentenceSource: $sentenceSource, tatoebaId: $tatoebaId, tatoebaContributor: $tatoebaContributor, sentenceLicence: $sentenceLicence, attribution: $attribution, culturalNote: $culturalNote, audioUrl: $audioUrl, definiteForm: $definiteForm, pluralForm: $pluralForm, nounClass: $nounClass, isSynthetic: $isSynthetic)';
}


}

/// @nodoc
abstract mixin class _$DictionaryEntryCopyWith<$Res> implements $DictionaryEntryCopyWith<$Res> {
  factory _$DictionaryEntryCopyWith(_DictionaryEntry value, $Res Function(_DictionaryEntry) _then) = __$DictionaryEntryCopyWithImpl;
@override @useResult
$Res call({
 String id, String headword, String translation, List<String> translations, List<String> renderings, String partOfSpeech, String dialect, String pronunciation, String example, String exampleTranslation, String sentenceSource, String tatoebaId, String tatoebaContributor, String sentenceLicence, String attribution, String? culturalNote, String audioUrl, String definiteForm, String pluralForm, String nounClass, bool isSynthetic
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
@override @pragma('vm:prefer-inline') $Res call({Object? id = null,Object? headword = null,Object? translation = null,Object? translations = null,Object? renderings = null,Object? partOfSpeech = null,Object? dialect = null,Object? pronunciation = null,Object? example = null,Object? exampleTranslation = null,Object? sentenceSource = null,Object? tatoebaId = null,Object? tatoebaContributor = null,Object? sentenceLicence = null,Object? attribution = null,Object? culturalNote = freezed,Object? audioUrl = null,Object? definiteForm = null,Object? pluralForm = null,Object? nounClass = null,Object? isSynthetic = null,}) {
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
as String,nounClass: null == nounClass ? _self.nounClass : nounClass // ignore: cast_nullable_to_non_nullable
as String,isSynthetic: null == isSynthetic ? _self.isSynthetic : isSynthetic // ignore: cast_nullable_to_non_nullable
as bool,
  ));
}


}

// dart format on
