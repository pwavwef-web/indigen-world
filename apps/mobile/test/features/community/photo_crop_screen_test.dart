import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:indigen_world_mobile/features/community/photo_crop_screen.dart';

void main() {
  testWidgets(
    'custom handles export a changed aspect ratio without changing the original',
    (tester) async {
      late Directory directory;
      late File original;
      await tester.runAsync(() async {
        directory = await Directory.systemTemp.createTemp('kasem-crop-test-');
        original = File('${directory.path}/original.png');
        await original.writeAsBytes(
          img.encodePng(img.Image(width: 200, height: 100)),
        );
      });
      addTearDown(() => directory.delete(recursive: true));
      tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
        const MethodChannel('plugins.flutter.io/path_provider'),
        (_) async => directory.path,
      );
      addTearDown(
        () => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
          const MethodChannel('plugins.flutter.io/path_provider'),
          null,
        ),
      );
      String? result;
      await tester.pumpWidget(
        MaterialApp(
          home: Builder(
            builder: (context) => Scaffold(
              body: TextButton(
                onPressed: () async =>
                    result = await cropPhoto(context, original.path),
                child: const Text('Crop'),
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.text('Crop'));
      await tester.pump();
      for (
        var attempt = 0;
        attempt < 30 && find.byType(RawImage).evaluate().isEmpty;
        attempt++
      ) {
        await tester.runAsync(() async {
          await Future<void>.delayed(const Duration(milliseconds: 100));
        });
        await tester.pump(const Duration(milliseconds: 100));
      }
      await tester.pump(const Duration(milliseconds: 400));
      expect(find.text('Custom'), findsOneWidget);
      expect(find.byKey(const Key('crop-corner-1')), findsOneWidget);
      final imageSize = tester.getSize(find.byType(RawImage));
      final before = tester.getTopLeft(find.byKey(const Key('crop-corner-1')));
      await tester.drag(
        find.byKey(const Key('crop-corner-1')),
        Offset(-imageSize.width / 3, 0),
      );
      await tester.pump();
      expect(
        tester.getTopLeft(find.byKey(const Key('crop-corner-1'))).dx,
        lessThan(before.dx - 50),
      );
      await tester.tap(find.text('Use this crop'));
      for (var attempt = 0; attempt < 150 && result == null; attempt++) {
        await tester.runAsync(() async {
          await Future<void>.delayed(const Duration(milliseconds: 100));
        });
        await tester.pump();
      }
      expect(result, isNotNull);
      expect(result, isNot(original.path));
      await tester.runAsync(() async {
        final cropped = img.decodeImage(await File(result!).readAsBytes())!;
        expect(cropped.width, inInclusiveRange(125, 145));
        expect(cropped.height, 100);
        final unchanged = img.decodeImage(await original.readAsBytes())!;
        expect(unchanged.width, 200);
        expect(unchanged.height, 100);
      });
      expect(tester.takeException(), isNull);
    },
  );
}
