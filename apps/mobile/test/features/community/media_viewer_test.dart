// The immersive viewer a post attachment opens into.
//
// It used to be a black page with an app bar on it: no way out but the back
// arrow, no idea which of four pictures you were looking at, and nothing you
// could do to the post you had opened it from without closing it again. It is
// now the set of gestures everybody already has — swipe sideways between
// attachments, drag down to put it back, tap to clear the chrome away, double
// tap to appreciate — with the post's own actions along the bottom.

import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/features/community/community_screen.dart';
import 'package:indigen_world_mobile/features/community/data/community_models.dart';
import 'package:indigen_world_mobile/features/community/widgets/post_media_view.dart';
import 'package:visibility_detector/visibility_detector.dart';

import 'community_test_harness.dart';

const _photos = [
  CommunityMedia(url: 'https://example.test/one.jpg', type: 'image'),
  CommunityMedia(url: 'https://example.test/two.jpg', type: 'image'),
];

void main() {
  setUp(
    () => VisibilityDetectorController.instance.updateInterval = Duration.zero,
  );
  tearDown(
    () => VisibilityDetectorController.instance.updateInterval = const Duration(
      milliseconds: 500,
    ),
  );

  final amina = fakeProfile();

  Future<FakeCommunityRepository> pumpAndOpen(WidgetTester tester) async {
    final repository = FakeCommunityRepository(
      profiles: [amina],
      posts: [fakePost(media: _photos, likeCount: 4, replyCount: 2)],
    );
    await tester.pumpWidget(
      communityHarness(
        repository: repository,
        profile: amina,
        child: const CommunityScreen(),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));

    // The block is taller than what is left of the test surface and its middle
    // is the hairline between two tiles, so the tap goes into the top left of
    // the first one.
    final block = tester.getRect(find.byType(PostMediaView));
    await tester.tapAt(Offset(block.left + 40, block.top + 20));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    return repository;
  }

  testWidgets('an attachment opens full screen, saying which one it is', (
    tester,
  ) async {
    await pumpAndOpen(tester);

    expect(find.byType(MediaViewerPage), findsOneWidget);
    expect(find.text('1 of 2'), findsOneWidget);
    // The post's own actions travel with it, so nobody has to close the
    // picture to say something about it.
    expect(find.byTooltip('Appreciate'), findsWidgets);
    expect(find.byTooltip('Reply'), findsWidgets);
    expect(find.byTooltip('Share'), findsWidgets);
  });

  testWidgets('double tapping the picture appreciates the post', (
    tester,
  ) async {
    final repository = await pumpAndOpen(tester);

    // The whole surface takes the gesture, so it does not matter where on the
    // picture the fingers land.
    final viewer = find.byType(MediaViewerPage);
    await tester.tap(viewer);
    await tester.pump(const Duration(milliseconds: 40));
    await tester.tap(viewer);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 700));

    expect(repository.toggledLikes, ['post1']);
  });

  testWidgets('dragging it down puts it back where it came from', (
    tester,
  ) async {
    await pumpAndOpen(tester);

    await tester.drag(find.byType(MediaViewerPage), const Offset(0, 260));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));

    expect(find.byType(MediaViewerPage), findsNothing);
    // And what is behind it is the feed it was opened from, not a reload.
    expect(find.text('De zaanem. Ko gara.'), findsOneWidget);
  });

  testWidgets('a small drag springs back instead of closing', (tester) async {
    await pumpAndOpen(tester);

    await tester.drag(find.byType(MediaViewerPage), const Offset(0, 40));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));

    expect(find.byType(MediaViewerPage), findsOneWidget);
  });
}
