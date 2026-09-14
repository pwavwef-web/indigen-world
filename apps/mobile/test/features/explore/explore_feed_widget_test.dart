// Explore on screen: playback, the chrome, the rail, the Context sheet and the
// topic row, driven the way a member drives them.
//
// The video player is replaced through `reelVideoControllerFactoryProvider`
// with one that needs no platform plugin and records what it was told, so
// "only one clip plays" is asserted against real controllers rather than
// inferred from the code. Posters are left empty so nothing touches the
// network.

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/app/app_theme.dart';
import 'package:indigen_world_mobile/app/shell_chrome.dart';
import 'package:indigen_world_mobile/features/community/data/community_models.dart';
import 'package:indigen_world_mobile/features/community/data/community_providers.dart';
import 'package:indigen_world_mobile/features/community/data/community_repository.dart';
import 'package:indigen_world_mobile/features/community/data/community_space_models.dart';
import 'package:indigen_world_mobile/features/community/data/community_space_providers.dart';
import 'package:indigen_world_mobile/features/explore/explore_feed.dart';
import 'package:indigen_world_mobile/features/explore/explore_screen.dart';
import 'package:indigen_world_mobile/features/explore/published_content.dart';
import 'package:indigen_world_mobile/features/explore/reel_context_sheet.dart';
import 'package:indigen_world_mobile/features/explore/reel_details.dart';
import 'package:indigen_world_mobile/features/explore/reel_view.dart';
import 'package:indigen_world_mobile/l10n/app_localizations.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:video_player/video_player.dart';

import '../community/community_test_harness.dart';

/// A player that plays nothing and remembers everything.
class _FakeVideo extends VideoPlayerController {
  _FakeVideo(String url, {this.fail = false})
    : super.networkUrl(Uri.parse(url));

  final bool fail;
  var disposed = false;

  @override
  Future<void> initialize() async {
    if (fail) throw Exception('No decoder for this clip');
    value = value.copyWith(
      isInitialized: true,
      duration: const Duration(seconds: 20),
      size: const Size(1080, 1920),
    );
  }

  @override
  Future<void> play() async => value = value.copyWith(isPlaying: true);

  @override
  Future<void> pause() async => value = value.copyWith(isPlaying: false);

  @override
  Future<void> setLooping(bool looping) async =>
      value = value.copyWith(isLooping: looping);

  @override
  Future<void> setVolume(double volume) async =>
      value = value.copyWith(volume: volume);

  @override
  Future<void> seekTo(Duration position) async =>
      value = value.copyWith(position: position);

  @override
  Future<void> dispose() async {
    disposed = true;
    await super.dispose();
  }
}

PublishedReel _published(
  String id, {
  required String creatorId,
  required String creatorName,
  String description = 'A clip from the archive',
  String englishSummary = '',
  int daysAgo = 1,
  String category = 'storytelling',
}) => PublishedReel(
  id: id,
  title: 'Title $id',
  creatorName: creatorName,
  creatorId: creatorId,
  mediaUrl: 'https://example.test/$id.mp4',
  mediaType: 'video',
  description: description,
  englishSummary: englishSummary,
  category: category,
  language: 'xsm',
  publicationRoute: 'reviewed',
  publishedAt: DateTime.utc(
    2026,
    9,
    12,
  ).subtract(Duration(days: daysAgo)).toIso8601String(),
);

final _viewer = fakeProfile(
  uid: 'viewer-uid',
  username: 'viewer',
  displayName: 'Viewer',
);

final _threeReels = [
  _published('one', creatorId: 'afi', creatorName: 'Afi Mensah', daysAgo: 1),
  _published('two', creatorId: 'kofi', creatorName: 'Kofi Ayamga', daysAgo: 2),
  _published('three', creatorId: 'abla', creatorName: 'Abla Nsoh', daysAgo: 3),
];

class _Harness {
  final created = <_FakeVideo>[];
  late ProviderContainer container;

  _FakeVideo videoFor(String reelId) =>
      created.lastWhere((video) => video.dataSource.endsWith('/$reelId.mp4'));

  List<String> get order =>
      container.read(exploreLoopedFeedProvider).map((reel) => reel.id).toList();
}

Future<_Harness> _pump(
  WidgetTester tester, {
  List<PublishedReel>? published,
  List<CommunityPost> posts = const [],
  FakeCommunityRepository? repository,
  FakeCommunitySpaceRepository? spaces,
  bool failVideos = false,
}) async {
  SharedPreferences.setMockInitialValues({});
  tester.view.physicalSize = const Size(1080, 2340);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);

  final harness = _Harness();
  final repo = repository ?? FakeCommunityRepository(profiles: [_viewer]);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        communityRepositoryProvider.overrideWithValue(repo),
        currentUidProvider.overrideWithValue('viewer-uid'),
        myCommunityProfileProvider.overrideWith(
          (ref) => Stream<CommunityProfile?>.value(_viewer),
        ),
        communitySpaceRepositoryProvider.overrideWithValue(
          spaces ?? FakeCommunitySpaceRepository(),
        ),
        publishedReelsProvider.overrideWith(
          (ref) => Stream.value(published ?? _threeReels),
        ),
        communityFeedProvider.overrideWithValue(AsyncValue.data(posts)),
        followingFeedProvider.overrideWithValue(
          const AsyncValue.data(<CommunityPost>[]),
        ),
        reelVideoControllerFactoryProvider.overrideWithValue((url) {
          final video = _FakeVideo(url, fail: failVideos);
          harness.created.add(video);
          return video;
        }),
      ],
      child: MaterialApp(
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        theme: buildIndigenTheme(),
        home: const ExploreScreen(onExit: null),
      ),
    ),
  );
  harness.container = ProviderScope.containerOf(
    tester.element(find.byType(ExploreScreen)),
  );
  await _settle(tester);
  return harness;
}

Future<void> _settle(WidgetTester tester) async {
  for (var frame = 0; frame < 6; frame++) {
    await tester.pump(const Duration(milliseconds: 50));
  }
}

/// Lets every toast and deferred reveal run out, so no timer outlives a test.
Future<void> _drain(WidgetTester tester) async {
  await tester.pump(const Duration(seconds: 4));
  await tester.pump(const Duration(seconds: 4));
}

void main() {
  group('playback', () {
    testWidgets('only the reel in front plays; the next waits, paused', (
      tester,
    ) async {
      final harness = await _pump(tester);
      final order = harness.order;
      expect(order, hasLength(3));

      final first = harness.videoFor(order[0]);
      final second = harness.videoFor(order[1]);
      expect(first.value.isPlaying, isTrue);
      expect(second.value.isInitialized, isTrue);
      expect(second.value.isPlaying, isFalse);
      // Nothing is opened two reels away.
      expect(
        harness.created.where(
          (video) => video.dataSource.endsWith('/${order[2]}.mp4'),
        ),
        isEmpty,
      );

      await tester.fling(find.byType(PageView), const Offset(0, -600), 2000);
      await _settle(tester);
      await tester.pump(const Duration(milliseconds: 600));

      final playing = harness.created
          .where((video) => !video.disposed && video.value.isPlaying)
          .toList();
      expect(playing, hasLength(1));
      expect(playing.single.dataSource, endsWith('/${order[1]}.mp4'));
      // The reel swiped away let its decoder go…
      expect(first.disposed, isTrue);
      // …and the one after the new reel is waiting.
      final third = harness.videoFor(order[2]);
      expect(third.value.isPlaying, isFalse);
      expect(third.disposed, isFalse);
      await _drain(tester);
    });

    testWidgets('a tap pauses and a second tap resumes', (tester) async {
      final harness = await _pump(tester);
      final first = harness.videoFor(harness.order[0]);

      await tester.tapAt(const Offset(160, 360));
      await tester.pump();
      expect(first.value.isPlaying, isFalse);
      expect(
        find.byIcon(Icons.play_arrow_rounded).hitTestable(),
        findsOneWidget,
      );

      await tester.tapAt(const Offset(160, 360));
      await tester.pump();
      expect(first.value.isPlaying, isTrue);
      await _drain(tester);
    });

    testWidgets('a clip that cannot open says so and offers a retry', (
      tester,
    ) async {
      await _pump(tester, failVideos: true);
      expect(
        find.text('This video cannot be played right now.'),
        findsOneWidget,
      );
      expect(find.text('Try again'), findsOneWidget);
      await _drain(tester);
    });

    testWidgets('muting one reel mutes the next', (tester) async {
      final harness = await _pump(tester);
      await tester.tap(find.bySemanticsLabel('Sound on. Mute').first);
      await tester.pump();
      expect(harness.videoFor(harness.order[0]).value.volume, 0);

      await tester.fling(find.byType(PageView), const Offset(0, -600), 2000);
      await _settle(tester);
      expect(harness.videoFor(harness.order[1]).value.volume, 0);
      await _drain(tester);
    });
  });

  group('the chrome', () {
    testWidgets('leaves during playback and returns on a tap', (tester) async {
      final harness = await _pump(tester);
      expect(harness.container.read(shellChromeVisibilityProvider), isTrue);

      await tester.pump(const Duration(seconds: 4));
      await tester.pump(const Duration(milliseconds: 300));
      expect(harness.container.read(shellChromeVisibilityProvider), isFalse);

      // A tap on a playing reel pauses it, and a pause brings everything back.
      await tester.tapAt(const Offset(160, 360));
      await tester.pump(const Duration(milliseconds: 300));
      expect(harness.container.read(shellChromeVisibilityProvider), isTrue);
      await _drain(tester);
    });

    testWidgets('stays while the Context sheet is open', (tester) async {
      final harness = await _pump(tester);
      await tester.tap(find.text('Context').hitTestable());
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
      expect(find.byType(ReelContextBody), findsOneWidget);

      await tester.pump(const Duration(seconds: 8));
      expect(harness.container.read(shellChromeVisibilityProvider), isTrue);

      Navigator.of(tester.element(find.byType(ReelContextBody))).pop();
      await tester.pump(const Duration(milliseconds: 400));
      await _drain(tester);
    });
  });

  group('Context', () {
    testWidgets('opens over the reel, pauses when expanded, keeps the place', (
      tester,
    ) async {
      final harness = await _pump(tester);
      final order = harness.order;
      final first = harness.videoFor(order[0]);

      await tester.tap(find.text('Context').hitTestable());
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
      // Medium height: the reel above it still plays.
      expect(first.value.isPlaying, isTrue);
      // The reel has no creator context yet, and the sheet says so rather
      // than leaving an empty page.
      expect(find.text('No context has been added yet'), findsOneWidget);

      // Dragged up over most of the frame, the reel pauses.
      await tester.dragFrom(
        tester.getTopLeft(find.byType(ReelContextBody)) + const Offset(180, 14),
        const Offset(0, -500),
      );
      await tester.pump(const Duration(milliseconds: 500));
      expect(first.value.isPlaying, isFalse);

      // Expanded, the sources are labelled: a machine's explanation apart from
      // the review desk's approval.
      await tester.scrollUntilVisible(
        find.text('Approved on the Indigen World review desk'),
        200,
        scrollable: find
            .descendant(
              of: find.byType(ReelContextBody),
              matching: find.byType(Scrollable),
            )
            .first,
      );
      expect(find.text('AI-generated · not verified'), findsOneWidget);
      expect(find.text('Ask Kawuri to explain'), findsOneWidget);

      Navigator.of(tester.element(find.byType(ReelContextBody))).pop();
      await tester.pump(const Duration(milliseconds: 500));

      // Same reel, same player, playing again.
      expect(first.disposed, isFalse);
      expect(first.value.isPlaying, isTrue);
      expect(harness.order.first, order.first);
      await _drain(tester);
    });

    testWidgets('the translation panel names its source', (tester) async {
      await _pump(
        tester,
        published: [
          _published(
            'song',
            creatorId: 'afi',
            creatorName: 'Afi Mensah',
            englishSummary: 'A song sung at the end of the millet harvest.',
          ),
        ],
      );
      await tester.tap(find.text('See translation').hitTestable());
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
      expect(find.text('In English'.toUpperCase()), findsOneWidget);
      expect(
        find.text('A song sung at the end of the millet harvest.'),
        findsOneWidget,
      );
      expect(
        find.text('Reviewed by the Indigen World review desk'),
        findsOneWidget,
      );
      Navigator.of(tester.element(find.byType(ReelTranslationBody))).pop();
      await tester.pump(const Duration(milliseconds: 400));
      await _drain(tester);
    });
  });

  group('following from the rail', () {
    testWidgets('the plus turns to a check while the follow is written', (
      tester,
    ) async {
      final repository = _GatedFollowRepository(profiles: [_viewer]);
      final harness = await _pump(tester, repository: repository);
      final name = harness.container
          .read(exploreLoopedFeedProvider)
          .first
          .creator;

      await tester.tap(find.bySemanticsLabel('Follow $name').hitTestable());
      await tester.pump();
      expect(find.bySemanticsLabel('Following $name'), findsOneWidget);

      repository.gate.complete();
      await tester.pump(const Duration(milliseconds: 100));
      expect(repository.toggledFollows, hasLength(1));
      await _drain(tester);
    });

    testWidgets('a refused follow puts the plus back and says why', (
      tester,
    ) async {
      final repository = _RefusingFollowRepository(profiles: [_viewer]);
      final harness = await _pump(tester, repository: repository);
      final name = harness.container
          .read(exploreLoopedFeedProvider)
          .first
          .creator;

      await tester.tap(find.bySemanticsLabel('Follow $name').hitTestable());
      await tester.pump(const Duration(milliseconds: 100));
      expect(
        find.bySemanticsLabel('Follow $name').hitTestable(),
        findsOneWidget,
      );
      expect(find.textContaining('Could not follow'), findsOneWidget);
      await _drain(tester);
    });
  });

  group('topics', () {
    testWidgets('a topic with nothing in it offers everything back', (
      tester,
    ) async {
      await _pump(tester);
      await tester.tap(find.byKey(const ValueKey('explore-topic-music')));
      await _settle(tester);
      expect(find.text('No music here yet'), findsOneWidget);

      await tester.tap(find.text('Show everything'));
      await _settle(tester);
      expect(find.byType(PageView), findsOneWidget);
      await _drain(tester);
    });

    testWidgets('a topic narrows the feed without leaving Explore', (
      tester,
    ) async {
      final harness = await _pump(
        tester,
        published: [
          ..._threeReels,
          _published(
            'drums',
            creatorId: 'kwame',
            creatorName: 'Kwame Akolgo',
            category: 'music',
          ),
        ],
      );
      await tester.tap(find.byKey(const ValueKey('explore-topic-music')));
      await _settle(tester);
      expect(harness.order, ['drums']);
      expect(find.byType(ExploreScreen), findsOneWidget);
      await _drain(tester);
    });
  });

  group('community attribution', () {
    const culture = CommunitySpace(
      id: 'kasena-culture',
      name: 'Kasena Culture',
      ownerId: 'owner',
    );
    const privateCircle = CommunitySpace(
      id: 'paga-elders',
      name: 'Paga Elders',
      ownerId: 'owner',
      visibility: CommunityVisibility.private,
    );

    Future<void> pumpRow(
      WidgetTester tester, {
      required FakeCommunitySpaceRepository spaces,
      required CommunitySpace space,
    }) async {
      SharedPreferences.setMockInitialValues({});
      await tester.pumpWidget(
        communityHarness(
          repository: FakeCommunityRepository(profiles: [_viewer]),
          profile: _viewer,
          uid: 'viewer-uid',
          spaces: spaces,
          child: Scaffold(
            backgroundColor: Colors.black,
            body: Center(
              child: ReelCommunityRow(
                stamp: PostCommunityStamp(
                  id: space.id,
                  name: space.name,
                  isPrivate: space.isPrivate,
                ),
                onOpen: () {},
              ),
            ),
          ),
        ),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));
    }

    testWidgets('joining a public community says Joined', (tester) async {
      final spaces = FakeCommunitySpaceRepository(communities: [culture]);
      await pumpRow(tester, spaces: spaces, space: culture);
      expect(find.text('Kasena Culture'), findsOneWidget);
      await tester.tap(find.text('Join'));
      await tester.pump(const Duration(milliseconds: 100));
      expect(find.text('Joined'), findsOneWidget);
      expect(spaces.joined, ['kasena-culture']);
      await _drain(tester);
    });

    testWidgets('joining a private community says Requested', (tester) async {
      final spaces = FakeCommunitySpaceRepository(communities: [privateCircle]);
      await pumpRow(tester, spaces: spaces, space: privateCircle);
      await tester.tap(find.text('Join'));
      await tester.pump(const Duration(milliseconds: 100));
      expect(find.text('Requested'), findsOneWidget);
      await _drain(tester);
    });

    testWidgets('a refused join goes back to Join and says why', (
      tester,
    ) async {
      final spaces = _RefusingJoinSpaces(communities: [culture]);
      await pumpRow(tester, spaces: spaces, space: culture);
      await tester.tap(find.text('Join'));
      await tester.pump(const Duration(milliseconds: 100));
      expect(find.text('Join'), findsOneWidget);
      expect(find.text('Joined'), findsNothing);
      expect(
        find.text('This community is not accepting members.'),
        findsOneWidget,
      );
      await _drain(tester);
    });

    testWidgets('an existing member sees Joined without doing anything', (
      tester,
    ) async {
      final spaces = FakeCommunitySpaceRepository(
        communities: [culture],
        memberships: const [
          CommunityMembership(
            communityId: 'kasena-culture',
            uid: 'viewer-uid',
            role: CommunityRole.member,
            status: MembershipStatus.active,
          ),
        ],
      );
      await pumpRow(tester, spaces: spaces, space: culture);
      expect(find.text('Joined'), findsOneWidget);
      expect(find.text('Join'), findsNothing);
    });
  });

  group('the caption', () {
    testWidgets('is two lines until asked, and folds when the reel moves on', (
      tester,
    ) async {
      final reel = Reel.fromPublished(
        _published(
          'long',
          creatorId: 'afi',
          creatorName: 'Afi Mensah',
          description: List.filled(
            12,
            'Stories preserve culture and make Kasem live.',
          ).join(' '),
        ),
      );
      Widget details({required bool active}) => communityHarness(
        repository: FakeCommunityRepository(),
        child: Scaffold(
          backgroundColor: Colors.black,
          body: SizedBox(
            width: 300,
            child: ReelDetails(
              reel: reel,
              displayName: 'Afi Mensah',
              handle: 'afi',
              isActive: active,
              viewCount: 1200,
              soundMuted: false,
              onOpenCreator: () {},
              onOpenCommunity: () {},
              onToggleSound: () {},
            ),
          ),
        ),
      );
      await tester.pumpWidget(details(active: true));
      await tester.pump();
      expect(find.text('Afi Mensah  @afi', findRichText: true), findsOneWidget);
      expect(find.text('1.2K views'), findsOneWidget);
      expect(find.text('more'), findsOneWidget);

      await tester.tap(find.text('more'));
      await tester.pump();
      expect(find.text('less'), findsOneWidget);

      await tester.pumpWidget(details(active: false));
      await tester.pump();
      expect(find.text('more'), findsOneWidget);
    });
  });
}

class _GatedFollowRepository extends FakeCommunityRepository {
  _GatedFollowRepository({super.profiles});

  final gate = Completer<void>();

  @override
  Future<void> toggleFollow({
    required String followerId,
    required String targetId,
    required bool following,
  }) async {
    await gate.future;
    return super.toggleFollow(
      followerId: followerId,
      targetId: targetId,
      following: following,
    );
  }
}

class _RefusingFollowRepository extends FakeCommunityRepository {
  _RefusingFollowRepository({super.profiles});

  @override
  Future<void> toggleFollow({
    required String followerId,
    required String targetId,
    required bool following,
  }) async => throw StateError('permission-denied');
}

class _RefusingJoinSpaces extends FakeCommunitySpaceRepository {
  _RefusingJoinSpaces({super.communities});

  @override
  Future<MembershipStatus> join({
    required CommunitySpace space,
    required String uid,
  }) async =>
      throw const CommunityFailure('This community is not accepting members.');
}
