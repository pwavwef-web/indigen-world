import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/community/data/community_models.dart';
import 'package:indigen_world_mobile/features/community/data/event_reminders.dart';
import 'package:indigen_world_mobile/features/community/data/post_event.dart';
import 'package:indigen_world_mobile/shared/glass_popup.dart';

/// When and where an Event post happens, with the reader's own reminder.
///
/// A hairline box like the poll and the quote, so it reads as part of the post
/// rather than as a card inside it. The date tile is the one bold thing on it:
/// it is what somebody scrolling past needs to take away.
class PostEventTile extends ConsumerWidget {
  const PostEventTile({required this.post, this.now, super.key});

  final CommunityPost post;

  /// The clock, for tests. The real one otherwise.
  final DateTime? now;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final event = post.event;
    if (event == null) return const SizedBox.shrink();
    final brand = context.brand;
    final clock = now ?? DateTime.now();
    final tile = eventDateTile(event.startsAt);
    final countdown = eventCountdownLabel(event.startsAt, now: clock);
    final over = countdown == 'Ended';
    final reminder = eventReminderFor(post, now: clock);
    final reminded = ref.watch(
      eventRemindersProvider.select((state) => state.containsKey(post.id)),
    );

    return Semantics(
      container: true,
      label:
          'Event, ${eventWhenLabel(event.startsAt)}'
          '${event.place.isEmpty ? '' : ', at ${event.place}'}. $countdown.',
      child: Container(
        padding: const EdgeInsets.fromLTRB(10, 10, 6, 10),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: brand.divider),
        ),
        child: Row(
          children: [
            ExcludeSemantics(
              child: Container(
                width: 50,
                padding: const EdgeInsets.symmetric(vertical: 6),
                decoration: BoxDecoration(
                  color: over ? brand.divider : brand.accentSoft,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Column(
                  children: [
                    Text(
                      tile.month,
                      style: TextStyle(
                        color: over ? brand.mutedInk : brand.accent,
                        fontSize: 10.5,
                        fontWeight: FontWeight.w900,
                        letterSpacing: 0.8,
                      ),
                    ),
                    Text(
                      tile.day,
                      style: TextStyle(
                        color: over ? brand.mutedInk : brand.ink,
                        fontSize: 20,
                        height: 1.1,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: ExcludeSemantics(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      countdown.toUpperCase(),
                      style: TextStyle(
                        color: over ? brand.mutedInk : brand.accent,
                        fontSize: 11,
                        fontWeight: FontWeight.w900,
                        letterSpacing: 0.6,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      eventWhenLabel(event.startsAt),
                      style: TextStyle(
                        color: brand.ink,
                        fontSize: 13.5,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    if (event.place.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Row(
                        children: [
                          Icon(
                            Icons.place_outlined,
                            size: 13,
                            color: brand.mutedInk,
                          ),
                          const SizedBox(width: 3),
                          Flexible(
                            child: Text(
                              event.place,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                color: brand.mutedInk,
                                fontSize: 12.5,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ],
                ),
              ),
            ),
            if (reminder != null || reminded)
              IconButton(
                key: Key('event-remind-${post.id}'),
                tooltip: reminded ? 'Cancel reminder' : 'Remind me',
                isSelected: reminded,
                onPressed: () async {
                  HapticFeedback.selectionClick();
                  final controller = ref.read(eventRemindersProvider.notifier);
                  if (reminded) {
                    await controller.clear(post.id);
                    if (context.mounted) {
                      showGlassToast(context, 'Reminder removed.');
                    }
                    return;
                  }
                  final done = await controller.set(reminder!);
                  if (!context.mounted) return;
                  showGlassToast(
                    context,
                    done
                        ? 'We’ll remind you an hour before.'
                        : 'This phone could not set the reminder.',
                    icon: done ? Icons.notifications_active_outlined : null,
                  );
                },
                icon: Icon(
                  Icons.notifications_none_rounded,
                  color: brand.mutedInk,
                ),
                selectedIcon: Icon(
                  Icons.notifications_active_rounded,
                  color: brand.accent,
                ),
              ),
          ],
        ),
      ),
    );
  }
}
