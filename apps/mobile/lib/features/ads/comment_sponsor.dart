import 'dart:async';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_mobile_ads/google_mobile_ads.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/ads/ad_consent.dart';
import 'package:indigen_world_mobile/features/ads/admob_config.dart';
import 'package:indigen_world_mobile/features/ads/admob_native.dart';
import 'package:indigen_world_mobile/features/ads/data/ad_campaign.dart';
import 'package:indigen_world_mobile/features/ads/data/served_ad.dart';
import 'package:indigen_world_mobile/features/ads/widgets/sponsored_card.dart';
import 'package:indigen_world_mobile/features/subscriptions/data/subscription_providers.dart';
import 'package:visibility_detector/visibility_detector.dart';

/// The sponsored slot above a thread's first reply.
///
/// ── Shaped like a reply, never mistaken for one ──────────────────────────
/// The convention people already know from Reddit: the first thing under a
/// post's reply count is a promoted entry drawn in the thread's own shape —
/// avatar, name, a line of text, a link card — so it reads as part of the
/// page rather than a banner dropped into a conversation. What keeps it
/// honest is that it is never *only* that shape: "Sponsored" sits beside the
/// name on every one, there is no reply, like or share control to suggest a
/// person said it, and it is a UI placement rather than a comment record, so
/// it cannot be counted, notified, quoted or exported as somebody's words.
///
/// One per thread, even when the same thread is open twice (a reel's comment
/// sheet over its post page): the first slot to mount claims [threadKey].
class CommentSponsor extends ConsumerStatefulWidget {
  const CommentSponsor({
    required this.threadKey,
    this.eligible = true,
    this.padding = const EdgeInsets.fromLTRB(16, 10, 12, 12),
    this.avatarSize = 34,
    super.key,
  });

  final String threadKey;
  final bool eligible;

  /// Where the row sits, so it lines up with the thread's own replies.
  final EdgeInsets padding;
  final double avatarSize;

  @override
  ConsumerState<CommentSponsor> createState() => _CommentSponsorState();
}

class _CommentSponsorState extends ConsumerState<CommentSponsor> {
  static final _claimed = <String>{};
  static const _measurements = MethodChannel('world.indigen/comment_ad');
  static final _heightListeners = <String, void Function(double)>{};
  static var _channelWired = false;

  /// A first guess at the native row before Android has measured it: the
  /// identity line, two lines of text and the 120dp media the SDK requires.
  double _nativeHeight = 232;
  NativeAd? _ad;
  bool _loaded = false, _requested = false, _visible = false, _owns = false;

  /// An impression is the slot being seen, once — not every visibility
  /// callback while somebody scrolls past it.
  bool _impressed = false;

  @override
  void initState() {
    super.initState();
    _owns = _claimed.add(widget.threadKey);
    if (!_owns) return;
    _heightListeners[widget.threadKey] = (height) {
      if (mounted && height >= 120 && (height - _nativeHeight).abs() > 0.5) {
        setState(() => _nativeHeight = height);
      }
    };
    if (!_channelWired) {
      _channelWired = true;
      _measurements.setMethodCallHandler((call) async {
        if (call.method == 'height' && call.arguments is Map) {
          final data = call.arguments as Map;
          final height = data['height'];
          if (height is num) {
            _heightListeners[data['instanceId']]?.call(height.toDouble());
          }
        }
      });
    }
  }

  @override
  void dispose() {
    _ad?.dispose();
    if (_owns) {
      _claimed.remove(widget.threadKey);
      _heightListeners.remove(widget.threadKey);
    }
    super.dispose();
  }

  void _dropAd() {
    _ad?.dispose();
    _ad = null;
    _loaded = false;
  }

  Future<void> _request() async {
    if (_requested ||
        !_visible ||
        !mounted ||
        !ref.read(adsAllowedProvider) ||
        !ref.read(adConsentProvider).canRequestAds) {
      return;
    }
    final unit = ref
        .read(adMobConfigProvider)
        .nativeUnitIdFor(AdPlacement.post_comments);
    if (unit == null ||
        ref
            .read(adMobNoFillProvider.notifier)
            .coolingDown(AdPlacement.post_comments)) {
      return;
    }
    _requested = true;
    if (!await ref.read(mobileAdsInitializerProvider).ensureInitialized() ||
        !mounted ||
        !ref.read(adsAllowedProvider)) {
      return;
    }
    final brand = context.brand;
    final ad = NativeAd(
      adUnitId: unit,
      factoryId: 'postComments',
      // The native row is drawn by Android, so it is handed the palette
      // rather than guessing at it: a comment row in the wrong colours is
      // the fastest way for a sponsored slot to look like a foreign object.
      customOptions: {
        'dark': brand.isDark,
        'instanceId': widget.threadKey,
        'ink': brand.ink.toARGB32(),
        'muted': brand.mutedInk.toARGB32(),
        'accent': brand.accent.toARGB32(),
        'accentSoft': brand.accentSoft.toARGB32(),
        'border': brand.border.toARGB32(),
        'surface': brand.surface.toARGB32(),
        'avatar': widget.avatarSize,
      },
      request: const AdRequest(),
      nativeAdOptions: NativeAdOptions(
        videoOptions: VideoOptions(startMuted: true),
        adChoicesPlacement: AdChoicesPlacement.topRightCorner,
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
    // A member who subscribes mid-thread, or withdraws consent, loses the
    // advert at once rather than on the next visit.
    ref.listen<bool>(adsAllowedProvider, (_, allowed) {
      if (!allowed) setState(_dropAd);
    });
    ref.listen<bool>(adConsentProvider.select((v) => v.canRequestAds), (
      _,
      allowed,
    ) {
      if (!allowed) setState(_dropAd);
    });
    const enabled = bool.fromEnvironment(
      'POST_COMMENTS_ADS_ENABLED',
      defaultValue: !kReleaseMode,
    );
    if (!enabled ||
        !_owns ||
        !widget.eligible ||
        !inventory.allowed ||
        !inventory.resolved) {
      return const SizedBox.shrink();
    }
    final house = inventory.firstParty.firstOrNull;
    final telemetry = ref.watch(servedAdTelemetryProvider);
    final Widget child;
    if (house != null) {
      child = PromotedComment(
        ad: house,
        padding: widget.padding,
        avatarSize: widget.avatarSize,
      );
    } else if (inventory.adMobEligible &&
        defaultTargetPlatform == TargetPlatform.android) {
      // A registered custom native layout, never a squeezed medium template.
      // Space is held only once the advert has actually loaded, so nothing
      // jumps under a thumb, and the height follows Android's own measurement
      // — larger system text makes the row taller rather than clipping it.
      if (!_loaded || _ad == null) {
        child = const SizedBox(width: double.infinity, height: 1);
      } else {
        child = Padding(
          padding: EdgeInsets.only(
            left: widget.padding.left,
            right: widget.padding.right,
          ),
          child: AnimatedSize(
            duration: const Duration(milliseconds: 180),
            child: SizedBox(
              height: _nativeHeight,
              child: AdWidget(ad: _ad!),
            ),
          ),
        );
      }
    } else {
      return const SizedBox.shrink();
    }
    return VisibilityDetector(
      key: ValueKey('comment-sponsor-${widget.threadKey}'),
      onVisibilityChanged: (info) {
        _visible = info.visibleFraction >= .5;
        if (!_visible || !mounted) return;
        if (house != null) {
          if (_impressed) return;
          _impressed = true;
          unawaited(telemetry.recordImpression(house.campaignId));
        } else {
          unawaited(_request());
        }
      },
      child: child,
    );
  }
}

/// A first-party advert drawn as an entry in a thread.
///
/// Public so the render checks and the ads console preview can draw exactly
/// what a member sees.
class PromotedComment extends ConsumerWidget {
  const PromotedComment({
    required this.ad,
    this.padding = const EdgeInsets.fromLTRB(16, 10, 12, 12),
    this.avatarSize = 34,
    super.key,
  });

  final ServedAd ad;
  final EdgeInsets padding;
  final double avatarSize;

  /// Indigen World's own campaigns are published by the house-ads console,
  /// which is the only writer of `house-` placements.
  bool get _isHouse => ad.campaignId.startsWith('house-');

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final brand = context.brand;
    final name = _isHouse
        ? 'Indigen World'
        : ad.advertiserName.isEmpty
        ? 'Sponsored'
        : ad.advertiserName;
    final text = ad.body.isNotEmpty ? ad.body : ad.headline;
    final large = MediaQuery.textScalerOf(context).scale(14) > 20;
    return Semantics(
      container: true,
      label: 'Sponsored by $name',
      child: DecoratedBox(
        decoration: BoxDecoration(
          border: Border(bottom: BorderSide(color: brand.divider)),
        ),
        child: Padding(
          padding: padding,
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _AdvertiserAvatar(ad: ad, house: _isHouse, size: avatarSize),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Row(
                            children: [
                              Flexible(
                                child: Text(
                                  name,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(
                                    color: brand.ink,
                                    fontSize: 13.5,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                              ),
                              if (_isHouse) ...[
                                const SizedBox(width: 3),
                                Icon(
                                  Icons.verified_rounded,
                                  size: 14,
                                  color: brand.accent,
                                  semanticLabel: 'Indigen World',
                                ),
                              ],
                              const SizedBox(width: 6),
                              const SponsoredTag(),
                            ],
                          ),
                        ),
                        const WhyThisAdvertButton(),
                      ],
                    ),
                    if (text.isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.only(top: 2),
                        child: Text(
                          text,
                          maxLines: large ? 6 : 3,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            color: brand.ink,
                            fontSize: 14.5,
                            height: 1.35,
                          ),
                        ),
                      ),
                    if (ad.hasLink || (ad.hasCreative && !ad.isVideo))
                      Padding(
                        padding: const EdgeInsets.only(top: 8),
                        child: _LinkCard(ad: ad),
                      ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// The persistent word on every sponsored slot.
class SponsoredTag extends StatelessWidget {
  const SponsoredTag({super.key});

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: brand.gold.withValues(alpha: brand.isDark ? 0.22 : 0.18),
        borderRadius: BorderRadius.circular(5),
      ),
      child: Text(
        'Sponsored',
        style: TextStyle(
          color: brand.isDark ? brand.gold : brand.ink,
          fontSize: 10.5,
          fontWeight: FontWeight.w800,
          letterSpacing: 0.2,
        ),
      ),
    );
  }
}

class _AdvertiserAvatar extends StatelessWidget {
  const _AdvertiserAvatar({
    required this.ad,
    required this.house,
    required this.size,
  });
  final ServedAd ad;
  final bool house;
  final double size;
  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final Widget inner;
    if (house) {
      inner = Padding(
        padding: EdgeInsets.all(size * 0.14),
        child: Image.asset(
          'assets/brand/indigen-world-mark.png',
          fit: BoxFit.contain,
          excludeFromSemantics: true,
        ),
      );
    } else if (ad.advertiserLogoUrl.isNotEmpty) {
      inner = CachedNetworkImage(
        imageUrl: ad.advertiserLogoUrl,
        memCacheWidth: (size * 3).round(),
        fit: BoxFit.cover,
        errorWidget: (_, _, _) => _initial(brand),
      );
    } else {
      inner = _initial(brand);
    }
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: brand.surface,
        shape: BoxShape.circle,
        border: Border.all(color: brand.border),
      ),
      clipBehavior: Clip.antiAlias,
      child: inner,
    );
  }

  Widget _initial(BrandPalette brand) => ColoredBox(
    color: brand.accentSoft,
    child: Center(
      child: Text(
        ad.advertiserName.isEmpty ? 'S' : ad.advertiserName[0].toUpperCase(),
        style: TextStyle(color: brand.accent, fontWeight: FontWeight.w900),
      ),
    ),
  );
}

/// Picture, headline, where it goes, and the one button.
class _LinkCard extends ConsumerWidget {
  const _LinkCard({required this.ad});
  final ServedAd ad;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final brand = context.brand;
    final host = Uri.tryParse(ad.ctaUrl)?.host.replaceFirst('www.', '') ?? '';
    final showHeadline = ad.body.isNotEmpty && ad.headline.isNotEmpty;
    return Material(
      color: brand.surface,
      clipBehavior: Clip.antiAlias,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: BorderSide(color: brand.border),
      ),
      child: InkWell(
        onTap: ad.hasLink ? () => openSponsoredAd(context, ref, ad) : null,
        child: Padding(
          padding: const EdgeInsets.all(8),
          child: Row(
            children: [
              if (ad.hasCreative && !ad.isVideo) ...[
                ClipRRect(
                  borderRadius: BorderRadius.circular(9),
                  child: CachedNetworkImage(
                    imageUrl: ad.creativeUrl,
                    memCacheWidth: 200,
                    width: 56,
                    height: 56,
                    fit: BoxFit.cover,
                    placeholder: (_, _) => ColoredBox(
                      color: brand.surfaceMuted,
                      child: const SizedBox(width: 56, height: 56),
                    ),
                    errorWidget: (_, _, _) => const SizedBox.shrink(),
                  ),
                ),
                const SizedBox(width: 10),
              ],
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (showHeadline)
                      Text(
                        ad.headline,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: brand.ink,
                          fontSize: 13.5,
                          height: 1.25,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    if (host.isNotEmpty)
                      Text(
                        host,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(color: brand.mutedInk, fontSize: 12),
                      ),
                  ],
                ),
              ),
              if (ad.hasLink) ...[
                const SizedBox(width: 8),
                FilledButton.tonal(
                  onPressed: () => openSponsoredAd(context, ref, ad),
                  style: FilledButton.styleFrom(
                    minimumSize: const Size(0, 40),
                    padding: const EdgeInsets.symmetric(horizontal: 14),
                    visualDensity: VisualDensity.compact,
                    textStyle: const TextStyle(
                      fontFamily: 'Noto Sans',
                      fontSize: 13,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  child: Text(ad.callToAction),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
