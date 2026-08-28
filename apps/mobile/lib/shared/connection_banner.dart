import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/core/connectivity.dart';

/// A small pill that appears only when something server-side is genuinely
/// unreachable, and names which of the two possible reasons it is.
///
/// It exists so the app never has to guess in copy elsewhere: screens can say
/// "could not load" without also claiming the member is offline, because if
/// they really are, this pill is already on screen saying so.
class ConnectionBanner extends ConsumerWidget {
  const ConnectionBanner({this.onDark = false, super.key});

  /// Explore renders over full-bleed video, so the pill inverts there.
  final bool onDark;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final block = ref.watch(connectionBlockProvider);

    return IgnorePointer(
      child: AnimatedSwitcher(
        duration: const Duration(milliseconds: 260),
        switchInCurve: Curves.easeOutBack,
        switchOutCurve: Curves.easeIn,
        transitionBuilder: (child, animation) => FadeTransition(
          opacity: animation,
          child: SizeTransition(sizeFactor: animation, child: child),
        ),
        child: block == null
            ? const SizedBox(key: ValueKey('connected'), width: double.infinity)
            : Align(
                key: ValueKey(block),
                child: Semantics(
                  liveRegion: true,
                  label: block.message,
                  excludeSemantics: true,
                  child: Container(
                    padding: const EdgeInsets.fromLTRB(11, 6, 13, 6),
                    decoration: BoxDecoration(
                      color: onDark
                          ? Colors.black.withValues(alpha: 0.55)
                          : context.brand.terracotta.withValues(alpha: 0.13),
                      borderRadius: BorderRadius.circular(999),
                      border: Border.all(
                        color: onDark
                            ? Colors.white24
                            : context.brand.terracotta.withValues(alpha: 0.4),
                      ),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          block == ConnectionBlock.offline
                              ? Icons.wifi_off_rounded
                              : Icons.cloud_sync_outlined,
                          size: 14,
                          color: onDark
                              ? context.brand.gold
                              : context.brand.terracotta,
                        ),
                        const SizedBox(width: 7),
                        Flexible(
                          child: Text(
                            block.shortLabel,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              color: onDark
                                  ? Colors.white
                                  : context.brand.terracotta,
                              fontSize: 10.5,
                              fontWeight: FontWeight.w900,
                              letterSpacing: 0.3,
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
}
