import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/auth/auth_repository.dart';
import 'package:indigen_world_mobile/features/community/data/community_providers.dart';
import 'package:indigen_world_mobile/features/profile/profile_screen.dart';

/// Diameter of the top-right profile control, plus the inset it is pinned at.
/// Screens use these to keep their own top-right content clear of it.
const double kProfileOrbSize = 38;
const double kProfileOrbInset = 12;

/// The account control that used to be the "You" tab.
///
/// It floats in the top-right corner of every shell tab as a glass orb — the
/// same material as the bottom rail — and opens the profile sheet on tap.
class ProfileOrb extends ConsumerWidget {
  const ProfileOrb({this.onDark = false, super.key});

  /// Explore renders over full-bleed video, so the orb switches to a light
  /// treatment there.
  final bool onDark;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authStateProvider).asData?.value;
    final profile = ref.watch(myCommunityProfileProvider).asData?.value;
    final photoUrl = profile?.avatarUrl ?? user?.photoURL;
    final name = profile?.displayName ?? user?.displayName?.trim() ?? '';
    final initial = name.isNotEmpty
        ? name.characters.first.toUpperCase()
        : null;

    return Semantics(
      button: true,
      label: 'Your profile and settings',
      child: Tooltip(
        message: 'You',
        child: Material(
          color: Colors.transparent,
          shape: const CircleBorder(),
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            onTap: () {
              HapticFeedback.selectionClick();
              Navigator.of(context).push(
                MaterialPageRoute<void>(
                  builder: (context) => Scaffold(
                    appBar: AppBar(title: const Text('You')),
                    body: const ProfileScreen(),
                  ),
                ),
              );
            },
            child: Container(
              width: kProfileOrbSize,
              height: kProfileOrbSize,
              padding: const EdgeInsets.all(2),
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: onDark
                    ? Colors.black.withValues(alpha: 0.35)
                    : Colors.white.withValues(alpha: 0.72),
                border: Border.all(
                  color: onDark
                      ? Colors.white38
                      : BrandColors.kenteGold.withValues(alpha: 0.55),
                  width: 1.2,
                ),
                boxShadow: [
                  BoxShadow(
                    color: BrandColors.heritageGreen.withValues(alpha: 0.18),
                    blurRadius: 12,
                    offset: const Offset(0, 4),
                  ),
                ],
              ),
              child: ClipOval(
                child: photoUrl != null && photoUrl.isNotEmpty
                    ? CachedNetworkImage(
                        imageUrl: photoUrl,
                        fit: BoxFit.cover,
                        placeholder: (context, url) => _fallback(initial),
                        errorWidget: (context, url, error) =>
                            _fallback(initial),
                      )
                    : _fallback(initial),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _fallback(String? initial) => ColoredBox(
    color: BrandColors.heritageGreen,
    child: Center(
      child: initial != null
          ? Text(
              initial,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 15,
                fontWeight: FontWeight.w900,
              ),
            )
          : const Icon(
              Icons.person_outline_rounded,
              color: Colors.white,
              size: 19,
            ),
    ),
  );
}
