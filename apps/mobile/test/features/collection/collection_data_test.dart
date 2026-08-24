import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/features/collection/collection_data.dart';

void main() {
  test('maps the live dictionary schema without unsafe dynamic casts', () {
    final entry = dictionaryEntryFromData('entry-1', {
      'kasemText': 'Konkwolo',
      'englishText': 'Bottle',
      'partOfSpeech': 'Noun',
      'dialect': 'Navrongo',
      'kasemExample': 'amo dole kokwolo',
      'englishExample': 'I threw the bottle away',
      // Legacy imports can contain numeric text fields. They must render, not
      // produce a red runtime error.
      'pronunciation': 1.25,
      'isPublished': true,
    });

    expect(entry, isNotNull);
    expect(entry!.headword, 'Konkwolo');
    expect(entry.translation, 'Bottle');
    expect(entry.pronunciation, '1.25');
    expect(entry.isSynthetic, isFalse);
  });

  test('ignores rows that contain neither a Kasem nor English term', () {
    expect(dictionaryEntryFromData('empty', {'isPublished': true}), isNull);
  });
}
