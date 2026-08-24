import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_analytics/firebase_analytics.dart';
import 'package:firebase_app_check/firebase_app_check.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_crashlytics/firebase_crashlytics.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:firebase_performance/firebase_performance.dart';
import 'package:firebase_remote_config/firebase_remote_config.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:flutter/foundation.dart';
import 'package:indigen_world_mobile/core/app_config.dart';
import 'package:indigen_world_mobile/firebase_options_development.dart'
    as development;
import 'package:indigen_world_mobile/firebase_options_production.dart'
    as production;
import 'package:indigen_world_mobile/firebase_options_staging.dart' as staging;

FirebaseOptions firebaseOptionsFor(AppEnvironment environment) =>
    switch (environment) {
      AppEnvironment.development =>
        development.DefaultFirebaseOptions.currentPlatform,
      AppEnvironment.staging => staging.DefaultFirebaseOptions.currentPlatform,
      AppEnvironment.production =>
        production.DefaultFirebaseOptions.currentPlatform,
    };

@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  if (Firebase.apps.isEmpty) {
    await Firebase.initializeApp(options: firebaseOptionsFor(appEnvironment));
  }
}

class FirebaseBootstrap {
  const FirebaseBootstrap._();

  /// Brings Firebase up for this launch and reports whether the app may use it.
  ///
  /// Only [Firebase.initializeApp] decides the answer. Everything after it —
  /// analytics, Crashlytics, Performance, Messaging auto-init, Remote Config,
  /// App Check — is a side service that is nice to have and is therefore
  /// started best-effort, each in its own guard. Before, a single failure in
  /// that block (an App Check activation on an unregistered debug device, a
  /// Remote Config fetch timing out on a slow network) tore down the whole
  /// result and the app fell back to its offline path: no sign-in, no posting,
  /// empty feeds — even though Firestore and Auth were perfectly reachable.
  static Future<bool> initialize() async {
    try {
      if (Firebase.apps.isEmpty) {
        await Firebase.initializeApp(
          options: firebaseOptionsFor(appEnvironment),
        );
      }
    } on Object catch (error, stackTrace) {
      debugPrint('Firebase core init failed; continuing offline: $error');
      debugPrintStack(stackTrace: stackTrace);
      return false;
    }

    if (useFirebaseEmulators) {
      // A failed emulator hookup must not look like a broken app: fall through
      // to the real project rather than pretending Firebase is unavailable.
      await _guard('emulators', _connectEmulators);
    }

    // Cache reads locally so a flaky connection shows the last known feed
    // instead of an empty screen.
    await _guard('firestore-settings', () async {
      FirebaseFirestore.instance.settings = const Settings(
        persistenceEnabled: true,
        cacheSizeBytes: Settings.CACHE_SIZE_UNLIMITED,
      );
    });

    final isProduction = appEnvironment == AppEnvironment.production;
    await Future.wait([
      _guard(
        'analytics',
        () => FirebaseAnalytics.instance.setAnalyticsCollectionEnabled(
          isProduction,
        ),
      ),
      _guard(
        'crashlytics',
        () => FirebaseCrashlytics.instance.setCrashlyticsCollectionEnabled(
          isProduction,
        ),
      ),
      _guard(
        'performance',
        () => FirebasePerformance.instance.setPerformanceCollectionEnabled(
          isProduction,
        ),
      ),
      // Messaging auto-init is on in every environment now that in-app alerts
      // are a shipped feature; without it no FCM token is ever minted.
      _guard(
        'messaging',
        () => FirebaseMessaging.instance.setAutoInitEnabled(true),
      ),
      _guard('remote-config', _configureRemoteConfig),
      if (!useFirebaseEmulators) _guard('app-check', _activateAppCheck),
    ]);

    _guardSync(
      'messaging-background',
      () => FirebaseMessaging.onBackgroundMessage(
        firebaseMessagingBackgroundHandler,
      ),
    );

    return true;
  }

  static Future<void> _configureRemoteConfig() async {
    final isProduction = appEnvironment == AppEnvironment.production;
    await FirebaseRemoteConfig.instance.setDefaults(const {
      'learning_enabled': false,
      'bounties_enabled': false,
      'marketplace_enabled': false,
      'voice_enabled': false,
      'ai_assistant_enabled': false,
    });
    await FirebaseRemoteConfig.instance.setConfigSettings(
      RemoteConfigSettings(
        fetchTimeout: const Duration(seconds: 10),
        minimumFetchInterval: isProduction
            ? const Duration(hours: 12)
            : Duration.zero,
      ),
    );
  }

  static Future<void> _activateAppCheck() async {
    final isProduction = appEnvironment == AppEnvironment.production;
    await FirebaseAppCheck.instance.activate(
      providerAndroid: isProduction
          ? const AndroidPlayIntegrityProvider()
          : const AndroidDebugProvider(),
      providerApple: isProduction
          ? const AppleAppAttestWithDeviceCheckFallbackProvider()
          : const AppleDebugProvider(),
    );
  }

  static Future<void> _connectEmulators() async {
    const configuredHost = String.fromEnvironment('FIREBASE_EMULATOR_HOST');
    final host = configuredHost.isNotEmpty
        ? configuredHost
        : defaultTargetPlatform == TargetPlatform.android
        ? '10.0.2.2'
        : 'localhost';

    await FirebaseAuth.instance.useAuthEmulator(host, 9099);
    FirebaseFirestore.instance.useFirestoreEmulator(host, 8080);
    FirebaseFunctions.instance.useFunctionsEmulator(host, 5001);
    await FirebaseStorage.instance.useStorageEmulator(host, 9199);
  }

  /// Runs an optional start-up step, logging and swallowing any failure.
  static Future<void> _guard(String step, Future<void> Function() run) async {
    try {
      await run();
    } on Object catch (error) {
      debugPrint('Firebase bootstrap step "$step" failed (continuing): $error');
    }
  }

  static void _guardSync(String step, void Function() run) {
    try {
      run();
    } on Object catch (error) {
      debugPrint('Firebase bootstrap step "$step" failed (continuing): $error');
    }
  }
}
