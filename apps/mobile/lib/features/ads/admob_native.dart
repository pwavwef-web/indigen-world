import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_mobile_ads/google_mobile_ads.dart';
import 'package:indigen_world_mobile/features/ads/ad_consent.dart';
import 'package:indigen_world_mobile/features/ads/admob_config.dart';
import 'package:indigen_world_mobile/features/ads/data/ad_campaign.dart';
import 'package:indigen_world_mobile/features/ads/data/served_ad.dart';
import 'package:indigen_world_mobile/features/subscriptions/data/subscription_providers.dart';

abstract interface class MobileAdsInitializer {
  Future<bool> ensureInitialized();
}

class GoogleMobileAdsInitializer implements MobileAdsInitializer {
  Future<bool>? _initializing;

  @override
  Future<bool> ensureInitialized() => _initializing ??= _initialize();

  Future<bool> _initialize() async {
    try {
      await MobileAds.instance.initialize();
      return true;
    } on Object {
      return false;
    }
  }
}

final mobileAdsInitializerProvider = Provider<MobileAdsInitializer>(
  (ref) => GoogleMobileAdsInitializer(),
);

abstract interface class AdMobNativeHandle {
  Future<void> load();
  Widget get view;
  Future<void> dispose();
}

abstract interface class AdMobNativeFactory {
  AdMobNativeHandle create({
    required String unitId,
    required bool compact,
    required VoidCallback onLoaded,
    required VoidCallback onFailed,
  });
}

class GoogleAdMobNativeFactory implements AdMobNativeFactory {
  const GoogleAdMobNativeFactory();

  @override
  AdMobNativeHandle create({
    required String unitId,
    required bool compact,
    required VoidCallback onLoaded,
    required VoidCallback onFailed,
  }) => _GoogleNativeHandle(
    unitId: unitId,
    compact: compact,
    onLoaded: onLoaded,
    onFailed: onFailed,
  );
}

class _GoogleNativeHandle implements AdMobNativeHandle {
  _GoogleNativeHandle({
    required String unitId,
    required bool compact,
    required VoidCallback onLoaded,
    required VoidCallback onFailed,
  }) {
    _ad = NativeAd(
      adUnitId: unitId,
      request: const AdRequest(),
      nativeTemplateStyle: NativeTemplateStyle(
        templateType: compact ? TemplateType.small : TemplateType.medium,
      ),
      listener: NativeAdListener(
        onAdLoaded: (_) => onLoaded(),
        onAdFailedToLoad: (ad, _) {
          unawaited(ad.dispose());
          onFailed();
        },
      ),
    );
  }

  late final NativeAd _ad;

  @override
  Future<void> load() => _ad.load();

  @override
  Widget get view => AdWidget(ad: _ad);

  @override
  Future<void> dispose() => _ad.dispose();
}

final adMobNativeFactoryProvider = Provider<AdMobNativeFactory>(
  (ref) => const GoogleAdMobNativeFactory(),
);

/// The only widget allowed to own a Google native ad object.
///
/// It stays zero-sized until a real ad has loaded, never retries because of a
/// rebuild, and drops its object immediately when consent or membership stops
/// allowing advertising.
class AdMobNativeSlot extends ConsumerStatefulWidget {
  const AdMobNativeSlot({
    required this.placement,
    this.compact = false,
    this.loading,
    this.onUnavailable,
    super.key,
  });

  final AdPlacement placement;
  final bool compact;
  final Widget? loading;
  final VoidCallback? onUnavailable;

  @override
  ConsumerState<AdMobNativeSlot> createState() => _AdMobNativeSlotState();
}

/// Chooses one source for one slot. First-party content is returned
/// synchronously and an AdMob request is never constructed for that slot.
class UnifiedAdSlot extends StatelessWidget {
  const UnifiedAdSlot({
    required this.slot,
    required this.firstPartyBuilder,
    this.compact = false,
    this.loading,
    this.onAdMobUnavailable,
    super.key,
  });

  final AdSlot slot;
  final Widget Function(BuildContext context, ServedAd ad) firstPartyBuilder;
  final bool compact;
  final Widget? loading;
  final VoidCallback? onAdMobUnavailable;

  @override
  Widget build(BuildContext context) {
    final firstParty = slot.firstParty;
    if (firstParty != null) return firstPartyBuilder(context, firstParty);
    return AdMobNativeSlot(
      key: ValueKey('admob-${slot.key}'),
      placement: slot.placement,
      compact: compact,
      loading: loading,
      onUnavailable: onAdMobUnavailable,
    );
  }
}

class _AdMobNativeSlotState extends ConsumerState<AdMobNativeSlot> {
  AdMobNativeHandle? _handle;
  bool _loaded = false;
  bool _requestStarted = false;
  bool _unavailableNotified = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _reconcile());
  }

  @override
  void didUpdateWidget(AdMobNativeSlot oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.placement != widget.placement ||
        oldWidget.compact != widget.compact) {
      _disposeHandle();
      _requestStarted = false;
      _unavailableNotified = false;
    }
    WidgetsBinding.instance.addPostFrameCallback((_) => _reconcile());
  }

  Future<void> _reconcile() async {
    if (!mounted) return;
    final allowed = ref.read(adsAllowedProvider);
    if (!allowed) {
      _disposeHandle();
      return;
    }

    var consent = ref.read(adConsentProvider);
    if (consent.availability == AdConsentAvailability.unresolved) {
      await ref.read(adConsentProvider.notifier).ensureReady();
      if (!mounted || !ref.read(adsAllowedProvider)) return;
      consent = ref.read(adConsentProvider);
    }
    if (!consent.canRequestAds) {
      _notifyUnavailable();
      return;
    }
    if (_requestStarted) return;

    final unitId = ref
        .read(adMobConfigProvider)
        .nativeUnitIdFor(widget.placement);
    if (unitId == null) {
      _notifyUnavailable();
      return;
    }
    final initialized = await ref
        .read(mobileAdsInitializerProvider)
        .ensureInitialized();
    if (!mounted || !ref.read(adsAllowedProvider)) {
      return;
    }
    if (!initialized) {
      _notifyUnavailable();
      return;
    }

    _requestStarted = true;
    final handle = ref
        .read(adMobNativeFactoryProvider)
        .create(
          unitId: unitId,
          compact: widget.compact,
          onLoaded: () {
            if (!mounted || !ref.read(adsAllowedProvider)) {
              _disposeHandle();
              return;
            }
            setState(() => _loaded = true);
          },
          onFailed: () {
            if (!mounted) return;
            _handle = null;
            setState(() => _loaded = false);
            _notifyUnavailable();
          },
        );
    _handle = handle;
    try {
      await handle.load();
    } on Object {
      await handle.dispose();
      if (identical(_handle, handle)) _handle = null;
      _notifyUnavailable();
    }
  }

  void _notifyUnavailable() {
    if (_unavailableNotified) return;
    _unavailableNotified = true;
    widget.onUnavailable?.call();
  }

  void _disposeHandle() {
    final handle = _handle;
    _handle = null;
    _loaded = false;
    if (handle != null) unawaited(handle.dispose());
  }

  @override
  void dispose() {
    _disposeHandle();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    ref.listen<bool>(adsAllowedProvider, (previous, allowed) {
      if (!allowed) {
        _disposeHandle();
        if (mounted) setState(() {});
      } else if (previous == false) {
        _requestStarted = false;
        _unavailableNotified = false;
        WidgetsBinding.instance.addPostFrameCallback((_) => _reconcile());
      }
    });
    ref.listen<AdConsentState>(adConsentProvider, (previous, next) {
      if (!next.canRequestAds) {
        _disposeHandle();
        _requestStarted = false;
        if (mounted) setState(() {});
      } else if (previous?.canRequestAds != true) {
        _unavailableNotified = false;
        WidgetsBinding.instance.addPostFrameCallback((_) => _reconcile());
      }
    });
    final allowed = ref.watch(adsAllowedProvider);
    final canRequestAds = ref.watch(adConsentProvider).canRequestAds;
    if (!allowed || !canRequestAds) return const SizedBox.shrink();
    final handle = _handle;
    if (!_loaded || handle == null) {
      return widget.loading ?? const SizedBox.shrink();
    }
    return SizedBox(height: widget.compact ? 100 : 300, child: handle.view);
  }
}
