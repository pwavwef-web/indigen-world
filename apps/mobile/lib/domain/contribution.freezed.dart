// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint, type=warning, deprecated_member_use, deprecated_member_use_from_same_package
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'contribution.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// dart format off
T _$identity<T>(T value) => value;

/// @nodoc
mixin _$Contribution {

 String get id; String get sourceText; String get targetText; String get dialect; String get knowledgeBasis; DateTime get createdAt; ContributionStatus get status; String get partOfSpeech; String get notes; String? get relatedEntryId; bool get rightsConfirmed;
/// Create a copy of Contribution
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$ContributionCopyWith<Contribution> get copyWith => _$ContributionCopyWithImpl<Contribution>(this as Contribution, _$identity);

  /// Serializes this Contribution to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is Contribution&&(identical(other.id, id) || other.id == id)&&(identical(other.sourceText, sourceText) || other.sourceText == sourceText)&&(identical(other.targetText, targetText) || other.targetText == targetText)&&(identical(other.dialect, dialect) || other.dialect == dialect)&&(identical(other.knowledgeBasis, knowledgeBasis) || other.knowledgeBasis == knowledgeBasis)&&(identical(other.createdAt, createdAt) || other.createdAt == createdAt)&&(identical(other.status, status) || other.status == status)&&(identical(other.partOfSpeech, partOfSpeech) || other.partOfSpeech == partOfSpeech)&&(identical(other.notes, notes) || other.notes == notes)&&(identical(other.relatedEntryId, relatedEntryId) || other.relatedEntryId == relatedEntryId)&&(identical(other.rightsConfirmed, rightsConfirmed) || other.rightsConfirmed == rightsConfirmed));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,id,sourceText,targetText,dialect,knowledgeBasis,createdAt,status,partOfSpeech,notes,relatedEntryId,rightsConfirmed);

@override
String toString() {
  return 'Contribution(id: $id, sourceText: $sourceText, targetText: $targetText, dialect: $dialect, knowledgeBasis: $knowledgeBasis, createdAt: $createdAt, status: $status, partOfSpeech: $partOfSpeech, notes: $notes, relatedEntryId: $relatedEntryId, rightsConfirmed: $rightsConfirmed)';
}


}

/// @nodoc
abstract mixin class $ContributionCopyWith<$Res>  {
  factory $ContributionCopyWith(Contribution value, $Res Function(Contribution) _then) = _$ContributionCopyWithImpl;
@useResult
$Res call({
 String id, String sourceText, String targetText, String dialect, String knowledgeBasis, DateTime createdAt, ContributionStatus status, String partOfSpeech, String notes, String? relatedEntryId, bool rightsConfirmed
});




}
/// @nodoc
class _$ContributionCopyWithImpl<$Res>
    implements $ContributionCopyWith<$Res> {
  _$ContributionCopyWithImpl(this._self, this._then);

  final Contribution _self;
  final $Res Function(Contribution) _then;

/// Create a copy of Contribution
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? id = null,Object? sourceText = null,Object? targetText = null,Object? dialect = null,Object? knowledgeBasis = null,Object? createdAt = null,Object? status = null,Object? partOfSpeech = null,Object? notes = null,Object? relatedEntryId = freezed,Object? rightsConfirmed = null,}) {
  return _then(Contribution(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,sourceText: null == sourceText ? _self.sourceText : sourceText // ignore: cast_nullable_to_non_nullable
as String,targetText: null == targetText ? _self.targetText : targetText // ignore: cast_nullable_to_non_nullable
as String,dialect: null == dialect ? _self.dialect : dialect // ignore: cast_nullable_to_non_nullable
as String,knowledgeBasis: null == knowledgeBasis ? _self.knowledgeBasis : knowledgeBasis // ignore: cast_nullable_to_non_nullable
as String,createdAt: null == createdAt ? _self.createdAt : createdAt // ignore: cast_nullable_to_non_nullable
as DateTime,status: null == status ? _self.status : status // ignore: cast_nullable_to_non_nullable
as ContributionStatus,partOfSpeech: null == partOfSpeech ? _self.partOfSpeech : partOfSpeech // ignore: cast_nullable_to_non_nullable
as String,notes: null == notes ? _self.notes : notes // ignore: cast_nullable_to_non_nullable
as String,relatedEntryId: freezed == relatedEntryId ? _self.relatedEntryId : relatedEntryId // ignore: cast_nullable_to_non_nullable
as String?,rightsConfirmed: null == rightsConfirmed ? _self.rightsConfirmed : rightsConfirmed // ignore: cast_nullable_to_non_nullable
as bool,
  ));
}

}


/// Adds pattern-matching-related methods to [Contribution].
extension ContributionPatterns on Contribution {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _Contribution value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _Contribution() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _Contribution value)  $default,){
final _that = this;
switch (_that) {
case _Contribution():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _Contribution value)?  $default,){
final _that = this;
switch (_that) {
case _Contribution() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String id,  String sourceText,  String targetText,  String dialect,  String knowledgeBasis,  DateTime createdAt,  ContributionStatus status,  String partOfSpeech,  String notes,  String? relatedEntryId,  bool rightsConfirmed)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _Contribution() when $default != null:
return $default(_that.id,_that.sourceText,_that.targetText,_that.dialect,_that.knowledgeBasis,_that.createdAt,_that.status,_that.partOfSpeech,_that.notes,_that.relatedEntryId,_that.rightsConfirmed);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String id,  String sourceText,  String targetText,  String dialect,  String knowledgeBasis,  DateTime createdAt,  ContributionStatus status,  String partOfSpeech,  String notes,  String? relatedEntryId,  bool rightsConfirmed)  $default,) {final _that = this;
switch (_that) {
case _Contribution():
return $default(_that.id,_that.sourceText,_that.targetText,_that.dialect,_that.knowledgeBasis,_that.createdAt,_that.status,_that.partOfSpeech,_that.notes,_that.relatedEntryId,_that.rightsConfirmed);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String id,  String sourceText,  String targetText,  String dialect,  String knowledgeBasis,  DateTime createdAt,  ContributionStatus status,  String partOfSpeech,  String notes,  String? relatedEntryId,  bool rightsConfirmed)?  $default,) {final _that = this;
switch (_that) {
case _Contribution() when $default != null:
return $default(_that.id,_that.sourceText,_that.targetText,_that.dialect,_that.knowledgeBasis,_that.createdAt,_that.status,_that.partOfSpeech,_that.notes,_that.relatedEntryId,_that.rightsConfirmed);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _Contribution implements Contribution {
  const _Contribution({required this.id, required this.sourceText, required this.targetText, required this.dialect, required this.knowledgeBasis, required this.createdAt, required this.status, this.partOfSpeech = 'Not selected', this.notes = '', this.relatedEntryId, this.rightsConfirmed = false});
  factory _Contribution.fromJson(Map<String, dynamic> json) => _$ContributionFromJson(json);

@override final  String id;
@override final  String sourceText;
@override final  String targetText;
@override final  String dialect;
@override final  String knowledgeBasis;
@override final  DateTime createdAt;
@override final  ContributionStatus status;
@override@JsonKey() final  String partOfSpeech;
@override@JsonKey() final  String notes;
@override final  String? relatedEntryId;
@override@JsonKey() final  bool rightsConfirmed;

/// Create a copy of Contribution
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$ContributionCopyWith<_Contribution> get copyWith => __$ContributionCopyWithImpl<_Contribution>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$ContributionToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _Contribution&&(identical(other.id, id) || other.id == id)&&(identical(other.sourceText, sourceText) || other.sourceText == sourceText)&&(identical(other.targetText, targetText) || other.targetText == targetText)&&(identical(other.dialect, dialect) || other.dialect == dialect)&&(identical(other.knowledgeBasis, knowledgeBasis) || other.knowledgeBasis == knowledgeBasis)&&(identical(other.createdAt, createdAt) || other.createdAt == createdAt)&&(identical(other.status, status) || other.status == status)&&(identical(other.partOfSpeech, partOfSpeech) || other.partOfSpeech == partOfSpeech)&&(identical(other.notes, notes) || other.notes == notes)&&(identical(other.relatedEntryId, relatedEntryId) || other.relatedEntryId == relatedEntryId)&&(identical(other.rightsConfirmed, rightsConfirmed) || other.rightsConfirmed == rightsConfirmed));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,id,sourceText,targetText,dialect,knowledgeBasis,createdAt,status,partOfSpeech,notes,relatedEntryId,rightsConfirmed);

@override
String toString() {
  return 'Contribution(id: $id, sourceText: $sourceText, targetText: $targetText, dialect: $dialect, knowledgeBasis: $knowledgeBasis, createdAt: $createdAt, status: $status, partOfSpeech: $partOfSpeech, notes: $notes, relatedEntryId: $relatedEntryId, rightsConfirmed: $rightsConfirmed)';
}


}

/// @nodoc
abstract mixin class _$ContributionCopyWith<$Res> implements $ContributionCopyWith<$Res> {
  factory _$ContributionCopyWith(_Contribution value, $Res Function(_Contribution) _then) = __$ContributionCopyWithImpl;
@override @useResult
$Res call({
 String id, String sourceText, String targetText, String dialect, String knowledgeBasis, DateTime createdAt, ContributionStatus status, String partOfSpeech, String notes, String? relatedEntryId, bool rightsConfirmed
});




}
/// @nodoc
class __$ContributionCopyWithImpl<$Res>
    implements _$ContributionCopyWith<$Res> {
  __$ContributionCopyWithImpl(this._self, this._then);

  final _Contribution _self;
  final $Res Function(_Contribution) _then;

/// Create a copy of Contribution
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? id = null,Object? sourceText = null,Object? targetText = null,Object? dialect = null,Object? knowledgeBasis = null,Object? createdAt = null,Object? status = null,Object? partOfSpeech = null,Object? notes = null,Object? relatedEntryId = freezed,Object? rightsConfirmed = null,}) {
  return _then(_Contribution(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,sourceText: null == sourceText ? _self.sourceText : sourceText // ignore: cast_nullable_to_non_nullable
as String,targetText: null == targetText ? _self.targetText : targetText // ignore: cast_nullable_to_non_nullable
as String,dialect: null == dialect ? _self.dialect : dialect // ignore: cast_nullable_to_non_nullable
as String,knowledgeBasis: null == knowledgeBasis ? _self.knowledgeBasis : knowledgeBasis // ignore: cast_nullable_to_non_nullable
as String,createdAt: null == createdAt ? _self.createdAt : createdAt // ignore: cast_nullable_to_non_nullable
as DateTime,status: null == status ? _self.status : status // ignore: cast_nullable_to_non_nullable
as ContributionStatus,partOfSpeech: null == partOfSpeech ? _self.partOfSpeech : partOfSpeech // ignore: cast_nullable_to_non_nullable
as String,notes: null == notes ? _self.notes : notes // ignore: cast_nullable_to_non_nullable
as String,relatedEntryId: freezed == relatedEntryId ? _self.relatedEntryId : relatedEntryId // ignore: cast_nullable_to_non_nullable
as String?,rightsConfirmed: null == rightsConfirmed ? _self.rightsConfirmed : rightsConfirmed // ignore: cast_nullable_to_non_nullable
as bool,
  ));
}


}

// dart format on
