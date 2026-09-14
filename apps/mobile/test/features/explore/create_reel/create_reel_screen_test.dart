import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/app/app_theme.dart';
import 'package:indigen_world_mobile/features/community/data/community_models.dart';
import 'package:indigen_world_mobile/features/community/data/community_providers.dart';
import 'package:indigen_world_mobile/features/community/data/community_space_models.dart';
import 'package:indigen_world_mobile/features/community/data/community_space_providers.dart';
import 'package:indigen_world_mobile/features/explore/create_reel/reel_draft_store.dart';
import 'package:indigen_world_mobile/features/explore/create_reel/reel_explore_preview.dart';
import 'package:indigen_world_mobile/features/explore/create_reel/reel_media_tools.dart';
import 'package:indigen_world_mobile/features/explore/create_reel/reel_publisher.dart';
import 'package:indigen_world_mobile/features/explore/create_reel_screen.dart';

import 'reel_test_fakes.dart';

/// Keeps adopted files in place so the publisher finds them on disk.
class _InPlaceStore extends FakeReelDraftStore {
  @override
  Future<String> adoptFile(
    String draftId,
    String sourcePath, {
    required String fileName,
  }) async => sourcePath;
}

const _publicSpace = CommunitySpace(
  id: 'navrongo-dancers',
  name: 'Navrongo dancers',
  ownerId: 'someone',
  memberCount: 12,
);
const _privateSpace = CommunitySpace(
  id: 'paga-elders',
  name: 'Paga elders',
  ownerId: 'someone',
  visibility: CommunityVisibility.private,
  memberCount: 4,
);

void main() {
  late FakeReelDraftStore store;
  late FakeReelMediaTools tools;
  late FakeReelPublishBackend backend;
  late Directory temp;

  setUp(() {
    temp = Directory.systemTemp.createTempSync('reel_screen_test');
    store = _InPlaceStore();
    tools = FakeReelMediaTools();
    backend = FakeReelPublishBackend();
  });

  tearDown(() => temp.deleteSync(recursive: true));

  /// A small Android phone: 320×568 logical pixels.
  void useSmallPhone(WidgetTester tester) {
    tester.view
      ..physicalSize = const Size(320, 568)
      ..devicePixelRatio = 1;
    addTearDown(tester.view.reset);
  }

  Future<void> pumpScreen(WidgetTester tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          reelDraftStoreProvider.overrideWithValue(store),
          reelMediaToolsProvider.overrideWithValue(tools),
          reelPreviewControllerFactoryProvider.overrideWithValue(
            (path) => FakePreviewController(),
          ),
          reelPublishBackendProvider.overrideWithValue(backend),
          myCommunityProfileProvider.overrideWith(
            (ref) => Stream<CommunityProfile?>.value(testAuthor),
          ),
          joinedCommunitiesProvider.overrideWith(
            (ref) async => const [_publicSpace, _privateSpace],
          ),
        ],
        child: MaterialApp(
          theme: buildIndigenDarkTheme(),
          home: Builder(
            builder: (context) => Scaffold(
              body: Center(
                child: FilledButton(
                  onPressed: () => Navigator.of(context).push(
                    MaterialPageRoute<bool>(
                      builder: (_) => const CreateReelScreen(),
                    ),
                  ),
                  child: const Text('open'),
                ),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();
  }

  /// Scrolls the stage until [finder] is on screen, then taps it. A stage is a
  /// lazy list, so a control further down is not built until it is near.
  Future<void> tapVisible(WidgetTester tester, Finder finder) async {
    await tester.scrollUntilVisible(
      finder,
      120,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.pumpAndSettle();
    await tester.tap(finder);
    await tester.pumpAndSettle();
  }

  final contextField = find.byWidgetPredicate(
    (widget) =>
        widget is TextField &&
        (widget.decoration?.hintText?.startsWith('For example') ?? false),
  );

  testWidgets('the three stages fit a small phone, keyboard included', (
    tester,
  ) async {
    useSmallPhone(tester);
    await pumpScreen(tester);

    // Stage 1, empty: both routes in, and the real limits.
    expect(find.text('Record'), findsOneWidget);
    expect(find.text('Choose from device'), findsOneWidget);
    expect(
      find.textContaining('Up to 3:00 · 128 MB', skipOffstage: false),
      findsOneWidget,
    );
    expect(find.text('Continue'), findsOneWidget);
    expect(find.text('Save draft'), findsOneWidget);

    // Continuing without a video says why, and stays put.
    await tester.tap(find.text('Continue'));
    await tester.pumpAndSettle();
    expect(find.text('Record or choose a video first.'), findsWidgets);

    // A cancelled pick leaves the stage as it was.
    tools.pickedPath = null;
    await tapVisible(tester, find.text('Choose from device'));
    expect(find.text('Record'), findsOneWidget);

    tools.pickedPath = '/cache/picked.mp4';
    await tapVisible(tester, find.text('Choose from device'));
    expect(find.text('Trim'), findsWidgets);
    expect(
      find.textContaining('Selected 0:42', skipOffstage: false),
      findsOneWidget,
    );
    expect(find.text('Replace video'), findsOneWidget);

    await tester.tap(find.text('Continue'));
    await tester.pumpAndSettle();
    expect(find.text('Give this reel meaning'), findsOneWidget);

    // The keyboard comes up over a short screen: nothing overflows, and the
    // action bar steps aside for the field being typed in.
    await tester.tap(find.byType(TextField).first);
    tester.view.viewInsets = const FakeViewPadding(bottom: 260);
    addTearDown(tester.view.resetViewInsets);
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    expect(find.text('Save draft'), findsNothing);
    await tester.enterText(
      find.byType(TextField).first,
      'Harvest dance\nin Navrongo',
    );
    tester.view.resetViewInsets();
    await tester.pumpAndSettle();
    expect(find.text('Save draft'), findsOneWidget);

    await tester.tap(find.text('Continue'));
    await tester.pumpAndSettle();
    expect(find.text('Choose what this reel is about.'), findsWidgets);

    await tapVisible(tester, find.text('Dance'));
    await tapVisible(tester, find.text('Choose'));
    expect(find.text('Paga elders', skipOffstage: false), findsOneWidget);
    await tester.enterText(find.byType(TextField).last, 'navrongo');
    await tester.pumpAndSettle();
    expect(find.text('Paga elders', skipOffstage: false), findsNothing);
    await tester.tap(find.text('Navrongo dancers'));
    await tester.pumpAndSettle();
    expect(
      find.textContaining('Public community · also shown in Explore'),
      findsOneWidget,
    );

    await tester.scrollUntilVisible(
      contextField,
      120,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.enterText(
      contextField,
      'Young people dancing at the start of the harvest festival.',
    );
    await tapVisible(tester, find.text('I created this media'));
    expect(tester.takeException(), isNull);

    await tester.tap(find.text('Continue'));
    await tester.pumpAndSettle();
    expect(find.text('Check your reel'), findsOneWidget);
    expect(find.byType(ReelExplorePreview), findsOneWidget);
    expect(find.text('Publish'), findsOneWidget);
    expect(tester.takeException(), isNull);

    // Back to an earlier stage loses nothing.
    // On a narrow phone the other steps are numbered marks with tooltips.
    await tester.tap(find.byTooltip('Tell the story'));
    await tester.pumpAndSettle();
    expect(find.text('Harvest dance\nin Navrongo'), findsOneWidget);
  });

  testWidgets('publishing runs the upload and closes on success', (
    tester,
  ) async {
    final video = File('${temp.path}/clip.mp4')..writeAsBytesSync([1, 2, 3]);
    tools.pickedPath = video.path;
    await pumpScreen(tester);
    await tapVisible(tester, find.text('Choose from device'));
    await tester.tap(find.text('Continue'));
    await tester.pumpAndSettle();
    await tapVisible(tester, find.text('Food'));
    await tester.scrollUntilVisible(
      contextField,
      120,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.enterText(
      contextField,
      'Grandmother pounding fufu for the naming feast.',
    );
    await tapVisible(tester, find.text('I created this media'));
    await tester.tap(find.text('Continue'));
    await tester.pumpAndSettle();

    await tester.runAsync(() async {
      await tester.tap(find.text('Publish'));
      for (var i = 0; i < 40 && backend.written.isEmpty; i++) {
        await Future<void>.delayed(const Duration(milliseconds: 10));
      }
    });
    await tester.pumpAndSettle();

    expect(backend.written, hasLength(1));
    expect(backend.written.single.details.context, contains('fufu'));
    expect(find.byType(CreateReelScreen), findsNothing);
    expect(find.text('Your reel is live.'), findsOneWidget);
  });

  testWidgets('leaving with work asks to keep or discard the draft', (
    tester,
  ) async {
    await pumpScreen(tester);
    await tapVisible(tester, find.text('Choose from device'));
    await tester.tap(find.byTooltip('Close'));
    await tester.pumpAndSettle();
    expect(find.text('Leave this reel?'), findsOneWidget);
    await tester.tap(find.text('Keep draft'));
    await tester.pumpAndSettle();
    expect(find.byType(CreateReelScreen), findsNothing);
    expect(store.drafts.values.single.video, isNotNull);
  });

  testWidgets('an oversized pick is explained on the stage', (tester) async {
    tools.probeProblem = const ReelMediaProblem(
      'This video is 300 MB; reels can be up to 128 MB.',
    );
    await pumpScreen(tester);
    await tapVisible(tester, find.text('Choose from device'));
    expect(find.textContaining('300 MB'), findsOneWidget);
    expect(find.text('Record'), findsOneWidget);
  });

  testWidgets('saved drafts can be resumed from the empty stage', (
    tester,
  ) async {
    final saved = completeTestDraft(id: 'reel_saved')
        .copyWith(video: null, caption: 'Saved caption');
    store.drafts[saved.id] = saved;
    await pumpScreen(tester);
    await tapVisible(tester, find.text('Resume a draft (1)'));
    expect(find.text('Your drafts'), findsOneWidget);
    expect(find.text('Saved caption'), findsOneWidget);
    await tester.tap(find.text('Resume'));
    await tester.pumpAndSettle();
    expect(find.text('Check your reel'), findsOneWidget);
  });

  testWidgets('deleting a draft asks first', (tester) async {
    final saved = completeTestDraft(id: 'reel_saved').copyWith(video: null);
    store.drafts[saved.id] = saved;
    await pumpScreen(tester);
    await tester.tap(find.byTooltip('Drafts'));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Delete draft'));
    await tester.pumpAndSettle();
    expect(find.text('Delete this draft?'), findsOneWidget);
    await tester.tap(find.text('Delete'));
    await tester.pumpAndSettle();
    expect(store.deleted, ['reel_saved']);
    expect(find.text('No other drafts.'), findsOneWidget);
  });
}
