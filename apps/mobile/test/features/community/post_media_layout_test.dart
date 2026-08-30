// Where a post's attachment sits, and how tall it is allowed to get.
//
// Both used to be decided by the attachment: it lived in the column beside the
// avatar, which starts an avatar's width in from one edge and stops short of
// the other, and it was drawn at whatever shape the camera gave it. A portrait
// clip is 9:16, so one post became a tall slab pressed against the right of the
// screen. It now spans the card with even margins, and its shape is held inside
// a range that leaves room for the writing around it.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/app/app_theme.dart';
import 'package:indigen_world_mobile/features/community/data/community_models.dart';
import 'package:indigen_world_mobile/features/community/widgets/community_post_card.dart';
import 'package:indigen_world_mobile/features/community/widgets/post_media_view.dart';
import 'package:indigen_world_mobile/features/community/widgets/post_text.dart';
import 'package:visibility_detector/visibility_detector.dart';

CommunityPost _post(CommunityMedia media) => CommunityPost(
  id: 'post-1',
  authorId: 'author-1',
  authorName: 'Ayine',
  authorUsername: 'ayine',
  text: 'Harvest drumming at Paga.',
  media: [media],
  likeCount: 0,
  replyCount: 0,
  createdAt: DateTime(2026, 8, 30),
);

Future<void> _pumpCard(WidgetTester tester, CommunityMedia media) async {
  await tester.pumpWidget(
    ProviderScope(
      child: MaterialApp(
        theme: buildIndigenTheme(),
        // In a scroller, as it always is: a post is as tall as its writing and
        // its attachment, and the feed is what gives it somewhere to be tall.
        home: Scaffold(
          body: ListView(
            children: [
              CommunityPostCard(
                post: _post(media),
                liked: false,
                saved: false,
                onLike: () {},
                onReply: () {},
                onSave: () {},
                onOpen: () {},
                onOpenAuthor: () {},
                onMore: () {},
              ),
            ],
          ),
        ),
      ),
    ),
  );
  await tester.pump(const Duration(milliseconds: 300));
}

void main() {
  // A video tile watches for visibility before it will open a decoder, and its
  // coalescing timer outlives the widget tree unless it is told not to wait.
  setUp(
    () => VisibilityDetectorController.instance.updateInterval = Duration.zero,
  );
  tearDown(
    () => VisibilityDetectorController.instance.updateInterval = const Duration(
      milliseconds: 500,
    ),
  );

  group('the shape an attachment is drawn in', () {
    test('a portrait clip is held to three by four', () {
      // A phone shoots 9:16. Drawn at that, one post is most of a screen.
      const portrait = CommunityMedia(
        url: 'https://example.test/clip.mp4',
        type: 'video',
        aspectRatio: 9 / 16,
      );
      expect(PostMediaView.displayAspect(portrait), closeTo(3 / 4, 0.0001));
    });

    test('a panorama is held to sixteen by nine', () {
      const wide = CommunityMedia(
        url: 'https://example.test/wide.jpg',
        type: 'image',
        aspectRatio: 4,
      );
      expect(PostMediaView.displayAspect(wide), closeTo(16 / 9, 0.0001));
    });

    test('an ordinary shape is left exactly as it was shot', () {
      const square = CommunityMedia(
        url: 'https://example.test/square.jpg',
        type: 'image',
      );
      expect(PostMediaView.displayAspect(square), closeTo(4 / 3, 0.0001));
    });

    test('a missing or nonsense ratio falls back rather than collapsing', () {
      const broken = CommunityMedia(
        url: 'https://example.test/broken.jpg',
        type: 'image',
        aspectRatio: 0,
      );
      expect(PostMediaView.displayAspect(broken), closeTo(4 / 3, 0.0001));
    });
  });

  testWidgets('an attachment breaks out of the avatar gutter', (tester) async {
    await _pumpCard(
      tester,
      const CommunityMedia(
        url: 'https://example.test/clip.mp4',
        type: 'video',
        aspectRatio: 9 / 16,
      ),
    );

    final media = tester.getRect(find.byType(PostMediaView));
    final text = tester.getRect(find.byType(PostText));
    final card = tester.getRect(find.byType(CommunityPostCard));

    // Writing stays under the byline it belongs to; the picture does not.
    expect(media.left, lessThan(text.left));
    // And the margins either side of it match, which is the difference between
    // wider and centred.
    expect(
      media.left - card.left,
      closeTo(card.right - media.right, 0.5),
    );
  });

  testWidgets('a portrait clip no longer takes the whole screen', (
    tester,
  ) async {
    await _pumpCard(
      tester,
      const CommunityMedia(
        url: 'https://example.test/clip.mp4',
        type: 'video',
        aspectRatio: 9 / 16,
      ),
    );

    final media = tester.getRect(find.byType(PostMediaView));
    expect(media.width / media.height, closeTo(3 / 4, 0.01));
  });
}
