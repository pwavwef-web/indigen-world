import 'dart:async';
import 'dart:io';

import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/app/app_theme.dart';
import 'package:indigen_world_mobile/features/kawuri/kawuri_create_screen.dart';
import 'package:indigen_world_mobile/features/kawuri/kawuri_creation_screen.dart';
import 'package:indigen_world_mobile/features/kawuri/kawuri_media_models.dart';
import 'package:indigen_world_mobile/features/kawuri/kawuri_media_repository.dart';
import 'package:indigen_world_mobile/features/kawuri/kawuri_models.dart';
import 'package:indigen_world_mobile/features/kawuri/kawuri_screen.dart';
import 'package:indigen_world_mobile/features/kawuri/kawuri_service.dart';
import 'package:indigen_world_mobile/features/kawuri/kawuri_tasks.dart';
import 'package:indigen_world_mobile/features/kawuri/kawuri_voice_input.dart';
import 'package:indigen_world_mobile/l10n/app_localizations.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// The server's manifest, in the exact shape `getKawuriCapabilities` returns.
Map<Object?, Object?> manifest({
  bool video = true,
  bool speech = true,
  bool analysis = true,
  bool videoAudio = true,
}) => {
  'provider': 'vertex',
  'chat': true,
  'translation': true,
  'imageGeneration': true,
  'videoGeneration': video,
  'speechToText': speech,
  'mediaAnalysis': analysis,
  'unavailableReasons': {if (!video) 'videoGeneration': 'not_eligible'},
  'speechToTextLanguages': speech ? ['en'] : [],
  'imageAspectRatios': ['1:1', '3:4', '4:3', '9:16', '16:9'],
  'imageOutputCounts': [1],
  'imageReferenceInput': true,
  'videoAspectRatios': video ? ['9:16', '16:9'] : [],
  'videoDurations': video ? [4, 6, 8] : [],
  'videoResolutions': video
      ? {
          '16:9': ['720p', '1080p'],
          '9:16': ['720p'],
        }
      : {},
  'videoReferenceImage': video,
  'videoNegativePrompt': video,
  'videoQualityOptions': video ? ['fast'] : [],
  'videoAudio': video && videoAudio,
  'videoRequiresConfirmation': true,
  'analysisIntentions': ['describe', 'cultural_context'],
  'limits': {
    'promptChars': 2000,
    'transcriptionSeconds': 120,
    'transcriptionBytes': 10485760,
    'referenceImageBytes': 20971520,
    'analysisBytes': {'image': 20971520, 'video': 209715200, 'audio': 26214400},
  },
};

Map<Object?, Object?> taskMap({
  required String id,
  required String type,
  required String status,
  String prompt = 'Kasena compound concept',
  int? progress,
  List<Object?> outputs = const [],
}) => {
  'id': id,
  'type': type,
  'status': status,
  'prompt': prompt,
  'progress': progress,
  'aspectRatio': type == 'video_generation' ? '9:16' : '1:1',
  'duration': type == 'video_generation' ? 8 : null,
  'resolution': type == 'video_generation' ? '720p' : null,
  'outputMedia': outputs,
  'createdAt': '2026-09-14T10:00:00.000Z',
};

class FakeMediaRepository implements KawuriMediaRepository {
  FakeMediaRepository({this.uid = 'member-1'});

  @override
  final String? uid;

  final uploads = <String>[];
  final analyses = <Map<String, Object?>>[];
  final videos = <Map<String, Object?>>[];

  @override
  Future<String> upload({
    required String purpose,
    required String filePath,
    required String contentType,
    void Function(double progress)? onProgress,
  }) async {
    uploads.add('$purpose|$contentType');
    return 'kawuri-uploads/$uid/$purpose/up_1/upload.jpg';
  }

  @override
  Future<KawuriCreation> analyse({
    required String requestId,
    required String intention,
    String question = '',
    String? storagePath,
    String? followUpTaskId,
    String conversationId = '',
  }) async {
    analyses.add({
      'requestId': requestId,
      'intention': intention,
      'question': question,
      'storagePath': storagePath,
      'followUpTaskId': followUpTaskId,
    });
    return KawuriCreation.fromMap({
      'id': '${uid}_task1',
      'type': 'image_analysis',
      'status': 'ready',
      'result': {
        'summary': 'A painted wall.',
        'observations': ['Black and white triangles.'],
        'possibleContext': ['May be a family compound.'],
        'detectedText': <String>[],
        'suggestedLanguages': <String>[],
        'suggestedTopics': ['Architecture'],
        'confidenceNotes': ['The town cannot be known from this.'],
        'requiresCommunityVerification': true,
      },
      'createdAt': '2026-09-14T10:00:00.000Z',
    });
  }

  @override
  Future<KawuriCreation> createVideo({
    required String requestId,
    required String prompt,
    required String aspectRatio,
    required int durationSeconds,
    required String resolution,
    required bool confirmSpend,
    String negativePrompt = '',
    String quality = 'fast',
    bool generateAudio = false,
    String? referenceImagePath,
    String sourceTaskId = '',
    String conversationId = '',
  }) async {
    videos.add({
      'requestId': requestId,
      'prompt': prompt,
      'aspectRatio': aspectRatio,
      'durationSeconds': durationSeconds,
      'confirmSpend': confirmSpend,
      'generateAudio': generateAudio,
    });
    return KawuriCreation.fromMap(
      taskMap(
        id: '${uid}_$requestId',
        type: 'video_generation',
        status: 'generating',
        prompt: prompt,
      ),
    );
  }

  @override
  Future<KawuriCreation> task(String taskId) async => KawuriCreation.fromMap(
    taskMap(id: taskId, type: 'video_generation', status: 'generating'),
  );

  @override
  Stream<KawuriCreation?> watchTask(String taskId) => Stream.value(
    KawuriCreation.fromMap(
      taskMap(id: taskId, type: 'video_generation', status: 'generating'),
    ),
  );

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  group('capabilities', () {
    test('are read from the server manifest, never assumed', () {
      final caps = KawuriCapabilities.fromMap(manifest(video: false));
      expect(caps.loaded, isTrue);
      expect(caps.imageGeneration, isTrue);
      expect(caps.videoGeneration, isFalse);
      expect(caps.speechToTextLanguages, ['en']);
      expect(caps.imageAspectRatios, contains('3:4'));
      expect(caps.videoDurations, isEmpty);
      expect(caps.analysisBytes['video'], 209715200);
      expect(caps.unavailableTag('videoGeneration'), 'Creators');
      expect(caps.unavailableMessage('imageGeneration'), isNull);
      expect(
        caps.unavailableMessage('videoGeneration'),
        contains('approved creators'),
      );
    });

    test('nothing is offered before the server answers', () {
      const caps = KawuriCapabilities.none;
      expect(caps.imageGeneration, isFalse);
      expect(caps.unavailableTag('mediaAnalysis'), 'Checking…');
      final signedOut = KawuriCapabilities.fromMap({
        'chat': true,
        'unavailableReasons': {'speechToText': 'sign_in_required'},
      });
      expect(signedOut.unavailableTag('speechToText'), 'Sign in');
    });
  });

  group('creations', () {
    test('Recent lines use real status, and progress only when reported', () {
      final image = KawuriCreation.fromMap(
        taskMap(id: 't1', type: 'image_generation', status: 'ready'),
      );
      expect(image.subtitle, 'Image · Ready');
      expect(image.title, 'Kasena compound concept');
      expect(image.progressLabel, isNull);

      final reported = KawuriCreation.fromMap(
        taskMap(
          id: 't2',
          type: 'video_generation',
          status: 'generating',
          prompt: 'Festival story',
          progress: 42,
        ),
      );
      expect(reported.subtitle, 'Video · Generating');
      expect(reported.progressLabel, '42%');

      final unreported = KawuriCreation.fromMap(
        taskMap(id: 't3', type: 'video_generation', status: 'generating'),
      );
      expect(unreported.progressLabel, isNull, reason: 'no invented figure');
    });

    test('overflow actions follow the task state', () {
      KawuriCreation of(String type, String status) =>
          KawuriCreation.fromMap(taskMap(id: 'x', type: type, status: status));
      expect(of('video_generation', 'generating').actions, ['cancel']);
      expect(of('video_generation', 'ready').actions, contains('use_in_reel'));
      expect(
        of('image_generation', 'ready').actions,
        contains('use_as_reel_cover'),
      );
      expect(of('image_generation', 'rejected').actions, [
        'retry',
        'edit_prompt',
        'delete',
      ]);
      expect(of('image_analysis', 'ready').actions, [
        'ask_follow_up',
        'delete',
      ]);
      expect(
        of('image_generation', 'failed').actions,
        isNot(contains('share')),
      );
    });

    test('signed links survive a live snapshot that carries none', () {
      final fetched = KawuriCreation.fromMap(
        taskMap(
          id: 't1',
          type: 'image_generation',
          status: 'ready',
          outputs: [
            {
              'storagePath': 'kawuri-creations/u/t1/image-1.png',
              'mimeType': 'image/png',
              'url': 'https://signed.example/a',
            },
          ],
        ),
      );
      final live = KawuriCreation.fromMap(
        taskMap(
          id: 't1',
          type: 'image_generation',
          status: 'ready',
          outputs: [
            {
              'storagePath': 'kawuri-creations/u/t1/image-1.png',
              'mimeType': 'image/png',
            },
          ],
        ),
      );
      expect(
        live.withLinksFrom(fetched).primaryOutput!.url,
        'https://signed.example/a',
      );
    });

    test('backend reasons become the backend’s own member-facing words', () {
      final error = KawuriMediaException.from(
        FirebaseFunctionsException(
          code: 'invalid-argument',
          message: 'Voice transcription currently supports English only. You can still type in another language.',
          details: {'reason': 'UNSUPPORTED_LANGUAGE'},
        ),
      );
      expect(error.reason, 'UNSUPPORTED_LANGUAGE');
      expect(error.message, contains('English only'));
      final bare = KawuriMediaException.from(
        FirebaseFunctionsException(code: 'resource-exhausted', message: ''),
      );
      expect(bare.reason, 'RATE_LIMITED');
    });

    test('uploads are typed the way the server checks them', () {
      expect(kawuriMimeTypeFor('/tmp/voice.m4a'), 'audio/mp4');
      expect(kawuriMimeTypeFor('/tmp/photo.JPG'), 'image/jpeg');
      expect(kawuriMimeTypeFor('/tmp/clip.mov'), 'video/quicktime');
      expect(kawuriMimeTypeFor('/tmp/notes.pdf'), isNull);
      expect(
        kawuriVoiceEnglishOnly,
        'Voice input currently supports English only.',
      );
    });

    test('an analysis keeps interpretation labelled as unverified', () {
      final result = KawuriAnalysisResult.fromMap({
        'summary': 'A painted wall.',
        'observations': ['Triangles.'],
        'possibleContext': ['May be a family compound.'],
        'suggestedLanguages': ['Kasem'],
        'requiresCommunityVerification': true,
      })!;
      expect(result.plainText, contains('Possible context (not verified)'));
      expect(result.plainText, contains('Suggested languages (not verified)'));
      final message = KawuriMessage(
        id: 'm1',
        role: KawuriRole.kawuri,
        text: result.plainText,
        sentAt: DateTime(2026, 9, 14),
        taskType: KawuriTaskType.mediaAnalysis,
        taskId: 'u_task1',
        analysis: result,
        attachment: const KawuriAttachment(
          path: '/tmp/a.jpg',
          name: 'a.jpg',
          mimeType: 'image/jpeg',
          sizeBytes: 10,
        ),
      );
      final restored = KawuriMessage.fromJson(message.toJson());
      expect(restored.taskId, 'u_task1');
      expect(restored.analysis!.possibleContext, ['May be a family compound.']);
      expect(restored.attachment!.name, 'a.jpg');
    });
  });

  group('analysis in the conversation', () {
    late File file;
    setUp(() {
      file = File('${Directory.systemTemp.path}/kawuri_test_photo.jpg')
        ..writeAsBytesSync(List.filled(64, 1));
    });
    tearDown(() {
      if (file.existsSync()) file.deleteSync();
    });

    KawuriMessage ask(String id, {KawuriAttachment? attachment}) =>
        KawuriMessage(
          id: id,
          role: KawuriRole.you,
          text: 'What is this?',
          sentAt: DateTime(2026, 9, 14),
          taskType: KawuriTaskType.mediaAnalysis,
          options: const {'intention': 'cultural_context'},
          conversationId: 'c1',
          attachment: attachment,
        );

    test(
      'uploads the file, analyses it server-side and keeps the task id',
      () async {
        final media = FakeMediaRepository();
        final service = KawuriService(
          null,
          media: media,
          capabilities: KawuriCapabilities.fromMap(manifest()),
        );
        final first = ask(
          '111_1',
          attachment: KawuriAttachment(
            path: file.path,
            name: 'photo.jpg',
            mimeType: 'image/jpeg',
            sizeBytes: 64,
          ),
        );
        final answer = await service.ask([first]);
        expect(answer.failed, isFalse);
        expect(answer.taskId, 'member-1_task1');
        expect(answer.analysis!.observations, ['Black and white triangles.']);
        expect(media.uploads, ['media|image/jpeg']);
        expect(media.analyses.single['intention'], 'cultural_context');
        expect(media.analyses.single['requestId'], 'ana_111_1');

        // A follow-up continues the same task and uploads nothing.
        final reply = KawuriMessage(
          id: '111_2',
          role: KawuriRole.kawuri,
          text: answer.text,
          sentAt: DateTime(2026, 9, 14),
          taskType: KawuriTaskType.mediaAnalysis,
          taskId: answer.taskId,
          analysis: answer.analysis,
        );
        await service.ask([first, reply, ask('111_3')]);
        expect(media.uploads, hasLength(1));
        expect(media.analyses.last['followUpTaskId'], 'member-1_task1');
      },
    );

    test('is refused honestly when the server does not offer it', () async {
      final media = FakeMediaRepository();
      final service = KawuriService(null, media: media);
      final answer = await service.ask([
        ask(
          '222_1',
          attachment: KawuriAttachment(
            path: file.path,
            name: 'photo.jpg',
            mimeType: 'image/jpeg',
            sizeBytes: 64,
          ),
        ),
      ]);
      expect(answer.failed, isTrue);
      expect(media.uploads, isEmpty);
      expect(media.analyses, isEmpty);
    });
  });

  group('screens', () {
    Future<void> pumpKawuri(
      WidgetTester tester, {
      required FakeMediaRepository media,
      required Map<Object?, Object?> caps,
      List<KawuriCreation> recent = const [],
    }) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            kawuriMediaRepositoryProvider.overrideWithValue(media),
            kawuriCapabilitiesProvider.overrideWith(
              (ref) async => KawuriCapabilities.fromMap(caps),
            ),
            kawuriRecentCreationsProvider.overrideWith(
              (ref) => Stream.value(recent),
            ),
            kawuriServiceProvider.overrideWithValue(const KawuriService(null)),
            kawuriTaskProvider.overrideWith(
              (ref, taskId) => media.watchTask(taskId),
            ),
          ],
          child: MaterialApp(
            localizationsDelegates: AppLocalizations.localizationsDelegates,
            supportedLocales: AppLocalizations.supportedLocales,
            theme: buildIndigenTheme(),
            home: const KawuriScreen(),
          ),
        ),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));
    }

    testWidgets('Recent shows real task records with real progress', (
      tester,
    ) async {
      await pumpKawuri(
        tester,
        media: FakeMediaRepository(),
        caps: manifest(),
        recent: [
          KawuriCreation.fromMap(
            taskMap(id: 'a', type: 'image_generation', status: 'ready'),
          ),
          KawuriCreation.fromMap(
            taskMap(
              id: 'b',
              type: 'video_generation',
              status: 'generating',
              prompt: 'Festival story',
              progress: 42,
            ),
          ),
        ],
      );
      await tester.scrollUntilVisible(
        find.text('Festival story'),
        200,
        scrollable: find.byType(Scrollable).first,
      );
      expect(find.text('Kasena compound concept'), findsOneWidget);
      expect(find.text('Image · Ready'), findsOneWidget);
      expect(find.text('Video · Generating'), findsOneWidget);
      expect(find.text('42%'), findsOneWidget);
      expect(find.textContaining('coming soon'), findsNothing);
    });

    testWidgets('tools the server withholds say why, and open nothing', (
      tester,
    ) async {
      await pumpKawuri(
        tester,
        media: FakeMediaRepository(),
        caps: manifest(video: false, speech: false),
      );
      expect(find.text('Creators'), findsOneWidget);
      await tester.tap(find.byTooltip('Voice input · Coming soon'));
      await tester.pump(const Duration(milliseconds: 400));
      expect(find.text('Voice input · Coming soon'), findsWidgets);
      expect(find.byType(KawuriCreateScreen), findsNothing);
    });

    testWidgets(
      'voice input is offered as English only when the server has it',
      (tester) async {
        await pumpKawuri(
          tester,
          media: FakeMediaRepository(),
          caps: manifest(),
        );
        expect(find.byTooltip('Voice input · English only'), findsOneWidget);
        expect(find.byTooltip('Attach media to analyse'), findsOneWidget);
      },
    );

    testWidgets(
      'Create video offers the model’s own options and asks before spending',
      (tester) async {
        final media = FakeMediaRepository();
        await pumpKawuri(tester, media: media, caps: manifest());
        await tester.tap(find.text('Create video'));
        await tester.pumpAndSettle(const Duration(milliseconds: 100));
        expect(find.byType(KawuriCreateScreen), findsOneWidget);
        expect(find.text('Tall · 9:16'), findsOneWidget);
        expect(find.text('Wide · 16:9'), findsOneWidget);
        expect(find.text('8 seconds'), findsOneWidget);
        expect(
          find.text('Square · 1:1'),
          findsNothing,
          reason: 'Veo has no square',
        );

        await tester.enterText(
          find.byType(TextField).first,
          'A slow pan across painted walls',
        );
        // The form's button carries the camera icon; the app bar title of the
        // same name does not. The list builds lazily, so scroll to it first.
        final create = find.byIcon(Icons.videocam_outlined);
        await tester.scrollUntilVisible(
          create,
          200,
          scrollable: find
              .descendant(
                of: find.byType(KawuriCreateScreen),
                matching: find.byType(Scrollable),
              )
              .first,
        );
        // A tap while the list is still settling only stops the scroll.
        await tester.pumpAndSettle();
        await tester.tap(create);
        await tester.pumpAndSettle(const Duration(milliseconds: 100));
        expect(find.text('Use a video generation?'), findsOneWidget);
        expect(
          find.textContaining('8-second video, with sound,'),
          findsOneWidget,
          reason: 'sound is on by default and the spend dialog says so',
        );
        await tester.tap(find.text('Not now'));
        await tester.pumpAndSettle(const Duration(milliseconds: 100));
        expect(media.videos, isEmpty, reason: 'declining buys nothing');

        // Closing the dialog hands focus back to the prompt, which scrolls the
        // form back up to it.
        await tester.scrollUntilVisible(
          create,
          200,
          scrollable: find
              .descendant(
                of: find.byType(KawuriCreateScreen),
                matching: find.byType(Scrollable),
              )
              .first,
        );
        // A tap while the list is still settling only stops the scroll.
        await tester.pumpAndSettle();
        await tester.tap(create);
        await tester.pumpAndSettle(const Duration(milliseconds: 100));
        await tester.tap(find.text('Create video').last);
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 500));
        expect(media.videos, hasLength(1));
        expect(media.videos.single['confirmSpend'], isTrue);
        expect(media.videos.single['durationSeconds'], 8);
        expect(media.videos.single['generateAudio'], isTrue);
        expect(find.text('Video · Generating'), findsOneWidget);
        // Unmount so the detail screen's status timer is disposed.
        await tester.pumpWidget(const SizedBox.shrink());
      },
    );

    testWidgets('the sound switch is offered only by a backend that honours it', (
      tester,
    ) async {
      Future<void> pump(Map<Object?, Object?> caps) async {
        await tester.pumpWidget(
          ProviderScope(
            overrides: [
              kawuriMediaRepositoryProvider.overrideWithValue(
                FakeMediaRepository(),
              ),
              kawuriCapabilitiesProvider.overrideWith(
                (ref) async => KawuriCapabilities.fromMap(caps),
              ),
            ],
            child: MaterialApp(
              localizationsDelegates: AppLocalizations.localizationsDelegates,
              supportedLocales: AppLocalizations.supportedLocales,
              theme: buildIndigenTheme(),
              home: const KawuriCreateScreen(kind: KawuriCreateKind.video),
            ),
          ),
        );
        await tester.pumpAndSettle();
      }

      await pump(manifest());
      final sound = find.byKey(const Key('kawuri-video-sound'));
      await tester.scrollUntilVisible(
        sound,
        150,
        scrollable: find.byType(Scrollable).first,
      );
      expect(tester.widget<SwitchListTile>(sound).value, isTrue);
      expect(find.textContaining('will not be speaking Kasem'), findsOneWidget);
      await tester.tap(sound);
      await tester.pumpAndSettle();
      expect(tester.widget<SwitchListTile>(sound).value, isFalse);
      expect(find.textContaining('A silent video'), findsOneWidget);

      // An older backend makes every video silent, so no switch is shown and
      // the screen keeps saying so.
      await tester.pumpWidget(const SizedBox.shrink());
      await pump(manifest(videoAudio: false));
      expect(find.byKey(const Key('kawuri-video-sound')), findsNothing);
      await tester.scrollUntilVisible(
        find.textContaining('without sound'),
        150,
        scrollable: find.byType(Scrollable).first,
      );
      expect(find.textContaining('without sound'), findsOneWidget);
    });

    for (final width in [320.0, 412.0]) {
      testWidgets(
        'Create image stays usable with the keyboard up and large text at $width px',
        (tester) async {
          tester.view.devicePixelRatio = 1;
          tester.view.physicalSize = Size(width, 700);
          tester.platformDispatcher.textScaleFactorTestValue = 1.6;
          addTearDown(tester.view.resetPhysicalSize);
          addTearDown(tester.view.resetDevicePixelRatio);
          addTearDown(tester.view.resetViewInsets);
          addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
          await tester.pumpWidget(
            ProviderScope(
              overrides: [
                kawuriMediaRepositoryProvider.overrideWithValue(
                  FakeMediaRepository(),
                ),
                kawuriCapabilitiesProvider.overrideWith(
                  (ref) async => KawuriCapabilities.fromMap(manifest()),
                ),
              ],
              child: MaterialApp(
                localizationsDelegates: AppLocalizations.localizationsDelegates,
                supportedLocales: AppLocalizations.supportedLocales,
                theme: buildIndigenTheme(),
                home: const KawuriCreateScreen(kind: KawuriCreateKind.image),
              ),
            ),
          );
          await tester.pumpAndSettle();
          tester.view.viewInsets = const FakeViewPadding(bottom: 280);
          await tester.tap(find.byType(TextField).first);
          await tester.enterText(
            find.byType(TextField).first,
            'A drum\nat dusk',
          );
          await tester.pumpAndSettle();
          expect(tester.takeException(), isNull);
          await tester.scrollUntilVisible(
            find.byIcon(Icons.auto_awesome_outlined),
            150,
            scrollable: find.byType(Scrollable).first,
          );
          await tester.pumpAndSettle();
          final button = tester.getRect(
            find.byIcon(Icons.auto_awesome_outlined),
          );
          expect(button.bottom, lessThanOrEqualTo(700 - 280));
          expect(tester.takeException(), isNull);
        },
      );
    }

    testWidgets(
      'an analysis opens with its sections and the verification warning',
      (tester) async {
        tester.view.devicePixelRatio = 1;
        tester.view.physicalSize = const Size(320, 720);
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        final media = FakeMediaRepository();
        final analysis = await media.analyse(
          requestId: 'ana_00000001',
          intention: 'cultural_context',
        );
        await tester.pumpWidget(
          ProviderScope(
            overrides: [
              kawuriMediaRepositoryProvider.overrideWithValue(media),
              kawuriTaskProvider.overrideWith(
                (ref, id) => Stream.value(analysis),
              ),
            ],
            child: MaterialApp(
              localizationsDelegates: AppLocalizations.localizationsDelegates,
              supportedLocales: AppLocalizations.supportedLocales,
              theme: buildIndigenTheme(),
              home: KawuriCreationScreen(
                taskId: analysis.id,
                initial: analysis,
              ),
            ),
          ),
        );
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 300));
        expect(find.text('Image analysis · Ready'), findsOneWidget);
        expect(find.text('Seen directly'), findsOneWidget);
        expect(find.text('Possible context · not verified'), findsOneWidget);
        expect(
          find.textContaining('Needs community verification'),
          findsOneWidget,
        );
        expect(tester.takeException(), isNull);
        await tester.pumpWidget(const SizedBox.shrink());
      },
    );
  });
}
