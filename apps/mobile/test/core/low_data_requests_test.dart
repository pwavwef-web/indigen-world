import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/core/media_preferences.dart';
import 'package:indigen_world_mobile/features/community/data/community_models.dart';
import 'package:indigen_world_mobile/features/community/widgets/inline_video.dart';
import 'package:indigen_world_mobile/features/community/widgets/post_media_view.dart';
import 'package:indigen_world_mobile/features/community/widgets/video_cover.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:video_player_platform_interface/video_player_platform_interface.dart';
import 'package:visibility_detector/visibility_detector.dart';

class UnavailableVideoPlatform extends VideoPlayerPlatform {
  int requests = 0;
  @override
  Future<void> init() async {}
  @override
  Future<int?> createWithOptions(VideoCreationOptions options) async {
    requests++;
    throw PlatformException(
      code: 'network-unavailable',
      message: 'Synthetic constrained network',
    );
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  testWidgets(
    'low-data avoids full images and video poster decoders; manual video reports network failure',
    (tester) async {
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      SharedPreferences.setMockInitialValues({lowDataPreferenceKey: true});
      VisibilityDetectorController.instance.updateInterval = Duration.zero;
      final platform = UnavailableVideoPlatform();
      final original = VideoPlayerPlatform.instance;
      VideoPlayerPlatform.instance = platform;
      addTearDown(() => VideoPlayerPlatform.instance = original);
      final container = ProviderContainer();
      addTearDown(container.dispose);
      await container.read(lowDataModeProvider.notifier).set(true);
      const video = CommunityMedia(
        url: 'https://invalid.example/video.mp4',
        type: 'video',
      );
      const image = CommunityMedia(
        url: 'https://invalid.example/full.jpg',
        type: 'image',
      );
      var opened = 0;
      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: MaterialApp(
            home: Scaffold(
              body: Column(
                children: [
                  const SizedBox(
                    height: 120,
                    child: VideoCover(
                      videoUrl: 'https://invalid.example/poster.mp4',
                    ),
                  ),
                  SizedBox(
                    height: 120,
                    child: InlineVideoTile(item: video, onOpen: () => opened++),
                  ),
                  const PostMediaView(media: [image]),
                ],
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(
        platform.requests,
        0,
        reason:
            'neither cover decoding nor optional autoplay requests full video',
      );
      expect(
        find.byType(CachedNetworkImage),
        findsNothing,
        reason: 'full image waits for deliberate open when no thumbnail exists',
      );
      await tester.tap(find.byType(InlineVideoTile));
      expect(opened, 1);
      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: const MaterialApp(
            home: Scaffold(body: PostMediaView(media: [video])),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(platform.requests, 0);
      await tester.tap(find.byType(InlineVideoTile));
      await tester.pumpAndSettle();
      expect(
        platform.requests,
        1,
        reason: 'deliberate full-screen open requests the original video',
      );
      expect(find.text('This clip could not be played.'), findsOneWidget);
      // Let the bounded native cleanup timeout finish after the creation error.
      await tester.pump(const Duration(seconds: 3));
      expect(tester.takeException(), isNull);
    },
  );
}
