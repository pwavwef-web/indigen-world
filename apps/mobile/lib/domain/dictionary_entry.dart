import 'package:freezed_annotation/freezed_annotation.dart';

part 'dictionary_entry.freezed.dart';
part 'dictionary_entry.g.dart';

@freezed
abstract class DictionaryEntry with _$DictionaryEntry {
  const DictionaryEntry._();

  const factory DictionaryEntry({
    required String id,
    required String headword,
    required String translation,
    required String partOfSpeech,
    required String dialect,
    required String pronunciation,
    required String example,
    required String exampleTranslation,
    required String attribution,
    String? culturalNote,
    @Default(true) bool isSynthetic,
  }) = _DictionaryEntry;

  factory DictionaryEntry.fromJson(Map<String, Object?> json) =>
      _$DictionaryEntryFromJson(json);

  bool matches(String query) {
    final normalized = query.trim().toLowerCase();
    return normalized.isEmpty ||
        headword.toLowerCase().contains(normalized) ||
        translation.toLowerCase().contains(normalized) ||
        dialect.toLowerCase().contains(normalized);
  }
}
