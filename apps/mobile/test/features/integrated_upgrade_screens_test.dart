import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;
import 'dart:typed_data';

import 'package:firebase_auth/firebase_auth.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:visibility_detector/visibility_detector.dart';
import 'package:indigen_world_mobile/app/app_theme.dart';
import 'package:indigen_world_mobile/l10n/app_localizations.dart';
import 'package:indigen_world_mobile/features/auth/auth_repository.dart';
import 'package:indigen_world_mobile/features/shop/shop_repository.dart';
import 'package:indigen_world_mobile/features/shop/shop_screen.dart';
import 'package:indigen_world_mobile/features/shop/shop_checkout.dart';
import 'package:indigen_world_mobile/features/notifications/notifications_screen.dart';
import 'package:indigen_world_mobile/features/notifications/data/notification_models.dart';
import 'package:indigen_world_mobile/features/notifications/data/notification_providers.dart';
import 'package:indigen_world_mobile/features/community/data/community_providers.dart';
import 'package:indigen_world_mobile/features/collection/collection_data.dart';
import 'package:indigen_world_mobile/features/collection/collection_detail_screens.dart';
import 'package:indigen_world_mobile/features/explore/published_content.dart';
import 'package:indigen_world_mobile/features/ads/comment_sponsor.dart';
import 'package:indigen_world_mobile/features/ads/data/ad_campaign.dart';
import 'package:indigen_world_mobile/features/ads/data/served_ad.dart';
import 'package:indigen_world_mobile/features/video_editor/mobile_video_editor.dart';
import 'package:indigen_world_mobile/features/video_editor/mobile_timeline.dart';
import 'package:indigen_world_mobile/features/video_editor/video_editor_repository.dart';

class ReviewUser implements User {
  @override
  String get uid => 'synthetic-review-member';
  @override
  String get displayName => 'Review member';
  @override
  String get email => 'member@example.test';
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class ReviewAuth implements FirebaseAuth {
  @override
  User get currentUser => ReviewUser();
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class ImageFixtureHttp extends HttpOverrides {
  @override
  HttpClient createHttpClient(SecurityContext? context) => ImageFixtureClient();
}

class ImageFixtureClient implements HttpClient {
  @override
  Future<HttpClientRequest> openUrl(String method, Uri url) async =>
      ImageFixtureRequest();
  @override
  Future<HttpClientRequest> getUrl(Uri url) async => ImageFixtureRequest();
  @override
  dynamic noSuchMethod(Invocation invocation) => null;
}

class ImageFixtureRequest implements HttpClientRequest {
  @override
  final headers = ImageFixtureHeaders();
  @override
  Future<HttpClientResponse> close() async => ImageFixtureResponse();
  @override
  dynamic noSuchMethod(Invocation invocation) => null;
}

class ImageFixtureHeaders implements HttpHeaders {
  @override
  String? value(String name) => name == 'content-type'
      ? 'image/jpeg'
      : name == 'cache-control'
      ? 'public,max-age=3600'
      : null;
  @override
  dynamic noSuchMethod(Invocation invocation) => null;
}

class ImageFixtureResponse extends Stream<List<int>>
    implements HttpClientResponse {
  final bytes = File('assets/places/paga-pond.jpg').readAsBytesSync();
  @override
  int get statusCode => 200;
  @override
  int get contentLength => bytes.length;
  @override
  HttpClientResponseCompressionState get compressionState =>
      HttpClientResponseCompressionState.notCompressed;
  @override
  final headers = ImageFixtureHeaders();
  @override
  StreamSubscription<List<int>> listen(
    void Function(List<int>)? onData, {
    Function? onError,
    void Function()? onDone,
    bool? cancelOnError,
  }) => Stream<List<int>>.value(bytes).listen(
    onData,
    onError: onError,
    onDone: onDone,
    cancelOnError: cancelOnError,
  );
  @override
  dynamic noSuchMethod(Invocation invocation) => null;
}

final product = <String, dynamic>{
  'id': 'review-print',
  'name': 'Archive print · review fixture',
  'maker': 'Indigen World',
  'description': 'Synthetic catalogue item used only for local review.',
  'category': 'Prints',
  'priceMode': 'fixed',
  'priceMinor': 2400,
  'currency': 'GHS',
  'published': true,
  'inStock': true,
  'imageUrl': 'https://review-fixture.invalid/archive.jpg',
  'variants': <dynamic>[],
};
final order = <String, dynamic>{
  'id': 'review-order',
  'paymentStatus': 'paid',
  'fulfillmentStatus': 'packing',
  'returnStatus': 'none',
  'totalMinor': 2900,
  'currency': 'GHS',
  'refundedMinor': 0,
  'items': [
    {
      'productId': 'review-print',
      'variantId': 'default',
      'name': product['name'],
      'quantity': 1,
      'priceMinor': 2400,
    },
  ],
  'address': {'recipient': 'Review member', 'city': 'Fixture town'},
  'delivery': {'name': 'Configured pickup · fixture'},
  'timeline': [
    {
      'event': 'Payment verified · synthetic fixture',
      'at': '2026-10-16T12:00:00Z',
    },
    {'event': 'Packing', 'at': '2026-10-16T12:05:00Z'},
  ],
};
final config = <String, dynamic>{
  'checkoutReady': true,
  'settings': {
    'storeName': 'Indigen World',
    'currency': 'GHS',
    'supportEmail': 'store@example.test',
    'deliveryPolicy': 'Synthetic delivery policy for local review.',
    'returnsPolicy': 'Synthetic returns policy for local review.',
  },
  'delivery': [
    {
      'id': 'pickup',
      'name': 'Configured pickup · fixture',
      'feeMinor': 500,
      'enabled': true,
    },
  ],
  'categories': [
    {
      'id': 'prints',
      'name': 'Prints',
      'description': 'Stories for your space',
      'imageUrl': '',
    },
  ],
};

class ReviewShop extends ShopRepository {
  final calls = <String>[];
  @override
  Future<dynamic> call(String operation, [ShopRow data = const {}]) async {
    calls.add(operation);
    return switch (operation) {
      'config' => config,
      'catalogue' => {
        'items': [
          product,
          {
            ...product,
            'id': 'review-book',
            'name': 'Reading edition · review fixture',
            'priceMinor': 3600,
          },
        ],
        'cursor': null,
      },
      'product' => product,
      'cart' => {
        'lines': [
          {
            'productId': product['id'],
            'variantId': 'default',
            'quantity': 1,
            'product': product,
          },
        ],
      },
      'profile' => {
        'profile': {},
        'orders': [order],
        'addresses': [],
        'paymentMethods': [],
      },
      'order' => order,
      _ => {'ok': true},
    };
  }
}

class ReviewEditor extends VideoEditorRepository {
  @override
  String get currentUserUid => 'synthetic-review-member';
  @override
  Future<MobileTimeline?> loadLocal(String uid, String id) async =>
      MobileTimeline(
        id: id,
        ownerUid: uid,
        scenes: [
          {
            'id': 'review-scene',
            'kind': 'image',
            'mediaId': 'review-image',
            'localPath': File('assets/places/paga-pond.jpg').absolute.path,
            'duration': 8.0,
            'sourceIn': 0.0,
            'speed': 1.0,
            'fit': 'cover',
            'overlays': [
              {
                'id': 'title',
                'type': 'text',
                'text': 'A story from home',
                'sourceStart': 0.0,
                'sourceEnd': 8.0,
                'x': .5,
                'y': .78,
                'fontSize': 52.0,
                'color': '#ffffff',
                'background': '#111111',
              },
            ],
          },
        ],
      );
  @override
  Future<void> saveLocal(MobileTimeline project) async {}
}

const captureKey = ValueKey('screen-capture');
final screenshots = Directory(
  '../../apps/updates-blog/posts/2026-10-16-connected-mobile-workflows/screens',
);
late ui.Image fixtureImage;
Widget harness(
  Widget screen,
  ReviewShop api, {
  double scale = 1,
  bool dark = false,
}) => ProviderScope(
  overrides: [
    firebaseAuthProvider.overrideWithValue(ReviewAuth()),
    authStateProvider.overrideWith((ref) => Stream.value(ReviewUser())),
    currentUidProvider.overrideWithValue('synthetic-review-member'),
    shopRepositoryProvider.overrideWithValue(api),
    notificationsRepositoryProvider.overrideWithValue(null),
    notificationFeedProvider.overrideWith(
      (ref) => Stream.value([
        IndigenNotification(
          id: 'review-reply',
          recipientId: 'synthetic-review-member',
          kind: NotificationKind.reply,
          title: 'A member replied to your post',
          body: 'A story worth sharing. Thank you for adding it.',
          postId: 'review-post',
          actorName: 'Review member',
          createdAt: DateTime.now(),
        ),
        IndigenNotification(
          id: 'review-order',
          recipientId: 'synthetic-review-member',
          kind: NotificationKind.announcement,
          title: 'Your order is being packed',
          body: 'Order review-order · synthetic fixture',
          route: '/shop/order/review-order',
          createdAt: DateTime.now(),
        ),
      ]),
    ),
    unreadNotificationCountProvider.overrideWith((ref) => Stream.value(2)),
    placementInventoryProvider.overrideWith(
      (ref, placement) => AdPlacementInventory(
        placement: placement,
        allowed: true,
        adMobEligible: false,
        firstParty: placement == AdPlacement.post_comments
            ? [
                const ServedAd(
                  campaignId: 'review-house',
                  headline: 'Discover the collections',
                  body: 'Stories, language and work from our community.',
                  creativeUrl: '',
                  mediaType: 'image',
                  advertiserName: 'Indigen World',
                  ctaLabel: 'Explore',
                  ctaUrl: 'https://indigenworld.com',
                  placements: [AdPlacement.post_comments],
                ),
              ]
            : [],
      ),
    ),
  ],
  child: MaterialApp(
    localizationsDelegates: AppLocalizations.localizationsDelegates,
    supportedLocales: AppLocalizations.supportedLocales,
    theme: dark ? buildIndigenDarkTheme() : buildIndigenTheme(),
    builder: (context, child) => MediaQuery(
      data: MediaQuery.of(context)
          .copyWith(textScaler: TextScaler.linear(scale)),
      child: RepaintBoundary(key: captureKey, child: child!),
    ),
    home: screen,
  ),
);
Future<void> capture(WidgetTester tester, String name) async {
  await tester.runAsync(
    () => Future<void>.delayed(const Duration(milliseconds: 150)),
  );
  await tester.pump(const Duration(milliseconds: 300));
  expect(tester.takeException(), isNull);
  final boundary =
      tester.element(find.byKey(captureKey)).renderObject!
          as RenderRepaintBoundary;
  await tester.runAsync(() async {
    final image = await boundary.toImage(pixelRatio: 2),
        bytes = await image.toByteData(format: ui.ImageByteFormat.png);
    await screenshots.create(recursive: true);
    await File('${screenshots.path}/$name.png')
        .writeAsBytes(bytes!.buffer.asUint8List());
    image.dispose();
  });
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async {
    final bytes = await File(
      '../../services/functions/assets/fonts/NotoSans-Regular.ttf',
    ).readAsBytes();
    for (final family in ['Noto Sans', 'Roboto', 'Ahem']) {
      final loader = FontLoader(family)
        ..addFont(Future.value(ByteData.sublistView(bytes)));
      await loader.load();
    }
    final icons = FontLoader('MaterialIcons')
      ..addFont(rootBundle.load('fonts/MaterialIcons-Regular.otf'));
    await icons.load();
    final codec = await ui.instantiateImageCodec(
      await File('assets/places/paga-pond.jpg').readAsBytes(),
    );
    fixtureImage = (await codec.getNextFrame()).image;
    codec.dispose();
  });
  setUp(() {
    HttpOverrides.global = ImageFixtureHttp();
    for (final provider in <ImageProvider>[
      FileImage(File('assets/places/paga-pond.jpg').absolute),
      const CachedNetworkImageProvider(
        'https://review-fixture.invalid/archive.jpg',
      ),
      ResizeImage(
        const CachedNetworkImageProvider(
          'https://review-fixture.invalid/archive.jpg',
        ),
        width: 800,
      ),
    ]) {
      provider
          .obtainKey(ImageConfiguration.empty)
          .then(
            (key) => PaintingBinding.instance.imageCache.putIfAbsent(
              key,
              () => OneFrameImageStreamCompleter(
                Future.value(ImageInfo(image: fixtureImage.clone())),
              ),
            ),
          );
    }
    SharedPreferences.setMockInitialValues({});
    VisibilityDetectorController.instance.updateInterval = Duration.zero;
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(
          const MethodChannel('com.llfbandit.record/messages'),
          (call) async => null,
        );
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(
          const MethodChannel('plugins.flutter.io/path_provider'),
          (call) async => Directory.systemTemp.path,
        );
    final handler = FlutterError.onError;
    FlutterError.onError = (details) {
      if (details.exceptionAsString().contains('overflowed'))
        FlutterError.dumpErrorToConsole(details, forceReport: true);
      handler?.call(details);
    };
    addTearDown(() => FlutterError.onError = handler);
  });
  testWidgets(
    'Flutter exports its real caption raster and shared render spec',
    (tester) async {
      await tester.runAsync(() async {
        final dir = await Directory('../../data/private/mobile-render-fixture')
            .create(recursive: true);
        final layer = <String, dynamic>{
          'id': 'caption',
          'type': 'caption',
          'text': 'A story from home · Kasem ɩ ɔ ŋ',
          'x': .5,
          'y': .78,
          'fontSize': 42.0,
          'color': '#ffffff',
          'background': '#111111',
          'sourceStart': 1.0,
          'sourceEnd': 3.0,
        };
        final recorder = ui.PictureRecorder(), canvas = Canvas(recorder);
        VideoEditorRepository.paintOverlay(
          canvas,
          const Size(720, 1280),
          layer,
        );
        final picture = recorder.endRecording(),
            image = await picture.toImage(720, 1280),
            png = await image.toByteData(format: ui.ImageByteFormat.png);
        await File('${dir.path}/caption.png')
            .writeAsBytes(png!.buffer.asUint8List());
        image.dispose();
        picture.dispose();
        final project = MobileTimeline(
          id: 'review-project',
          ownerUid: 'synthetic-review-member',
          scenes: [
            {
              'id': 'scene',
              'kind': 'image',
              'mediaId': 'review-image',
              'duration': 4.0,
              'sourceIn': 0.0,
              'fit': 'cover',
              'overlays': [layer],
            },
          ],
        );
        await File('${dir.path}/spec.json').writeAsString(
          jsonEncode(
            project.renderSpec({
              'caption': 'video-projects/synthetic-review-member/review-project/layers/review-request/caption.png',
            }),
          ),
        );
      });
    },
  );
  testWidgets(
    'four shop tabs preserve state; product detail and order render at phone sizes',
    (tester) async {
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final api = ReviewShop();
      await tester.pumpWidget(harness(const ShopCollectionScreen(), api));
      await tester.pumpAndSettle();
      await capture(tester, 'shop-home');
      await tester.tap(find.text('Categories').last);
      await tester.pumpAndSettle();
      await capture(tester, 'shop-categories');
      await tester.tap(find.text('Cart').last);
      await tester.pumpAndSettle();
      await capture(tester, 'shop-cart');
      expect(find.text('Archive print · review fixture'), findsWidgets);
      await tester.tap(find.text('Profile').last);
      await tester.pumpAndSettle();
      await capture(tester, 'shop-profile');
      await tester.pumpWidget(
        harness(ShopOrderScreen(orderId: 'review-order', initial: order), api),
      );
      await tester.pumpAndSettle();
      await capture(tester, 'shop-order');
      await tester.pumpWidget(
        harness(
          ShopCheckoutScreen(
            lines: [
              {
                'productId': 'review-print',
                'variantId': 'default',
                'quantity': 1,
              },
            ],
            config: config,
          ),
          api,
        ),
      );
      await tester.pumpAndSettle();
      await capture(tester, 'shop-checkout');
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump(const Duration(seconds: 11));
    },
  );
  testWidgets(
    'notification actions, compact house placement and collection keep their own layouts',
    (tester) async {
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final api = ReviewShop();
      await tester.pumpWidget(harness(const NotificationsScreen(), api));
      await tester.pumpAndSettle();
      await capture(tester, 'notifications');
      // Rows are swiped to mark read; Like/Reply stay inline.
      expect(find.byType(Dismissible), findsWidgets);
      await tester.pumpWidget(
        harness(
          Scaffold(
            appBar: AppBar(title: const Text('Comments')),
            body: const Column(
              children: [
                CommentSponsor(threadKey: 'review-thread'),
                ListTile(
                  title: Text('Organic comment · review fixture'),
                  subtitle: Text(
                    'The first comment follows the sponsored placement.',
                  ),
                ),
              ],
            ),
          ),
          api,
        ),
      );
      await tester.pumpAndSettle();
      await capture(tester, 'comment-sponsor');
      await tester.pumpWidget(
        harness(
          PublishedCollectionScreen(
            kind: CollectionKind.literature,
            items: const AsyncData([
              PublishedReel(
                id: 'fixture-story',
                title: 'A story from home · fixture',
                creatorName: 'Review author',
                body:
                    'Synthetic reading fixture for checking collection layout.',
                category: 'Story',
              ),
            ]),
            onReload: () async {},
          ),
          api,
        ),
      );
      await tester.pumpAndSettle();
      await capture(tester, 'collection-literature');
    },
  );
  testWidgets(
    'native timeline, caption editing and high text scale have no layout overflow',
    (tester) async {
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final api = ReviewShop();
      await tester.pumpWidget(
        harness(
          MobileVideoEditor(
            sourcePath: 'fixture',
            projectId: 'review-project',
            repository: ReviewEditor(),
          ),
          api,
        ),
      );
      await tester.pumpAndSettle();
      await capture(tester, 'mobile-editor');
      await tester.tap(find.text('Captions').first);
      await tester.pumpAndSettle();
      await capture(tester, 'mobile-editor-captions');
      tester.state<NavigatorState>(find.byType(Navigator).first).pop();
      await tester.pumpAndSettle();
      await tester.pumpWidget(
        harness(const ShopCollectionScreen(), api, scale: 1.8, dark: true),
      );
      await tester.pumpAndSettle();
      await capture(tester, 'shop-large-text-dark');
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pumpAndSettle();
    },
  );
}
