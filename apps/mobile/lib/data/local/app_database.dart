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

@DriftDatabase(tables: [ContributionRecords, SavedEntryRecords])
class AppDatabase extends _$AppDatabase {
  AppDatabase() : super(driftDatabase(name: 'indigen_world'));

  AppDatabase.forTesting(super.executor);

  @override
  int get schemaVersion => 1;

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
}

final appDatabaseProvider = Provider<AppDatabase>((ref) {
  final database = AppDatabase();
  ref.onDispose(database.close);
  return database;
});
