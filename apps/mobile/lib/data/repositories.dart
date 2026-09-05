import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/data/local/app_database.dart';
import 'package:indigen_world_mobile/domain/contribution.dart';

/// What this device remembers on its own.
///
/// ── What used to be here, and why it is not ──────────────────────────────
/// A `DemoDictionaryRepository` holding four synthetic entries — "Kasem
/// greeting · demo", "Synthetic example withheld", "Validated community data
/// will replace this demo" — behind a `dictionaryRepositoryProvider` that
/// `EntryDetailScreen` consulted BEFORE the published Firestore document. So
/// `/entry/demo-water` resolved to invented vocabulary in preference to a real
/// entry with the same id, and every entry built without explicitly passing
/// `isSynthetic: false` was flagged in the interface as a demo projection.
///
/// It was scaffolding from before there was a dictionary to read, and the
/// dictionary has had 1200 published entries for some time. Synthetic
/// vocabulary in a language-preservation app is not a placeholder; it is a
/// wrong answer about somebody's language, sitting in the one place a learner
/// has been told to trust.
///
/// The published archive is read through `publishedDictionaryEntriesProvider`
/// in `features/collection/collection_data.dart`. An unavailable Firebase
/// launch yields an empty collection, which every surface renders as an honest
/// empty state rather than as four invented words.

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

final contributionRepositoryProvider = Provider<ContributionRepository>(
  (ref) => LocalContributionRepository(ref.watch(appDatabaseProvider)),
);

final savedEntryRepositoryProvider = Provider<SavedEntryRepository>(
  (ref) => LocalSavedEntryRepository(ref.watch(appDatabaseProvider)),
);

final contributionsProvider = FutureProvider<List<Contribution>>(
  (ref) => ref.watch(contributionRepositoryProvider).getAll(),
);

/// Every saved key on this device.
///
/// The table is shared: dictionary entries are stored under their plain id,
/// while other surfaces namespace their keys (`reel:`, `reel-appreciated:`).
/// Read this when you need the raw set; read [savedDictionaryEntryIdsProvider]
/// when you mean saved *words*.
final savedEntryIdsProvider = FutureProvider<Set<String>>(
  (ref) => ref.watch(savedEntryRepositoryProvider).getSavedIds(),
);

/// Saved dictionary entries only — anything a namespaced surface put in the
/// same table is filtered out, so a count of "Saved words" stays honest.
final savedDictionaryEntryIdsProvider = FutureProvider<Set<String>>((
  ref,
) async {
  final ids = await ref.watch(savedEntryIdsProvider.future);
  return ids.where((id) => !id.contains(':')).toSet();
});
