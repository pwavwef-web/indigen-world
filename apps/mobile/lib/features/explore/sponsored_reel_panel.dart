import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/features/ads/data/served_ad.dart';
import 'package:indigen_world_mobile/features/ads/widgets/sponsored_card.dart';
import 'package:share_plus/share_plus.dart';
import 'package:video_player/video_player.dart';

/// A first-party advert in Explore, laid out the way people already read a
/// video advert in a full-screen feed: the creative across the middle of a
/// black page, then who it is from, what it says, one white button, and the
/// player's own controls along the foot.
///
/// ── What it deliberately does not copy ────────────────────────────────────
/// The feeds this shape comes from put reply, repost and like totals under
/// an advert, because their adverts are posts. Ours are not: an Indigen World
/// campaign has no thread, nobody reposted it and nobody liked it, and a row
/// of counts would be numbers invented to make a paid placement look popular.
/// The pills that stand where those counts would be are the things a member
/// can actually do with an advert — share its link, ask why it is here, or
/// report or hide it.
///
/// The verified mark appears only on Indigen World's own house campaigns,
/// whose identity the server reserves. Third-party advertisers keep their own
/// name and logo, with no badge we have not checked.
class SponsoredReelPanel extends ConsumerWidget {
  const SponsoredReelPanel({
    required this.ad,
    required this.muted,
    required this.onToggleSound,
    required this.onMore,
    this.controller,
    this.playing = true,
    this.onTogglePlay,
    super.key,
  });

  final ServedAd ad;
  final VideoPlayerController? controller;
  final bool playing;
  final bool muted;
  final VoidCallback? onTogglePlay;
  final VoidCallback onToggleSound;
  final VoidCallback onMore;

  bool get _house => ad.campaignId.startsWith('house-');

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final name = _house
        ? 'Indigen World'
        : ad.advertiserName.isEmpty
        ? 'Sponsored'
        : ad.advertiserName;
    final host =
        Uri.tryParse(ad.ctaUrl)?.host.replaceFirst(RegExp(r'^www\.'), '') ?? '';
    final text = ad.body.isNotEmpty ? ad.body : ad.headline;
    final showHeadline = ad.body.isNotEmpty && ad.headline.isNotEmpty;
    final controller = this.controller;

    return Semantics(
      container: true,
      label: 'Advert from $name',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(18, 14, 18, 0),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _AdvertiserLogo(ad: ad, house: _house),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Flexible(
                            child: Text(
                              name,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 17,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                          ),
                          if (_house) ...[
                            const SizedBox(width: 4),
                            const Icon(
                              Icons.verified_rounded,
                              size: 17,
                              color: Color(0xFFF5B43C),
                              semanticLabel: 'Indigen World',
                            ),
                          ],
                        ],
                      ),
                      if (host.isNotEmpty)
                        Text(
                          host,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: Color(0xFFA9B1BE),
                            fontSize: 14,
                          ),
                        ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                const Padding(
                  padding: EdgeInsets.only(top: 2),
                  child: Text(
                    'Ad',
                    style: TextStyle(
                      color: Color(0xFFA9B1BE),
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ],
            ),
          ),
          if (text.isNotEmpty)
            Padding(
              padding: const EdgeInsets.fromLTRB(18, 12, 18, 0),
              child: Text.rich(
                TextSpan(
                  children: [
                    if (showHeadline)
                      TextSpan(
                        text: '${ad.headline}\n',
                        style: const TextStyle(fontWeight: FontWeight.w800),
                      ),
                    TextSpan(text: text),
                  ],
                ),
                maxLines: MediaQuery.textScalerOf(context).scale(16) > 22
                    ? 6
                    : 4,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 16,
                  height: 1.35,
                ),
              ),
            ),
          Padding(
            padding: const EdgeInsets.fromLTRB(18, 14, 18, 0),
            child: Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                if (ad.hasLink)
                  _Pill(
                    icon: Icons.ios_share_rounded,
                    label: 'Share',
                    onTap: () => Share.share(ad.ctaUrl),
                  ),
                _Pill(
                  icon: Icons.info_outline_rounded,
                  label: 'Why this ad',
                  onTap: () => explainSponsoredAd(context),
                ),
                _Pill(
                  icon: Icons.more_horiz_rounded,
                  label: 'More',
                  semanticLabel: 'More options for this advert',
                  onTap: onMore,
                ),
              ],
            ),
          ),
          if (ad.hasLink)
            Padding(
              padding: const EdgeInsets.fromLTRB(18, 16, 18, 0),
              child: SizedBox(
                height: 50,
                child: FilledButton(
                  onPressed: () {
                    HapticFeedback.selectionClick();
                    openSponsoredAd(context, ref, ad);
                  },
                  style: FilledButton.styleFrom(
                    backgroundColor: Colors.white,
                    foregroundColor: Colors.black,
                    shape: const StadiumBorder(),
                    textStyle: const TextStyle(
                      fontFamily: 'Noto Sans',
                      fontSize: 16,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  child: Text(
                    ad.callToAction,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ),
            ),
          if (controller != null)
            _PlayerControls(
              controller: controller,
              playing: playing,
              muted: muted,
              onTogglePlay: onTogglePlay,
              onToggleSound: onToggleSound,
            )
          else
            const SizedBox(height: 14),
        ],
      ),
    );
  }
}

class _AdvertiserLogo extends StatelessWidget {
  const _AdvertiserLogo({required this.ad, required this.house});
  final ServedAd ad;
  final bool house;

  @override
  Widget build(BuildContext context) {
    final Widget inner;
    if (house) {
      inner = Padding(
        padding: const EdgeInsets.all(6),
        child: Image.asset(
          'assets/brand/indigen-world-mark.png',
          fit: BoxFit.contain,
          excludeFromSemantics: true,
        ),
      );
    } else if (ad.advertiserLogoUrl.isNotEmpty) {
      inner = CachedNetworkImage(
        imageUrl: ad.advertiserLogoUrl,
        memCacheWidth: 150,
        fit: BoxFit.cover,
        errorWidget: (_, _, _) => _initial,
      );
    } else {
      inner = _initial;
    }
    return Container(
      width: 48,
      height: 48,
      decoration: BoxDecoration(
        color: const Color(0xFF1B2333),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: Colors.white.withValues(alpha: 0.12)),
      ),
      clipBehavior: Clip.antiAlias,
      child: inner,
    );
  }

  Widget get _initial => Center(
    child: Text(
      ad.advertiserName.isEmpty ? 'S' : ad.advertiserName[0].toUpperCase(),
      style: const TextStyle(
        color: Colors.white,
        fontSize: 20,
        fontWeight: FontWeight.w900,
      ),
    ),
  );
}

class _Pill extends StatelessWidget {
  const _Pill({
    required this.icon,
    required this.label,
    required this.onTap,
    this.semanticLabel,
  });
  final IconData icon;
  final String label;
  final String? semanticLabel;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Semantics(
    button: true,
    label: semanticLabel ?? label,
    excludeSemantics: true,
    child: Material(
      color: Colors.white.withValues(alpha: 0.12),
      shape: const StadiumBorder(),
      child: InkWell(
        customBorder: const StadiumBorder(),
        onTap: onTap,
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 42),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(icon, size: 19, color: Colors.white),
                const SizedBox(width: 7),
                Flexible(
                  child: Text(
                    label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    ),
  );
}

/// The thin progress line, then pause, time left, speed and sound.
class _PlayerControls extends StatefulWidget {
  const _PlayerControls({
    required this.controller,
    required this.playing,
    required this.muted,
    required this.onToggleSound,
    this.onTogglePlay,
  });

  final VideoPlayerController controller;
  final bool playing;
  final bool muted;
  final VoidCallback? onTogglePlay;
  final VoidCallback onToggleSound;

  @override
  State<_PlayerControls> createState() => _PlayerControlsState();
}

class _PlayerControlsState extends State<_PlayerControls> {
  static const _speeds = [1.0, 1.5, 2.0, 0.5];
  var _speed = 0;

  Future<void> _cycleSpeed() async {
    HapticFeedback.selectionClick();
    setState(() => _speed = (_speed + 1) % _speeds.length);
    await widget.controller.setPlaybackSpeed(_speeds[_speed]);
  }

  static String _remaining(Duration left) {
    final seconds = left.inSeconds.clamp(0, 359999);
    final m = seconds ~/ 60, s = seconds % 60;
    return '-$m:${s.toString().padLeft(2, '0')}';
  }

  static String _speedLabel(double speed) =>
      speed == speed.roundToDouble() ? '${speed.round()}x' : '${speed}x';

  @override
  Widget build(BuildContext context) =>
      ValueListenableBuilder<VideoPlayerValue>(
        valueListenable: widget.controller,
        builder: (context, value, _) {
          final total = value.duration;
          final fraction = total.inMilliseconds <= 0
              ? 0.0
              : (value.position.inMilliseconds / total.inMilliseconds).clamp(
                  0.0,
                  1.0,
                );
          return Padding(
            padding: const EdgeInsets.only(top: 18),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // The track runs edge to edge; drag or tap to move through.
                GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onHorizontalDragUpdate: (d) =>
                      _seek(context, d.localPosition.dx),
                  onTapUp: (d) => _seek(context, d.localPosition.dx),
                  child: SizedBox(
                    height: 18,
                    child: Align(
                      alignment: Alignment.bottomCenter,
                      child: Stack(
                        children: [
                          Container(
                            height: 3,
                            color: Colors.white.withValues(alpha: 0.28),
                          ),
                          FractionallySizedBox(
                            widthFactor: fraction,
                            child: Container(height: 3, color: Colors.white),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(6, 2, 6, 0),
                  child: Row(
                    children: [
                      IconButton(
                        tooltip: widget.playing ? 'Pause' : 'Play',
                        onPressed: widget.onTogglePlay,
                        color: Colors.white,
                        icon: Icon(
                          widget.playing
                              ? Icons.pause_rounded
                              : Icons.play_arrow_rounded,
                          size: 30,
                        ),
                      ),
                      Semantics(
                        label: 'Time left',
                        child: Text(
                          _remaining(total - value.position),
                          style: const TextStyle(
                            color: Color(0xFFD5DAE2),
                            fontSize: 15,
                            fontFeatures: [FontFeature.tabularFigures()],
                          ),
                        ),
                      ),
                      const Spacer(),
                      TextButton(
                        onPressed: _cycleSpeed,
                        style: TextButton.styleFrom(
                          foregroundColor: Colors.white,
                          minimumSize: const Size(48, 48),
                          textStyle: const TextStyle(
                            fontFamily: 'Noto Sans',
                            fontSize: 17,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        child: Text(
                          _speedLabel(_speeds[_speed]),
                          semanticsLabel:
                              'Playback speed ${_speedLabel(_speeds[_speed])}',
                        ),
                      ),
                      IconButton(
                        tooltip: widget.muted ? 'Turn sound on' : 'Mute',
                        onPressed: widget.onToggleSound,
                        color: Colors.white,
                        icon: Icon(
                          widget.muted
                              ? Icons.volume_off_rounded
                              : Icons.volume_up_rounded,
                        ),
                      ),
                      IconButton(
                        tooltip: 'Replay',
                        onPressed: () {
                          widget.controller.seekTo(Duration.zero);
                          widget.controller.play();
                        },
                        color: Colors.white,
                        icon: const Icon(Icons.replay_rounded),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          );
        },
      );

  void _seek(BuildContext context, double dx) {
    final width = context.size?.width ?? 0;
    final total = widget.controller.value.duration;
    if (width <= 0 || total <= Duration.zero) return;
    final fraction = (dx / width).clamp(0.0, 1.0);
    widget.controller.seekTo(
      Duration(milliseconds: (total.inMilliseconds * fraction).round()),
    );
  }
}
