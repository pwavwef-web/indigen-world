import 'dart:async';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/ads/data/served_ad.dart';
import 'package:indigen_world_mobile/features/subscriptions/manage_subscription_screen.dart';
import 'package:indigen_world_mobile/shared/glass_popup.dart';
import 'package:indigen_world_mobile/shared/glass_surface.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:visibility_detector/visibility_detector.dart';

/// ─────────────────────────────────────────────────────────────────────────────
/// SPONSORED SURFACES
///
/// How a paid advert looks anywhere in the app. Everything here exists so that
/// an advert is never mistaken for the thing it is sitting next to: it wears
/// the word "Sponsored" before it says anything else, it borrows the same glass
/// the rest of the app is built from rather than inventing a louder material of
/// its own, and it never borrows the chrome that means *a member made this* —
/// no creator avatar, no appreciation, no replies.
///
/// There are two shapes and not one because the two hosts are different
/// shapes. The Community timeline is a column of full-width rows and can afford
/// a creative, a headline, a paragraph and a button; the Collection grid hands
/// its tiles a stated height next to seven portals and can afford a creative, a
/// line and an arrow. One widget stretched across both would have been a
/// [SponsoredCard] with half its parts turned off.
/// ─────────────────────────────────────────────────────────────────────────────

/// How much of an advert has to be on screen before it counts as seen.
///
/// The same 0.55 the Community feed counts a post at. A number shared with the
/// content it sits among, so an advertiser is never billed on a threshold
/// friendlier than the one the app uses on itself.
const double kSponsoredVisibleFraction = 0.55;

/// How a sponsored link reaches the browser.
///
/// A seam rather than a direct [launchUrl] call, and only for one reason: the
/// order in [SponsoredLinkOpener.open] — counted, *then* opened — is a promise
/// to advertisers, and a promise worth a test is a promise worth being able to
/// observe without a Firebase project and a platform channel.
typedef SponsoredLinkLauncher = Future<bool> Function(Uri url);

final sponsoredLinkLauncherProvider = Provider<SponsoredLinkLauncher>(
  (ref) => (url) => launchUrl(url, mode: LaunchMode.externalApplication),
);

/// What happens when somebody taps an advert.
class SponsoredLinkOpener {
  const SponsoredLinkOpener(this._telemetry, this._launch);

  final ServedAdTelemetry _telemetry;
  final SponsoredLinkLauncher _launch;

  /// Records the click, then opens the destination. Returns whether anything
  /// opened, so the caller can say so when nothing did.
  ///
  /// The recording is first and it is awaited. A click that opened a browser
  /// and then lost its write on the way out of the app is a click the
  /// advertiser paid for and cannot see, and the write is a single callable
  /// against a warm connection — the browser is a moment later, not a moment
  /// too late.
  Future<bool> open(ServedAd ad) async {
    await _telemetry.recordClick(ad.campaignId);
    final uri = Uri.tryParse(ad.ctaUrl);
    // Only the web. An advert is copy somebody else wrote, and the one thing a
    // paid-for string must not be allowed to do is name a scheme of its own and
    // have this app hand it to the platform.
    if (uri == null || (uri.scheme != 'http' && uri.scheme != 'https')) {
      return false;
    }
    try {
      return await _launch(uri);
    } on Object {
      return false;
    }
  }
}

final sponsoredLinkOpenerProvider = Provider<SponsoredLinkOpener>(
  (ref) => SponsoredLinkOpener(
    ref.watch(servedAdTelemetryProvider),
    ref.watch(sponsoredLinkLauncherProvider),
  ),
);

Future<void> _openAd(BuildContext context, WidgetRef ref, ServedAd ad) async {
  if (await ref.read(sponsoredLinkOpenerProvider).open(ad)) return;
  if (context.mounted) showGlassToast(context, 'Could not open this advert.');
}

/// One advert in a scrolling feed: the Community timeline.
class SponsoredCard extends ConsumerWidget {
  const SponsoredCard({
    required this.ad,
    required this.slot,
    this.margin = const EdgeInsets.fromLTRB(16, 10, 16, 10),
    super.key,
  });

  final ServedAd ad;

  /// What tells two showings of the same campaign apart.
  ///
  /// A rotation of one advert down a long feed puts the same campaign id on
  /// screen several times over, and a [VisibilityDetector] needs a key nothing
  /// else in the tree shares.
  final String slot;

  /// The space around the card.
  ///
  /// The default is the Community timeline's, which is full-bleed and so has to
  /// inset the advert itself. A Collection channel is a list that already has a
  /// gutter, and a card that adds its own on top of that would be the one row
  /// on the page that is narrower than the rest — which reads as a mistake
  /// rather than as a boundary.
  final EdgeInsetsGeometry margin;

  @override
  Widget build(BuildContext context, WidgetRef ref) => _SponsoredImpression(
    campaignId: ad.campaignId,
    slot: slot,
    child: Padding(
      padding: margin,
      child: GlassCard.listItem(
        // The gold hairline is the app's own "this is set apart" hint, and it
        // is as loud as an advert is allowed to be here.
        accent: context.brand.gold,
        padding: EdgeInsets.zero,
        onTap: ad.hasLink ? () => _openAd(context, ref, ad) : null,
        semanticLabel: 'Sponsored. ${ad.headline}',
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (ad.hasCreative)
              ClipRRect(
                borderRadius: const BorderRadius.vertical(
                  top: Radius.circular(kGlassRadius - 1),
                ),
                child: AspectRatio(
                  aspectRatio: 16 / 9,
                  child: _SponsoredCreative(ad: ad),
                ),
              ),
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 12, 14, 13),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Row(
                    children: [
                      _SponsoredLabel(),
                      Spacer(),
                      _WhyThisAdvert(),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Text(
                    ad.headline,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  if (ad.body.isNotEmpty) ...[
                    const SizedBox(height: 5),
                    Text(
                      ad.body,
                      maxLines: 3,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: context.brand.mutedInk,
                        fontSize: 13,
                        height: 1.4,
                      ),
                    ),
                  ],
                  if (ad.hasLink) ...[
                    const SizedBox(height: 13),
                    Align(
                      alignment: Alignment.centerLeft,
                      child: SponsoredCtaButton(ad: ad),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    ),
  );
}

/// One advert in the Collection grid, sized like the portal tiles beside it.
///
/// Deliberately the same shell those tiles use — artwork band, then a capped
/// caption — so it sits in the grid instead of on top of it. What makes it an
/// advert rather than an eighth portal is the label over the artwork and the
/// arrow that says it leaves the app.
class SponsoredTile extends ConsumerWidget {
  const SponsoredTile({required this.ad, super.key});

  final ServedAd ad;

  @override
  Widget build(BuildContext context, WidgetRef ref) => _SponsoredImpression(
    campaignId: ad.campaignId,
    slot: 'collection',
    // The shell `CollectionCardSurface` builds, spelled out rather than
    // imported: a shared advert widget that reached into the Collection
    // feature for its frame would stop being shared the first time one of the
    // two changed.
    child: ClipRRect(
      borderRadius: BorderRadius.circular(18),
      child: GlassCard.listItem(
        radius: 18,
        accent: context.brand.gold,
        padding: EdgeInsets.zero,
        onTap: ad.hasLink ? () => _openAd(context, ref, ad) : null,
        semanticLabel: 'Sponsored. ${ad.headline}',
        child: LayoutBuilder(
          builder: (context, constraints) {
            final artwork = Stack(
              fit: StackFit.expand,
              children: [
                _SponsoredCreative(ad: ad),
                const Positioned(top: 10, left: 10, child: _SponsoredLabel()),
              ],
            );
            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // The grid states a tile height and the single-column fallback
                // states none, exactly as the portal tiles have to handle.
                if (constraints.hasBoundedHeight)
                  Expanded(child: artwork)
                else
                  AspectRatio(aspectRatio: 4 / 3, child: artwork),
                Padding(
                  padding: const EdgeInsets.all(13),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        ad.headline,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                      const SizedBox(height: 6),
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              ad.hasLink ? ad.callToAction : 'Sponsored',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                color: context.brand.gold,
                                fontSize: 10,
                                fontWeight: FontWeight.w900,
                              ),
                            ),
                          ),
                          if (ad.hasLink)
                            Icon(
                              Icons.open_in_new_rounded,
                              color: context.brand.mutedInk,
                              size: 15,
                            ),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            );
          },
        ),
      ),
    ),
  );
}

/// The advert's button, wherever it appears.
///
/// Public because the Explore reel draws its own chrome over full-bleed footage
/// and cannot use either card, but the thing a tap does — count, then open —
/// must not be written twice.
class SponsoredCtaButton extends ConsumerWidget {
  const SponsoredCtaButton({required this.ad, this.onDark = false, super.key});

  final ServedAd ad;
  final bool onDark;

  /// Deliberately the palette's own accent fill rather than the gold the label
  /// and the hairline wear. Gold is a light colour and this pill's foreground
  /// is white; the advert is already unmistakable by the time somebody reaches
  /// the button, and a button nobody can read is not a louder advert, only a
  /// worse one.
  @override
  Widget build(BuildContext context, WidgetRef ref) => GlassPill(
    label: ad.callToAction,
    icon: Icons.open_in_new_rounded,
    selected: true,
    onDark: onDark,
    onTap: () => _openAd(context, ref, ad),
  );
}

/// The question every advert should be willing to answer.
///
/// ── Why this is here, and why it offers a way out ─────────────────────────
/// Adverts now run through the Collection channels as well as the two feeds,
/// which means a member can meet several in an afternoon of ordinary use. An app
/// that has just increased how often it interrupts somebody owes them two
/// things: a plain account of why, and the door out. Both are one tap away, and
/// the door is a real one — a membership genuinely removes every advert in the
/// app, enforced in `placedAdsProvider` rather than promised here.
///
/// Deliberately a small icon and not a labelled button. It has to be findable
/// by anybody who wants it and invisible to everybody who does not, and an
/// advert that argues its own case in a paragraph is a worse advert and a worse
/// app.
class _WhyThisAdvert extends StatelessWidget {
  const _WhyThisAdvert();

  @override
  Widget build(BuildContext context) => IconButton(
    tooltip: 'Why am I seeing this?',
    visualDensity: VisualDensity.compact,
    padding: EdgeInsets.zero,
    constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
    iconSize: 16,
    color: context.brand.mutedInk,
    icon: const Icon(Icons.info_outline_rounded),
    onPressed: () => _explain(context),
  );

  Future<void> _explain(BuildContext context) async {
    final seePlans = await showGlassPopup<bool>(
      context: context,
      title: 'Why am I seeing this?',
      builder: (popupContext) => Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'Everything in Indigen World is free to read, watch and listen to, '
            'and adverts are part of how that is paid for. They are placed by '
            'the project — nobody is tracked, profiled or targeted, and no '
            'advertiser is told anything about you.\n\n'
            'A membership takes every advert out of the app.',
            style: TextStyle(
              color: popupContext.brand.mutedInk,
              fontSize: 13.5,
              height: 1.5,
            ),
          ),
          const SizedBox(height: 18),
          FilledButton(
            onPressed: () => Navigator.pop(popupContext, true),
            child: const Text('See membership'),
          ),
        ],
      ),
    );
    if (seePlans != true || !context.mounted) return;
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (context) => const ManageSubscriptionScreen(),
      ),
    );
  }
}

/// The word, first, on everything.
class _SponsoredLabel extends StatelessWidget {
  const _SponsoredLabel();

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
    decoration: BoxDecoration(
      color: context.brand.gold.withValues(alpha: 0.16),
      borderRadius: BorderRadius.circular(kGlassPillRadius),
      border: Border.all(color: context.brand.gold.withValues(alpha: 0.4)),
    ),
    child: Text(
      'Sponsored',
      style: TextStyle(
        color: context.brand.gold,
        fontSize: 9.5,
        fontWeight: FontWeight.w900,
        letterSpacing: 1.1,
      ),
    ),
  );
}

/// The creative itself.
///
/// ── Why a video creative is not played here ──────────────────────────────
/// An advert lands in a feed of other people's work, and in Explore that work
/// is already playing with its own sound. A clip that started itself in the
/// middle of a timeline would be a second soundtrack over the first, which is
/// the one thing this app spends real effort avoiding — see the whole video
/// lifecycle in `reel_view.dart`. There is also nothing to show: the placement
/// record carries the clip's own URL and no poster frame, and handing a video
/// file to an image decoder gets a broken picture rather than a still. So a
/// video creative is drawn as a plate that says what it is and waits to be
/// tapped.
class _SponsoredCreative extends StatelessWidget {
  const _SponsoredCreative({required this.ad});

  final ServedAd ad;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    if (ad.isVideo || !ad.hasCreative) {
      return DecoratedBox(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [
              brand.gold.withValues(alpha: 0.06),
              brand.terracotta.withValues(alpha: 0.13),
            ],
          ),
        ),
        child: Center(
          child: Icon(
            ad.isVideo
                ? Icons.play_circle_outline_rounded
                : Icons.campaign_rounded,
            color: brand.gold,
            size: 44,
          ),
        ),
      );
    }
    return CachedNetworkImage(
      imageUrl: ad.creativeUrl,
      fit: BoxFit.cover,
      placeholder: (context, url) =>
          ColoredBox(color: brand.surfaceMuted),
      errorWidget: (context, url, error) =>
          ColoredBox(color: brand.surfaceMuted),
    );
  }
}

/// Counts an advert the first time enough of it is genuinely on screen.
///
/// Only the threshold lives here. Whether this campaign has already been
/// counted is [ServedAdTelemetry]'s question, because the answer has to hold
/// across every surface and every rebuild, not just across this widget.
class _SponsoredImpression extends ConsumerWidget {
  const _SponsoredImpression({
    required this.campaignId,
    required this.slot,
    required this.child,
  });

  final String campaignId;
  final String slot;
  final Widget child;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Read once, into the closure. `VisibilityDetector` coalesces its callbacks
    // and can fire one after this element has gone, and a `ref` used after that
    // point is an error thrown out of a timer for the sake of a statistic.
    final telemetry = ref.watch(servedAdTelemetryProvider);
    return VisibilityDetector(
      key: ValueKey('sponsored-$slot-$campaignId'),
      onVisibilityChanged: (info) {
        if (info.visibleFraction < kSponsoredVisibleFraction) return;
        unawaited(telemetry.recordImpression(campaignId));
      },
      child: child,
    );
  }
}
