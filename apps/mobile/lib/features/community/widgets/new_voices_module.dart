import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/community/community_profile_screen.dart';
import 'package:indigen_world_mobile/features/community/data/community_models.dart';
import 'package:indigen_world_mobile/features/community/data/community_space_providers.dart';
import 'package:indigen_world_mobile/features/community/data/feed_discovery.dart';
import 'package:indigen_world_mobile/features/community/people_screen.dart';
import 'package:indigen_world_mobile/features/community/widgets/community_avatar.dart';
import 'package:indigen_world_mobile/features/community/widgets/people_widgets.dart';
import 'package:indigen_world_mobile/features/community/widgets/verified_badge.dart';
import 'package:indigen_world_mobile/l10n/app_localizations.dart';
import 'package:visibility_detector/visibility_detector.dart';

/// "New voices": a short row of people worth following, dropped into the feed
/// between two posts.
///
/// Renders nothing at all until it has somebody to suggest, and nothing if it
/// never does — an empty carousel of grey boxes is worse than no carousel.
/// Keeps the first list it was given for as long as it is on screen, so
/// following somebody does not make their card vanish under the reader's
/// thumb.
class NewVoicesModule extends ConsumerStatefulWidget {
  const NewVoicesModule({super.key});

  @override
  ConsumerState<NewVoicesModule> createState() => _NewVoicesModuleState();
}

class _NewVoicesModuleState extends ConsumerState<NewVoicesModule> {
  List<VoiceSuggestion>? _shown;

  @override
  Widget build(BuildContext context) {
    final latest = ref.watch(voiceSuggestionsProvider).asData?.value;
    if (_shown == null && latest != null && latest.isNotEmpty) {
      _shown = latest;
    }
    final people = _shown;
    if (people == null || people.isEmpty) return const SizedBox.shrink();

    final brand = context.brand;
    final l10n = AppLocalizations.of(context);
    // The row has to be a fixed height to scroll sideways, so it is measured in
    // the reader's own text size rather than in pixels that large text would
    // overflow.
    final scale = MediaQuery.textScalerOf(context).scale(14) / 14;
    final rowHeight = 176 + 34 * (math.min(scale, 2.0) - 1).clamp(0.0, 1.0) * 2;

    return VisibilityDetector(
      key: const Key('community-new-voices'),
      onVisibilityChanged: (info) {
        if (info.visibleFraction > 0.4 && mounted) {
          ref.read(newVoicesSeenProvider.notifier).markSeen();
        }
      },
      child: DecoratedBox(
        decoration: BoxDecoration(
          border: Border(bottom: BorderSide(color: brand.divider)),
        ),
        child: Padding(
          padding: const EdgeInsets.only(top: 10, bottom: 12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 4, 2),
                child: Row(
                  children: [
                    Expanded(
                      child: Semantics(
                        header: true,
                        child: Text(
                          l10n.communityNewVoices,
                          style: TextStyle(
                            color: brand.ink,
                            fontSize: 15,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ),
                    ),
                    TextButton(
                      style: TextButton.styleFrom(
                        minimumSize: const Size(48, 44),
                      ),
                      onPressed: () => Navigator.of(context).push(
                        MaterialPageRoute<void>(
                          builder: (context) => const PeopleScreen(),
                        ),
                      ),
                      child: Text(l10n.communityNewVoicesSeeAll),
                    ),
                  ],
                ),
              ),
              LayoutBuilder(
                builder: (context, constraints) {
                  // Three and a bit cards across, so the edge of the fourth
                  // says the row keeps going.
                  final cardWidth = ((constraints.maxWidth - 16) / 3.35).clamp(
                    104.0,
                    168.0,
                  );
                  return SizedBox(
                    height: rowHeight,
                    child: ListView.separated(
                      scrollDirection: Axis.horizontal,
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      itemCount: people.length,
                      separatorBuilder: (context, index) =>
                          const SizedBox(width: 8),
                      itemBuilder: (context, index) => _VoiceCard(
                        key: ValueKey('voice-${people[index].profile.uid}'),
                        suggestion: people[index],
                        width: cardWidth,
                      ),
                    ),
                  );
                },
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _VoiceCard extends StatelessWidget {
  const _VoiceCard({required this.suggestion, required this.width, super.key});

  final VoiceSuggestion suggestion;
  final double width;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final l10n = AppLocalizations.of(context);
    final profile = suggestion.profile;
    final reason = switch (suggestion.reason) {
      VoiceReason.sharedCommunity => l10n.communityVoiceCommunity,
      VoiceReason.sameDialect => l10n.communityVoiceDialect,
      VoiceReason.creator => l10n.communityVoiceCreator,
      VoiceReason.activeNow => l10n.communityVoiceActive,
      VoiceReason.newMember => l10n.communityVoiceNew,
    };
    void open() => Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (context) => CommunityProfileScreen(uid: profile.uid),
      ),
    );

    return SizedBox(
      width: width,
      child: Material(
        color: brand.surface.withValues(alpha: brand.isDark ? 0.5 : 0.7),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: BorderSide(color: brand.border),
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: open,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(8, 12, 8, 10),
            child: Column(
              children: [
                Semantics(
                  label: profile.displayName,
                  excludeSemantics: true,
                  child: CommunityAvatar(
                    initials: profile.initials,
                    imageUrl: profile.avatarUrl,
                    username: profile.username,
                    size: 52,
                  ),
                ),
                const SizedBox(height: 8),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Flexible(
                      child: Text(
                        profile.displayName,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          color: brand.ink,
                          fontSize: 13.5,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                    if (profile.mark != VerifiedMark.none) ...[
                      const SizedBox(width: 3),
                      VerifiedBadge(
                        mark: profile.mark,
                        size: 13,
                        explainOnTap: false,
                      ),
                    ],
                  ],
                ),
                Text(
                  reason,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  textAlign: TextAlign.center,
                  style: TextStyle(color: brand.mutedInk, fontSize: 12),
                ),
                const Spacer(),
                FollowButton(targetUid: profile.uid, dense: true),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
