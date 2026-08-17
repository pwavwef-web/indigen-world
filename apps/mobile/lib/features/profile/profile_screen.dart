import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/app_config.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/data/repositories.dart';
import 'package:indigen_world_mobile/shared/app_widgets.dart';

class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final savedCount =
        ref.watch(savedEntryIdsProvider).asData?.value.length ?? 0;
    final contributionCount =
        ref.watch(contributionsProvider).asData?.value.length ?? 0;

    return ScreenContainer(
      child: ListView(
        key: const PageStorageKey('profile-scroll'),
        padding: const EdgeInsets.only(bottom: 110),
        children: [
          const BrandHeader(
            eyebrow: 'You',
            title: 'Your space.',
            subtitle: 'Guest mode keeps public learning useful before sign-in.',
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
                        Container(
                          width: 60,
                          height: 60,
                          decoration: const BoxDecoration(
                            color: BrandColors.heritageGreen,
                            shape: BoxShape.circle,
                          ),
                          child: const Icon(
                            Icons.person_outline_rounded,
                            color: Colors.white,
                            size: 32,
                          ),
                        ),
                        const SizedBox(width: 16),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'Guest learner',
                                style: Theme.of(context).textTheme.titleLarge,
                              ),
                              const SizedBox(height: 4),
                              Text('Kasem · $appEnvironment environment'),
                            ],
                          ),
                        ),
                        const StatusPill(
                          icon: Icons.lock_outline,
                          label: 'LOCAL',
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
                        icon: Icons.notifications_none_rounded,
                        title: 'Notification choices',
                        subtitle: 'Disabled until messaging is configured',
                        onTap: () => _showMessage(
                          context,
                          'Notification preferences require Firebase Messaging.',
                        ),
                      ),
                      const Divider(height: 1, indent: 62),
                      _SettingsTile(
                        icon: Icons.privacy_tip_outlined,
                        title: 'Privacy and community data',
                        subtitle: 'Know what is stored and why',
                        onTap: () => _showPrivacy(context),
                      ),
                      const Divider(height: 1, indent: 62),
                      _SettingsTile(
                        icon: Icons.help_outline_rounded,
                        title: 'Support',
                        subtitle: 'Project-approved contact will be supplied remotely',
                        onTap: () => _showMessage(
                          context,
                          'Support contact is intentionally not hard-coded.',
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
                SizedBox(
                  width: double.infinity,
                  child: OutlinedButton.icon(
                    onPressed: () => _showMessage(
                      context,
                      'Authentication connects after development Firebase credentials are supplied.',
                    ),
                    icon: const Icon(Icons.login_rounded),
                    label: const Text('Sign in or link an account'),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  void _showMessage(BuildContext context, String text) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));
  }

  void _showPrivacy(BuildContext context) {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (context) => const SafeArea(
        child: Padding(
          padding: EdgeInsets.fromLTRB(24, 0, 24, 30),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Privacy in this build',
                style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800),
              ),
              SizedBox(height: 12),
              Text(
                'Saved words and contribution drafts remain on this device. No sign-in, analytics, crash reporting, cloud sync, or production data connection is active in this debug build.',
                style: TextStyle(fontSize: 16, height: 1.5),
              ),
            ],
          ),
        ),
      ),
    );
  }
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
