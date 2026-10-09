import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_mobile_ads/google_mobile_ads.dart';
import 'package:indigen_world_mobile/core/brand.dart';
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

/// The size every Google native ad in the app is drawn at.
///
/// Only the medium template is used. Its Android layout
/// (`gnt_medium_template_view.xml` in google_mobile_ads) is a fixed 350dp
/// tall, so a shorter box clips the call-to-action off the bottom — which is
/// what the 300dp box this replaced did. Google's recommended bounds for the
/// medium template are 320–400 wide and 320–400 tall
/// (developers.google.com/admob/flutter/native/templates). The small template
/// is not used: it has no MediaView, and a video creative needs one.
abstract final class NativeAdBox {
  static const double height = 350;
  static const double maxWidth = 400;
}

/// The colours a native template is drawn in, fixed at request time.
///
/// Every text colour is stated. The template's body view has no colour of its
/// own and inherits the Android activity theme's, which in dark mode
/// (`Theme.Black`) is white — on the template's white card. AdMob's native
/// policy requires text with "sufficient contrast from the background to be
/// clearly legible", so nothing here is left to inheritance.
@immutable
class NativeAdPalette {
  const NativeAdPalette({
    required this.background,
    required this.headline,
    required this.body,
    required this.action,
    required this.onAction,
  });

  factory NativeAdPalette.of(BuildContext context) {
    final brand = context.brand;
    return NativeAdPalette(
      // Composited, so a translucent surface can never let the page through.
      background: Color.alphaBlend(brand.surface, brand.background),
      headline: brand.ink,
      body: brand.mutedInk,
      action: brand.accentFill,
      onAction: brand.onAccentFill,
    );
  }

  final Color background;
  final Color headline;
  final Color body;
  final Color action;
  final Color onAction;

  NativeTemplateStyle templateStyle() => NativeTemplateStyle(
    templateType: TemplateType.medium,
    mainBackgroundColor: background,
    cornerRadius: 12,
    callToActionTextStyle: NativeTemplateTextStyle(
      textColor: onAction,
      backgroundColor: action,
      style: NativeTemplateFontStyle.bold,
      size: 15,
    ),
    primaryTextStyle: NativeTemplateTextStyle(
      textColor: headline,
      backgroundColor: background,
      style: NativeTemplateFontStyle.bold,
      size: 15,
    ),
    secondaryTextStyle: NativeTemplateTextStyle(
      textColor: body,
      backgroundColor: background,
      size: 13,
    ),
    tertiaryTextStyle: NativeTemplateTextStyle(
      textColor: body,
      backgroundColor: background,
      size: 13,
    ),
  );
}

abstract interface class AdMobNativeHandle {
  Future<void> load();
  Widget get view;
  Future<void> dispose();
}

abstract interface class AdMobNativeFactory {
  AdMobNativeHandle create({
    required String unitId,
    required NativeAdPalette palette,
    required VoidCallback onLoaded,
    required VoidCallback onFailed,
  });
}

class GoogleAdMobNativeFactory implements AdMobNativeFactory {
  const GoogleAdMobNativeFactory();

  @override
  AdMobNativeHandle create({
    required String unitId,
    required NativeAdPalette palette,
    required VoidCallback onLoaded,
    required VoidCallback onFailed,
  }) => _GoogleNativeHandle(
    unitId: unitId,
    palette: palette,
    onLoaded: onLoaded,
    onFailed: onFailed,
  );
}

class _GoogleNativeHandle implements AdMobNativeHandle {
  _GoogleNativeHandle({
    required String unitId,
    required NativeAdPalette palette,
    required VoidCallback onLoaded,
    required VoidCallback onFailed,
  }) {
    _ad = NativeAd(
      adUnitId: unitId,
      request: const AdRequest(),
      // Muted is the SDK's default; stated because the app plays music, and
      // an advert that started a second soundtrack would be the one thing
      // the player works hardest to prevent.
      nativeAdOptions: NativeAdOptions(
        videoOptions: VideoOptions(startMuted: true),
      ),
      nativeTemplateStyle: palette.templateStyle(),
      listener: NativeAdListener(
        onAdLoaded: (_) => onLoaded(),
        onAdFailedToLoad: (ad, error) {
          if (kDebugMode) {
            debugPrint(
              'AdMob native request failed: ${error.code} ${error.message}',
            );
          }
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

/// How long a placement stops asking Google after a request comes back empty.
///
/// A list with a slot every fifth row would otherwise send a request for
/// every slot scrolled past while the account has nothing to serve — the
/// normal state while AdMob is still reviewing the app.
const Duration kAdMobNoFillCooldown = Duration(seconds: 60);

final adMobClockProvider = Provider<DateTime Function()>((ref) => DateTime.now);

/// When each placement last came back empty, for this session.
class AdMobNoFill extends Notifier<Map<AdPlacement, DateTime>> {
  @override
  Map<AdPlacement, DateTime> build() => const <AdPlacement, DateTime>{};

  void record(AdPlacement placement) {
    state = {...state, placement: ref.read(adMobClockProvider)()};
  }

  bool coolingDown(AdPlacement placement) {
    final failedAt = state[placement];
    if (failedAt == null) return false;
    final since = ref.read(adMobClockProvider)().difference(failedAt);
    return since < kAdMobNoFillCooldown;
  }
}

final adMobNoFillProvider =
    NotifierProvider<AdMobNoFill, Map<AdPlacement, DateTime>>(AdMobNoFill.new);

/// The only widget allowed to own a Google native ad object.
///
/// ── What it promises ─────────────────────────────────────────────────────
/// * One request per slot. A rebuild or a second reconcile racing the first
///   never makes another, and in a list a loaded advert is kept alive while
///   the list is — so scrolling back reuses it — and disposed with it.
/// * The space is held while the request is out. Google's implementation
///   guidance asks that a late advert not "cover or shift the other content",
///   because content moving under a finger is how an accidental click
///   happens. An empty result collapses the space; it never grows late.
/// * Nothing at all unless the member is on the free tier and UMP says an
///   advert may be requested. Losing either drops the object at once.
/// * The advert is framed and labelled as one, outside the template's own
///   "Ad" badge, so it cannot read as a row of the list it sits in.
class AdMobNativeSlot extends ConsumerStatefulWidget {
  const AdMobNativeSlot({
    required this.placement,
    this.loading,
    this.onUnavailable,
    this.onDark = false,
    this.keepAlive = true,
    super.key,
  });

  final AdPlacement placement;

  /// Replaces the reserved frame while a request is out. Explore passes a
  /// full-page spinner; lists keep the default.
  final Widget? loading;

  final VoidCallback? onUnavailable;

  /// Whether the slot sits on a dark ground regardless of theme (Explore).
  final bool onDark;

  /// Whether a loaded advert outlives being scrolled out of its list.
  ///
  /// Right for the Collection and Community lists, where it is what stops a
  /// scroll back from becoming a second request. Wrong for Explore's endless
  /// pager, where it would hold every advert page ever passed in memory.
  final bool keepAlive;

  @override
  ConsumerState<AdMobNativeSlot> createState() => _AdMobNativeSlotState();
}

/// Chooses one source for one slot. First-party content is returned
/// synchronously and an AdMob request is never constructed for that slot.
class UnifiedAdSlot extends StatelessWidget {
  const UnifiedAdSlot({
    required this.slot,
    required this.firstPartyBuilder,
    this.loading,
    this.onAdMobUnavailable,
    this.onDark = false,
    this.adMobPadding = EdgeInsets.zero,
    this.keepAdMobAlive = true,
    super.key,
  });

  final AdSlot slot;
  final Widget Function(BuildContext context, ServedAd ad) firstPartyBuilder;
  final Widget? loading;
  final VoidCallback? onAdMobUnavailable;
  final bool onDark;

  /// The gutter a full-bleed host gives a Google advert, matching the margin
  /// its first-party card already brings. Lists with a gutter of their own
  /// leave it at zero.
  final EdgeInsetsGeometry adMobPadding;

  /// See [AdMobNativeSlot.keepAlive].
  final bool keepAdMobAlive;

  @override
  Widget build(BuildContext context) {
    final firstParty = slot.firstParty;
    if (firstParty != null) return firstPartyBuilder(context, firstParty);
    return Padding(
      padding: adMobPadding,
      child: AdMobNativeSlot(
        key: ValueKey('admob-${slot.key}'),
        placement: slot.placement,
        loading: loading,
        onUnavailable: onAdMobUnavailable,
        onDark: onDark,
        keepAlive: keepAdMobAlive,
      ),
    );
  }
}

enum _SlotPhase { idle, requesting, loaded, unavailable }

class _AdMobNativeSlotState extends ConsumerState<AdMobNativeSlot>
    with AutomaticKeepAliveClientMixin {
  AdMobNativeHandle? _handle;
  var _phase = _SlotPhase.idle;

  /// Bumped whenever the slot is reset, so a request started before the reset
  /// can recognise itself as stale after any of its awaits.
  var _generation = 0;
  var _unavailableNotified = false;

  @override
  bool get wantKeepAlive =>
      widget.keepAlive &&
      (_phase == _SlotPhase.requesting || _phase == _SlotPhase.loaded);

  @override
  void initState() {
    super.initState();
    _scheduleReconcile();
  }

  @override
  void didUpdateWidget(AdMobNativeSlot oldWidget) {
    super.didUpdateWidget(oldWidget);
    // Only a different placement is a different request. An ordinary parent
    // rebuild used to schedule another reconcile every time, and two of them
    // awaiting the same SDK start-up could each create an advert.
    if (oldWidget.placement == widget.placement) return;
    _reset();
    _unavailableNotified = false;
    _scheduleReconcile();
  }

  void _scheduleReconcile() =>
      WidgetsBinding.instance.addPostFrameCallback((_) => _reconcile());

  bool _isCurrent(int generation) =>
      mounted && generation == _generation && ref.read(adsAllowedProvider);

  Future<void> _reconcile() async {
    if (!mounted || _phase != _SlotPhase.idle) return;
    if (!ref.read(adsAllowedProvider)) return;
    final generation = ++_generation;
    // Resolved before any await: the colours of the theme the request was
    // made under, and no BuildContext carried across the gaps below.
    final palette = NativeAdPalette.of(context);
    _setPhase(_SlotPhase.requesting);

    var consent = ref.read(adConsentProvider);
    if (consent.availability == AdConsentAvailability.unresolved) {
      await ref.read(adConsentProvider.notifier).ensureReady();
      if (!_isCurrent(generation)) return;
      consent = ref.read(adConsentProvider);
    }
    if (!consent.canRequestAds) return _unavailable(generation);

    final unitId = ref
        .read(adMobConfigProvider)
        .nativeUnitIdFor(widget.placement);
    if (unitId == null ||
        ref.read(adMobNoFillProvider.notifier).coolingDown(widget.placement)) {
      return _unavailable(generation);
    }
    final initialized = await ref
        .read(mobileAdsInitializerProvider)
        .ensureInitialized();
    if (!_isCurrent(generation)) return;
    if (!initialized || !ref.read(adConsentProvider).canRequestAds) {
      return _unavailable(generation);
    }

    final handle = ref
        .read(adMobNativeFactoryProvider)
        .create(
          unitId: unitId,
          palette: palette,
          onLoaded: () {
            // A stale handle was already disposed by the reset that made it
            // stale; there is nothing left to do with it.
            if (!_isCurrent(generation)) return;
            _setPhase(_SlotPhase.loaded);
          },
          onFailed: () {
            if (!mounted || generation != _generation) return;
            // The Google handle disposes itself on a failed load.
            _handle = null;
            ref.read(adMobNoFillProvider.notifier).record(widget.placement);
            _unavailable(generation);
          },
        );
    _handle = handle;
    try {
      await handle.load();
    } on Object {
      if (!mounted || generation != _generation) return;
      _handle = null;
      unawaited(handle.dispose());
      _unavailable(generation);
    }
  }

  void _setPhase(_SlotPhase phase) {
    if (!mounted) return;
    setState(() => _phase = phase);
    updateKeepAlive();
  }

  void _unavailable(int generation) {
    if (!mounted || generation != _generation) return;
    _setPhase(_SlotPhase.unavailable);
    if (_unavailableNotified) return;
    _unavailableNotified = true;
    widget.onUnavailable?.call();
  }

  /// Drops whatever this slot holds and makes any request in flight stale.
  void _reset() {
    _generation++;
    final handle = _handle;
    _handle = null;
    _phase = _SlotPhase.idle;
    if (handle != null) unawaited(handle.dispose());
  }

  @override
  void dispose() {
    _reset();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    ref.listen<bool>(adsAllowedProvider, (previous, allowed) {
      if (!allowed) {
        _reset();
        if (mounted) setState(() {});
        updateKeepAlive();
      } else if (previous == false) {
        _unavailableNotified = false;
        _scheduleReconcile();
      }
    });
    ref.listen<bool>(adConsentProvider.select((state) => state.canRequestAds), (
      previous,
      canRequestAds,
    ) {
      if (!canRequestAds) {
        // Revoked: the advert goes now. Resolving to "no" for the first time
        // leaves a request that is still waiting on consent to finish it.
        if (previous ?? false) {
          _reset();
          if (mounted) setState(() {});
          updateKeepAlive();
        }
      } else if (previous != true && _phase != _SlotPhase.requesting) {
        // Granted, or granted again after a revocation. A request already
        // out is waiting on this very answer and carries on by itself.
        _reset();
        _unavailableNotified = false;
        _scheduleReconcile();
      }
    });

    final allowed = ref.watch(adsAllowedProvider);
    final canRequestAds = ref.watch(
      adConsentProvider.select((state) => state.canRequestAds),
    );
    if (!allowed || !canRequestAds) return const SizedBox.shrink();

    final handle = _handle;
    if (_phase == _SlotPhase.loaded && handle != null) {
      return AdMobFrame(onDark: widget.onDark, child: handle.view);
    }
    if (_phase == _SlotPhase.unavailable) return const SizedBox.shrink();

    // Idle or requesting. Hold the space only for a request that will really
    // be made, so a slot that is about to find nothing never flashes a frame.
    ref.watch(adMobNoFillProvider);
    final willRequest =
        ref.watch(adMobConfigProvider).nativeUnitIdFor(widget.placement) !=
            null &&
        (_phase == _SlotPhase.requesting ||
            !ref
                .read(adMobNoFillProvider.notifier)
                .coolingDown(widget.placement));
    if (!willRequest) return const SizedBox.shrink();
    return widget.loading ?? AdMobFrame(onDark: widget.onDark);
  }
}

/// The frame every Google native ad is shown in.
///
/// A label the app draws itself, above and outside the ad view, then the
/// template at the one size it is laid out for. The label is not a control:
/// nothing interactive sits against the advert's edge, and the gap it makes
/// is the buffer between the advert and whatever row is above it. Without a
/// [child] it is the reserved space a request in flight holds.
class AdMobFrame extends StatelessWidget {
  const AdMobFrame({this.child, this.onDark = false, super.key});

  final Widget? child;
  final bool onDark;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final labelColor = onDark ? Colors.white70 : brand.mutedInk;
    return Semantics(
      container: true,
      label: 'Advertisement',
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 10),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Align(
              alignment: Alignment.centerLeft,
              child: ExcludeSemantics(
                child: Text(
                  'ADVERTISEMENT',
                  style: TextStyle(
                    color: labelColor,
                    fontSize: 10.5,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 1.3,
                  ),
                ),
              ),
            ),
            const SizedBox(height: 8),
            Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(
                  maxWidth: NativeAdBox.maxWidth,
                ),
                child: SizedBox(
                  height: NativeAdBox.height,
                  width: double.infinity,
                  child:
                      child ??
                      DecoratedBox(
                        key: const Key('admob-reserved-space'),
                        decoration: BoxDecoration(
                          color: onDark
                              ? Colors.white.withValues(alpha: 0.06)
                              : brand.surfaceMuted,
                          borderRadius: BorderRadius.circular(12),
                        ),
                      ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
