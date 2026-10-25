import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:intl/intl.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Snoozing alerts on this phone: they keep arriving, silently.
///
/// ── Why this is not quiet hours ───────────────────────────────────────────
/// Quiet hours are a standing arrangement kept by the backend — every night
/// from ten, say — and they hold alerts back until the window ends. Snoozing
/// is the opposite shape of decision: *right now*, for a while, because
/// somebody walked into a meeting or a funeral or a classroom. Nothing is held
/// back. Alerts still land in the shade, so the member can look whenever they
/// choose; they just do not ring, buzz or pop up over what is on screen.
///
/// It belongs to the handset, not the account — a phone on silent in church
/// says nothing about the tablet at home — and it is read by the alert
/// renderer, which is usually a background isolate the system woke for one
/// push. That is why the value is re-read from disk every time rather than
/// trusted from any in-memory cache.

const alertSnoozeKey = 'indigen_world_alerts_snoozed_until_v1';

/// The hour "Until tomorrow morning" ends at, local time.
const snoozeMorningHour = 7;

/// When snoozing ends, or null when alerts are ringing normally.
///
/// Expired values read as null rather than being cleaned up here: this runs in
/// whichever isolate is drawing an alert, and a read should never write.
Future<DateTime?> alertsSnoozedUntil({DateTime? now}) async {
  try {
    final preferences = await SharedPreferences.getInstance();
    // Another isolate — the app's own UI — may have changed it since this one
    // last looked.
    await preferences.reload();
    final until = preferences.getInt(alertSnoozeKey);
    if (until == null) return null;
    final end = DateTime.fromMillisecondsSinceEpoch(until);
    return end.isAfter(now ?? DateTime.now()) ? end : null;
  } on Object {
    return null;
  }
}

/// The next [snoozeMorningHour] o'clock after [now]: this morning if it has
/// not come yet, otherwise tomorrow's.
DateTime nextSnoozeMorning(DateTime now) {
  final today = DateTime(now.year, now.month, now.day, snoozeMorningHour);
  return now.isBefore(today)
      ? today
      : DateTime(now.year, now.month, now.day + 1, snoozeMorningHour);
}

/// The choices the snooze sheet offers.
enum SnoozeChoice {
  hour('For 1 hour'),
  eightHours('For 8 hours'),
  morning('Until tomorrow morning');

  const SnoozeChoice(this.label);
  final String label;

  DateTime endFrom(DateTime now) => switch (this) {
    SnoozeChoice.hour => now.add(const Duration(hours: 1)),
    SnoozeChoice.eightHours => now.add(const Duration(hours: 8)),
    SnoozeChoice.morning => nextSnoozeMorning(now),
  };
}

/// "until 14:30", or "until tomorrow 07:00" — always naming the day when it
/// is not today, because "until 07:00" read at 23:00 is ambiguous.
String snoozeUntilLabel(DateTime until, {DateTime? now}) {
  final reference = now ?? DateTime.now();
  final time = DateFormat.Hm().format(until);
  final sameDay =
      until.year == reference.year &&
      until.month == reference.month &&
      until.day == reference.day;
  if (sameDay) return 'until $time';
  final tomorrow = DateTime(reference.year, reference.month, reference.day + 1);
  final isTomorrow =
      until.year == tomorrow.year &&
      until.month == tomorrow.month &&
      until.day == tomorrow.day;
  return isTomorrow
      ? 'until tomorrow $time'
      : 'until ${DateFormat.MMMd().format(until)} $time';
}

/// The live snooze state, for the screens that show it.
///
/// Holds a timer to the end of the snooze so a banner saying "snoozed until
/// 14:30" disappears at 14:30 instead of the next time something rebuilds it.
class AlertSnooze extends Notifier<DateTime?> {
  Timer? _expiry;

  @override
  DateTime? build() {
    ref.onDispose(() => _expiry?.cancel());
    unawaited(_load());
    return null;
  }

  Future<void> _load() async => _set(await alertsSnoozedUntil());

  void _set(DateTime? until) {
    _expiry?.cancel();
    state = until;
    if (until == null) return;
    final remaining = until.difference(DateTime.now());
    _expiry = Timer(
      remaining.isNegative ? Duration.zero : remaining,
      () => state = null,
    );
  }

  Future<void> snooze(SnoozeChoice choice, {DateTime? now}) async {
    final until = choice.endFrom(now ?? DateTime.now());
    final preferences = await SharedPreferences.getInstance();
    await preferences.setInt(alertSnoozeKey, until.millisecondsSinceEpoch);
    _set(until);
  }

  Future<void> resume() async {
    final preferences = await SharedPreferences.getInstance();
    await preferences.remove(alertSnoozeKey);
    _set(null);
  }
}

final alertSnoozeProvider = NotifierProvider<AlertSnooze, DateTime?>(
  AlertSnooze.new,
);

/// Asks how long to snooze for, and does it. Offers to resume instead when a
/// snooze is already running.
Future<void> showSnoozeSheet(BuildContext context, WidgetRef ref) async {
  final current = ref.read(alertSnoozeProvider);
  final brand = context.brand;
  final choice = await showModalBottomSheet<Object>(
    context: context,
    showDragHandle: true,
    backgroundColor: brand.surface,
    builder: (sheet) => SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 4),
            child: Text(
              'Snooze alerts on this phone',
              style: TextStyle(
                color: brand.ink,
                fontSize: 17,
                fontWeight: FontWeight.w900,
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
            child: Text(
              'Alerts still arrive and wait in your notification shade — '
              'they just stay silent and do not pop up.',
              style: TextStyle(color: brand.mutedInk, fontSize: 13.5),
            ),
          ),
          if (current != null)
            ListTile(
              leading: Icon(
                Icons.notifications_active_rounded,
                color: brand.accent,
              ),
              title: const Text('Resume alerts now'),
              subtitle: Text('Snoozed ${snoozeUntilLabel(current)}'),
              onTap: () => Navigator.pop(sheet, 'resume'),
            ),
          for (final option in SnoozeChoice.values)
            ListTile(
              leading: const Icon(Icons.snooze_rounded),
              title: Text(option.label),
              subtitle: option == SnoozeChoice.morning
                  ? Text(
                      snoozeUntilLabel(option.endFrom(DateTime.now()))
                          .replaceFirst('until ', 'Ends '),
                    )
                  : null,
              onTap: () => Navigator.pop(sheet, option),
            ),
          const SizedBox(height: 8),
        ],
      ),
    ),
  );
  if (choice == null) return;
  HapticFeedback.selectionClick();
  final snooze = ref.read(alertSnoozeProvider.notifier);
  if (choice == 'resume') {
    await snooze.resume();
  } else if (choice is SnoozeChoice) {
    await snooze.snooze(choice);
  }
}

/// The strip that says alerts are snoozed, with the way out of it.
///
/// Shown wherever somebody would wonder why their phone has gone quiet: the
/// top of the notification centre and of Alert settings. Nothing when alerts
/// are ringing normally.
class AlertSnoozeBanner extends ConsumerWidget {
  const AlertSnoozeBanner({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final until = ref.watch(alertSnoozeProvider);
    if (until == null) return const SizedBox.shrink();
    final brand = context.brand;
    return Semantics(
      liveRegion: true,
      child: Container(
        margin: const EdgeInsets.fromLTRB(12, 8, 12, 4),
        padding: const EdgeInsets.fromLTRB(14, 6, 6, 6),
        decoration: BoxDecoration(
          color: brand.surfaceMuted,
          borderRadius: BorderRadius.circular(14),
        ),
        child: Row(
          children: [
            Icon(Icons.snooze_rounded, size: 18, color: brand.accent),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                'Alerts are silent ${snoozeUntilLabel(until)}',
                style: TextStyle(
                  color: brand.ink,
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
            TextButton(
              onPressed: () {
                HapticFeedback.selectionClick();
                unawaited(ref.read(alertSnoozeProvider.notifier).resume());
              },
              child: const Text('Resume'),
            ),
          ],
        ),
      ),
    );
  }
}
