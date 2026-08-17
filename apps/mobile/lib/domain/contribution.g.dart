// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'contribution.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_Contribution _$ContributionFromJson(Map<String, dynamic> json) =>
    _Contribution(
      id: json['id'] as String,
      sourceText: json['sourceText'] as String,
      targetText: json['targetText'] as String,
      dialect: json['dialect'] as String,
      knowledgeBasis: json['knowledgeBasis'] as String,
      createdAt: DateTime.parse(json['createdAt'] as String),
      status: $enumDecode(_$ContributionStatusEnumMap, json['status']),
      partOfSpeech: json['partOfSpeech'] as String? ?? 'Not selected',
      notes: json['notes'] as String? ?? '',
      relatedEntryId: json['relatedEntryId'] as String?,
      rightsConfirmed: json['rightsConfirmed'] as bool? ?? false,
    );

Map<String, dynamic> _$ContributionToJson(_Contribution instance) =>
    <String, dynamic>{
      'id': instance.id,
      'sourceText': instance.sourceText,
      'targetText': instance.targetText,
      'dialect': instance.dialect,
      'knowledgeBasis': instance.knowledgeBasis,
      'createdAt': instance.createdAt.toIso8601String(),
      'status': _$ContributionStatusEnumMap[instance.status]!,
      'partOfSpeech': instance.partOfSpeech,
      'notes': instance.notes,
      'relatedEntryId': instance.relatedEntryId,
      'rightsConfirmed': instance.rightsConfirmed,
    };

const _$ContributionStatusEnumMap = {
  ContributionStatus.draft: 'draft',
  ContributionStatus.queued: 'queued',
  ContributionStatus.underReview: 'underReview',
  ContributionStatus.approved: 'approved',
  ContributionStatus.rejected: 'rejected',
};
