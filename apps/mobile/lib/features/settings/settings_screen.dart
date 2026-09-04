import 'dart:async';
import 'dart:io' show Platform;

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/app_config.dart';
import 'package:indigen_world_mobile/core/app_locale.dart';
import 'package:indigen_world_mobile/core/app_signature.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/core/connectivity.dart';
import 'package:indigen_world_mobile/core/firebase_ready.dart';
import 'package:indigen_world_mobile/core/media_preferences.dart';
import 'package:indigen_world_mobile/core/theme_mode.dart';
import 'package:indigen_world_mobile/features/auth/auth_repository.dart';
import 'package:indigen_world_mobile/features/auth/sign_in_sheet.dart';
import 'package:indigen_world_mobile/features/community/claim_kasem_name_screen.dart';
import 'package:indigen_world_mobile/features/community/data/community_models.dart';
import 'package:indigen_world_mobile/features/community/data/community_providers.dart';
import 'package:indigen_world_mobile/features/community/data/kasem_names.dart';
import 'package:indigen_world_mobile/features/community/people_screen.dart';
import 'package:indigen_world_mobile/features/community/phone_verification_screen.dart';
import 'package:indigen_world_mobile/features/community/saved_posts_screen.dart';
import 'package:indigen_world_mobile/features/community/widgets/verified_badge.dart';
import 'package:indigen_world_mobile/features/downloads/data/downloads_providers.dart';
import 'package:indigen_world_mobile/features/downloads/downloads_screen.dart';
import 'package:indigen_world_mobile/features/notifications/data/notification_preferences.dart';
import 'package:indigen_world_mobile/features/notifications/data/notification_providers.dart';
import 'package:indigen_world_mobile/features/notifications/notification_settings_screen.dart';
import 'package:indigen_world_mobile/features/notifications/notifications_screen.dart';
import 'package:indigen_world_mobile/features/notifications/push_messaging.dart';
import 'package:indigen_world_mobile/features/rating/rating_service.dart';
import 'package:indigen_world_mobile/features/settings/licences_screen.dart';
import 'package:indigen_world_mobile/features/settings/policy_screen.dart';
import 'package:indigen_world_mobile/features/settings/settings_widgets.dart';
import 'package:indigen_world_mobile/features/subscriptions/data/entitlement.dart';
import 'package:indigen_world_mobile/features/subscriptions/data/subscription_catalog.dart';
import 'package:indigen_world_mobile/features/subscriptions/data/subscription_providers.dart';
import 'package:indigen_world_mobile/features/subscriptions/manage_subscription_screen.dart';
import 'package:indigen_world_mobile/l10n/app_localizations.dart';
import 'package:indigen_world_mobile/shared/glass_popup.dart';
import 'package:package_info_plus/package_info_plus.dart';

/// App version and build number, read from the packaged manifest.
final appVersionProvider = FutureProvider<String>((ref) async {
  final info = await PackageInfo.fromPlatform();
  return '${info.version} (${info.buildNumber})';
});

/// Everything about the account, privacy and the legal record — including
/// licences.
///
/// Two things it deliberately no longer holds. The community profile, which now
/// lives in exactly one place (the Profile tab), because it had three front
/// doors and one of them was buried in here. And the notification switches,
/// which are their own page: eleven controls wedged between the app's theme and
/// its privacy policy is not where anybody looks for them at the moment their
/// phone will not stop.
class SettingsScreen extends ConsumerStatefulWidget {
  const SettingsScreen({super.key});

  @override
  ConsumerState<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends ConsumerState<SettingsScreen> {
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
    final themeMode = ref.watch(themeModeProvider);
    final locale = ref.watch(localeProvider);
    final l10n = AppLocalizations.of(context);
    final signature = ref.watch(appSignatureProvider).asData?.value;
    final entitlement =
        ref.watch(entitlementProvider).asData?.value ?? Entitlement.none;
    final downloadCount = ref.watch(downloadedIdsProvider).length;
    final mutedAlerts =
        ref.watch(notificationPreferencesProvider).asData?.value.mutedCount ?? 0;

    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(18, 10, 18, 40),
        children: [
          // ── Identity card ────────────────────────────────────────────
          //
          // A summary and nothing more. It used to be the third way into the
          // community profile editor; it now says who is signed in, which is
          // the only thing a settings screen needs an identity for.
          Card(
            child: ListTile(
              minVerticalPadding: 16,
              leading: Icon(
                Icons.account_circle_outlined,
                size: 34,
                color: context.brand.accent,
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
            ),
          ),
          const SizedBox(height: 22),

          // ── Account ──────────────────────────────────────────────────
          const SettingsSectionLabel('ACCOUNT'),
          const SizedBox(height: 9),
          SettingsGroup(
            children: [
              // Offered only while it is still there to take, only to somebody
              // who has not already got the ring — a row that says "take a
              // Kassena name" to a member called Nyaaba is noise — and only
              // when the console has published names to take. The list is the
              // console's alone now, so it can be empty, and there is no point
              // offering a door to an empty room.
              if (profile != null &&
                  profile.canClaimKasemName &&
                  ref.watch(kasemNamesProvider).isNotEmpty &&
                  !isKasemHandle(
                    profile.username,
                    ref.watch(kasemHandleSetProvider),
                  ))
                SettingsRow(
                  icon: Icons.workspace_premium_outlined,
                  title: 'Take a Kassena name',
                  subtitle: 'One change, and your picture gets the kente ring',
                  onTap: () => _claimKasemName(profile),
                ),
              // Verification sits in Account rather than Preferences: it is
              // about who this account is, not how it behaves.
              SettingsRow(
                icon: profile?.phoneVerified ?? false
                    ? Icons.verified_user_rounded
                    : Icons.phone_iphone_rounded,
                title: profile?.phoneVerified ?? false
                    ? 'Number verified'
                    : 'Verify your number',
                subtitle: switch (profile) {
                  null => 'Set up your community profile first',
                  final it when it.phoneVerified =>
                    VerifiedBadge.label(it.mark),
                  // A granted kind that is waiting on a phone is explained
                  // rather than left as a badge that never appeared.
                  final it when it.hasPendingVerification =>
                    'Your ${VerifiedBadge.label(VerifiedMark.fromKind(it.verifiedKind)).toLowerCase()} mark is waiting on this',
                  _ => 'Show the community somebody real is here',
                },
                enabled: signedIn && profile != null && !(profile.phoneVerified),
                onTap: _verifyPhone,
              ),
              // Between verification and the account controls, because that is
              // what it is about: what this account is entitled to. The row
              // reads the entitlement rather than guessing, so a member whose
              // renewal has failed sees that here rather than discovering it
              // when the adverts come back.
              SettingsRow(
                icon: entitlement.isActive
                    ? Icons.volunteer_activism_rounded
                    : Icons.favorite_border_rounded,
                title: entitlement.isActive
                    ? productForId(entitlement.productId)?.name ??
                          'Your membership'
                    : 'Membership',
                subtitle: entitlement.isActive
                    ? entitlement.status.description
                    : 'No adverts, offline listening, and more of Kawuri',
                onTap: _openSubscription,
              ),
              SettingsRow(
                icon: Icons.lock_outline_rounded,
                title: 'Change password',
                subtitle: signedIn
                    ? 'We email you a secure reset link'
                    : 'Sign in first',
                enabled: signedIn && (user.email?.isNotEmpty ?? false),
                onTap: () => _sendPasswordReset(user?.email),
              ),
              SettingsRow(
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
          const SettingsSectionLabel('COMMUNITY'),
          const SizedBox(height: 9),
          SettingsGroup(
            children: [
              SettingsRow(
                icon: Icons.download_for_offline_outlined,
                title: 'Downloads',
                subtitle: downloadCount > 0
                    ? '$downloadCount kept on this phone'
                    : 'Songs and chapters kept for listening offline',
                onTap: _openDownloads,
              ),
              SettingsRow(
                icon: Icons.bookmark_border_rounded,
                title: 'Saved posts',
                subtitle: 'Posts you kept for later — private to you',
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder: (context) => const SavedPostsScreen(),
                  ),
                ),
              ),
              SettingsRow(
                icon: Icons.person_search_outlined,
                title: 'Find people',
                subtitle: 'Search members by name or handle',
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder: (context) => const PeopleScreen(),
                  ),
                ),
              ),
              SettingsRow(
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
          SettingsSectionLabel(l10n.settingsPreferences),
          const SizedBox(height: 9),
          SettingsGroup(
            children: [
              // First in the group, because it decides what every other row on
              // this screen is written in.
              SettingsRow(
                icon: Icons.translate_rounded,
                title: l10n.settingsLanguage,
                subtitle: locale == null
                    ? l10n.settingsLanguageMatchDevice
                    : languageEndonym(locale),
                onTap: _chooseLanguage,
              ),
              SettingsRow(
                icon: themeModeIcon(themeMode),
                title: l10n.settingsAppearance,
                subtitle: switch (themeMode) {
                  ThemeMode.system => l10n.settingsAppearanceSystem,
                  ThemeMode.light => l10n.settingsAppearanceLight,
                  ThemeMode.dark => l10n.settingsAppearanceDark,
                },
                onTap: _chooseAppearance,
              ),
              SwitchListTile.adaptive(
                secondary: Icon(
                  Icons.play_circle_outline_rounded,
                  color: context.brand.accent,
                ),
                title: Text(
                  l10n.settingsAutoplayTitle,
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
                subtitle: Text(l10n.settingsAutoplayBody),
                value: ref.watch(videoAutoplayProvider),
                onChanged: (value) => unawaited(
                  ref.read(videoAutoplayProvider.notifier).set(value),
                ),
              ),
            ],
          ),
          const SizedBox(height: 22),

          // ── Notifications ────────────────────────────────────────────
          //
          // Two doors, and neither of them is a switch. One goes to what has
          // already happened, the other to what is allowed to happen — a
          // distinction that was genuinely hard to see when the second was
          // eleven controls sitting directly under the first.
          const SettingsSectionLabel('NOTIFICATIONS'),
          const SizedBox(height: 9),
          SettingsGroup(
            children: [
              SettingsRow(
                icon: Icons.notifications_none_rounded,
                title: 'Notifications',
                subtitle:
                    'Everything that has happened, whatever is muted for push',
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder: (context) => const NotificationsScreen(),
                  ),
                ),
              ),
              SettingsRow(
                icon: Icons.tune_rounded,
                title: 'Notification settings',
                subtitle: mutedAlerts == 0
                    ? 'Push alerts, and what is allowed to wake you'
                    : '$mutedAlerts of ${NotificationPreference.values.length} '
                          'kinds muted',
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder: (context) => const NotificationSettingsScreen(),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 22),

          // ── Privacy and data ─────────────────────────────────────────
          const SettingsSectionLabel('PRIVACY AND DATA'),
          const SizedBox(height: 9),
          SettingsGroup(
            children: [
              SettingsRow(
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
              SettingsRow(
                icon: Icons.support_agent_outlined,
                title: 'Contact support',
                subtitle: 'Reach the project team',
                onTap: _openSupport,
              ),
              SettingsRow(
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
          const SettingsSectionLabel('ABOUT'),
          const SizedBox(height: 9),
          SettingsGroup(
            children: [
              SettingsRow(
                icon: Icons.description_outlined,
                title: 'Licences',
                subtitle: 'Licences and open-source notices',
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder: (context) => const LicencesScreen(),
                  ),
                ),
              ),
              // A deliberate, member-initiated path to the store. Distinct from
              // the in-app review card, which Play forbids putting behind any
              // button or question — see rating_service.dart.
              const SettingsRow(
                icon: Icons.star_outline_rounded,
                title: 'Rate Indigen World',
                subtitle: 'Leave a review on Google Play',
                onTap: openStoreListing,
              ),
              SettingsRow(
                icon: Icons.gavel_outlined,
                title: 'Terms of use',
                subtitle: 'Your agreement with Indigen World',
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder: (context) =>
                        const PolicyScreen(document: PolicyDocument.terms),
                  ),
                ),
              ),
              SettingsRow(
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
              // The pair Google Sign-In is granted to. Unreadable anywhere
              // else on a Play-signed release — Play mints the certificate
              // after upload — and the only thing anybody needs when sign-in
              // is refused for this build.
              if (signature != null)
                SettingsRow(
                  icon: Icons.fingerprint_rounded,
                  title: 'App signature',
                  subtitle:
                      '${signature.packageName}\n'
                      'SHA-1 ${AppSignature.formatted(signature.sha1) ?? 'unavailable'}',
                  onTap: () {
                    Clipboard.setData(
                      ClipboardData(
                        text:
                            '${signature.packageName}\n'
                            'SHA-1: ${AppSignature.formatted(signature.sha1) ?? 'unavailable'}\n'
                            'SHA-256: ${AppSignature.formatted(signature.sha256) ?? 'unavailable'}\n'
                            'Installed by: ${signature.installer ?? 'sideloaded'}',
                      ),
                    );
                    _message('App signature copied.');
                  },
                ),
            ],
          ),
        ],
      ),
    );
  }

  /// The appearance choice, offered as three plain rows.
  ///
  /// A switch would only cover two of the three states, and "match device" is
  /// the one most people want — a phone that goes dark at dusk should take the
  /// app with it.
  /// The reading language.
  ///
  /// "Match my device" leads, and is what almost everybody stays on — the list
  /// exists for the member whose phone language and reading language differ,
  /// which in a diaspora is a very ordinary thing to be.
  Future<void> _chooseLanguage() async {
    final l10n = AppLocalizations.of(context);
    final current = ref.read(localeProvider);
    final choice = await showGlassActionSheet<String>(
      context: context,
      title: l10n.settingsLanguage,
      actions: [
        GlassAction(
          value: '',
          icon: current == null
              ? Icons.check_circle_rounded
              : Icons.smartphone_rounded,
          label: l10n.settingsLanguageMatchDevice,
          description: l10n.settingsLanguageSubtitle,
        ),
        for (final locale in supportedAppLocales)
          GlassAction(
            value: locale.languageCode,
            icon: current?.languageCode == locale.languageCode
                ? Icons.check_circle_rounded
                : Icons.translate_rounded,
            // Named in itself, so somebody who cannot read the list can still
            // find their own language in it.
            label: languageEndonym(locale),
          ),
      ],
    );
    if (choice == null) return;
    await ref
        .read(localeProvider.notifier)
        .setLocale(choice.isEmpty ? null : Locale(choice));
  }

  Future<void> _chooseAppearance() async {
    final current = ref.read(themeModeProvider);
    final choice = await showGlassActionSheet<ThemeMode>(
      context: context,
      title: AppLocalizations.of(context).settingsAppearance,
      actions: [
        for (final mode in ThemeMode.values)
          GlassAction(
            value: mode,
            icon: mode == current
                ? Icons.check_circle_rounded
                : themeModeIcon(mode),
            label: themeModeLabel(mode),
            description: switch (mode) {
              ThemeMode.system => 'Follow the phone light and dark setting',
              ThemeMode.light => 'Always light',
              ThemeMode.dark => 'Always dark',
            },
          ),
      ],
    );
    if (choice == null) return;
    await ref.read(themeModeProvider.notifier).setMode(choice);
  }

  Future<void> _claimKasemName(CommunityProfile profile) async {
    final block = ref.read(connectionBlockProvider);
    if (block != null) {
      _message(block.message);
      return;
    }
    final claimed = await Navigator.of(context).push<bool>(
      MaterialPageRoute<bool>(
        builder: (context) => ClaimKasemNameScreen(profile: profile),
      ),
    );
    if ((claimed ?? false) && mounted) {
      _message('Your name is yours. Wear it well.');
    }
  }

  Future<void> _openSubscription() => Navigator.of(context).push(
    MaterialPageRoute<void>(
      builder: (context) => const ManageSubscriptionScreen(),
    ),
  );

  Future<void> _openDownloads() => Navigator.of(context).push(
    MaterialPageRoute<void>(builder: (context) => const DownloadsScreen()),
  );

  Future<void> _verifyPhone() async {
    final block = ref.read(connectionBlockProvider);
    if (block != null) {
      _message(block.message);
      return;
    }
    final verified = await Navigator.of(context).push<bool>(
      MaterialPageRoute<bool>(
        builder: (context) => const PhoneVerificationScreen(),
      ),
    );
    if ((verified ?? false) && mounted) {
      _message('Your number is verified.');
    }
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
