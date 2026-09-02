import 'package:flutter/material.dart';

/// What a member has agreed to be woken about.
///
/// The backend fans one action out to many people in three places — a reply
/// reaches everybody in a thread, a post reaches its author's followers, a
/// publication reaches a creator's followers — and a fan-out with no off switch
/// is a spam machine. These are that switch.
///
/// The wire values are the keys of `communityProfiles/{uid}.notificationPrefs`
/// and must match `notificationPreferenceKeys` in
/// services/functions/src/community-notifications.ts exactly. They are spelled
/// out rather than derived from `name` so that a rename on either side is a
/// compile error to reconcile here rather than a switch that silently stops
/// being read.
///
/// Ordered loudest first. Somebody who came to this screen because their phone
/// would not stop should find the reason in the first two rows.
enum NotificationPreference {
  followedPosts(
    'followedPosts',
    'Posts from people you follow',
    'New posts, and work published to Explore, by the people you follow',
    Icons.dynamic_feed_rounded,
  ),
  threadReplies(
    'threadReplies',
    'Replies in threads you are in',
    'When a conversation you started, joined or saved carries on without you',
    Icons.forum_rounded,
  ),
  reelComments(
    'reelComments',
    'Replies on Explore',
    'Comments on your published work, and replies to comments you left',
    Icons.smart_display_rounded,
  ),
  mentions(
    'mentions',
    'Mentions',
    'When somebody writes your handle into a post',
    Icons.alternate_email_rounded,
  ),
  likes(
    'likes',
    'Likes on your posts',
    'One alert the first time each member likes a post of yours',
    Icons.favorite_rounded,
  ),
  follows(
    'follows',
    'New followers',
    'When somebody starts following you',
    Icons.person_add_alt_1_rounded,
  ),
  milestones(
    'milestones',
    'Milestones',
    'When one of your posts reaches 10, 50, 100 or 500 likes',
    Icons.local_fire_department_rounded,
  ),
  leaderboard(
    'leaderboard',
    'Contributor board',
    'When somebody passes you on the contributors board',
    Icons.leaderboard_rounded,
  ),
  streakReminders(
    'streakReminders',
    'Streak reminders',
    'A nudge on a day your contributing streak is about to lapse',
    Icons.whatshot_rounded,
  );

  const NotificationPreference(this.key, this.title, this.description, this.icon);

  /// The field name inside `notificationPrefs`.
  final String key;

  final String title;
  final String description;
  final IconData icon;
}

/// One member's answers, with absence meaning yes.
///
/// Absence is yes at every level — no map, no entry, a value that is not a
/// bool — and the backend reads it the same way, for the same reason
/// `messagePreviews` does in push.ts: it is the only reading under which a
/// profile written before this screen existed keeps behaving exactly as it did
/// yesterday. Only an explicit `false`, which nothing but this screen writes,
/// turns an alert off.
@immutable
class NotificationPreferences {
  const NotificationPreferences(this._values);

  /// Everything on — what a member who has never touched the screen has.
  const NotificationPreferences.all() : _values = const <String, bool>{};

  final Map<String, bool> _values;

  bool isOn(NotificationPreference preference) =>
      _values[preference.key] ?? true;

  /// Reads the `notificationPrefs` field off a profile document.
  ///
  /// Anything that is not a map of booleans is discarded value by value rather
  /// than wholesale, so one bad entry written by a future build cannot switch
  /// the other six back on.
  static NotificationPreferences fromField(Object? raw) {
    if (raw is! Map) return const NotificationPreferences.all();
    final values = <String, bool>{};
    for (final preference in NotificationPreference.values) {
      final value = raw[preference.key];
      if (value is bool) values[preference.key] = value;
    }
    return NotificationPreferences(values);
  }

  /// How many of the seven are switched off, for the summary line.
  int get mutedCount => NotificationPreference.values
      .where((preference) => !isOn(preference))
      .length;
}
