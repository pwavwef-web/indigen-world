import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/features/notifications/push_messaging.dart';
import 'package:indigen_world_mobile/shared/glass_popup.dart';

/// The one second ask, offered in context rather than at start-up.
///
/// Somebody who declined the first-run primer was answering a question about an
/// app they had not used yet. Sending a first message is the moment the answer
/// might genuinely be different — there is now somebody who might reply, and
/// nothing to tell them when it happens.
///
/// It is asked exactly once. [shouldOfferPushNudge] holds every condition; this
/// only draws it, and spends the one attempt whichever way it is answered. Call
/// it only where a "no" costs the member nothing.
Future<void> maybeOfferPushNudge(BuildContext context, WidgetRef ref) async {
  if (!await shouldOfferPushNudge()) return;
  if (!context.mounted) return;

  final accepted = await showGlassConfirm(
    context: context,
    title: 'Know when they reply?',
    message:
        'Alerts reach your lock screen when a member answers you, mentions '
        'you, or follows your work. Everything still appears in the app '
        'either way.',
    confirmLabel: 'Turn on alerts',
    cancelLabel: 'Not now',
  );

  // Spent whatever the answer was, and before the permission call, so a member
  // who dismisses the sheet by tapping away is not asked again either.
  await recordPushNudgeShown();
  if (accepted != true) return;

  try {
    await setPushAlerts(ref, enabled: true);
  } on Object {
    // A device that cannot mint a token still has the whole notification
    // centre. Nothing to report and nothing to retry.
  }
}
