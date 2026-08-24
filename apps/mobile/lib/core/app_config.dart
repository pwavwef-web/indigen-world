class AppConfig {
  const AppConfig({
    this.learningEnabled = false,
    this.bountiesEnabled = false,
    this.marketplaceEnabled = false,
    this.voiceEnabled = false,
    this.aiAssistantEnabled = false,
  });

  final bool learningEnabled;
  final bool bountiesEnabled;
  final bool marketplaceEnabled;
  final bool voiceEnabled;
  final bool aiAssistantEnabled;
}

enum AppEnvironment { development, staging, production }

const appEnvironmentName = String.fromEnvironment(
  'APP_ENV',
  defaultValue: 'development',
);

const _firebaseEmulatorOverride = String.fromEnvironment(
  'USE_FIREBASE_EMULATORS',
);

AppEnvironment get appEnvironment => switch (appEnvironmentName) {
  'development' => AppEnvironment.development,
  'staging' => AppEnvironment.staging,
  'production' => AppEnvironment.production,
  _ => throw UnsupportedError(
    'Unsupported APP_ENV "$appEnvironmentName". Use development, staging, or production.',
  ),
};

/// Whether this launch should talk to the local Firebase emulator suite.
///
/// Opt-in only. It used to default to `true` for the development flavour, which
/// silently pointed every debug build at `localhost` / `10.0.2.2` — a host a
/// real handset cannot reach — so the app looked permanently offline (no
/// sign-in, no posting, empty feeds) on any device that was not an emulator
/// running the suite. Emulator runs now pass
/// `--dart-define=USE_FIREBASE_EMULATORS=true` explicitly.
bool get useFirebaseEmulators =>
    _firebaseEmulatorOverride.toLowerCase() == 'true';

const developmentAppConfig = AppConfig();
