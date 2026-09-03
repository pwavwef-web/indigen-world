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
      translations:
          (json['translations'] as List<dynamic>?)
              ?.map((e) => e as String)
              .toList() ??
          const <String>[],
      renderings:
          (json['renderings'] as List<dynamic>?)
              ?.map((e) => e as String)
              .toList() ??
          const <String>[],
      partOfSpeech: json['partOfSpeech'] as String,
      dialect: json['dialect'] as String,
      pronunciation: json['pronunciation'] as String,
      example: json['example'] as String,
      exampleTranslation: json['exampleTranslation'] as String,
      sentenceSource: json['sentenceSource'] as String? ?? '',
      tatoebaId: json['tatoebaId'] as String? ?? '',
      tatoebaContributor: json['tatoebaContributor'] as String? ?? '',
      sentenceLicence: json['sentenceLicence'] as String? ?? '',
      attribution: json['attribution'] as String,
      culturalNote: json['culturalNote'] as String?,
      audioUrl: json['audioUrl'] as String? ?? '',
      definiteForm: json['definiteForm'] as String? ?? '',
      pluralForm: json['pluralForm'] as String? ?? '',
      nounClass: json['nounClass'] as String? ?? '',
      isSynthetic: json['isSynthetic'] as bool? ?? true,
    );

Map<String, dynamic> _$DictionaryEntryToJson(_DictionaryEntry instance) =>
    <String, dynamic>{
      'id': instance.id,
      'headword': instance.headword,
      'translation': instance.translation,
      'translations': instance.translations,
      'renderings': instance.renderings,
      'partOfSpeech': instance.partOfSpeech,
      'dialect': instance.dialect,
      'pronunciation': instance.pronunciation,
      'example': instance.example,
      'exampleTranslation': instance.exampleTranslation,
      'sentenceSource': instance.sentenceSource,
      'tatoebaId': instance.tatoebaId,
      'tatoebaContributor': instance.tatoebaContributor,
      'sentenceLicence': instance.sentenceLicence,
      'attribution': instance.attribution,
      'culturalNote': instance.culturalNote,
      'audioUrl': instance.audioUrl,
      'definiteForm': instance.definiteForm,
      'pluralForm': instance.pluralForm,
      'nounClass': instance.nounClass,
      'isSynthetic': instance.isSynthetic,
    };
