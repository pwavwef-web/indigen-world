/// What kind of post somebody says they are making.
///
/// Optional, and deliberately a short closed list rather than free tags: the
/// point is a thin coloured rail a reader can learn in a week, and a rail with
/// forty colours teaches nothing. The wire values are what the Security Rules
/// accept, so adding one here without adding it there is a post that fails to
/// publish.
enum PostCategory {
  question('question'),
  language('language'),
  culture('culture'),
  music('music'),
  story('story'),

  /// Reserved for staff on the main feed and for a community's moderators
  /// inside it. A label that says "this is official" has to be one somebody
  /// could not simply choose.
  announcement('announcement');

  const PostCategory(this.wire);

  /// The stored value.
  final String wire;

  /// The category [raw] names, or null for anything unrecognised — including
  /// every post written before categories existed.
  static PostCategory? fromWire(Object? raw) {
    for (final category in values) {
      if (category.wire == raw) return category;
    }
    return null;
  }

  /// The categories a member may pick, given whether they are allowed to
  /// announce.
  static List<PostCategory> choosable({required bool canAnnounce}) => [
    for (final category in values)
      if (category != announcement || canAnnounce) category,
  ];
}
