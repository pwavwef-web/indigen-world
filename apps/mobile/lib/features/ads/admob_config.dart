import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/app_config.dart';
import 'package:indigen_world_mobile/features/ads/data/ad_campaign.dart';

/// Google's published Android sample identifiers. They are the only values a
/// development, staging, debug, or automated-test build may use.
abstract final class GoogleMobileAdsTestIds {
  static const androidApp = 'ca-app-pub-3940256099942544~3347511713';
  static const native = 'ca-app-pub-3940256099942544/2247696110';
}

/// Build-time Mobile Ads configuration.
///
/// Ad-unit IDs are not credentials, but keeping the production values out of
/// the repository prevents accidental developer traffic on live inventory and
/// avoids committing the publisher identifier embedded in every value.
@immutable
class AdMobConfig {
  const AdMobConfig({
    required this.environment,
    required this.testMode,
    required this.androidAppId,
    required this.nativeUnitIds,
  });

  factory AdMobConfig.fromEnvironment({
    AppEnvironment? environment,
    bool? releaseMode,
    String productionAndroidAppId = const String.fromEnvironment(
      'ADMOB_ANDROID_APP_ID',
    ),
    String communityNativeId = const String.fromEnvironment(
      'ADMOB_COMMUNITY_NATIVE_AD_UNIT_ID',
    ),
    String exploreNativeId = const String.fromEnvironment(
      'ADMOB_EXPLORE_NATIVE_AD_UNIT_ID',
    ),
    String collectionNativeId = const String.fromEnvironment(
      'ADMOB_COLLECTION_NATIVE_AD_UNIT_ID',
    ),
  }) {
    final selectedEnvironment = environment ?? appEnvironment;
    final useTestIds =
        !(releaseMode ?? kReleaseMode) ||
        selectedEnvironment != AppEnvironment.production;
    return AdMobConfig(
      environment: selectedEnvironment,
      testMode: useTestIds,
      androidAppId: useTestIds
          ? GoogleMobileAdsTestIds.androidApp
          : productionAndroidAppId,
      nativeUnitIds: {
        AdPlacement.community: useTestIds
            ? GoogleMobileAdsTestIds.native
            : communityNativeId,
        AdPlacement.explore: useTestIds
            ? GoogleMobileAdsTestIds.native
            : exploreNativeId,
        AdPlacement.collection: useTestIds
            ? GoogleMobileAdsTestIds.native
            : collectionNativeId,
      },
    );
  }

  final AppEnvironment environment;
  final bool testMode;
  final String androidAppId;
  final Map<AdPlacement, String> nativeUnitIds;

  static final _appIdPattern = RegExp(r'^ca-app-pub-\d{16}~\d{10}$');
  static final _unitIdPattern = RegExp(r'^ca-app-pub-\d{16}/\d{10}$');

  bool get hasValidAppId {
    final value = androidAppId.trim();
    return _appIdPattern.hasMatch(value) &&
        (testMode || !value.startsWith('ca-app-pub-3940256099942544~'));
  }

  String? nativeUnitIdFor(AdPlacement placement) {
    if (!hasValidAppId) return null;
    final value = nativeUnitIds[placement]?.trim() ?? '';
    if (!_unitIdPattern.hasMatch(value)) return null;
    if (!testMode && value.startsWith('ca-app-pub-3940256099942544/')) {
      return null;
    }
    return value;
  }

  /// Empty only when this configuration is safe to serve from production.
  List<String> get productionValidationIssues {
    if (testMode) return const <String>[];
    return [
      if (!hasValidAppId) 'ADMOB_ANDROID_APP_ID',
      for (final placement in AdPlacement.values)
        if (nativeUnitIdFor(placement) == null)
          'ADMOB_${placement.name.toUpperCase()}_NATIVE_AD_UNIT_ID',
    ];
  }
}

final adMobConfigProvider = Provider<AdMobConfig>(
  (ref) => AdMobConfig.fromEnvironment(),
);
