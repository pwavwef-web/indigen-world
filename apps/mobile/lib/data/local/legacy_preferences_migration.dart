import 'dart:convert';

import 'package:indigen_world_mobile/data/local/app_database.dart';
import 'package:indigen_world_mobile/domain/contribution.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _migrationCompleteKey = 'drift_migration_v1_complete';
const _contributionsKey = 'indigen_world_contributions_v1';
const _savedEntriesKey = 'indigen_world_saved_entries_v1';

Future<void> migrateLegacyPreferences(AppDatabase database) async {
  final preferences = await SharedPreferences.getInstance();
  if (preferences.getBool(_migrationCompleteKey) ?? false) return;

  for (final encoded
      in preferences.getStringList(_contributionsKey) ?? const <String>[]) {
    try {
      final decoded = Map<String, Object?>.from(
        jsonDecode(encoded) as Map<Object?, Object?>,
      );
      await database.upsertContribution(Contribution.fromJson(decoded));
    } on Object {
      // Keep a malformed legacy record from blocking all valid local data.
    }
  }

  for (final entryId
      in preferences.getStringList(_savedEntriesKey) ?? const <String>[]) {
    await database.addSavedEntry(entryId);
  }

  await preferences.setBool(_migrationCompleteKey, true);
}
