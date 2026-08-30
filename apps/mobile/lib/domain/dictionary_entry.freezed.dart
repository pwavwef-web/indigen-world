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

 String get id; String get headword; String get translation; String get partOfSpeech; String get dialect; String get pronunciation; String get example; String get exampleTranslation; String get attribution; String? get culturalNote;/// A published recording of the headword being said, or empty where the
/// entry has none.
///
/// Separate from [pronunciation], which is the written guide. The two used
/// to share one field, so an entry with audio showed a download URL where
/// its phonetics belonged and still had nothing to play.
 String get audioUrl; bool get isSynthetic;
/// Create a copy of DictionaryEntry
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$DictionaryEntryCopyWith<DictionaryEntry> get copyWith => _$DictionaryEntryCopyWithImpl<DictionaryEntry>(this as DictionaryEntry, _$identity);

  /// Serializes this DictionaryEntry to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is DictionaryEntry&&(identical(other.id, id) || other.id == id)&&(identical(other.headword, headword) || other.headword == headword)&&(identical(other.translation, translation) || other.translation == translation)&&(identical(other.partOfSpeech, partOfSpeech) || other.partOfSpeech == partOfSpeech)&&(identical(other.dialect, dialect) || other.dialect == dialect)&&(identical(other.pronunciation, pronunciation) || other.pronunciation == pronunciation)&&(identical(other.example, example) || other.example == example)&&(identical(other.exampleTranslation, exampleTranslation) || other.exampleTranslation == exampleTranslation)&&(identical(other.attribution, attribution) || other.attribution == attribution)&&(identical(other.culturalNote, culturalNote) || other.culturalNote == culturalNote)&&(identical(other.audioUrl, audioUrl) || other.audioUrl == audioUrl)&&(identical(other.isSynthetic, isSynthetic) || other.isSynthetic == isSynthetic));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,id,headword,translation,partOfSpeech,dialect,pronunciation,example,exampleTranslation,attribution,culturalNote,audioUrl,isSynthetic);

@override
String toString() {
  return 'DictionaryEntry(id: $id, headword: $headword, translation: $translation, partOfSpeech: $partOfSpeech, dialect: $dialect, pronunciation: $pronunciation, example: $example, exampleTranslation: $exampleTranslation, attribution: $attribution, culturalNote: $culturalNote, audioUrl: $audioUrl, isSynthetic: $isSynthetic)';
}


}

/// @nodoc
abstract mixin class $DictionaryEntryCopyWith<$Res>  {
  factory $DictionaryEntryCopyWith(DictionaryEntry value, $Res Function(DictionaryEntry) _then) = _$DictionaryEntryCopyWithImpl;
@useResult
$Res call({
 String id, String headword, String translation, String partOfSpeech, String dialect, String pronunciation, String example, String exampleTranslation, String attribution, String? culturalNote, String audioUrl, bool isSynthetic
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
@pragma('vm:prefer-inline') @override $Res call({Object? id = null,Object? headword = null,Object? translation = null,Object? partOfSpeech = null,Object? dialect = null,Object? pronunciation = null,Object? example = null,Object? exampleTranslation = null,Object? attribution = null,Object? culturalNote = freezed,Object? audioUrl = null,Object? isSynthetic = null,}) {
  return _then(DictionaryEntry(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,headword: null == headword ? _self.headword : headword // ignore: cast_nullable_to_non_nullable
as String,translation: null == translation ? _self.translation : translation // ignore: cast_nullable_to_non_nullable
as String,partOfSpeech: null == partOfSpeech ? _self.partOfSpeech : partOfSpeech // ignore: cast_nullable_to_non_nullable
as String,dialect: null == dialect ? _self.dialect : dialect // ignore: cast_nullable_to_non_nullable
as String,pronunciation: null == pronunciation ? _self.pronunciation : pronunciation // ignore: cast_nullable_to_non_nullable
as String,example: null == example ? _self.example : example // ignore: cast_nullable_to_non_nullable
as String,exampleTranslation: null == exampleTranslation ? _self.exampleTranslation : exampleTranslation // ignore: cast_nullable_to_non_nullable
as String,attribution: null == attribution ? _self.attribution : attribution // ignore: cast_nullable_to_non_nullable
as String,culturalNote: freezed == culturalNote ? _self.culturalNote : culturalNote // ignore: cast_nullable_to_non_nullable
as String?,audioUrl: null == audioUrl ? _self.audioUrl : audioUrl // ignore: cast_nullable_to_non_nullable
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String id,  String headword,  String translation,  String partOfSpeech,  String dialect,  String pronunciation,  String example,  String exampleTranslation,  String attribution,  String? culturalNote,  String audioUrl,  bool isSynthetic)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _DictionaryEntry() when $default != null:
return $default(_that.id,_that.headword,_that.translation,_that.partOfSpeech,_that.dialect,_that.pronunciation,_that.example,_that.exampleTranslation,_that.attribution,_that.culturalNote,_that.audioUrl,_that.isSynthetic);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String id,  String headword,  String translation,  String partOfSpeech,  String dialect,  String pronunciation,  String example,  String exampleTranslation,  String attribution,  String? culturalNote,  String audioUrl,  bool isSynthetic)  $default,) {final _that = this;
switch (_that) {
case _DictionaryEntry():
return $default(_that.id,_that.headword,_that.translation,_that.partOfSpeech,_that.dialect,_that.pronunciation,_that.example,_that.exampleTranslation,_that.attribution,_that.culturalNote,_that.audioUrl,_that.isSynthetic);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String id,  String headword,  String translation,  String partOfSpeech,  String dialect,  String pronunciation,  String example,  String exampleTranslation,  String attribution,  String? culturalNote,  String audioUrl,  bool isSynthetic)?  $default,) {final _that = this;
switch (_that) {
case _DictionaryEntry() when $default != null:
return $default(_that.id,_that.headword,_that.translation,_that.partOfSpeech,_that.dialect,_that.pronunciation,_that.example,_that.exampleTranslation,_that.attribution,_that.culturalNote,_that.audioUrl,_that.isSynthetic);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _DictionaryEntry extends DictionaryEntry {
  const _DictionaryEntry({required this.id, required this.headword, required this.translation, required this.partOfSpeech, required this.dialect, required this.pronunciation, required this.example, required this.exampleTranslation, required this.attribution, this.culturalNote, this.audioUrl = '', this.isSynthetic = true}): super._();
  factory _DictionaryEntry.fromJson(Map<String, dynamic> json) => _$DictionaryEntryFromJson(json);

@override final  String id;
@override final  String headword;
@override final  String translation;
@override final  String partOfSpeech;
@override final  String dialect;
@override final  String pronunciation;
@override final  String example;
@override final  String exampleTranslation;
@override final  String attribution;
@override final  String? culturalNote;
/// A published recording of the headword being said, or empty where the
/// entry has none.
///
/// Separate from [pronunciation], which is the written guide. The two used
/// to share one field, so an entry with audio showed a download URL where
/// its phonetics belonged and still had nothing to play.
@override@JsonKey() final  String audioUrl;
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
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _DictionaryEntry&&(identical(other.id, id) || other.id == id)&&(identical(other.headword, headword) || other.headword == headword)&&(identical(other.translation, translation) || other.translation == translation)&&(identical(other.partOfSpeech, partOfSpeech) || other.partOfSpeech == partOfSpeech)&&(identical(other.dialect, dialect) || other.dialect == dialect)&&(identical(other.pronunciation, pronunciation) || other.pronunciation == pronunciation)&&(identical(other.example, example) || other.example == example)&&(identical(other.exampleTranslation, exampleTranslation) || other.exampleTranslation == exampleTranslation)&&(identical(other.attribution, attribution) || other.attribution == attribution)&&(identical(other.culturalNote, culturalNote) || other.culturalNote == culturalNote)&&(identical(other.audioUrl, audioUrl) || other.audioUrl == audioUrl)&&(identical(other.isSynthetic, isSynthetic) || other.isSynthetic == isSynthetic));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,id,headword,translation,partOfSpeech,dialect,pronunciation,example,exampleTranslation,attribution,culturalNote,audioUrl,isSynthetic);

@override
String toString() {
  return 'DictionaryEntry(id: $id, headword: $headword, translation: $translation, partOfSpeech: $partOfSpeech, dialect: $dialect, pronunciation: $pronunciation, example: $example, exampleTranslation: $exampleTranslation, attribution: $attribution, culturalNote: $culturalNote, audioUrl: $audioUrl, isSynthetic: $isSynthetic)';
}


}

/// @nodoc
abstract mixin class _$DictionaryEntryCopyWith<$Res> implements $DictionaryEntryCopyWith<$Res> {
  factory _$DictionaryEntryCopyWith(_DictionaryEntry value, $Res Function(_DictionaryEntry) _then) = __$DictionaryEntryCopyWithImpl;
@override @useResult
$Res call({
 String id, String headword, String translation, String partOfSpeech, String dialect, String pronunciation, String example, String exampleTranslation, String attribution, String? culturalNote, String audioUrl, bool isSynthetic
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
@override @pragma('vm:prefer-inline') $Res call({Object? id = null,Object? headword = null,Object? translation = null,Object? partOfSpeech = null,Object? dialect = null,Object? pronunciation = null,Object? example = null,Object? exampleTranslation = null,Object? attribution = null,Object? culturalNote = freezed,Object? audioUrl = null,Object? isSynthetic = null,}) {
  return _then(_DictionaryEntry(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,headword: null == headword ? _self.headword : headword // ignore: cast_nullable_to_non_nullable
as String,translation: null == translation ? _self.translation : translation // ignore: cast_nullable_to_non_nullable
as String,partOfSpeech: null == partOfSpeech ? _self.partOfSpeech : partOfSpeech // ignore: cast_nullable_to_non_nullable
as String,dialect: null == dialect ? _self.dialect : dialect // ignore: cast_nullable_to_non_nullable
as String,pronunciation: null == pronunciation ? _self.pronunciation : pronunciation // ignore: cast_nullable_to_non_nullable
as String,example: null == example ? _self.example : example // ignore: cast_nullable_to_non_nullable
as String,exampleTranslation: null == exampleTranslation ? _self.exampleTranslation : exampleTranslation // ignore: cast_nullable_to_non_nullable
as String,attribution: null == attribution ? _self.attribution : attribution // ignore: cast_nullable_to_non_nullable
as String,culturalNote: freezed == culturalNote ? _self.culturalNote : culturalNote // ignore: cast_nullable_to_non_nullable
as String?,audioUrl: null == audioUrl ? _self.audioUrl : audioUrl // ignore: cast_nullable_to_non_nullable
as String,isSynthetic: null == isSynthetic ? _self.isSynthetic : isSynthetic // ignore: cast_nullable_to_non_nullable
as bool,
  ));
}


}

// dart format on
