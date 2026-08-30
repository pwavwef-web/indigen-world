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

    /// A published recording of the headword being said, or empty where the
    /// entry has none.
    ///
    /// Separate from [pronunciation], which is the written guide. The two used
    /// to share one field, so an entry with audio showed a download URL where
    /// its phonetics belonged and still had nothing to play.
    @Default('') String audioUrl,
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
