import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/domain/contribution.dart';
import 'package:indigen_world_mobile/domain/dictionary_entry.dart';

void main() {
  test(
    'dictionary matching is case-insensitive and preserves canonical text',
    () {
      const entry = DictionaryEntry(
        id: 'one',
        headword: 'Kasem greeting · demo',
        translation: 'Hello',
        partOfSpeech: 'Expression',
        dialect: 'Paga',
        pronunciation: 'Pending',
        example: 'Pending',
        exampleTranslation: 'Pending',
        attribution: 'Synthetic',
      );

      expect(entry.matches('HELLO'), isTrue);
      expect(entry.matches('paga'), isTrue);
      expect(entry.matches('water'), isFalse);
      expect(entry.headword, 'Kasem greeting · demo');
    },
  );

  test('contribution survives local JSON round trip', () {
    final contribution = Contribution(
      id: 'mobile-1',
      sourceText: 'Source',
      targetText: 'Target',
      dialect: 'Not sure',
      knowledgeBasis: 'My own knowledge',
      createdAt: DateTime.utc(2026, 8, 15),
      status: ContributionStatus.queued,
    );

    final restored = Contribution.fromJson(contribution.toJson());

    expect(restored.id, contribution.id);
    expect(restored.status, ContributionStatus.queued);
    expect(restored.createdAt, contribution.createdAt);
  });
}
