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

bool get useFirebaseEmulators {
  if (_firebaseEmulatorOverride.isNotEmpty) {
    return _firebaseEmulatorOverride.toLowerCase() == 'true';
  }
  return appEnvironment == AppEnvironment.development;
}

const developmentAppConfig = AppConfig();
