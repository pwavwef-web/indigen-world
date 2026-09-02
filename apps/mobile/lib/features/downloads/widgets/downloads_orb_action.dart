import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/data/local/app_database.dart';
import 'package:indigen_world_mobile/features/downloads/data/downloads_providers.dart';
import 'package:indigen_world_mobile/features/downloads/downloads_screen.dart';
import 'package:indigen_world_mobile/shared/profile_orb.dart';

/// The way into what this phone is keeping offline, pinned beside the orb.
///
/// ── Why it renders nothing without a subscription ─────────────────────────
/// Not a locked orb, not a greyed one, not one that opens the paywall. Nothing.
/// The same judgement `_ReviewDeskCard` makes on the Contribute tab, for the
/// same reason: a door somebody can never open is worse than no door, because
/// it invites the question and then refuses to answer it. The place to *sell*
/// offline listening is the download button on a track, where somebody has
/// already decided they want this particular song on this particular flight —
/// that button stays visible for everybody and opens the plans. A permanent
/// padlock in the corner of a tab sells nothing and nags constantly.
///
/// ── Why it is only on Collection ──────────────────────────────────────────
/// The caller decides that, not this widget. Downloads are audio out of the
/// archive, so the archive's tab is the one place the shortcut means anything;
/// on Community or Learn it would be a control pointing somewhere else. See
/// `app_shell.dart`, which also asks [downloadsAllowedProvider] so the row it
/// sits in does not leave a gap for a control that is not coming.
///
/// Drawn as the orb's twin — same diameter, same fill, same hairline, same
/// lift — because the pair has to read as one piece of shell furniture. It
/// carries [onDark] for that reason alone: Collection is never dark, but a
/// control that matches the orb everywhere except in the one state the orb
/// changes for is a control that will look wrong the first time it moves.
class DownloadsOrbAction extends ConsumerWidget {
  const DownloadsOrbAction({this.onDark = false, super.key});

  /// Switches to the light-on-dark treatment, matching [ProfileOrb].
  final bool onDark;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (!ref.watch(downloadsAllowedProvider)) return const SizedBox.shrink();

    final brand = context.brand;
    // Read straight off the index rather than kept in state: the badge has to
    // fall to nothing the moment somebody clears the list on the screen this
    // very button opened.
    final kept =
        ref.watch(downloadsProvider).asData?.value ??
        const <DownloadedTrackRecord>[];

    return Semantics(
      button: true,
      label: 'Your downloads',
      // Deliberately not `excludeSemantics: true`. Excluding would take the
      // ink well's own tap action out of the tree along with the badge, which
      // is how a control ends up announced as a button that a screen reader
      // then has no action to invoke. The badge is silenced on its own below
      // instead, so the label stays "Your downloads" rather than "Your
      // downloads 3" — the count is in the tooltip, which is read out anyway.
      child: Tooltip(
        message: kept.isEmpty
            ? 'Downloads'
            : 'Downloads · ${kept.length} kept offline',
        child: SizedBox(
          width: kProfileOrbSize,
          height: kProfileOrbSize,
          child: Stack(
            // The badge overhangs the circle by a couple of pixels, the way
            // every count badge in the app does. It lands in the gap between
            // this control and the orb, which is the one place beside it that
            // is guaranteed to be empty.
            clipBehavior: Clip.none,
            children: [
              Material(
                color: Colors.transparent,
                shape: const CircleBorder(),
                clipBehavior: Clip.antiAlias,
                child: InkWell(
                  onTap: () {
                    HapticFeedback.selectionClick();
                    Navigator.of(context).push(
                      MaterialPageRoute<void>(
                        builder: (context) => const DownloadsScreen(),
                      ),
                    );
                  },
                  child: Container(
                    width: kProfileOrbSize,
                    height: kProfileOrbSize,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: onDark
                          ? Colors.black.withValues(alpha: 0.35)
                          : Colors.white.withValues(alpha: 0.72),
                      border: Border.all(
                        color: onDark
                            ? Colors.white38
                            : brand.gold.withValues(alpha: 0.55),
                        width: 1.2,
                      ),
                      boxShadow: [
                        BoxShadow(
                          color: brand.accent.withValues(alpha: 0.18),
                          blurRadius: 12,
                          offset: const Offset(0, 4),
                        ),
                      ],
                    ),
                    child: Icon(
                      // The filled tick, not the outlined arrow: this opens
                      // what is already saved, it does not save anything. The
                      // arrow belongs to `DownloadToggle`, which does.
                      kept.isEmpty
                          ? Icons.offline_pin_rounded
                          : Icons.download_done_rounded,
                      size: 19,
                      color: onDark ? Colors.white : brand.accent,
                    ),
                  ),
                ),
              ),
              if (kept.isNotEmpty)
                Positioned(
                  top: -3,
                  right: -3,
                  child: ExcludeSemantics(
                    child: _KeptBadge(count: kept.length),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

/// How many tracks are down there, in the corner of the button.
///
/// Capped at "9+". Past that the number stops being information a corner badge
/// can carry and starts being two more digits crowding a 38px circle — the
/// exact count is one tap away, on a screen that also says how many megabytes
/// it comes to.
class _KeptBadge extends StatelessWidget {
  const _KeptBadge({required this.count});

  final int count;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return Container(
      constraints: const BoxConstraints(minWidth: 16, minHeight: 16),
      padding: const EdgeInsets.symmetric(horizontal: 4),
      decoration: BoxDecoration(
        color: brand.accentFill,
        shape: BoxShape.rectangle,
        borderRadius: BorderRadius.circular(999),
        // The ring is what keeps the badge legible over whatever the tab
        // happens to be showing behind the cluster.
        border: Border.all(color: brand.background, width: 1.4),
      ),
      alignment: Alignment.center,
      child: Text(
        count > 9 ? '9+' : '$count',
        style: TextStyle(
          color: brand.onAccentFill,
          fontSize: 9.5,
          height: 1.1,
          fontWeight: FontWeight.w900,
        ),
      ),
    );
  }
}
