import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/learn/practice_reminder.dart';

/// "Remind me to practise", and at what time.
///
/// Shown where the daily goal is explained — the moment somebody is thinking
/// about keeping it — and again in notification settings, where people look
/// for anything that makes the phone buzz.
class PracticeReminderRow extends ConsumerWidget {
  const PracticeReminderRow({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final brand = context.brand;
    final reminder = ref.watch(practiceReminderProvider);
    final controller = ref.read(practiceReminderProvider.notifier);
    final time = TimeOfDay(hour: reminder.hour, minute: reminder.minute);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        SwitchListTile.adaptive(
          key: const Key('practice-reminder-switch'),
          contentPadding: EdgeInsets.zero,
          secondary: Icon(Icons.alarm_rounded, color: brand.accent),
          title: const Text(
            'Remind me to practise',
            style: TextStyle(fontWeight: FontWeight.w700),
          ),
          subtitle: Text(
            reminder.enabled
                ? 'Every day at ${time.format(context)}, unless you have '
                      'already practised.'
                : 'A nudge on days you have not practised yet. On this phone.',
          ),
          value: reminder.enabled,
          onChanged: (on) async {
            if (on) unawaited(_askToNotify());
            await controller.setEnabled(on);
          },
        ),
        if (reminder.enabled)
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton.icon(
              key: const Key('practice-reminder-time'),
              onPressed: () async {
                final picked = await showTimePicker(
                  context: context,
                  initialTime: time,
                  helpText: 'Remind me at',
                );
                if (picked != null) {
                  await controller.setTime(picked.hour * 60 + picked.minute);
                }
              },
              icon: const Icon(Icons.schedule_rounded),
              label: Text('Change the time (${time.format(context)})'),
            ),
          ),
      ],
    );
  }

  /// Android 13 and later post nothing without the grant. Asked here, when
  /// somebody has just said they want a reminder, rather than at launch.
  static Future<void> _askToNotify() async {
    if (!Platform.isAndroid) return;
    try {
      await FlutterLocalNotificationsPlugin()
          .resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin
          >()
          ?.requestNotificationsPermission();
    } on Object {
      // Refused or unavailable: the switch still records the wish, and the
      // reminder appears once alerts are allowed.
    }
  }
}
