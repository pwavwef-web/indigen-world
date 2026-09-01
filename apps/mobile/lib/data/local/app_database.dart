import 'package:drift/drift.dart';
import 'package:drift_flutter/drift_flutter.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/domain/contribution.dart' as domain;

part 'app_database.g.dart';

class ContributionRecords extends Table {
  TextColumn get id => text()();
  TextColumn get sourceText => text()();
  TextColumn get targetText => text()();
  TextColumn get dialect => text()();
  TextColumn get knowledgeBasis => text()();
  DateTimeColumn get createdAt => dateTime()();
  TextColumn get status => text()();
  TextColumn get partOfSpeech => text()();
  TextColumn get notes => text()();
  TextColumn get relatedEntryId => text().nullable()();
  BoolColumn get rightsConfirmed => boolean()();

  @override
  Set<Column<Object>> get primaryKey => {id};
}

class SavedEntryRecords extends Table {
  TextColumn get entryId => text()();

  @override
  Set<Column<Object>> get primaryKey => {entryId};
}

/// One collection track kept on the device for offline listening.
///
/// ── Why the row and the file are separate things ──────────────────────────
/// The audio lives in the app's own documents directory and this table is the
/// index over it. Keeping them apart is what makes the failure modes
/// survivable: a row whose file has been cleared by the system is detected and
/// dropped on the next read, and a file with no row is orphaned rubbish that
/// the same pass deletes. A single blob column would have made an eight-minute
/// audiobook chapter a row in SQLite, which is not what SQLite is for.
///
/// ── Why the metadata is copied and not looked up ──────────────────────────
/// Because the point of a download is that it works with no network. A title
/// and an artist read from `publishedContent` at play time would leave an
/// offline queue full of blank rows, so the handful of fields the player and
/// the notification actually draw are copied here at download time.
class DownloadedTrackRecords extends Table {
  /// The published record id — the same id the collection stream is keyed by.
  TextColumn get trackId => text()();

  TextColumn get title => text()();
  TextColumn get artist => text().nullable()();
  TextColumn get album => text()();
  TextColumn get artworkUrl => text().nullable()();

  /// Which collection it was saved from, so Downloads can group them.
  TextColumn get kind => text()();

  /// The remote file this came from. Kept so a re-download after a failure
  /// does not need the collection stream to be loaded again.
  TextColumn get sourceUrl => text()();

  /// Absolute path on this device. Rebuilt against the current documents
  /// directory on read, because iOS and Android both move that directory
  /// between installs and an absolute path stored today can be wrong tomorrow.
  TextColumn get fileName => text()();

  IntColumn get sizeBytes => integer()();
  DateTimeColumn get downloadedAt => dateTime()();

  @override
  Set<Column<Object>> get primaryKey => {trackId};
}

@DriftDatabase(
  tables: [ContributionRecords, SavedEntryRecords, DownloadedTrackRecords],
)
class AppDatabase extends _$AppDatabase {
  AppDatabase() : super(driftDatabase(name: 'indigen_world'));

  AppDatabase.forTesting(super.executor);

  @override
  int get schemaVersion => 2;

  /// Adds the downloads index to a database that predates offline listening.
  ///
  /// Creating only the new table rather than recreating anything: an upgrade
  /// that dropped and rebuilt would take a member's queued offline
  /// contributions with it, and those are the one thing in here that cannot be
  /// fetched again.
  @override
  MigrationStrategy get migration => MigrationStrategy(
    onCreate: (migrator) => migrator.createAll(),
    onUpgrade: (migrator, from, to) async {
      if (from < 2) {
        await migrator.createTable(downloadedTrackRecords);
      }
    },
  );

  Future<List<domain.Contribution>> getContributions() async {
    final rows = await (select(
      contributionRecords,
    )..orderBy([(row) => OrderingTerm.desc(row.createdAt)])).get();
    return rows
        .map(
          (row) => domain.Contribution(
            id: row.id,
            sourceText: row.sourceText,
            targetText: row.targetText,
            dialect: row.dialect,
            knowledgeBasis: row.knowledgeBasis,
            createdAt: row.createdAt.toUtc(),
            status: domain.ContributionStatus.values.byName(row.status),
            partOfSpeech: row.partOfSpeech,
            notes: row.notes,
            relatedEntryId: row.relatedEntryId,
            rightsConfirmed: row.rightsConfirmed,
          ),
        )
        .toList(growable: false);
  }

  Future<void> upsertContribution(domain.Contribution contribution) =>
      into(contributionRecords).insertOnConflictUpdate(
        ContributionRecordsCompanion.insert(
          id: contribution.id,
          sourceText: contribution.sourceText,
          targetText: contribution.targetText,
          dialect: contribution.dialect,
          knowledgeBasis: contribution.knowledgeBasis,
          createdAt: contribution.createdAt,
          status: contribution.status.name,
          partOfSpeech: contribution.partOfSpeech,
          notes: contribution.notes,
          relatedEntryId: Value(contribution.relatedEntryId),
          rightsConfirmed: contribution.rightsConfirmed,
        ),
      );

  Future<Set<String>> getSavedEntryIds() async {
    final rows = await select(savedEntryRecords).get();
    return rows.map((row) => row.entryId).toSet();
  }

  Future<bool> toggleSavedEntry(String entryId) => transaction(() async {
    final existing = await (select(
      savedEntryRecords,
    )..where((row) => row.entryId.equals(entryId))).getSingleOrNull();
    if (existing == null) {
      await into(savedEntryRecords)
          .insert(SavedEntryRecordsCompanion.insert(entryId: entryId));
      return true;
    }
    await (delete(
      savedEntryRecords,
    )..where((row) => row.entryId.equals(entryId))).go();
    return false;
  });

  Future<void> addSavedEntry(String entryId) => into(
    savedEntryRecords,
  ).insertOnConflictUpdate(SavedEntryRecordsCompanion.insert(entryId: entryId));

  /// Every download, newest first, as a live stream.
  Stream<List<DownloadedTrackRecord>> watchDownloads() =>
      (select(downloadedTrackRecords)
            ..orderBy([(row) => OrderingTerm.desc(row.downloadedAt)]))
          .watch();

  Future<List<DownloadedTrackRecord>> getDownloads() =>
      (select(downloadedTrackRecords)
            ..orderBy([(row) => OrderingTerm.desc(row.downloadedAt)]))
          .get();

  Future<int> countDownloads() async {
    final rows = await select(downloadedTrackRecords).get();
    return rows.length;
  }

  Future<void> upsertDownload(DownloadedTrackRecordsCompanion record) =>
      into(downloadedTrackRecords).insertOnConflictUpdate(record);

  Future<void> deleteDownload(String trackId) => (delete(
    downloadedTrackRecords,
  )..where((row) => row.trackId.equals(trackId))).go();
}

final appDatabaseProvider = Provider<AppDatabase>((ref) {
  final database = AppDatabase();
  ref.onDispose(database.close);
  return database;
});
