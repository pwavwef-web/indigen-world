import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/features/collection/collection_data.dart';

/// The two axes an entry can be plural on, and why they must not be confused.
///
/// `dictionaryEntries.translations` is written by the review pipeline from the
/// contribution's *Kasem* body — see `submissionTranslations` in
/// services/functions/src/publication.ts — however much its name suggests the
/// English side. Reading it as English printed Kasem in the meaning column;
/// reading it as nothing showed a member's second and third answers to nobody.
/// These tests pin which side it lands on.
void main() {
  Map<String, dynamic> entry({
    String kasemText = 'nia, nyu',
    List<String> translations = const <String>[],
    String englishText = 'water',
  }) => <String, dynamic>{
    'kasemText': kasemText,
    'englishText': englishText,
    if (translations.isNotEmpty) 'translations': translations,
    'isPublished': true,
  };

  test('the headword is the first rendering, never the raw string', () {
    // A guided contribution arrives as the one string the member typed. Taking
    // it whole filed the entry under a comma and offered the dictionary a word
    // nobody could look up.
    final parsed = dictionaryEntryFromData(
      'w1',
      entry(translations: <String>['nia', 'nyu']),
    )!;

    expect(parsed.headword, 'nia');
    expect(parsed.renderings, ['nia', 'nyu']);
    expect(parsed.furtherRenderings, ['nyu']);
    expect(parsed.hasSeveralRenderings, isTrue);
  });

  test('Kasem renderings never leak into the English meaning', () {
    final parsed = dictionaryEntryFromData(
      'w2',
      entry(translations: <String>['nia', 'nyu']),
    )!;

    expect(parsed.translation, 'water');
    expect(parsed.primaryTranslation, 'water');
    expect(parsed.translations, isNot(contains('nyu')));
  });

  test('a legacy entry with one rendering is untouched', () {
    final parsed = dictionaryEntryFromData(
      'legacy',
      entry(kasemText: 'nia'),
    )!;

    expect(parsed.headword, 'nia');
    expect(parsed.furtherRenderings, isEmpty);
    expect(parsed.hasSeveralRenderings, isFalse);
  });

  test('a legacy body that listed several is split the way it was meant', () {
    final parsed = dictionaryEntryFromData(
      'legacy2',
      entry(kasemText: 'nia / nyu'),
    )!;

    expect(parsed.headword, 'nia');
    expect(parsed.furtherRenderings, ['nyu']);
  });

  test('a rendering nobody filed the entry under is still searchable', () {
    // The whole point: somebody who knows the word as `nyu` must find it even
    // though the entry is filed under `nia`.
    final parsed = dictionaryEntryFromData(
      'w3',
      entry(translations: <String>['nia', 'nyu']),
    )!;

    expect(parsed.matches('nyu'), isTrue);
    expect(parsed.matches('nia'), isTrue);
    expect(parsed.matches('water'), isTrue);
    expect(parsed.matches('elephant'), isFalse);
  });
}
