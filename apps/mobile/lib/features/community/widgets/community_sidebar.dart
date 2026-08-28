import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/auth/auth_repository.dart';
import 'package:indigen_world_mobile/features/community/community_actions.dart';
import 'package:indigen_world_mobile/features/community/community_profile_screen.dart';
import 'package:indigen_world_mobile/features/community/data/chat_providers.dart';
import 'package:indigen_world_mobile/features/community/data/community_models.dart';
import 'package:indigen_world_mobile/features/community/data/community_providers.dart';
import 'package:indigen_world_mobile/features/community/messages_screen.dart';
import 'package:indigen_world_mobile/features/community/people_screen.dart';
import 'package:indigen_world_mobile/features/community/saved_posts_screen.dart';
import 'package:indigen_world_mobile/features/community/widgets/community_avatar.dart';
import 'package:indigen_world_mobile/features/explore/kept_reels_screen.dart';
import 'package:indigen_world_mobile/features/kawuri/kawuri_screen.dart';
import 'package:indigen_world_mobile/features/notifications/data/notification_providers.dart';
import 'package:indigen_world_mobile/features/notifications/notifications_screen.dart';
import 'package:indigen_world_mobile/features/settings/settings_screen.dart';
import 'package:indigen_world_mobile/shared/glass_popup.dart';

/// The community drawer.
///
/// The header used to spend its width on a slogan. A slogan is not a door —
/// everything the section can do lived behind three unlabelled icons or
/// nowhere at all. This is the door: identity at the top, then the rooms, in
/// the order somebody actually reaches for them.
///
/// Rows carry live badges rather than static labels, because the reason to
/// open a drawer is usually to find out whether anything is waiting.
class CommunitySidebar extends ConsumerWidget {
  const CommunitySidebar({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profile = ref.watch(myCommunityProfileProvider).asData?.value;
    final uid = ref.watch(currentUidProvider);
    final unreadNotifications =
        ref.watch(unreadNotificationCountProvider).asData?.value ?? 0;
    final unreadMessages = ref.watch(unreadChatCountProvider);
    final counts = uid == null
        ? null
        : ref.watch(profileCountsProvider(uid)).asData?.value;

    // Pushing from the drawer's own context would leave the drawer in the
    // stack under the new route. Closing first is what makes Back come home
    // to the feed rather than to a half-open panel.
    void go(Widget Function(BuildContext context) builder) {
      Navigator.of(context).pop();
      Navigator.of(context).push(MaterialPageRoute<void>(builder: builder));
    }

    return Drawer(
      backgroundColor: Colors.transparent,
      elevation: 0,
      width: MediaQuery.sizeOf(context).width * 0.82,
      child: ClipRRect(
        borderRadius: const BorderRadius.horizontal(right: Radius.circular(26)),
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 24, sigmaY: 24),
          // The panel's ground is a Material rather than a coloured box: rows
          // are ListTiles, and a tile paints its ripple onto the nearest
          // Material ancestor. Behind an opaque box those ripples land where
          // nobody can see them, so every tap in the drawer would feel dead.
          child: Material(
            color: context.brand.background.withValues(alpha: 0.94),
            child: DecoratedBox(
              decoration: BoxDecoration(
                border: Border(
                  right: BorderSide(
                    color: context.brand.accent.withValues(alpha: 0.12),
                  ),
                ),
              ),
              child: SafeArea(
                child: Column(
                  children: [
                    _SidebarIdentity(
                      profile: profile,
                      followers: counts?.followers,
                      following: counts?.following,
                      posts: counts?.posts,
                      onOpenProfile: uid == null
                          ? null
                          : () => go(
                              (context) => CommunityProfileScreen(uid: uid),
                            ),
                    ),
                    Divider(height: 1, color: context.brand.divider),
                    Expanded(
                      child: ListView(
                        padding: const EdgeInsets.symmetric(vertical: 6),
                        children: [
                          _SidebarItem(
                            icon: Icons.forum_outlined,
                            label: 'Messages',
                            description: 'Private conversations',
                            badge: unreadMessages,
                            onTap: () =>
                                go((context) => const MessagesScreen()),
                          ),
                          _SidebarItem(
                            icon: Icons.notifications_none_rounded,
                            label: 'Notifications',
                            description: 'Replies, follows and reshares',
                            badge: unreadNotifications,
                            onTap: () =>
                                go((context) => const NotificationsScreen()),
                          ),
                          _SidebarItem(
                            icon: Icons.search_rounded,
                            label: 'Find people',
                            description: 'Search by name or @handle',
                            onTap: () => go((context) => const PeopleScreen()),
                          ),
                          const _SidebarSection(label: 'YOUR THINGS'),
                          _SidebarItem(
                            icon: Icons.person_outline_rounded,
                            label: 'Your profile',
                            description: 'Posts, replies and media',
                            onTap: uid == null
                                ? null
                                : () => go(
                                    (context) =>
                                        CommunityProfileScreen(uid: uid),
                                  ),
                          ),
                          _SidebarItem(
                            icon: Icons.bookmark_border_rounded,
                            label: 'Saved posts',
                            description: 'Kept from the feed',
                            onTap: () =>
                                go((context) => const SavedPostsScreen()),
                          ),
                          _SidebarItem(
                            icon: Icons.play_circle_outline_rounded,
                            label: 'Your keeps',
                            description: 'Reels you kept from Explore',
                            onTap: () =>
                                go((context) => const KeptReelsScreen()),
                          ),
                          _SidebarItem(
                            icon: Icons.group_outlined,
                            label: 'Followers',
                            description: 'People who follow you',
                            onTap: uid == null
                                ? null
                                : () => go(
                                    (context) => PeopleListScreen(
                                      uid: uid,
                                      mode: PeopleListMode.followers,
                                    ),
                                  ),
                          ),
                          _SidebarItem(
                            icon: Icons.person_add_alt_outlined,
                            label: 'Following',
                            description: 'People you follow',
                            onTap: uid == null
                                ? null
                                : () => go(
                                    (context) => PeopleListScreen(
                                      uid: uid,
                                      mode: PeopleListMode.following,
                                    ),
                                  ),
                          ),
                          const _SidebarSection(label: 'MORE'),
                          _SidebarItem(
                            icon: Icons.auto_awesome_outlined,
                            label: 'Ask Kawuri',
                            description: 'Kasem help, offline-aware',
                            onTap: () => go((context) => const KawuriScreen()),
                          ),
                          _SidebarItem(
                            icon: Icons.settings_outlined,
                            label: 'Settings',
                            description: 'Language, data and account',
                            onTap: () =>
                                go((context) => const SettingsScreen()),
                          ),
                          const SizedBox(height: 6),
                          Divider(
                            height: 1,
                            color: context.brand.divider,
                            indent: 18,
                            endIndent: 18,
                          ),
                          _SidebarItem(
                            icon: uid == null
                                ? Icons.login_rounded
                                : Icons.logout_rounded,
                            label: uid == null ? 'Sign in' : 'Sign out',
                            description: uid == null
                                ? 'To post, reply and message'
                                : 'On this device',
                            isDestructive: uid != null,
                            onTap: () => uid == null
                                ? _signIn(context, ref)
                                : _signOut(context, ref),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _signIn(BuildContext context, WidgetRef ref) async {
    Navigator.of(context).pop();
    await CommunityActions(ref).requireProfile(context);
  }

  Future<void> _signOut(BuildContext context, WidgetRef ref) async {
    final confirmed = await showGlassConfirm(
      context: context,
      title: 'Sign out?',
      message:
          'Your posts stay where they are. Anything saved only on this '
          'device stays on this device.',
      confirmLabel: 'Sign out',
      isDestructive: true,
    );
    if (confirmed != true || !context.mounted) return;
    Navigator.of(context).pop();
    await ref.read(authRepositoryProvider)?.signOut();
  }
}

class _SidebarIdentity extends StatelessWidget {
  const _SidebarIdentity({
    required this.profile,
    required this.followers,
    required this.following,
    required this.posts,
    required this.onOpenProfile,
  });

  final CommunityProfile? profile;
  final int? followers;
  final int? following;
  final int? posts;
  final VoidCallback? onOpenProfile;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(18, 18, 18, 14),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: onOpenProfile,
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 2),
            child: Row(
              children: [
                CommunityAvatar(
                  initials: profile?.initials ?? '·',
                  imageUrl: profile?.avatarUrl,
                  size: 52,
                  ringed: true,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        profile?.displayName ?? 'Not signed in',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 15.5,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        profile?.handle ?? 'Sign in to take part',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: context.brand.mutedInk,
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
        if (profile != null) ...[
          const SizedBox(height: 14),
          Row(
            children: [
              _MiniCount(value: posts, label: 'Posts'),
              _MiniCount(value: followers, label: 'Followers'),
              _MiniCount(value: following, label: 'Following'),
            ],
          ),
        ],
      ],
    ),
  );
}

class _MiniCount extends StatelessWidget {
  const _MiniCount({required this.value, required this.label});

  final int? value;
  final String label;

  @override
  Widget build(BuildContext context) => Expanded(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          // Never a zero while the aggregate read is still in flight: a zero
          // is a claim about somebody's following, and we do not know it yet.
          value == null ? '—' : communityCountLabel(value!),
          style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w900),
        ),
        const SizedBox(height: 1),
        Text(
          label.toUpperCase(),
          style: TextStyle(
            color: context.brand.mutedInk,
            fontSize: 8.5,
            fontWeight: FontWeight.w800,
            letterSpacing: 0.7,
          ),
        ),
      ],
    ),
  );
}

class _SidebarSection extends StatelessWidget {
  const _SidebarSection({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(20, 16, 20, 6),
    child: Text(
      label,
      style: TextStyle(
        color: context.brand.terracotta,
        fontSize: 9.5,
        fontWeight: FontWeight.w900,
        letterSpacing: 1.2,
      ),
    ),
  );
}

class _SidebarItem extends StatelessWidget {
  const _SidebarItem({
    required this.icon,
    required this.label,
    required this.onTap,
    this.description,
    this.badge = 0,
    this.isDestructive = false,
  });

  final IconData icon;
  final String label;
  final String? description;
  final int badge;
  final bool isDestructive;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final tint = isDestructive
        ? context.brand.terracotta
        : context.brand.accent;
    return ListTile(
      enabled: onTap != null,
      onTap: onTap == null
          ? null
          : () {
              HapticFeedback.selectionClick();
              onTap!();
            },
      contentPadding: const EdgeInsets.symmetric(horizontal: 18),
      minVerticalPadding: 10,
      leading: Container(
        width: 38,
        height: 38,
        decoration: BoxDecoration(
          color: tint.withValues(alpha: 0.09),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Icon(icon, size: 20, color: tint),
      ),
      title: Row(
        children: [
          Flexible(
            child: Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontSize: 14.5,
                fontWeight: FontWeight.w800,
                color: isDestructive ? context.brand.terracotta : null,
              ),
            ),
          ),
          if (badge > 0) ...[
            const SizedBox(width: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
              constraints: const BoxConstraints(minWidth: 21),
              decoration: BoxDecoration(
                color: context.brand.terracotta,
                borderRadius: BorderRadius.circular(999),
              ),
              child: Text(
                badge > 99 ? '99+' : '$badge',
                textAlign: TextAlign.center,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 10,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ),
          ],
        ],
      ),
      subtitle: description == null
          ? null
          : Padding(
              padding: const EdgeInsets.only(top: 1),
              child: Text(
                description!,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(color: context.brand.mutedInk, fontSize: 11.5),
              ),
            ),
    );
  }
}
