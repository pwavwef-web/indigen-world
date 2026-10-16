import 'dart:async';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_mobile_ads/google_mobile_ads.dart';
import 'package:visibility_detector/visibility_detector.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/ads/admob_config.dart';
import 'package:indigen_world_mobile/features/ads/admob_native.dart';
import 'package:indigen_world_mobile/features/ads/ad_consent.dart';
import 'package:indigen_world_mobile/features/ads/data/ad_campaign.dart';
import 'package:indigen_world_mobile/features/ads/data/served_ad.dart';
import 'package:indigen_world_mobile/features/ads/widgets/sponsored_card.dart';
import 'package:indigen_world_mobile/features/subscriptions/data/subscription_providers.dart';

/// One UI placement, independent of comment documents and their counts.
class CommentSponsor extends ConsumerStatefulWidget {
  const CommentSponsor({
    required this.threadKey,
    this.eligible = true,
    super.key,
  });
  final String threadKey;
  final bool eligible;
  @override
  ConsumerState<CommentSponsor> createState() => _CommentSponsorState();
}

class _CommentSponsorState extends ConsumerState<CommentSponsor> {
  static final _claimed = <String>{};
  static const _measurements = MethodChannel('world.indigen/comment_ad');
  static final _heightListeners = <String, void Function(double)>{};
  double _nativeHeight = 190;
  NativeAd? _ad;
  bool _loaded = false, _requested = false, _visible = false, _owns = false;
  @override
  void initState() {
    super.initState();
    _owns = _claimed.add(widget.threadKey);
    if (_owns) {
      _heightListeners[widget.threadKey] = (height) {
        if (mounted && height >= 120 && height != _nativeHeight)
          setState(() => _nativeHeight = height);
      };
      _measurements.setMethodCallHandler((call) async {
        if (call.method == 'height' && call.arguments is Map) {
          final data = call.arguments as Map;
          final height = data['height'];
          if (height is num)
            _heightListeners[data['instanceId']]?.call(height.toDouble());
        }
      });
    }
  }

  @override
  void dispose() {
    _ad?.dispose();
    if (_owns) _claimed.remove(widget.threadKey);
    if (_owns) _heightListeners.remove(widget.threadKey);
    super.dispose();
  }

  Future<void> _request() async {
    if (_requested ||
        !_visible ||
        !mounted ||
        !ref.read(adsAllowedProvider) ||
        !ref.read(adConsentProvider).canRequestAds)
      return;
    final unit = ref
        .read(adMobConfigProvider)
        .nativeUnitIdFor(AdPlacement.post_comments);
    if (unit == null ||
        ref
            .read(adMobNoFillProvider.notifier)
            .coolingDown(AdPlacement.post_comments))
      return;
    _requested = true;
    if (!await ref.read(mobileAdsInitializerProvider).ensureInitialized() ||
        !mounted ||
        !ref.read(adsAllowedProvider))
      return;
    final ad = NativeAd(
      adUnitId: unit,
      factoryId: 'postComments',
      customOptions: {
        'dark': Theme.of(context).brightness == Brightness.dark,
        'instanceId': widget.threadKey,
      },
      request: const AdRequest(),
      nativeAdOptions: NativeAdOptions(
        videoOptions: VideoOptions(startMuted: true),
      ),
      listener: NativeAdListener(
        onAdLoaded: (ad) {
          if (!mounted || !ref.read(adsAllowedProvider)) {
            ad.dispose();
            return;
          }
          setState(() => _loaded = true);
        },
        onAdFailedToLoad: (ad, error) {
          ad.dispose();
          if (mounted) {
            _ad = null;
            ref
                .read(adMobNoFillProvider.notifier)
                .record(AdPlacement.post_comments);
            setState(() {});
          }
        },
      ),
    );
    _ad = ad;
    await ad.load();
  }

  @override
  Widget build(BuildContext context) {
    final inventory = ref.watch(
      placementInventoryProvider(AdPlacement.post_comments),
    );
    ref.listen<bool>(adsAllowedProvider, (_, allowed) {
      if (!allowed) {
        _ad?.dispose();
        _ad = null;
        _loaded = false;
      }
    });
    ref.listen<bool>(adConsentProvider.select((v) => v.canRequestAds), (
      _,
      allowed,
    ) {
      if (!allowed) {
        _ad?.dispose();
        _ad = null;
        _loaded = false;
      }
    });
    const enabled = bool.fromEnvironment(
      'POST_COMMENTS_ADS_ENABLED',
      defaultValue: !kReleaseMode,
    );
    if (!enabled ||
        !_owns ||
        !widget.eligible ||
        !inventory.allowed ||
        !inventory.resolved)
      return const SizedBox.shrink();
    final house = inventory.firstParty.firstOrNull;
    final telemetry = ref.watch(servedAdTelemetryProvider);
    Widget child;
    if (house != null) {
      child = Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                if (house.campaignId.startsWith('house-'))
                  Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: Image.asset(
                      'assets/brand/indigen-world-mark.png',
                      width: 32,
                      height: 32,
                      semanticLabel: 'Indigen World',
                    ),
                  )
                else if (house.advertiserLogoUrl.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: CircleAvatar(
                      radius: 16,
                      backgroundImage: CachedNetworkImageProvider(
                        house.advertiserLogoUrl,
                      ),
                    ),
                  ),
                Expanded(
                  child: Text(
                    house.advertiserName.isEmpty
                        ? 'Sponsored'
                        : house.advertiserName,
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                ),
                const Text('Sponsored', style: TextStyle(fontSize: 11)),
              ],
            ),
            const SizedBox(height: 8),
            Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                Expanded(
                  child: Text(
                    house.body.isEmpty ? house.headline : house.body,
                    maxLines: MediaQuery.textScalerOf(context).scale(14) > 21
                        ? 5
                        : 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                if (!house.isVideo && house.hasCreative)
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 10),
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(8),
                      child: CachedNetworkImage(
                        imageUrl: house.creativeUrl,
                        memCacheWidth: 160,
                        width: 58,
                        height: 58,
                        fit: BoxFit.cover,
                        errorWidget: (_, _, _) => const SizedBox.shrink(),
                      ),
                    ),
                  ),
                if (house.hasLink) SponsoredCtaButton(ad: house),
              ],
            ),
            const SizedBox(height: 8),
            Divider(height: 1, color: context.brand.divider),
          ],
        ),
      );
    } else if (inventory.adMobEligible &&
        defaultTargetPlatform == TargetPlatform.android) {
      // Reserve space before visibility/request. This is a custom native layout,
      // never a clipped medium template; large system text receives more height.
      child = _requested && _ad == null
          ? const SizedBox.shrink()
          : Padding(
              padding: const EdgeInsets.all(12),
              child: SizedBox(
                height: _nativeHeight,
                child: _loaded && _ad != null
                    ? AdWidget(ad: _ad!)
                    : const SizedBox.expand(),
              ),
            );
    } else {
      return const SizedBox.shrink();
    }
    return VisibilityDetector(
      key: ValueKey('comment-sponsor-${widget.threadKey}'),
      onVisibilityChanged: (info) {
        _visible = info.visibleFraction >= .5;
        if (!_visible || !mounted) return;
        if (house != null) {
          unawaited(telemetry.recordImpression(house.campaignId));
        } else {
          unawaited(_request());
        }
      },
      child: child,
    );
  }
}
