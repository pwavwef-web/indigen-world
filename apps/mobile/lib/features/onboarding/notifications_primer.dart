import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/notifications/push_messaging.dart';

/// Asks for push alerts, in the member's language, before the OS asks in its
/// own.
///
/// Android 13 and iOS each grant exactly one permission prompt per install. A
/// reflexive "Deny" on a dialog that arrived with no explanation is permanent
/// short of a trip through system settings — so the ask is made here first,
/// where there is room to say what actually arrives, and the OS prompt is only
/// reached by somebody who has already said yes to it.
///
/// "Not now" therefore does **not** show the OS prompt. Spending the one grant
/// on a refusal would close the door for good; leaving it unspent means the
/// settings toggle still works later.
class NotificationsPrimer extends ConsumerStatefulWidget {
  const NotificationsPrimer({required this.onDone, super.key});

  /// Called once the member has answered, whichever way they answered.
  final VoidCallback onDone;

  @override
  ConsumerState<NotificationsPrimer> createState() =>
      _NotificationsPrimerState();
}

class _NotificationsPrimerState extends ConsumerState<NotificationsPrimer> {
  var _busy = false;

  Future<void> _answer({required bool enable}) async {
    if (_busy) return;
    setState(() => _busy = true);

    var granted = false;
    if (enable) {
      try {
        granted = await setPushAlerts(ref, enabled: true);
      } on Object {
        // A device that cannot mint a token still gets the whole notification
        // centre from Firestore. Treat it as a decline and move on rather than
        // holding somebody at a dialog they cannot get past.
        granted = false;
      }
    }
    await recordPushPrimerShown(granted: granted);
    if (!mounted) return;
    widget.onDone();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    body: SafeArea(
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 620),
          child: ListView(
            padding: const EdgeInsets.fromLTRB(24, 36, 24, 32),
            children: [
              const _PrimerMark(),
              const SizedBox(height: 28),
              Text(
                'Know when\nsomeone answers.',
                style: Theme.of(context).textTheme.headlineLarge,
              ),
              const SizedBox(height: 14),
              Text(
                'Indigen can tell you the moment something reaches you.',
                style: Theme.of(context).textTheme.bodyLarge
                    ?.copyWith(color: BrandColors.mutedInk),
              ),
              const SizedBox(height: 26),
              for (final item in const [
                (
                  Icons.mode_comment_outlined,
                  'Replies and mentions',
                  'When a member answers you, or names you in a post.',
                ),
                (
                  Icons.person_add_alt_1_outlined,
                  'Follows',
                  'When somebody starts following your work.',
                ),
                (
                  Icons.play_circle_outline_rounded,
                  'Newly published work',
                  'When a reel, song or story goes live in the collection.',
                ),
              ]) ...[
                _PrimerPoint(
                  icon: item.$1,
                  title: item.$2,
                  description: item.$3,
                ),
                const SizedBox(height: 10),
              ],
              const SizedBox(height: 18),
              FilledButton.icon(
                key: const Key('push-primer-allow'),
                onPressed: _busy ? null : () => _answer(enable: true),
                icon: const Icon(Icons.notifications_active_outlined),
                label: Text(_busy ? 'One moment…' : 'Turn on alerts'),
              ),
              const SizedBox(height: 8),
              TextButton(
                key: const Key('push-primer-decline'),
                onPressed: _busy ? null : () => _answer(enable: false),
                child: const Text('Not now'),
              ),
              const SizedBox(height: 10),
              const Text(
                'Everything still appears in the app either way. You can '
                'change this any time in Settings.',
                textAlign: TextAlign.center,
                style: TextStyle(color: BrandColors.mutedInk, height: 1.4),
              ),
            ],
          ),
        ),
      ),
    ),
  );
}

class _PrimerMark extends StatelessWidget {
  const _PrimerMark();

  @override
  Widget build(BuildContext context) => Align(
    alignment: Alignment.centerLeft,
    child: Container(
      width: 70,
      height: 70,
      decoration: BoxDecoration(
        color: BrandColors.kenteGold,
        borderRadius: BorderRadius.circular(70 * 0.28),
      ),
      child: const Icon(
        Icons.notifications_none_rounded,
        color: BrandColors.heritageGreen,
        size: 70 * 0.58,
      ),
    ),
  );
}

class _PrimerPoint extends StatelessWidget {
  const _PrimerPoint({
    required this.icon,
    required this.title,
    required this.description,
  });

  final IconData icon;
  final String title;
  final String description;

  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(16),
      child: Row(
        children: [
          Icon(icon, color: BrandColors.heritageGreen),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: 3),
                Text(
                  description,
                  style: const TextStyle(color: BrandColors.mutedInk),
                ),
              ],
            ),
          ),
        ],
      ),
    ),
  );
}
