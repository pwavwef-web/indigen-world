import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/core/connectivity.dart';
import 'package:indigen_world_mobile/features/community/community_setup_screen.dart';
import 'package:indigen_world_mobile/features/community/data/community_providers.dart';
import 'package:indigen_world_mobile/features/notifications/data/notification_preferences.dart';
import 'package:indigen_world_mobile/features/notifications/data/notification_providers.dart';
import 'package:indigen_world_mobile/features/notifications/push_messaging.dart';
import 'package:indigen_world_mobile/features/settings/settings_widgets.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Everything that decides whether this app is allowed to interrupt somebody.
///
/// ── Why this is a page and not a section ──────────────────────────────────
/// It used to be two blocks halfway down App settings: a switch for push, a
/// switch for previews, then nine more switches under a second heading, wedged
/// between the app's theme and its privacy policy. That is the wrong shape for
/// what this actually is. Nobody arrives at these controls while browsing —
/// they arrive because their phone will not stop, in the middle of something
/// else, wanting one specific thing turned off. Making them scroll a settings
/// list past four unrelated groups to find it is the app arguing with them.
///
/// The two axes stay visibly separate, because they are answers to different
/// questions and they live in different places. *On this device* is a phone
/// setting, stored in [SharedPreferences], and switching it off silences this
/// handset and nothing else. *What wakes you* is an account setting, stored on
/// the community profile, and it follows the member to every device they sign
/// in on — which is also why it needs a handle to hang off, and says so.
class NotificationSettingsScreen extends ConsumerStatefulWidget {
  const NotificationSettingsScreen({super.key});

  @override
  ConsumerState<NotificationSettingsScreen> createState() =>
      _NotificationSettingsScreenState();
}

class _NotificationSettingsScreenState
    extends ConsumerState<NotificationSettingsScreen> {
  bool? _alertsEnabled;
  var _updatingAlerts = false;
  bool? _previewsEnabled;

  @override
  void initState() {
    super.initState();
    _loadPreferences();
  }

  Future<void> _loadPreferences() async {
    final preferences = await SharedPreferences.getInstance();
    final previews = await messagePreviewsEnabled();
    if (!mounted) return;
    setState(() {
      _alertsEnabled = preferences.getBool(pushAlertsPreferenceKey) ?? false;
      _previewsEnabled = previews;
    });
  }

  Future<void> _setPreviews(bool enabled) async {
    setState(() => _previewsEnabled = enabled);
    await setMessagePreviews(ref, enabled: enabled);
  }

  Future<void> _setAlerts(bool enabled) async {
    final block = ref.read(connectionBlockProvider);
    if (block != null) {
      _message(block.message);
      return;
    }
    setState(() => _updatingAlerts = true);
    try {
      // Permission, device registration, the announcements topic and the
      // stored preference all move together — see setPushAlerts.
      final granted = await setPushAlerts(ref, enabled: enabled);

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

  void _openProfileSetup() => Navigator.of(context).push(
    MaterialPageRoute<void>(builder: (context) => const CommunitySetupScreen()),
  );

  @override
  Widget build(BuildContext context) {
    final profile = ref.watch(myCommunityProfileProvider).asData?.value;
    final alertsOn = _alertsEnabled ?? false;

    return Scaffold(
      appBar: AppBar(title: const Text('Notification settings')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(18, 14, 18, 40),
        children: [
          const SettingsSectionLabel('ON THIS DEVICE'),
          const SizedBox(height: 9),
          SettingsGroup(
            children: [
              SwitchListTile.adaptive(
                secondary: Icon(
                  Icons.campaign_outlined,
                  color: context.brand.accent,
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
                value: alertsOn,
                onChanged: _alertsEnabled == null || _updatingAlerts
                    ? null
                    : _setAlerts,
              ),
              // Only worth offering to somebody whose lock screen actually has
              // something drawn on it.
              if (alertsOn)
                SwitchListTile.adaptive(
                  secondary: Icon(
                    Icons.visibility_outlined,
                    color: context.brand.accent,
                  ),
                  title: const Text(
                    'Show message text in alerts',
                    style: TextStyle(fontWeight: FontWeight.w700),
                  ),
                  subtitle: const Text(
                    'Off means an alert says who wrote, not what they said. '
                    'This choice belongs to this device.',
                  ),
                  value: _previewsEnabled ?? true,
                  onChanged: _previewsEnabled == null ? null : _setPreviews,
                ),
            ],
          ),
          const SizedBox(height: 22),
          const SettingsSectionLabel('WHAT WAKES YOU'),
          const SizedBox(height: 9),
          _NotificationPreferencesGroup(
            hasProfile: profile != null,
            onSetUpProfile: _openProfileSetup,
            onFailed: () => _message('Could not save that choice. Try again.'),
          ),
          const SizedBox(height: 14),
          Text(
            'These follow your account rather than this phone, so they are the '
            'same on every device you sign in on. Switching them all off does '
            'not switch off the notifications list in the app — nothing is '
            'lost, you simply are not woken for it.',
            style: TextStyle(
              color: context.brand.faintInk,
              fontSize: 12,
              height: 1.45,
            ),
          ),
        ],
      ),
    );
  }
}

/// The switches that decide what the backend is allowed to wake you for, and
/// the one that moves all of them.
///
/// A `ConsumerWidget` rather than more state on the screen, so that a preference
/// arriving from the profile stream rebuilds these rows instead of the whole
/// page — and so the switches are readable next to the enum that defines them
/// rather than a hundred lines away from it.
///
/// Nothing here is optimistic. Firestore's local write echoes back through the
/// same snapshot listener before it has left the device, so a switch moves
/// immediately and then *stays* moved only if the write actually lands: a
/// refused write snaps it back, which is the honest thing for a control whose
/// whole job is to be believed.
class _NotificationPreferencesGroup extends ConsumerWidget {
  const _NotificationPreferencesGroup({
    required this.hasProfile,
    required this.onSetUpProfile,
    required this.onFailed,
  });

  final bool hasProfile;
  final VoidCallback onSetUpProfile;
  final VoidCallback onFailed;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // The preferences live on the community profile, so there is nowhere to
    // write them until there is one. Said plainly rather than shown as nine
    // switches that would silently fail to save.
    if (!hasProfile) {
      return SettingsGroup(
        children: [
          SettingsRow(
            icon: Icons.notifications_paused_outlined,
            title: 'Set up your profile to choose',
            subtitle:
                'These belong to you rather than to this phone, so they follow '
                'you to every device you sign in on',
            onTap: onSetUpProfile,
          ),
        ],
      );
    }

    final uid = ref.watch(currentUidProvider);
    final repository = ref.watch(notificationsRepositoryProvider);
    // Everything-on while the profile is still in flight, which is the same
    // answer absence gives on the backend: a member who has never been here
    // behaves exactly as they did before the switches existed.
    final preferences =
        ref.watch(notificationPreferencesProvider).asData?.value ??
        const NotificationPreferences.all();
    final muted = preferences.mutedCount;
    final total = NotificationPreference.values.length;

    Future<void> set(NotificationPreference preference, bool enabled) async {
      if (uid == null || repository == null) return;
      try {
        await repository.setPreference(
          uid: uid,
          preference: preference,
          enabled: enabled,
        );
      } on Object {
        onFailed();
      }
    }

    Future<void> setAll({required bool enabled}) async {
      if (uid == null || repository == null) return;
      try {
        await repository.setAllPreferences(uid: uid, enabled: enabled);
      } on Object {
        onFailed();
      }
    }

    final ready = uid != null && repository != null;
    return SettingsGroup(
      children: [
        // ── The one switch somebody in a hurry is looking for ──────────────
        // Nine switches is nine taps and nine chances to leave the loud one
        // on, and the member who most needs this screen is the one least
        // inclined to read it. Deliberately a row and not a tenth switch: it
        // is not a preference with a state of its own, it is a command that
        // sets the nine below it, and dressing a command as a switch is how
        // "everything off" ends up looking on because one row disagreed.
        SettingsRow(
          icon: muted == total
              ? Icons.notifications_active_outlined
              : Icons.notifications_off_outlined,
          title: muted == total ? 'Turn everything back on' : 'Mute everything',
          subtitle: switch (muted) {
            0 => 'All $total kinds can wake you',
            final it when it == total => 'Nothing wakes you right now',
            final it => '$it of $total muted',
          },
          enabled: ready,
          onTap: ready ? () => unawaited(setAll(enabled: muted == total)) : null,
        ),
        for (final preference in NotificationPreference.values)
          SwitchListTile.adaptive(
            secondary: Icon(preference.icon, color: context.brand.accent),
            title: Text(
              preference.title,
              style: const TextStyle(fontWeight: FontWeight.w700),
            ),
            subtitle: Text(preference.description),
            value: preferences.isOn(preference),
            onChanged: ready
                ? (value) => unawaited(set(preference, value))
                : null,
          ),
      ],
    );
  }
}
