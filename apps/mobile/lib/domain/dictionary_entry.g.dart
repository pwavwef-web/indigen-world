// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'dictionary_entry.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_DictionaryEntry _$DictionaryEntryFromJson(Map<String, dynamic> json) =>
    _DictionaryEntry(
      id: json['id'] as String,
      headword: json['headword'] as String,
      translation: json['translation'] as String,
      partOfSpeech: json['partOfSpeech'] as String,
      dialect: json['dialect'] as String,
      pronunciation: json['pronunciation'] as String,
      example: json['example'] as String,
      exampleTranslation: json['exampleTranslation'] as String,
      attribution: json['attribution'] as String,
      culturalNote: json['culturalNote'] as String?,
      isSynthetic: json['isSynthetic'] as bool? ?? true,
    );

Map<String, dynamic> _$DictionaryEntryToJson(_DictionaryEntry instance) =>
    <String, dynamic>{
      'id': instance.id,
      'headword': instance.headword,
      'translation': instance.translation,
      'partOfSpeech': instance.partOfSpeech,
      'dialect': instance.dialect,
      'pronunciation': instance.pronunciation,
      'example': instance.example,
      'exampleTranslation': instance.exampleTranslation,
      'attribution': instance.attribution,
      'culturalNote': instance.culturalNote,
      'isSynthetic': instance.isSynthetic,
    };
