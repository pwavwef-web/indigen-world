import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/features/notifications/data/notification_preferences.dart';

/// The off switch for the fan-outs. Everything here turns on one rule —
/// absence means yes — because getting it backwards would have silently muted
/// every account that existed before the settings section shipped, and the only
/// symptom would have been an app that mysteriously went quiet.
void main() {
  group('NotificationPreferences.fromField', () {
    test('a profile with no preferences at all wants everything', () {
      for (final source in <Object?>[null, 'nonsense', 42, <Object?>[]]) {
        final preferences = NotificationPreferences.fromField(source);
        for (final preference in NotificationPreference.values) {
          expect(
            preferences.isOn(preference),
            isTrue,
            reason: '$preference was off for $source',
          );
        }
      }
    });

    test('an empty map is not the same as everything switched off', () {
      final preferences = NotificationPreferences.fromField(
        const <String, dynamic>{},
      );
      expect(preferences.mutedCount, 0);
    });

    test('only an explicit false switches something off', () {
      final preferences = NotificationPreferences.fromField(
        const <String, dynamic>{'followedPosts': false, 'likes': true},
      );
      expect(preferences.isOn(NotificationPreference.followedPosts), isFalse);
      expect(preferences.isOn(NotificationPreference.likes), isTrue);
      expect(preferences.isOn(NotificationPreference.mentions), isTrue);
      expect(preferences.mutedCount, 1);
    });

    test('one bad entry does not switch the other six back on', () {
      // A future build writing a string where a bool belongs must cost that
      // one preference its answer, not the whole map.
      final preferences = NotificationPreferences.fromField(
        const <String, dynamic>{
          'followedPosts': 'off',
          'threadReplies': false,
        },
      );
      expect(preferences.isOn(NotificationPreference.followedPosts), isTrue);
      expect(preferences.isOn(NotificationPreference.threadReplies), isFalse);
    });

    test('a key this build has never heard of is ignored', () {
      final preferences = NotificationPreferences.fromField(
        const <String, dynamic>{'somethingInventedLater': false},
      );
      expect(preferences.mutedCount, 0);
    });

    test('the everything-on constant behaves like an absent field', () {
      const all = NotificationPreferences.all();
      for (final preference in NotificationPreference.values) {
        expect(all.isOn(preference), isTrue);
      }
      expect(all.mutedCount, 0);
    });
  });

  group('the wire contract', () {
    test('the keys are exactly the ones the triggers read', () {
      // notificationPreferenceKeys in
      // services/functions/src/community-notifications.ts. A key that drifts on
      // either side is a switch that silently does nothing, and no test on the
      // other side of the wire would notice.
      expect(
        NotificationPreference.values.map((it) => it.key).toList()..sort(),
        [
          'followedPosts',
          'follows',
          'leaderboard',
          'likes',
          'mentions',
          'milestones',
          'reelComments',
          'streakReminders',
          'threadReplies',
        ],
      );
    });

    test('the loudest fan-outs are offered first', () {
      // Somebody who came to this screen because their phone would not stop
      // should find the reason in the first two rows.
      expect(NotificationPreference.values.first,
          NotificationPreference.followedPosts);
      expect(NotificationPreference.values[1],
          NotificationPreference.threadReplies);
    });

    test('every switch says what it turns off, in words', () {
      for (final preference in NotificationPreference.values) {
        expect(preference.title, isNotEmpty);
        expect(preference.description, isNotEmpty);
        // A switch whose label is the same as another's is a switch nobody can
        // choose between.
        expect(
          NotificationPreference.values
              .where((it) => it.title == preference.title)
              .length,
          1,
        );
      }
    });
  });
}
