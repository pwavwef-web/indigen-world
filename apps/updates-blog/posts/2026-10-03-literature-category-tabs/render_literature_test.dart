// Run from apps/mobile with the repository's pinned Flutter SDK:
// flutter test ../updates-blog/posts/2026-10-03-literature-category-tabs/render_literature_test.dart
import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/app/app_theme.dart';
import 'package:indigen_world_mobile/features/collection/collection_data.dart';
import 'package:indigen_world_mobile/features/collection/collection_detail_screens.dart';
import 'package:indigen_world_mobile/features/explore/published_content.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  testWidgets('render literature tabs with the existing local folktale', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final previousOverrides = HttpOverrides.current;
    HttpOverrides.global = null;
    addTearDown(() => HttpOverrides.global = previousOverrides);
    final cacheDirectory = Directory('../../.tooling/literature-render-cache')
      ..createSync(recursive: true);
    const pathProviderChannel = MethodChannel(
      'plugins.flutter.io/path_provider',
    );
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
      pathProviderChannel,
      (_) async => cacheDirectory.absolute.path,
    );
    addTearDown(
      () => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
        pathProviderChannel,
        null,
      ),
    );

    // Test rendering uses Ahem by default. Supply a readable local font under
    // the app's family name; this does not change the production application.
    final fontFile = File('C:/Windows/Fonts/segoeui.ttf');
    if (fontFile.existsSync()) {
      for (final family in ['Noto Sans', 'Roboto']) {
        final loader = FontLoader(family);
        loader.addFont(
          Future.value(ByteData.sublistView(fontFile.readAsBytesSync())),
        );
        await loader.load();
      }
    }
    final icons = FontLoader('MaterialIcons')
      ..addFont(rootBundle.load('fonts/MaterialIcons-Regular.otf'));
    await icons.load();

    final source = jsonDecode(
      File('../../output/pdf/sky-folktale/publication.json').readAsStringSync(),
    ) as Map<String, dynamic>;
    final cover = File('../../output/pdf/sky-folktale/cover.jpg')
        .readAsBytesSync();
    final server = (await tester.runAsync(
      () => HttpServer.bind(InternetAddress.loopbackIPv4, 0),
    ))!;
    server.listen((request) async {
      request.response.headers.contentType = ContentType('image', 'jpeg');
      request.response.add(cover);
      await request.response.close();
    });
    addTearDown(() => server.close(force: true));
    source['thumbnailUrl'] = 'http://127.0.0.1:${server.port}/cover.jpg';
    final item = PublishedReel.fromMap('kasem-sky-far-away', source);
    final theme = buildIndigenTheme();
    // The app's custom AppBar/button styles leave their font family unset.
    // Give those labels the same render font instead of the test-only Ahem.
    ButtonStyle? renderButtonStyle(ButtonStyle? style) => style?.copyWith(
      textStyle: WidgetStatePropertyAll(
        style.textStyle?.resolve({})?.copyWith(fontFamily: 'Noto Sans'),
      ),
    );
    final renderTheme = theme.copyWith(
      appBarTheme: theme.appBarTheme.copyWith(
        titleTextStyle: theme.appBarTheme.titleTextStyle?.copyWith(
          fontFamily: 'Noto Sans',
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: renderButtonStyle(theme.filledButtonTheme.style),
      ),
      textButtonTheme: TextButtonThemeData(
        style: renderButtonStyle(theme.textButtonTheme.style),
      ),
    );
    const boundaryKey = Key('literature-release-screen');
    await tester.pumpWidget(
      ProviderScope(
        child: RepaintBoundary(
          key: boundaryKey,
          child: MaterialApp(
            debugShowCheckedModeBanner: false,
            theme: renderTheme,
            home: const Scaffold(),
            initialRoute: '/literature',
            routes: {
              '/literature': (_) => PublishedCollectionScreen(
                kind: CollectionKind.literature,
                items: AsyncData([item]),
                onReload: () async {},
              ),
            },
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    for (var attempt = 0; attempt < 50; attempt++) {
      await tester.runAsync(
        () => Future<void>.delayed(const Duration(milliseconds: 100)),
      );
      await tester.pump(const Duration(milliseconds: 100));
      if (find.byType(RawImage).evaluate().isNotEmpty) break;
    }
    await tester.pumpAndSettle();

    final output = Directory(
      '../updates-blog/posts/2026-10-03-literature-category-tabs/images',
    )..createSync(recursive: true);
    Future<void> capture(String filename) async {
      final boundary = tester.renderObject<RenderRepaintBoundary>(
        find.byKey(boundaryKey),
      );
      final image = (await tester.runAsync(
        () => boundary.toImage(pixelRatio: 2),
      ))!;
      final bytes = (await tester.runAsync(
        () => image.toByteData(format: ui.ImageByteFormat.png),
      ))!;
      File('${output.path}/$filename')
          .writeAsBytesSync(bytes.buffer.asUint8List());
      image.dispose();
    }

    Future<void> select(String id) async {
      final tab = find.byKey(ValueKey('literature-tab-$id'));
      await Scrollable.ensureVisible(
        tester.element(tab),
        alignmentPolicy: ScrollPositionAlignmentPolicy.keepVisibleAtEnd,
      );
      await tester.pumpAndSettle();
      await tester.tap(tab);
      await tester.pumpAndSettle();
    }

    await select('folktales');
    expect(find.text(item.title), findsOneWidget);
    expect(find.byType(RawImage), findsWidgets);
    expect(
      tester.widget<RawImage>(find.byType(RawImage).first).image,
      isNotNull,
    );
    await capture('literature-folktales.png');
    await select('recipes');
    expect(find.text('No food & recipes published yet'), findsOneWidget);
    await capture('literature-recipes-empty.png');
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
    // Let the cache cleanup and local HTTP connection idle timers finish.
    await tester.pump(const Duration(seconds: 20));
  });
}
