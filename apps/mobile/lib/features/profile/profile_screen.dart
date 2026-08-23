import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/app_config.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/data/repositories.dart';
import 'package:indigen_world_mobile/features/auth/google_firebase_auth_service.dart';
import 'package:indigen_world_mobile/shared/app_widgets.dart';

class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final savedCount =
        ref.watch(savedEntryIdsProvider).asData?.value.length ?? 0;
    final contributionCount =
        ref.watch(contributionsProvider).asData?.value.length ?? 0;
    final authState = ref.watch(authStateProvider);
    final user = authState.asData?.value;

    return ScreenContainer(
      child: ListView(
        key: const PageStorageKey('profile-scroll'),
        padding: const EdgeInsets.only(bottom: 110),
        children: [
          BrandHeader(
            eyebrow: 'You',
            title: user?.displayName?.trim().isNotEmpty == true
                ? 'Welcome, ${user!.displayName!.trim().split(' ').first}.'
                : 'Your space.',
            subtitle: user == null
                ? 'Guest mode keeps public learning useful before sign-in.'
                : 'Your Google account keeps your Indigen World identity connected.',
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: Column(
              children: [
                _AccountCard(user: user),
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
                _AuthActionButton(
                  signedIn: user != null,
                  resolvingAuthState: authState.isLoading,
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
                'Saved words and contribution drafts remain on this device. Signing in shares your Google identity with Firebase Authentication; it does not upload local drafts or saved words. Production analytics and crash reporting remain disabled in non-production builds.',
                style: TextStyle(fontSize: 16, height: 1.5),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _AccountCard extends StatelessWidget {
  const _AccountCard({required this.user});

  final User? user;

  @override
  Widget build(BuildContext context) {
    final signedIn = user != null;
    final photoUrl = user?.photoURL;
    final displayName = user?.displayName?.trim();
    final primaryLabel = displayName?.isNotEmpty == true
        ? displayName!
        : signedIn
        ? 'Indigen World member'
        : 'Guest learner';
    final secondaryLabel = signedIn
        ? user?.email ?? 'Google account connected'
        : 'Kasem · $appEnvironment environment';

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Row(
          children: [
            CircleAvatar(
              radius: 30,
              backgroundColor: BrandColors.heritageGreen,
              foregroundImage: photoUrl == null ? null : NetworkImage(photoUrl),
              child: Icon(
                signedIn ? Icons.person_rounded : Icons.person_outline_rounded,
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
                    primaryLabel,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  const SizedBox(height: 4),
                  Text(
                    secondaryLabel,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ),
            ),
            const SizedBox(width: 10),
            StatusPill(
              icon: signedIn ? Icons.cloud_done_outlined : Icons.lock_outline,
              label: signedIn ? 'CONNECTED' : 'LOCAL',
              color: signedIn
                  ? BrandColors.heritageGreen
                  : BrandColors.savannahGreen,
            ),
          ],
        ),
      ),
    );
  }
}

class _AuthActionButton extends ConsumerStatefulWidget {
  const _AuthActionButton({
    required this.signedIn,
    required this.resolvingAuthState,
  });

  final bool signedIn;
  final bool resolvingAuthState;

  @override
  ConsumerState<_AuthActionButton> createState() => _AuthActionButtonState();
}

class _AuthActionButtonState extends ConsumerState<_AuthActionButton> {
  bool _busy = false;

  Future<void> _runAuthAction() async {
    if (_busy) return;
    setState(() => _busy = true);

    try {
      final authService = ref.read(googleFirebaseAuthServiceProvider);
      if (widget.signedIn) {
        await authService.signOut();
      } else {
        await authService.signIn();
      }
    } on AuthFailure catch (failure) {
      if (!failure.wasCancelled && mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(failure.message)));
      }
    } on Object {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Authentication failed. Please try again.'),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final disabled = _busy || widget.resolvingAuthState;
    return SizedBox(
      width: double.infinity,
      child: widget.signedIn
          ? OutlinedButton.icon(
              key: const Key('google-sign-out'),
              onPressed: disabled ? null : _runAuthAction,
              icon: _busy
                  ? const _AuthProgressIndicator()
                  : const Icon(Icons.logout_rounded),
              label: const Text('Sign out'),
            )
          : FilledButton.icon(
              key: const Key('google-sign-in'),
              onPressed: disabled ? null : _runAuthAction,
              icon: _busy
                  ? const _AuthProgressIndicator()
                  : const Icon(Icons.g_mobiledata_rounded, size: 28),
              label: Text(_busy ? 'Connecting…' : 'Continue with Google'),
            ),
    );
  }
}

class _AuthProgressIndicator extends StatelessWidget {
  const _AuthProgressIndicator();

  @override
  Widget build(BuildContext context) => const SizedBox.square(
    dimension: 18,
    child: CircularProgressIndicator(strokeWidth: 2),
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
