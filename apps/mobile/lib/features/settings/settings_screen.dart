import 'dart:io' show Platform;

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/app_config.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/core/connectivity.dart';
import 'package:indigen_world_mobile/core/firebase_ready.dart';
import 'package:indigen_world_mobile/features/auth/auth_repository.dart';
import 'package:indigen_world_mobile/features/auth/sign_in_sheet.dart';
import 'package:indigen_world_mobile/features/community/community_setup_screen.dart';
import 'package:indigen_world_mobile/features/community/data/community_providers.dart';
import 'package:indigen_world_mobile/features/community/edit_community_profile_screen.dart';
import 'package:indigen_world_mobile/features/community/people_screen.dart';
import 'package:indigen_world_mobile/features/community/saved_posts_screen.dart';
import 'package:indigen_world_mobile/features/notifications/notifications_screen.dart';
import 'package:indigen_world_mobile/features/notifications/push_messaging.dart';
import 'package:indigen_world_mobile/features/settings/licences_screen.dart';
import 'package:indigen_world_mobile/features/settings/policy_screen.dart';
import 'package:indigen_world_mobile/shared/glass_popup.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// App version and build number, read from the packaged manifest.
final appVersionProvider = FutureProvider<String>((ref) async {
  final info = await PackageInfo.fromPlatform();
  return '${info.version} (${info.buildNumber})';
});

/// The FCM topic community announcements are broadcast on.
const _communityTopic = 'community-updates';

/// Shared with the push layer so the toggle and the registration agree on what
/// the member chose. Two copies of this key meant settings could show "on"
/// while no device was ever registered.
const _notificationsPreferenceKey = pushAlertsPreferenceKey;

/// Everything about the account, the community identity, privacy and the
/// legal record — including licences.
class SettingsScreen extends ConsumerStatefulWidget {
  const SettingsScreen({super.key});

  @override
  ConsumerState<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends ConsumerState<SettingsScreen> {
  bool? _alertsEnabled;
  var _updatingAlerts = false;

  @override
  void initState() {
    super.initState();
    _loadPreferences();
  }

  Future<void> _loadPreferences() async {
    final preferences = await SharedPreferences.getInstance();
    if (!mounted) return;
    setState(
      () => _alertsEnabled =
          preferences.getBool(_notificationsPreferenceKey) ?? false,
    );
  }

  Future<void> _setAlerts(bool enabled) async {
    final block = ref.read(connectionBlockProvider);
    if (block != null) {
      _message(block.message);
      return;
    }
    setState(() => _updatingAlerts = true);
    try {
      // Permission, device registration and the stored preference all move
      // together — see setPushAlerts.
      final granted = await setPushAlerts(ref, enabled: enabled);

      // The broadcast topic is separate from per-member alerts: it carries
      // project announcements rather than anything about you.
      final messaging = FirebaseMessaging.instance;
      if (granted) {
        await messaging.subscribeToTopic(_communityTopic);
      } else {
        await messaging.unsubscribeFromTopic(_communityTopic);
      }

      if (!mounted) return;
      setState(() {
        _alertsEnabled = granted;
        _updatingAlerts = false;
      });
      if (enabled && !granted) {
        _message(
          'Notifications are turned off for Indigen in your device settings.',
        );
      }
    } on Object {
      if (!mounted) return;
      setState(() => _updatingAlerts = false);
      _message('Could not update your notification choice.');
    }
  }

  void _message(String text) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(content: Text(text), behavior: SnackBarBehavior.floating),
      );
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authStateProvider).asData?.value;
    final signedIn = user != null;
    final profile = ref.watch(myCommunityProfileProvider).asData?.value;
    final version = ref.watch(appVersionProvider).asData?.value;

    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(18, 10, 18, 40),
        children: [
          // ── Identity card ────────────────────────────────────────────
          Card(
            child: ListTile(
              minVerticalPadding: 16,
              leading: const Icon(
                Icons.account_circle_outlined,
                size: 34,
                color: BrandColors.heritageGreen,
              ),
              title: Text(
                profile?.displayName ??
                    (user?.displayName?.trim().isNotEmpty ?? false
                        ? user!.displayName!.trim()
                        : signedIn
                        ? 'Indigen World member'
                        : 'Guest learner'),
                style: const TextStyle(fontWeight: FontWeight.w800),
              ),
              subtitle: Text(
                profile != null
                    ? profile.handle
                    : (user?.email ??
                          'Signed out · $appEnvironmentName environment'),
              ),
              trailing: signedIn
                  ? const Icon(Icons.chevron_right_rounded)
                  : null,
              onTap: signedIn ? _openCommunityProfile : null,
            ),
          ),
          const SizedBox(height: 22),

          // ── Account ──────────────────────────────────────────────────
          const _SectionLabel('ACCOUNT'),
          const SizedBox(height: 9),
          _SettingsGroup(
            children: [
              _SettingsRow(
                icon: Icons.badge_outlined,
                title: profile == null
                    ? 'Set up your community profile'
                    : 'Edit community profile',
                subtitle: profile == null
                    ? 'Choose the handle the community knows you by'
                    : 'Name, photo, cover, bio and dialect',
                onTap: _openCommunityProfile,
              ),
              _SettingsRow(
                icon: Icons.lock_outline_rounded,
                title: 'Change password',
                subtitle: signedIn
                    ? 'We email you a secure reset link'
                    : 'Sign in first',
                enabled: signedIn && (user.email?.isNotEmpty ?? false),
                onTap: () => _sendPasswordReset(user?.email),
              ),
              _SettingsRow(
                icon: signedIn ? Icons.logout_rounded : Icons.login_rounded,
                title: signedIn ? 'Sign out' : 'Sign in or create an account',
                subtitle: signedIn
                    ? 'Public learning stays available in guest mode'
                    : 'Post, follow and keep your saves across devices',
                onTap: signedIn ? _signOut : _signIn,
              ),
            ],
          ),
          const SizedBox(height: 22),

          // ── Community ────────────────────────────────────────────────
          const _SectionLabel('COMMUNITY'),
          const SizedBox(height: 9),
          _SettingsGroup(
            children: [
              _SettingsRow(
                icon: Icons.bookmark_border_rounded,
                title: 'Saved posts',
                subtitle: 'Posts you kept for later — private to you',
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder: (context) => const SavedPostsScreen(),
                  ),
                ),
              ),
              _SettingsRow(
                icon: Icons.person_search_outlined,
                title: 'Find people',
                subtitle: 'Search members by name or handle',
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder: (context) => const PeopleScreen(),
                  ),
                ),
              ),
              _SettingsRow(
                icon: Icons.handshake_outlined,
                title: 'Community guidelines',
                subtitle: 'How this room keeps Kasem at its centre',
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder: (context) =>
                        const PolicyScreen(document: PolicyDocument.guidelines),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 22),

          // ── Preferences ──────────────────────────────────────────────
          const _SectionLabel('PREFERENCES'),
          const SizedBox(height: 9),
          _SettingsGroup(
            children: [
              _SettingsRow(
                icon: Icons.notifications_none_rounded,
                title: 'Notifications',
                subtitle: 'Likes, replies, follows, mentions and new releases',
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder: (context) => const NotificationsScreen(),
                  ),
                ),
              ),
              SwitchListTile.adaptive(
                secondary: const Icon(
                  Icons.campaign_outlined,
                  color: BrandColors.heritageGreen,
                ),
                title: const Text(
                  'Push alerts on this device',
                  style: TextStyle(fontWeight: FontWeight.w700),
                ),
                subtitle: Text(
                  _alertsEnabled == null
                      ? 'Loading your choice…'
                      : 'Alerts reach your lock screen. Everything still '
                            'appears in the app either way.',
                ),
                value: _alertsEnabled ?? false,
                onChanged: _alertsEnabled == null || _updatingAlerts
                    ? null
                    : _setAlerts,
              ),
            ],
          ),
          const SizedBox(height: 22),

          // ── Privacy and data ─────────────────────────────────────────
          const _SectionLabel('PRIVACY AND DATA'),
          const SizedBox(height: 9),
          _SettingsGroup(
            children: [
              _SettingsRow(
                icon: Icons.privacy_tip_outlined,
                title: 'Privacy and community data',
                subtitle: 'What is stored, where, and why',
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder: (context) =>
                        const PolicyScreen(document: PolicyDocument.privacy),
                  ),
                ),
              ),
              _SettingsRow(
                icon: Icons.support_agent_outlined,
                title: 'Contact support',
                subtitle: 'Reach the project team about your account or data',
                onTap: _openSupport,
              ),
              _SettingsRow(
                icon: Icons.no_accounts_outlined,
                title: 'Delete your account',
                subtitle: 'Removes your identity, posts and saves',
                destructive: true,
                onTap: _confirmDeletion,
              ),
            ],
          ),
          const SizedBox(height: 22),

          // ── About ────────────────────────────────────────────────────
          const _SectionLabel('ABOUT'),
          const SizedBox(height: 9),
          _SettingsGroup(
            children: [
              _SettingsRow(
                icon: Icons.description_outlined,
                title: 'Licences',
                subtitle:
                    'Content licences, community post terms and open-source '
                    'notices',
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder: (context) => const LicencesScreen(),
                  ),
                ),
              ),
              _SettingsRow(
                icon: Icons.gavel_outlined,
                title: 'Terms of use',
                subtitle: 'The agreement between you and Indigen World',
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder: (context) =>
                        const PolicyScreen(document: PolicyDocument.terms),
                  ),
                ),
              ),
              _SettingsRow(
                icon: Icons.info_outline_rounded,
                title: 'Indigen World',
                subtitle: version == null
                    ? 'Version loading…'
                    : 'Version $version · $appEnvironmentName',
                onTap: version == null
                    ? null
                    : () {
                        Clipboard.setData(
                          ClipboardData(
                            text:
                                'Indigen World $version · $appEnvironmentName',
                          ),
                        );
                        _message('Version copied.');
                      },
              ),
            ],
          ),
        ],
      ),
    );
  }

  void _openCommunityProfile() {
    final profile = ref.read(myCommunityProfileProvider).asData?.value;
    if (ref.read(currentUidProvider) == null) {
      _signIn();
      return;
    }
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (context) => profile == null
            ? const CommunitySetupScreen()
            : EditCommunityProfileScreen(profile: profile),
      ),
    );
  }

  Future<void> _signIn() async {
    final signedIn = await showSignInSheet(context);
    if ((signedIn ?? false) && mounted) {
      _message('Signed in. Welcome to Indigen World.');
    }
  }

  Future<void> _signOut() async {
    final confirmed = await showGlassConfirm(
      context: context,
      title: 'Sign out?',
      message:
          'Public learning stays available in guest mode. You can sign back '
          'in anytime.',
      confirmLabel: 'Sign out',
    );
    if (confirmed != true) return;
    // Drop the push registration first, while the account is still signed in
    // and the rules still allow deleting its own row.
    await unregisterThisDevice(ref);
    await ref.read(authRepositoryProvider)?.signOut();
    if (mounted) _message('Signed out.');
  }

  Future<void> _sendPasswordReset(String? email) async {
    if (email == null || email.isEmpty) return;
    final repository = ref.read(authRepositoryProvider);
    if (repository == null) {
      _message('You need a connection to reset your password.');
      return;
    }
    final confirmed = await showGlassConfirm(
      context: context,
      title: 'Send a reset link?',
      message: 'We will email a password reset link to $email.',
      confirmLabel: 'Send link',
    );
    if (confirmed != true) return;
    try {
      await repository.sendPasswordReset(email);
      if (mounted) _message('Reset link sent to $email.');
    } on AuthFailure catch (error) {
      if (mounted) _message(error.message);
    }
  }

  Future<void> _openSupport() async {
    final uid = ref.read(currentUidProvider);
    if (uid == null) {
      _message('Sign in so the team can reply to the right account.');
      return;
    }
    if (!ref.read(firebaseReadyProvider)) {
      _message('You need a connection to reach support.');
      return;
    }

    final controller = TextEditingController();
    final sent = await showGlassPopup<bool>(
      context: context,
      title: 'Contact support',
      subtitle:
          'Describe what you need. The project team sees your account so '
          'they can reply.',
      builder: (popupContext) => Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          TextField(
            controller: controller,
            autofocus: true,
            minLines: 3,
            maxLines: 6,
            maxLength: 1200,
            textCapitalization: TextCapitalization.sentences,
            decoration: const InputDecoration(
              hintText: 'What can we help with?',
            ),
          ),
          const SizedBox(height: 8),
          FilledButton(
            onPressed: () {
              if (controller.text.trim().isEmpty) return;
              Navigator.pop(popupContext, true);
            },
            child: const Text('Send to the project team'),
          ),
        ],
      ),
    );

    final message = controller.text.trim();
    controller.dispose();
    if (sent != true || message.isEmpty) return;

    try {
      await FirebaseFirestore.instance.collection('supportRequests').add({
        'authUid': uid,
        'status': 'open',
        'message': message,
        'source': 'mobile-settings',
        'platform': Platform.operatingSystem,
        'appVersion': ref.read(appVersionProvider).asData?.value ?? 'unknown',
        'createdAt': FieldValue.serverTimestamp(),
      });
      if (mounted) _message('Sent. The team will get back to you.');
    } on Object {
      if (mounted) _message('Could not send your message. Try again.');
    }
  }

  Future<void> _confirmDeletion() async {
    final confirmed = await showGlassConfirm(
      context: context,
      title: 'Delete your account?',
      message:
          'Deletion removes your community profile, posts, saves and follows. '
          'Validated contributions you have already made to the language '
          'record stay, because they belong to the community — your name is '
          'removed from them on request.\n\n'
          'Deletion is carried out by the project team so the consent record '
          'stays auditable. Send the request and they will confirm by email.',
      confirmLabel: 'Request deletion',
      isDestructive: true,
    );
    if (confirmed != true) return;

    final uid = ref.read(currentUidProvider);
    if (uid == null) {
      _message('Sign in to request deletion of your account.');
      return;
    }
    try {
      await FirebaseFirestore.instance.collection('supportRequests').add({
        'authUid': uid,
        'status': 'open',
        'kind': 'account-deletion',
        'message': 'Account deletion requested from the mobile app.',
        'source': 'mobile-settings',
        'platform': Platform.operatingSystem,
        'createdAt': FieldValue.serverTimestamp(),
      });
      if (mounted) _message('Deletion request sent to the project team.');
    } on Object {
      if (mounted) _message('Could not send the request. Try again.');
    }
  }
}

// ── Building blocks ─────────────────────────────────────────────────────────

class _SectionLabel extends StatelessWidget {
  const _SectionLabel(this.label);

  final String label;

  @override
  Widget build(BuildContext context) => Text(
    label,
    style: const TextStyle(
      color: BrandColors.heritageGreen,
      fontSize: 11,
      fontWeight: FontWeight.w900,
      letterSpacing: 1.2,
    ),
  );
}

class _SettingsGroup extends StatelessWidget {
  const _SettingsGroup({required this.children});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) => Card(
    child: Column(
      children: [
        for (var index = 0; index < children.length; index++) ...[
          if (index > 0) const Divider(height: 1, indent: 62),
          children[index],
        ],
      ],
    ),
  );
}

class _SettingsRow extends StatelessWidget {
  const _SettingsRow({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
    this.enabled = true,
    this.destructive = false,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback? onTap;
  final bool enabled;
  final bool destructive;

  @override
  Widget build(BuildContext context) {
    final color = destructive
        ? BrandColors.terracotta
        : BrandColors.heritageGreen;
    return ListTile(
      enabled: enabled && onTap != null,
      minVerticalPadding: 12,
      leading: Icon(icon, color: color),
      title: Text(
        title,
        style: TextStyle(
          fontWeight: FontWeight.w700,
          color: destructive ? BrandColors.terracotta : null,
        ),
      ),
      subtitle: Text(subtitle),
      trailing: const Icon(Icons.chevron_right_rounded),
      onTap: onTap,
    );
  }
}
