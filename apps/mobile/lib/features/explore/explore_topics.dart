import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/features/explore/reel_view.dart';

/// The topic row across the top of Explore.
///
/// A short closed list on purpose. The row has to fit on one line of a small
/// phone beside a search button and an avatar, and a topic nobody can find
/// content for is worse than no topic at all — so these are the three things
/// the archive actually holds a lot of, and "everything" first.
enum ExploreTopic {
  forYou('For you'),
  music('Music'),
  stories('Stories'),
  traditions('Traditions');

  const ExploreTopic(this.label);

  final String label;

  /// Analytics-safe name.
  String get key => name;
}

/// Which topic the member picked. Survives the routes Explore pushes and the
/// For you / Following switch; goes back to For you when they leave Explore.
class ExploreTopicSelection extends Notifier<ExploreTopic> {
  @override
  ExploreTopic build() => ExploreTopic.forYou;

  void select(ExploreTopic topic) {
    if (state != topic) state = topic;
  }

  void reset() => select(ExploreTopic.forYou);
}

final exploreTopicProvider =
    NotifierProvider<ExploreTopicSelection, ExploreTopic>(
      ExploreTopicSelection.new,
    );

// ── What a reel is about ────────────────────────────────────────────────────
//
// Nothing in the archive is tagged with these topics directly. Published work
// carries a free-text category, a Collection channel and tags; community posts
// carry an optional post category and whatever the member wrote. So a topic is
// read off those, strongest evidence first, and a reel can belong to more than
// one — a funeral drumming clip is music *and* tradition.

final _musicWords = RegExp(
  r'\b(music|song|songs|sing|singing|singer|choir|drum|drums|drumming|dance|'
  r'dancing|dancer|performance|perform|instrument|xylophone|flute|gyil|'
  r'kologo|lyrics|melody|band)\b',
);

final _storyWords = RegExp(
  r'\b(story|stories|storytelling|storyteller|folktale|folktales|folklore|'
  r'tale|tales|legend|legends|myth|oral|narrat\w*|poem|poems|poetry|proverb|'
  r'proverbs|literature|audiobook|riddle|riddles|history)\b',
);

final _traditionWords = RegExp(
  r'\b(tradition|traditions|traditional|culture|cultural|heritage|ceremony|'
  r'ceremonies|ritual|rituals|festival|festivals|custom|customs|craft|crafts|'
  r'weaving|smock|pottery|funeral|wedding|naming|chief|chieftaincy|shrine|'
  r'harvest|cuisine|food|dress|attire|rite|rites|ancestral|elders?)\b',
);

/// Classified once per reel object. The feed providers re-run on every
/// Firestore tick, and three regular expressions over every caption each time
/// is work a phone should only do once.
final _topicsByReel = Expando<Set<ExploreTopic>>('reelTopics');

/// The topics [reel] belongs to. Never includes [ExploreTopic.forYou], which
/// is everything rather than a topic.
Set<ExploreTopic> reelTopics(Reel reel) =>
    _topicsByReel[reel] ??= Set.unmodifiable(_classify(reel));

Set<ExploreTopic> _classify(Reel reel) {
  final topics = <ExploreTopic>{};

  switch (reel.collectionKind.toLowerCase()) {
    case 'music':
      topics.add(ExploreTopic.music);
    case 'literature' || 'audiobooks':
      topics.add(ExploreTopic.stories);
  }
  switch (reel.postCategory) {
    case 'music':
      topics.add(ExploreTopic.music);
    case 'story':
      topics.add(ExploreTopic.stories);
    case 'culture':
      topics.add(ExploreTopic.traditions);
  }

  final declared = [
    reel.category,
    ...reel.tags,
  ].join(' ').toLowerCase().replaceAll(RegExp(r'[-_]'), ' ');
  final written = '${reel.title} ${reel.caption}'.toLowerCase();
  for (final text in [declared, written]) {
    if (text.trim().isEmpty) continue;
    if (_musicWords.hasMatch(text)) topics.add(ExploreTopic.music);
    if (_storyWords.hasMatch(text)) topics.add(ExploreTopic.stories);
    if (_traditionWords.hasMatch(text)) topics.add(ExploreTopic.traditions);
  }
  return topics;
}

/// [reels] narrowed to [topic]. For you is the whole list, untouched.
List<Reel> reelsForTopic(List<Reel> reels, ExploreTopic topic) {
  if (topic == ExploreTopic.forYou) return reels;
  return List.unmodifiable([
    for (final reel in reels)
      if (reelTopics(reel).contains(topic)) reel,
  ]);
}
