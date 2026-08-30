import 'dart:ui';

import 'package:firebase_crashlytics/firebase_crashlytics.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/app/indigen_world_app.dart';
import 'package:indigen_world_mobile/core/app_locale.dart';
import 'package:indigen_world_mobile/core/app_signature.dart';
import 'package:indigen_world_mobile/core/firebase_bootstrap.dart';
import 'package:indigen_world_mobile/core/firebase_ready.dart';
import 'package:indigen_world_mobile/core/theme_mode.dart';
import 'package:indigen_world_mobile/data/local/app_database.dart';
import 'package:indigen_world_mobile/data/local/legacy_preferences_migration.dart';
import 'package:indigen_world_mobile/features/rating/rating_service.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final database = AppDatabase();
  await migrateLegacyPreferences(database);

  // Read once, up front, so a sign-in failure can report which package id and
  // signing certificate this build presented. Error reporting runs on a path
  // that cannot wait for a platform channel, and this is the only place the
  // answer is knowable at all on a Play-signed release.
  await const AppSignatureReader().read();

  // One line in the ledger the review prompt reads from. Counted per launch
  // rather than per session so "three distinct days" means what it says.
  await recordRatingActivity();

  // Read before the first frame. Resolving the appearance choice afterwards
  // would show every member who chose dark a white flash on the way to it, and
  // resolving the reading language afterwards would show a French member an
  // English screen on the way to their own.
  final themeMode = await readStoredThemeMode();
  final locale = await readStoredLocale();

  final firebaseReady = await FirebaseBootstrap.initialize();
  if (firebaseReady) {
    FlutterError.onError = FirebaseCrashlytics.instance.recordFlutterFatalError;
    PlatformDispatcher.instance.onError = (error, stackTrace) {
      FirebaseCrashlytics.instance.recordError(error, stackTrace, fatal: true);
      return true;
    };
  }

  runApp(
    ProviderScope(
      overrides: [
        appDatabaseProvider.overrideWithValue(database),
        // Without this the provider keeps its test-safe `false` default, and
        // every Firebase-backed surface — sign-in, the community feed, posting,
        // the Explore feed — behaves as though the device were offline no
        // matter how good the connection is.
        firebaseReadyProvider.overrideWithValue(firebaseReady),
        themeModeProvider.overrideWith(
          () => _StoredThemeModeController(themeMode),
        ),
        localeProvider.overrideWith(() => _StoredLocaleController(locale)),
      ],
      child: const IndigenWorldApp(),
    ),
  );
}

/// The controller seeded with the choice read before the first frame.
class _StoredThemeModeController extends ThemeModeController {
  _StoredThemeModeController(this._initial);

  final ThemeMode _initial;

  @override
  ThemeMode build() => _initial;
}

/// The same, for the reading language. `null` means the device decides, which
/// is what almost every member will be on.
class _StoredLocaleController extends LocaleController {
  _StoredLocaleController(this._initial);

  final Locale? _initial;

  @override
  Locale? build() => _initial;
}
