import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/features/community/widgets/video_cover.dart';
import 'package:indigen_world_mobile/features/explore/published_content.dart';
import 'package:indigen_world_mobile/features/explore/reel_engagement.dart';
import 'package:indigen_world_mobile/features/explore/reel_view.dart';
import 'package:indigen_world_mobile/l10n/app_localizations.dart';
import 'package:visibility_detector/visibility_detector.dart';

void main() {
  group('reel edges', () {
    test('are keyed by their owner and the reel they belong to', () {
      // The Firestore rule recomputes exactly this to decide whether an edge
      // is the writer's to make, so the shape is a contract.
      expect(
        ReelEngagementRepository.edgeId('amina-uid', 'pub_reel-1'),
        'amina-uid_pub_reel-1',
      );
    });
  });

  group('count labels', () {
    test('read as plain numbers below a thousand', () {
      expect(reelCountLabel(0), '0');
      expect(reelCountLabel(7), '7');
      expect(reelCountLabel(999), '999');
    });

    test('shorten once a number stops being worth reading in full', () {
      expect(reelCountLabel(1000), '1K');
      expect(reelCountLabel(1240), '1.2K');
      expect(reelCountLabel(2000000), '2M');
    });

    test('never show a negative total', () {
      // Counts come from aggregate queries that can only ever be zero or more,
      // but a rail that could print "-1" would be a rail nobody trusts.
      expect(reelCountLabel(-4), '0');
    });
  });

  group('published records', () {
    test('carry the creator account behind the work', () {
      // Without this the avatar on the rail has nowhere to go, which is what
      // made Explore a dead end.
      const reel = PublishedReel(
        id: 'pub_1',
        title: 'Every rhythm remembers',
        creatorName: 'Afi',
        creatorId: 'afi-uid',
      );

      expect(Reel.fromPublished(reel).creatorId, 'afi-uid');
    });

    test('the curated preview has no creator page to open', () {
      const preview = Reel(
        id: 'preview-1',
        imageUrl: '',
        label: 'PREVIEW',
        title: 'Illustrative only',
        creator: '@somebody',
        initials: 'SB',
        caption: '',
        sound: '',
        credit: '',
      );

      expect(preview.creatorId, isEmpty);
      expect(preview.isLive, isFalse);
    });
  });

  group('reel replies', () {
    test('initials fall back to a single character for one-word names', () {
      const single = ReelComment(
        id: 'c1',
        reelId: 'pub_1',
        authorId: 'a',
        authorName: 'Amina',
        authorUsername: 'amina_paga',
        text: 'Ko gara.',
      );
      const double = ReelComment(
        id: 'c2',
        reelId: 'pub_1',
        authorId: 'b',
        authorName: 'Nyaaba Atanga',
        authorUsername: 'nyaaba',
        text: 'De N lei.',
      );

      expect(single.initials, 'AM');
      expect(single.handle, '@amina_paga');
      expect(double.initials, 'NA');
    });
  });

  group('video covers', () {
    setUp(() {
      // The cover only opens a decoder once its tile is actually on screen,
      // and VisibilityDetector coalesces those callbacks behind a timer. Under
      // test that timer outlives the widget tree unless it fires immediately.
      VisibilityDetectorController.instance.updateInterval = Duration.zero;
    });

    tearDown(() {
      VisibilityDetectorController.instance.updateInterval = const Duration(
        milliseconds: 500,
      );
    });

    testWidgets('a server-made poster is preferred over opening the clip', (
      tester,
    ) async {
      await tester.pumpWidget(
        const MaterialApp(
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,

          home: SizedBox(
            width: 200,
            height: 200,
            child: VideoCover(
              videoUrl: 'https://example.test/clip.mp4',
              thumbnailUrl: 'https://example.test/cover.jpg',
            ),
          ),
        ),
      );
      await tester.pump();

      // One image request instead of a decoder: the cover never reaches for a
      // video when a still already exists.
      expect(find.byType(VideoCoverPlaceholder), findsOneWidget);
    });

    testWidgets('a clip with no poster shows brand chrome, never a flat fill', (
      tester,
    ) async {
      await tester.pumpWidget(
        const MaterialApp(
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,

          home: SizedBox(
            width: 200,
            height: 200,
            child: VideoCover(videoUrl: 'https://example.test/clip.mp4'),
          ),
        ),
      );
      await tester.pump();

      // The green rectangle this replaced read as a broken card rather than
      // as a video waiting to be tapped.
      expect(find.byType(VideoCoverPlaceholder), findsOneWidget);
      expect(find.byIcon(Icons.movie_creation_outlined), findsOneWidget);
    });
  });
}
