import 'package:freezed_annotation/freezed_annotation.dart';

part 'contribution.freezed.dart';
part 'contribution.g.dart';

enum ContributionStatus { draft, queued, underReview, approved, rejected }

@freezed
abstract class Contribution with _$Contribution {
  const factory Contribution({
    required String id,
    required String sourceText,
    required String targetText,
    required String dialect,
    required String knowledgeBasis,
    required DateTime createdAt,
    required ContributionStatus status,
    @Default('Not selected') String partOfSpeech,
    @Default('') String notes,
    String? relatedEntryId,
    @Default(false) bool rightsConfirmed,
  }) = _Contribution;

  factory Contribution.fromJson(Map<String, Object?> json) =>
      _$ContributionFromJson(json);
}
