import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/data/local/app_database.dart';
import 'package:indigen_world_mobile/domain/contribution.dart';

void main() {
  late AppDatabase database;

  setUp(() {
    database = AppDatabase.forTesting(NativeDatabase.memory());
  });

  tearDown(() => database.close());

  test('Drift stores contributions and saved dictionary entries', () async {
    final contribution = Contribution(
      id: 'local-1',
      sourceText: 'Source',
      targetText: 'Target',
      dialect: 'Not sure',
      knowledgeBasis: 'My own knowledge',
      createdAt: DateTime.utc(2026, 8, 16),
      status: ContributionStatus.queued,
    );

    await database.upsertContribution(contribution);
    expect(await database.getContributions(), [contribution]);

    expect(await database.toggleSavedEntry('entry-1'), isTrue);
    expect(await database.getSavedEntryIds(), {'entry-1'});
    expect(await database.toggleSavedEntry('entry-1'), isFalse);
  });
}
