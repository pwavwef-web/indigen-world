import 'dart:async';
import 'dart:ui';

import 'package:audio_service/audio_service.dart';
import 'package:firebase_crashlytics/firebase_crashlytics.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/app/indigen_world_app.dart';
import 'package:indigen_world_mobile/core/app_locale.dart';
import 'package:indigen_world_mobile/core/app_signature.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/core/device_integrity.dart';
import 'package:indigen_world_mobile/core/firebase_bootstrap.dart';
import 'package:indigen_world_mobile/core/firebase_ready.dart';
import 'package:indigen_world_mobile/core/theme_mode.dart';
import 'package:indigen_world_mobile/data/local/app_database.dart';
import 'package:indigen_world_mobile/data/local/legacy_preferences_migration.dart';
import 'package:indigen_world_mobile/features/downloads/data/downloads_providers.dart';
import 'package:indigen_world_mobile/features/music/music_audio_handler.dart';
import 'package:indigen_world_mobile/features/music/music_providers.dart';
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

  // Play Integrity's token provider takes seconds to prepare and nothing on
  // the first frame needs it, so it is started here and never waited for. Doing
  // it now rather than at the first check means the check a member actually
  // triggers — opening the paywall, starting a purchase — answers immediately
  // instead of stalling on a network round trip they did not ask for.
  unawaited(const PlayIntegrityChannel().warmUp());

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

  // The background audio session, which has to exist before the first frame
  // because the media session is a process-level thing rather than a screen.
  //
  // Wrapped, and deliberately not fatal. `AudioService.init` reaches all the
  // way down to a platform service that a device can refuse — a locked-down
  // OEM build, a foreground service the system will not start, a channel that
  // never answers — and none of that is a reason for somebody to lose the
  // dictionary, the community and their lessons as well. When it fails the
  // override is simply omitted: `musicAudioHandlerProvider` keeps its null
  // default, every music surface reads that and stands down, and the rest of
  // the app is untouched. Placed after the Crashlytics handlers are installed
  // so the failure is something we can actually read afterwards.
  IndigenAudioHandler? audioHandler;
  try {
    audioHandler = await AudioService.init(
      builder: IndigenAudioHandler.new,
      config: const AudioServiceConfig(
        androidNotificationChannelId: IndigenAudioHandler.notificationChannelId,
        androidNotificationChannelName:
            IndigenAudioHandler.notificationChannelName,
        androidNotificationChannelDescription:
            'Controls for the song or audiobook you are listening to.',
        // Ongoing while playing, and swipeable once paused — the pair Android
        // requires be set together for either to mean anything.
        androidNotificationOngoing: true,
        androidStopForegroundOnPause: true,
        // The same silhouette and tint the community alerts use, so the two
        // notifications read as coming from one app.
        androidNotificationIcon: 'drawable/ic_notification',
        notificationColor: BrandColors.kenteGold,
      ),
    );
  } on Object catch (error, stackTrace) {
    audioHandler = null;
    if (firebaseReady) {
      await FirebaseCrashlytics.instance.recordError(error, stackTrace);
    }
  }

  runApp(
    ProviderScope(
      overrides: [
        appDatabaseProvider.overrideWithValue(database),
        // The real offline index. Its provider ships empty so that the
        // hundreds of widget tests built on a bare scope never reach a
        // platform channel — see downloads_providers.dart — which means the
        // app itself has to hand it the real one exactly here.
        offlineTrackUrlsLookupProvider.overrideWith(
          (ref) => () => ref.read(downloadsRepositoryProvider).playableIndex(),
        ),
        // Omitted entirely when the session failed to start, which is what
        // leaves the provider at its test-safe null and the app at "no music
        // player" rather than "no app".
        if (audioHandler != null)
          musicAudioHandlerProvider.overrideWithValue(audioHandler),
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
