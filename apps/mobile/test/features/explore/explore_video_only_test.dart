// Explore is a video surface, and for a long time only half of it knew that.
// The community half filtered for video from the day it was merged in; the
// published half mapped every record straight through, so a song, an audiobook
// chapter or a literature document arrived as a silent, imageless full-screen
// card. These tests hold the rule on the published half, at the provider, so it
// cannot quietly come back the next time the query changes.

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/features/community/data/community_models.dart';
import 'package:indigen_world_mobile/features/community/data/community_providers.dart';
import 'package:indigen_world_mobile/features/explore/explore_feed.dart';
import 'package:indigen_world_mobile/features/explore/published_content.dart';
import 'package:indigen_world_mobile/features/explore/reel_view.dart';

PublishedReel _published(String id, String? mediaType, {String creator = ''}) =>
    PublishedReel(
      id: id,
      title: id,
      creatorName: 'Kassena creator',
      creatorId: creator,
      mediaUrl: 'https://example.test/$id',
      mediaType: mediaType,
    );

/// One of each thing the archive publishes, plus a record from before the
/// publication workflow inferred a `mediaType` at all.
final _everything = [
  _published('song', 'audio', creator: 'afi'),
  _published('reel', 'video', creator: 'afi'),
  _published('poem', 'document', creator: 'afi'),
  _published('photo', 'image', creator: 'afi'),
  _published('legacy', null, creator: 'afi'),
];

/// A container with both halves of the feed stubbed.
///
/// The community half is stubbed as well as the published half, and not for
/// tidiness: `exploreFeedProvider` reads both, and a feed that happened to be
/// empty for the wrong reason would pass these tests without the rule holding.
ProviderContainer _container({List<String> following = const []}) {
  final container = ProviderContainer(
    overrides: [
      publishedReelsProvider.overrideWith((ref) => Stream.value(_everything)),
      followingIdsProvider.overrideWith((ref) => Stream.value(following)),
      communityFeedProvider.overrideWithValue(
        const AsyncValue.data(<CommunityPost>[]),
      ),
      followingFeedProvider.overrideWithValue(
        const AsyncValue.data(<CommunityPost>[]),
      ),
    ],
  );
  addTearDown(container.dispose);
  return container;
}

/// Subscribes, so the stubbed streams are actually listened to, and lets the
/// event loop turn until their values have propagated.
///
/// Two details, both learned the hard way. Reading a `StreamProvider.future`
/// instead of listening would hang: nothing in a bare container keeps the
/// provider alive between reads, so the stream is disposed mid-load and the
/// future never completes. And one turn is not enough for the Following feed —
/// `followingIdsProvider` has to deliver before the feed that reads it can
/// recompute, so the values arrive a turn apart.
Future<void> _settle(ProviderContainer container, Provider<List<Reel>> of) async {
  container.listen(of, (_, _) {});
  for (var turn = 0; turn < 4; turn++) {
    await Future<void>.delayed(Duration.zero);
  }
}

void main() {
  group('the published half of Explore', () {
    test('shows the video and nothing else', () async {
      final container = _container();
      await _settle(container, exploreFeedProvider);

      final ids = container.read(exploreFeedProvider).map((reel) => reel.id);
      expect(ids, contains('reel'));
      expect(ids, isNot(contains('song')));
      expect(ids, ['reel']);
    });

    test('holds the same rule in the Following feed', () async {
      final container = _container(following: const ['afi']);
      await _settle(container, exploreFollowingFeedProvider);

      expect(
        container.read(exploreFollowingFeedProvider).map((reel) => reel.id),
        ['reel'],
      );
    });

    test('the filter is the media type, not the presence of media', () {
      // Every record here carries a mediaUrl, so a feed that filtered on
      // "has media" would have let all five through.
      expect(publishedReels(_everything).map((reel) => reel.id), ['reel']);
      expect(_everything.where((reel) => reel.isAudio).map((reel) => reel.id), [
        'song',
      ]);
    });
  });
}
