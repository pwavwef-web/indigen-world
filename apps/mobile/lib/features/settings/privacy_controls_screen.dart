import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/community/data/chat_providers.dart';
import 'package:indigen_world_mobile/features/community/data/community_providers.dart';
import 'package:indigen_world_mobile/features/community/widgets/community_avatar.dart';
import 'package:indigen_world_mobile/features/settings/settings_widgets.dart';
import 'package:indigen_world_mobile/shared/glass_popup.dart';

/// Who has been blocked or muted, and the way to take either back — plus
/// whether conversations say "Seen".
///
/// ── Why this screen exists ────────────────────────────────────────────────
/// Blocking and muting were one tap from any post and could never be undone:
/// the person vanished from the feed, and with them every way back to the
/// profile where an undo could have lived. A block made in a moment of
/// irritation was permanent. Now each one is listed here, by name.
class PrivacyControlsScreen extends ConsumerWidget {
  const PrivacyControlsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final blocked = ref.watch(myBlockedProfilesProvider);
    final muted = ref.watch(myMutedProfilesProvider);
    final receipts = ref.watch(chatReadReceiptsProvider);
    final signedIn = ref.watch(currentUidProvider) != null;

    return Scaffold(
      appBar: AppBar(title: const Text('Blocked, muted and read receipts')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(18, 14, 18, 40),
        children: [
          const SettingsSectionLabel('MESSAGES'),
          const SizedBox(height: 9),
          SettingsGroup(
            children: [
              SwitchListTile.adaptive(
                key: const Key('privacy-read-receipts'),
                secondary: Icon(
                  Icons.done_all_rounded,
                  color: context.brand.accent,
                ),
                title: const Text(
                  'Read receipts',
                  style: TextStyle(fontWeight: FontWeight.w700),
                ),
                subtitle: const Text(
                  'Others see “Seen” when you have read their message, and you '
                  'see it on theirs. Off means neither.',
                ),
                value: receipts,
                onChanged: (on) =>
                    ref.read(chatReadReceiptsProvider.notifier).set(on),
              ),
            ],
          ),
          const SizedBox(height: 22),
          if (!signedIn)
            Text(
              'Sign in to see who you have blocked or muted.',
              style: TextStyle(color: context.brand.mutedInk),
            )
          else ...[
            const SettingsSectionLabel('BLOCKED'),
            const SizedBox(height: 9),
            _PeopleGroup(
              ids: blocked.asData?.value ?? const <String>{},
              loading: blocked.isLoading,
              empty:
                  'Nobody. A blocked member cannot follow you, and you '
                  'will not see their posts.',
              actionLabel: 'Unblock',
              onAction: (uid) async {
                final me = ref.read(currentUidProvider);
                final repository = ref.read(communityRepositoryProvider);
                if (me == null || repository == null) return false;
                await repository.unblockProfile(uid: me, targetId: uid);
                return true;
              },
              doneMessage: 'Unblocked. Their posts can appear again.',
            ),
            const SizedBox(height: 22),
            const SettingsSectionLabel('MUTED'),
            const SizedBox(height: 9),
            _PeopleGroup(
              ids: muted.asData?.value ?? const <String>{},
              loading: muted.isLoading,
              empty:
                  'Nobody. Muting hides somebody’s posts from you without '
                  'telling them.',
              actionLabel: 'Unmute',
              onAction: (uid) async {
                final me = ref.read(currentUidProvider);
                final repository = ref.read(communityRepositoryProvider);
                if (me == null || repository == null) return false;
                await repository.unmuteProfile(uid: me, targetId: uid);
                return true;
              },
              doneMessage: 'Unmuted.',
            ),
          ],
        ],
      ),
    );
  }
}

class _PeopleGroup extends StatelessWidget {
  const _PeopleGroup({
    required this.ids,
    required this.loading,
    required this.empty,
    required this.actionLabel,
    required this.onAction,
    required this.doneMessage,
  });

  final Set<String> ids;
  final bool loading;
  final String empty;
  final String actionLabel;
  final Future<bool> Function(String uid) onAction;
  final String doneMessage;

  @override
  Widget build(BuildContext context) {
    if (loading && ids.isEmpty) {
      return const Padding(
        padding: EdgeInsets.all(16),
        child: Center(child: CircularProgressIndicator()),
      );
    }
    if (ids.isEmpty) {
      return Padding(
        padding: const EdgeInsets.symmetric(horizontal: 4),
        child: Text(empty, style: TextStyle(color: context.brand.mutedInk)),
      );
    }
    return SettingsGroup(
      children: [
        for (final uid in ids.toList()..sort())
          _PersonRow(
            key: ValueKey('privacy-person-$uid'),
            uid: uid,
            actionLabel: actionLabel,
            onAction: () async {
              try {
                final done = await onAction(uid);
                if (done && context.mounted) {
                  showGlassToast(context, doneMessage);
                }
              } on Object {
                if (context.mounted) {
                  showGlassToast(
                    context,
                    'That did not go through. Try again.',
                  );
                }
              }
            },
          ),
      ],
    );
  }
}

/// One person, by name and face, read live from their profile.
class _PersonRow extends ConsumerWidget {
  const _PersonRow({
    required this.uid,
    required this.actionLabel,
    required this.onAction,
    super.key,
  });

  final String uid;
  final String actionLabel;
  final VoidCallback onAction;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profile = ref.watch(communityProfileProvider(uid)).asData?.value;
    final name = profile?.displayName.trim().isNotEmpty ?? false
        ? profile!.displayName
        : 'A member';
    return ListTile(
      leading: CommunityAvatar(
        initials: profile?.initials ?? '·',
        imageUrl: profile?.avatarUrl,
        username: profile?.username,
        size: 40,
      ),
      title: Text(
        name,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: const TextStyle(fontWeight: FontWeight.w800),
      ),
      subtitle: profile == null ? null : Text('@${profile.username}'),
      trailing: OutlinedButton(onPressed: onAction, child: Text(actionLabel)),
    );
  }
}
