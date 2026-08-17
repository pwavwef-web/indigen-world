import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/data/local/app_database.dart';
import 'package:indigen_world_mobile/domain/contribution.dart';
import 'package:indigen_world_mobile/domain/dictionary_entry.dart';

abstract interface class DictionaryRepository {
  List<DictionaryEntry> search(String query);
  DictionaryEntry? findById(String id);
}

class DemoDictionaryRepository implements DictionaryRepository {
  const DemoDictionaryRepository();

  static const entries = <DictionaryEntry>[
    DictionaryEntry(
      id: 'demo-greeting',
      headword: 'Kasem greeting · demo',
      translation: 'Hello · synthetic placeholder',
      partOfSpeech: 'Expression',
      dialect: 'Dialect not assigned',
      pronunciation: 'Audio pending validation',
      example: 'Synthetic example withheld',
      exampleTranslation: 'Validated community data will replace this demo.',
      culturalNote: 'A validator-approved greeting and context belong here.',
      attribution: 'Synthetic engineering fixture · not linguistic guidance',
    ),
    DictionaryEntry(
      id: 'demo-water',
      headword: 'Kasem word for water · demo',
      translation: 'Water · synthetic placeholder',
      partOfSpeech: 'Noun',
      dialect: 'Paga · demo metadata',
      pronunciation: 'Audio pending validation',
      example: 'Synthetic example withheld',
      exampleTranslation: 'Validated community data will replace this demo.',
      culturalNote:
          'Public copy requires linguistic validation and attribution.',
      attribution: 'Synthetic engineering fixture · not linguistic guidance',
    ),
    DictionaryEntry(
      id: 'demo-family',
      headword: 'Kasem word for family · demo',
      translation: 'Family · synthetic placeholder',
      partOfSpeech: 'Noun',
      dialect: 'Navrongo · demo metadata',
      pronunciation: 'Audio pending validation',
      example: 'Synthetic example withheld',
      exampleTranslation: 'Validated community data will replace this demo.',
      culturalNote: 'Cultural notes remain hidden until they are approved.',
      attribution: 'Synthetic engineering fixture · not linguistic guidance',
    ),
    DictionaryEntry(
      id: 'demo-thank-you',
      headword: 'Kasem thanks · demo',
      translation: 'Thank you · synthetic placeholder',
      partOfSpeech: 'Expression',
      dialect: 'Chiana · demo metadata',
      pronunciation: 'Audio pending validation',
      example: 'Synthetic example withheld',
      exampleTranslation: 'Validated community data will replace this demo.',
      culturalNote: 'Usage guidance must be supplied by approved validators.',
      attribution: 'Synthetic engineering fixture · not linguistic guidance',
    ),
  ];

  @override
  DictionaryEntry? findById(String id) {
    for (final entry in entries) {
      if (entry.id == id) return entry;
    }
    return null;
  }

  @override
  List<DictionaryEntry> search(String query) =>
      entries.where((entry) => entry.matches(query)).toList(growable: false);
}

abstract interface class ContributionRepository {
  Future<List<Contribution>> getAll();
  Future<void> save(Contribution contribution);
}

class LocalContributionRepository implements ContributionRepository {
  const LocalContributionRepository(this._database);

  final AppDatabase _database;

  @override
  Future<List<Contribution>> getAll() => _database.getContributions();

  @override
  Future<void> save(Contribution contribution) =>
      _database.upsertContribution(contribution);
}

abstract interface class SavedEntryRepository {
  Future<Set<String>> getSavedIds();
  Future<bool> toggle(String entryId);
}

class LocalSavedEntryRepository implements SavedEntryRepository {
  const LocalSavedEntryRepository(this._database);

  final AppDatabase _database;

  @override
  Future<Set<String>> getSavedIds() => _database.getSavedEntryIds();

  @override
  Future<bool> toggle(String entryId) => _database.toggleSavedEntry(entryId);
}

final dictionaryRepositoryProvider = Provider<DictionaryRepository>(
  (ref) => const DemoDictionaryRepository(),
);

final contributionRepositoryProvider = Provider<ContributionRepository>(
  (ref) => LocalContributionRepository(ref.watch(appDatabaseProvider)),
);

final savedEntryRepositoryProvider = Provider<SavedEntryRepository>(
  (ref) => LocalSavedEntryRepository(ref.watch(appDatabaseProvider)),
);

final contributionsProvider = FutureProvider<List<Contribution>>(
  (ref) => ref.watch(contributionRepositoryProvider).getAll(),
);

final savedEntryIdsProvider = FutureProvider<Set<String>>(
  (ref) => ref.watch(savedEntryRepositoryProvider).getSavedIds(),
);
