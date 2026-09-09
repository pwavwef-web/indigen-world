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
      pluralDefiniteForm: json['pluralDefiniteForm'] as String? ?? '',
      countedForm: json['countedForm'] as String? ?? '',
      pronounForm: json['pronounForm'] as String? ?? '',
      definiteArticle: json['definiteArticle'] as String? ?? '',
      numeralSeries: json['numeralSeries'] as String? ?? '',
      numeralPrefix: json['numeralPrefix'] as String? ?? '',
      presentForm: json['presentForm'] as String? ?? '',
      pastForm: json['pastForm'] as String? ?? '',
      futureForm: json['futureForm'] as String? ?? '',
      pluralSubjectForm: json['pluralSubjectForm'] as String? ?? '',
      imperativeForm: json['imperativeForm'] as String? ?? '',
      agreeingOneForm: json['agreeingOneForm'] as String? ?? '',
      agreeingTwoForm: json['agreeingTwoForm'] as String? ?? '',
      alsoUsedAs:
          (json['alsoUsedAs'] as List<dynamic>?)
              ?.map((e) => e as String)
              .toList() ??
          const <String>[],
      ipa: json['ipa'] as String? ?? '',
      kasemDefinition: json['kasemDefinition'] as String? ?? '',
      etymology: json['etymology'] as String? ?? '',
      nounClass: json['nounClass'] as String? ?? '',
      homographIndex: (json['homographIndex'] as num?)?.toInt() ?? 0,
      senses: json['senses'] == null
          ? const <EntrySense>[]
          : const EntrySenseListConverter().fromJson(json['senses']),
      isPublished: json['isPublished'] as bool? ?? true,
      mergedIntoId: json['mergedIntoId'] as String? ?? '',
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
      'pluralDefiniteForm': instance.pluralDefiniteForm,
      'countedForm': instance.countedForm,
      'pronounForm': instance.pronounForm,
      'definiteArticle': instance.definiteArticle,
      'numeralSeries': instance.numeralSeries,
      'numeralPrefix': instance.numeralPrefix,
      'presentForm': instance.presentForm,
      'pastForm': instance.pastForm,
      'futureForm': instance.futureForm,
      'pluralSubjectForm': instance.pluralSubjectForm,
      'imperativeForm': instance.imperativeForm,
      'agreeingOneForm': instance.agreeingOneForm,
      'agreeingTwoForm': instance.agreeingTwoForm,
      'alsoUsedAs': instance.alsoUsedAs,
      'ipa': instance.ipa,
      'kasemDefinition': instance.kasemDefinition,
      'etymology': instance.etymology,
      'nounClass': instance.nounClass,
      'homographIndex': instance.homographIndex,
      'senses': const EntrySenseListConverter().toJson(instance.senses),
      'isPublished': instance.isPublished,
      'mergedIntoId': instance.mergedIntoId,
    };
