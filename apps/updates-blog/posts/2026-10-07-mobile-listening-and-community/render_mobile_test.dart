// Run from apps/mobile. These are previews with labelled test data, not a live release.
import 'dart:io';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:indigen_world_mobile/app/app_theme.dart';
import 'package:indigen_world_mobile/core/brand_themes.dart';
import 'package:indigen_world_mobile/data/local/app_database.dart';
import 'package:indigen_world_mobile/features/community/community_screen.dart';
import 'package:indigen_world_mobile/features/community/compose_post_screen.dart';
import 'package:indigen_world_mobile/features/community/data/community_space_models.dart';
import 'package:indigen_world_mobile/features/downloads/data/downloads_providers.dart';
import 'package:indigen_world_mobile/features/downloads/downloads_screen.dart';
import 'package:indigen_world_mobile/features/settings/contact_support_screen.dart';
import 'package:indigen_world_mobile/l10n/app_localizations.dart';
import '../../../mobile/test/features/community/community_test_harness.dart';

void main() {
  testWidgets('render implemented Black, community, tags and downloads screens', (tester) async {
    SharedPreferences.setMockInitialValues({});
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(const MethodChannel('com.llfbandit.record/messages'), (call) async => null);
    tester.view.physicalSize = const Size(390,844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    for (final family in ['Noto Sans','Roboto']) {
      final loader = FontLoader(family)..addFont(Future.value(ByteData.sublistView(File('C:/Windows/Fonts/segoeui.ttf').readAsBytesSync())));
      await loader.load();
    }
    await (FontLoader('MaterialIcons')..addFont(rootBundle.load('fonts/MaterialIcons-Regular.otf'))).load();
    final original = buildBrandTheme(BrandThemes.black, Brightness.dark);
    ButtonStyle? button(ButtonStyle? style) => style?.copyWith(textStyle: WidgetStatePropertyAll(style.textStyle?.resolve({})?.copyWith(fontFamily:'Noto Sans')));
    final theme = original.copyWith(
      appBarTheme:original.appBarTheme.copyWith(titleTextStyle:original.appBarTheme.titleTextStyle?.copyWith(fontFamily:'Noto Sans')),
      filledButtonTheme:FilledButtonThemeData(style:button(original.filledButtonTheme.style)),
      outlinedButtonTheme:OutlinedButtonThemeData(style:button(original.outlinedButtonTheme.style)),
      textButtonTheme:TextButtonThemeData(style:button(original.textButtonTheme.style)));
    const key = Key('release-preview');
    final output = Directory('../updates-blog/posts/2026-10-07-mobile-listening-and-community/images')..createSync(recursive:true);
    Future<void> capture(String name) async {
      await tester.pumpAndSettle();
      final boundary = tester.renderObject<RenderRepaintBoundary>(find.byKey(key));
      final image = (await tester.runAsync(() => boundary.toImage(pixelRatio:2)))!;
      final data = (await tester.runAsync(() => image.toByteData(format:ui.ImageByteFormat.png)))!;
      File('${output.path}/$name').writeAsBytesSync(data.buffer.asUint8List());
      image.dispose();
      expect(tester.takeException(), isNull);
    }
    Widget app(Widget child) => RepaintBoundary(key:key, child:MaterialApp(debugShowCheckedModeBanner:false, theme:theme, localizationsDelegates:AppLocalizations.localizationsDelegates, supportedLocales:AppLocalizations.supportedLocales, home:const Scaffold(), initialRoute:'/preview', routes:{'/preview':(_)=>child}));
    await tester.pumpWidget(app(const ContactSupportScreen()));
    await capture('black-support.png');
    final profile = fakeProfile();
    final circle = fakeCommunity();
    final spaces = FakeCommunitySpaceRepository(communities:[circle],memberships:[const CommunityMembership(communityId:'kasem-circle',uid:'amina-uid',role:CommunityRole.member,status:MembershipStatus.active)]);
    final repository = FakeCommunityRepository(profiles:[profile],posts:[fakePost(text:'Test preview: share a word, story or question with your community.')]);
    await tester.pumpWidget(RepaintBoundary(key:key,child:communityHarness(repository:repository,profile:profile,spaces:spaces,theme:theme,child:const CommunityScreen())));
    await capture('community-feeds.png');
    await tester.tap(find.text('Make a post'));
    await tester.pumpAndSettle();
    expect(find.byType(ComposePostScreen),findsOneWidget);
    await tester.tap(find.text('Tag: Choose a tag'));
    await capture('searchable-tags.png');
    final row = DownloadedTrackRecord(trackId:'preview-song',title:'Sample downloaded song',artist:'Test collection',album:'Music · preview data',artworkUrl:null,kind:'music',sourceUrl:'https://example.invalid/song.mp3',fileName:'preview.mp3',sizeBytes:4096,downloadedAt:DateTime(2026,10,7));
    await tester.pumpWidget(ProviderScope(overrides:[downloadsProvider.overrideWith((ref)=>Stream.value([row])),playableDownloadsProvider.overrideWith((ref)async=>{'preview-song':'file:///preview.mp3'}),downloadedArtworkProvider.overrideWith((ref)async=>{}),downloadsSizeProvider.overrideWith((ref)async=>4096),downloadLimitProvider.overrideWithValue(20)],child:app(const DownloadsScreen())));
    await capture('downloads-listening.png');
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump(const Duration(seconds:1));
  });
}
