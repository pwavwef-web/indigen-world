import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/app_config.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/data/repositories.dart';
import 'package:indigen_world_mobile/features/auth/auth_repository.dart';
import 'package:indigen_world_mobile/features/auth/sign_in_sheet.dart';
import 'package:indigen_world_mobile/features/community/community_profile_screen.dart';
import 'package:indigen_world_mobile/features/community/community_setup_screen.dart';
import 'package:indigen_world_mobile/features/community/data/community_providers.dart';
import 'package:indigen_world_mobile/features/community/saved_posts_screen.dart';
import 'package:indigen_world_mobile/features/settings/settings_screen.dart';
import 'package:indigen_world_mobile/shared/app_widgets.dart';

class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final savedCount =
        ref.watch(savedEntryIdsProvider).asData?.value.length ?? 0;
    final contributionCount =
        ref.watch(contributionsProvider).asData?.value.length ?? 0;
    final user = ref.watch(authStateProvider).asData?.value;
    final communityProfile = ref
        .watch(myCommunityProfileProvider)
        .asData
        ?.value;
    final signedIn = user != null;
    final displayName = user?.displayName?.trim();
    final nameText = signedIn
        ? (displayName != null && displayName.isNotEmpty
              ? displayName
              : 'Indigen World member')
        : 'Guest learner';
    final detailText = signedIn
        ? (user.email ?? 'Signed in')
        : 'Kasem · $appEnvironment environment';

    return ScreenContainer(
      child: ListView(
        key: const PageStorageKey('profile-scroll'),
        padding: const EdgeInsets.only(bottom: 110),
        children: [
          BrandHeader(
            eyebrow: 'You',
            title: 'Your space.',
            subtitle: signedIn
                ? 'Your saved words and contributions travel with your account.'
                : 'Guest mode keeps public learning useful before sign-in.',
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: Column(
              children: [
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(20),
                    child: Row(
                      children: [
                        _ProfileAvatar(user: user),
                        const SizedBox(width: 16),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                nameText,
                                style: Theme.of(context).textTheme.titleLarge,
                              ),
                              const SizedBox(height: 4),
                              Text(detailText),
                            ],
                          ),
                        ),
                        StatusPill(
                          icon: signedIn
                              ? Icons.verified_user_outlined
                              : Icons.lock_outline,
                          label: signedIn ? 'SIGNED IN' : 'LOCAL',
                          color: BrandColors.savannahGreen,
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                Row(
                  children: [
                    Expanded(
                      child: _StatCard(
                        icon: Icons.bookmark_outline_rounded,
                        value: '$savedCount',
                        label: 'Saved words',
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: _StatCard(
                        icon: Icons.outbox_outlined,
                        value: '$contributionCount',
                        label: 'Contributions',
                      ),
                    ),
                    const SizedBox(width: 12),
                    const Expanded(
                      child: _StatCard(
                        icon: Icons.stars_outlined,
                        value: '0',
                        label: 'Approved points',
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 24),
                const Align(
                  alignment: Alignment.centerLeft,
                  child: SectionTitle(title: 'Settings and safety'),
                ),
                const SizedBox(height: 12),
                Card(
                  child: Column(
                    children: [
                      _SettingsTile(
                        icon: Icons.groups_outlined,
                        title: communityProfile == null
                            ? 'Join the community feed'
                            : 'Your community profile',
                        subtitle: communityProfile == null
                            ? 'Choose a handle to post, follow and reply'
                            : '${communityProfile.handle} · posts, followers '
                                  'and saves',
                        onTap: () => _openCommunity(context, ref),
                      ),
                      const Divider(height: 1, indent: 62),
                      _SettingsTile(
                        icon: Icons.bookmark_border_rounded,
                        title: 'Saved posts',
                        subtitle: 'Community posts you kept for later',
                        onTap: () => Navigator.of(context).push(
                          MaterialPageRoute<void>(
                            builder: (context) => const SavedPostsScreen(),
                          ),
                        ),
                      ),
                      const Divider(height: 1, indent: 62),
                      _SettingsTile(
                        icon: Icons.download_outlined,
                        title: 'Offline downloads',
                        subtitle: 'No approved content packs installed',
                        onTap: () => _showMessage(
                          context,
                          'Download manifests connect in Release 3.',
                        ),
                      ),
                      const Divider(height: 1, indent: 62),
                      _SettingsTile(
                        icon: Icons.settings_outlined,
                        title: 'Settings',
                        subtitle:
                            'Account, notifications, privacy, licences and '
                            'support',
                        onTap: () => Navigator.of(context).push(
                          MaterialPageRoute<void>(
                            builder: (context) => const SettingsScreen(),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
                SizedBox(
                  width: double.infinity,
                  child: signedIn
                      ? OutlinedButton.icon(
                          onPressed: () => _signOut(context, ref),
                          icon: const Icon(Icons.logout_rounded),
                          label: const Text('Sign out'),
                        )
                      : FilledButton.icon(
                          onPressed: () => _signIn(context),
                          icon: const Icon(Icons.login_rounded),
                          label: const Text('Sign in or create an account'),
                        ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _signIn(BuildContext context) async {
    final signedIn = await showSignInSheet(context);
    if ((signedIn ?? false) && context.mounted) {
      _showMessage(context, 'Signed in. Welcome to Indigen World.');
    }
  }

  Future<void> _signOut(BuildContext context, WidgetRef ref) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Sign out?'),
        content: const Text(
          'Public learning stays available in guest mode. You can sign back in anytime.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('Sign out'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    await ref.read(authRepositoryProvider)?.signOut();
    if (context.mounted) _showMessage(context, 'Signed out.');
  }

  void _showMessage(BuildContext context, String text) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));
  }

  /// Opens the community identity: setup when there is no handle yet,
  /// otherwise the member's own community profile.
  void _openCommunity(BuildContext context, WidgetRef ref) {
    final profile = ref.read(myCommunityProfileProvider).asData?.value;
    final uid = ref.read(currentUidProvider);
    if (uid == null) {
      _signIn(context);
      return;
    }
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (context) => profile == null
            ? const CommunitySetupScreen()
            : CommunityProfileScreen(uid: uid),
      ),
    );
  }
}

class _ProfileAvatar extends StatelessWidget {
  const _ProfileAvatar({required this.user});

  final User? user;

  @override
  Widget build(BuildContext context) {
    final photoUrl = user?.photoURL;
    final displayName = user?.displayName?.trim();
    final initials = (displayName != null && displayName.isNotEmpty)
        ? displayName.characters.first.toUpperCase()
        : null;

    return Container(
      width: 60,
      height: 60,
      decoration: const BoxDecoration(
        color: BrandColors.heritageGreen,
        shape: BoxShape.circle,
      ),
      clipBehavior: Clip.antiAlias,
      child: photoUrl != null && photoUrl.isNotEmpty
          ? Image.network(
              photoUrl,
              fit: BoxFit.cover,
              errorBuilder: (_, _, _) => _fallback(initials),
            )
          : _fallback(initials),
    );
  }

  Widget _fallback(String? initials) => Center(
    child: initials != null
        ? Text(
            initials,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 24,
              fontWeight: FontWeight.w800,
            ),
          )
        : const Icon(
            Icons.person_outline_rounded,
            color: Colors.white,
            size: 32,
          ),
  );
}

class _StatCard extends StatelessWidget {
  const _StatCard({
    required this.icon,
    required this.value,
    required this.label,
  });

  final IconData icon;
  final String value;
  final String label;

  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 16),
      child: Column(
        children: [
          Icon(icon, color: BrandColors.terracotta),
          const SizedBox(height: 8),
          Text(value, style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 2),
          Text(
            label,
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 11),
          ),
        ],
      ),
    ),
  );
}

class _SettingsTile extends StatelessWidget {
  const _SettingsTile({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => ListTile(
    minVerticalPadding: 12,
    leading: Icon(icon, color: BrandColors.heritageGreen),
    title: Text(title, style: const TextStyle(fontWeight: FontWeight.w700)),
    subtitle: Text(subtitle),
    trailing: const Icon(Icons.chevron_right_rounded),
    onTap: onTap,
  );
}
