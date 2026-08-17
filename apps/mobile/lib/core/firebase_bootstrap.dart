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

  static Future<bool> initialize() async {
    try {
      if (Firebase.apps.isEmpty) {
        await Firebase.initializeApp(
          options: firebaseOptionsFor(appEnvironment),
        );
      }

      if (useFirebaseEmulators) {
        await _connectEmulators();
      }

      final isProduction = appEnvironment == AppEnvironment.production;
      await Future.wait([
        FirebaseAnalytics.instance.setAnalyticsCollectionEnabled(isProduction),
        FirebaseCrashlytics.instance.setCrashlyticsCollectionEnabled(
          isProduction,
        ),
        FirebasePerformance.instance.setPerformanceCollectionEnabled(
          isProduction,
        ),
        FirebaseMessaging.instance.setAutoInitEnabled(isProduction),
      ]);

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

      if (!useFirebaseEmulators) {
        await FirebaseAppCheck.instance.activate(
          providerAndroid: isProduction
              ? const AndroidPlayIntegrityProvider()
              : const AndroidDebugProvider(),
          providerApple: isProduction
              ? const AppleAppAttestWithDeviceCheckFallbackProvider()
              : const AppleDebugProvider(),
        );
      }

      FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);
      return true;
    } on Object catch (error, stackTrace) {
      debugPrint('Firebase bootstrap failed; continuing offline: $error');
      debugPrintStack(stackTrace: stackTrace);
      return false;
    }
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
}
