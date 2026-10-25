// Renders the app screens for the 0.1.36 release post.
//
//   POST_DATA=<post_data.json> flutter test tool/post_screens/render_0_1_36_test.dart
//
// Kept under tool/ so an ordinary `flutter test` never runs it. The screens
// are the real widgets, drawn with the app's own Noto Sans and theme, fed
// with published records (songs, a folktale, dictionary words) read from the
// public collections into POST_DATA beforehand. Conversations and the people
// in the privacy list are sample data made up for the pictures.

// Run as a tool, not a test of the app: test-only seams are the point.
// ignore_for_file: invalid_use_of_visible_for_testing_member

import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:audio_service/audio_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_cache_manager/flutter_cache_manager.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/app/app_theme.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/data/repositories.dart';
import 'package:indigen_world_mobile/domain/dictionary_entry.dart';
import 'package:indigen_world_mobile/features/ads/collection_ads.dart';
import 'package:indigen_world_mobile/features/ads/data/ad_campaign.dart';
import 'package:indigen_world_mobile/features/ads/data/served_ad.dart';
import 'package:indigen_world_mobile/features/collection/collection_data.dart';
import 'package:indigen_world_mobile/features/collection/collection_detail_screens.dart';
import 'package:indigen_world_mobile/features/collection/reading_preferences.dart';
import 'package:indigen_world_mobile/features/community/chat_screen.dart';
import 'package:indigen_world_mobile/features/community/data/chat_providers.dart';
import 'package:indigen_world_mobile/features/community/data/chat_repository.dart';
import 'package:indigen_world_mobile/features/community/data/community_models.dart';
import 'package:indigen_world_mobile/features/community/data/community_providers.dart';
import 'package:indigen_world_mobile/features/dictionary/dictionary_screen.dart';
import 'package:indigen_world_mobile/features/dictionary/recent_lookups.dart';
import 'package:indigen_world_mobile/features/downloads/data/downloads_providers.dart';
import 'package:indigen_world_mobile/features/explore/published_content.dart';
import 'package:indigen_world_mobile/features/kawuri/kawuri_media_models.dart';
import 'package:indigen_world_mobile/features/kawuri/kawuri_media_repository.dart';
import 'package:indigen_world_mobile/features/learn/learn_calendar.dart';
import 'package:indigen_world_mobile/features/learn/practice/practice_decks.dart';
import 'package:indigen_world_mobile/features/learn/practice/review_words_screen.dart';
import 'package:indigen_world_mobile/features/music/music_controller.dart';
import 'package:indigen_world_mobile/features/music/music_library.dart';
import 'package:indigen_world_mobile/features/music/music_library_tab.dart';
import 'package:indigen_world_mobile/features/music/music_likes.dart';
import 'package:indigen_world_mobile/features/music/music_providers.dart';
import 'package:indigen_world_mobile/features/music/music_recent.dart';
import 'package:indigen_world_mobile/features/music/music_sleep_timer.dart';
import 'package:indigen_world_mobile/features/music/now_playing_screen.dart';
import 'package:indigen_world_mobile/features/settings/privacy_controls_screen.dart';
import 'package:indigen_world_mobile/l10n/app_localizations.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _out = '../updates-blog/posts/2026-10-25-twenty-upgrades/screens';
const _shot = ValueKey('post-shot');

late Map<String, dynamic> _data;
late List<PublishedReel> _songs;
late PublishedReel _folktale;
late List<DictionaryEntry> _words;

PublishedReel _reel(Map<String, dynamic> raw) => PublishedReel(
  id: raw['id'] as String,
  title: raw['title'] as String,
  creatorName: raw['creatorName'] as String,
  mediaUrl: raw['mediaUrl'] as String,
  mediaType: raw['mediaType'] as String,
  thumbnailUrl: (raw['thumbnailUrl'] as String).isEmpty
      ? null
      : raw['thumbnailUrl'] as String,
  category: raw['category'] as String,
  body: raw['body'] as String,
  englishSummary: raw['englishSummary'] as String,
  description: raw['description'] as String,
  culturalNotes: raw['culturalNotes'] as String,
  licenceDisplay: raw['licenceDisplay'] as String,
);

/// The app's theme with a family named everywhere the test fonts would
/// otherwise draw bars — see the render-check notes.
ThemeData _patched(ThemeData base) {
  const family = 'Noto Sans';
  TextStyle? named(TextStyle? style) =>
      (style ?? const TextStyle()).copyWith(fontFamily: family);
  ButtonStyle? styled(ButtonStyle? style) =>
      (style ?? const ButtonStyle()).copyWith(
        textStyle: WidgetStatePropertyAll(
          named(style?.textStyle?.resolve(const {})),
        ),
      );
  return base.copyWith(
    textTheme: base.textTheme.apply(fontFamily: family),
    primaryTextTheme: base.primaryTextTheme.apply(fontFamily: family),
    appBarTheme: base.appBarTheme.copyWith(
      titleTextStyle: named(base.appBarTheme.titleTextStyle)?.copyWith(
        fontSize: 20,
        fontWeight: FontWeight.w800,
        color: base.colorScheme.onSurface,
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: styled(base.filledButtonTheme.style),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: styled(base.outlinedButtonTheme.style),
    ),
    textButtonTheme: TextButtonThemeData(
      style: styled(base.textButtonTheme.style),
    ),
    listTileTheme: base.listTileTheme.copyWith(
      titleTextStyle: named(base.listTileTheme.titleTextStyle)
          ?.copyWith(fontSize: 15.5, color: base.colorScheme.onSurface),
      subtitleTextStyle: named(base.listTileTheme.subtitleTextStyle)
          ?.copyWith(fontSize: 13, color: base.colorScheme.onSurfaceVariant),
    ),
    chipTheme: base.chipTheme.copyWith(
      labelStyle: named(base.chipTheme.labelStyle),
    ),
    segmentedButtonTheme: SegmentedButtonThemeData(
      style: styled(base.segmentedButtonTheme.style),
    ),
    popupMenuTheme: base.popupMenuTheme.copyWith(
      textStyle: named(base.popupMenuTheme.textStyle),
    ),
  );
}

Future<void> _pumpShot(
  WidgetTester tester,
  Widget screen, {
  List<Override> overrides = const [],
  required String name,
}) async {
  await tester.pumpWidget(
    ProviderScope(
      key: ValueKey(name),
      overrides: [
        collectionInventoryProvider.overrideWithValue(
          const AdPlacementInventory(
            placement: AdPlacement.collection,
            allowed: false,
            adMobEligible: false,
            firstParty: [],
          ),
        ),
        downloadsProvider.overrideWith((ref) => Stream.value(const [])),
        musicOfflineIdsProvider.overrideWithValue(const <String>{}),
        ...overrides,
      ],
      child: MaterialApp(
        debugShowCheckedModeBanner: false,
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        theme: _patched(buildIndigenTheme()),
        builder: (context, child) => RepaintBoundary(key: _shot, child: child!),
        home: screen,
      ),
    ),
  );
  await _settle(tester);
}

/// Lets images decode and animations land.
Future<void> _settle(WidgetTester tester) async {
  for (var round = 0; round < 10; round++) {
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 250)),
    );
    await tester.pump(const Duration(milliseconds: 300));
  }
}

Future<void> _capture(WidgetTester tester, String name) async {
  final boundary =
      tester.element(find.byKey(_shot)).renderObject! as RenderRepaintBoundary;
  await tester.runAsync(() async {
    final image = await boundary.toImage(pixelRatio: 3);
    final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
    await Directory(_out).create(recursive: true);
    await File('$_out/$name.png').writeAsBytes(bytes!.buffer.asUint8List());
    image.dispose();
  });
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUpAll(() async {
    _data = jsonDecode(
      await File(Platform.environment['POST_DATA']!).readAsString(),
    ) as Map<String, dynamic>;
    _songs = [
      for (final raw in (_data['songs'] as List).cast<Map<String, dynamic>>())
        _reel(raw),
    ];
    _folktale = _reel(
      (_data['literature'] as List).cast<Map<String, dynamic>>().first,
    );
    _words = [
      for (final raw
          in (_data['dictionary'] as List).cast<Map<String, dynamic>>())
        ?dictionaryEntryFromData(
          raw['id'] as String,
          (raw['data'] as Map).cast<String, dynamic>(),
        ),
    ]..sort((a, b) => a.sortKey.compareTo(b.sortKey));

    for (final (family, files) in [
      ('Noto Sans', ['NotoSans-Regular.ttf', 'NotoSans-Bold.ttf']),
      ('Roboto', ['NotoSans-Regular.ttf', 'NotoSans-Bold.ttf']),
    ]) {
      final loader = FontLoader(family);
      for (final file in files) {
        loader.addFont(
          File('assets/fonts/$file').readAsBytes().then(ByteData.sublistView),
        );
      }
      await loader.load();
    }
    final icons = FontLoader('MaterialIcons')
      ..addFont(rootBundle.load('fonts/MaterialIcons-Regular.otf'));
    await icons.load();
  });

  setUp(() async {
    learnClock = () => DateTime(2026, 10, 25, 18, 40);
    final temp = await Directory.systemTemp.createTemp('post-shots');
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(
          const MethodChannel('plugins.flutter.io/path_provider'),
          (call) async => temp.path,
        );
  });
  tearDown(() => learnClock = DateTime.now);

  Future<void> cacheArtwork(WidgetTester tester) async {
    await tester.runAsync(() async {
      for (final raw in [
        ...(_data['songs'] as List).cast<Map<String, dynamic>>(),
        ...(_data['literature'] as List).cast<Map<String, dynamic>>(),
      ]) {
        final file = raw['thumbnailFile'] as String?;
        if (file == null) continue;
        await DefaultCacheManager().putFile(
          raw['thumbnailUrl'] as String,
          await File(file).readAsBytes(),
        );
      }
    });
  }

  void phone(WidgetTester tester) {
    tester.view
      ..physicalSize = const Size(1170, 2532)
      ..devicePixelRatio = 3
      ..padding = const FakeViewPadding(top: 141, bottom: 60)
      ..viewPadding = const FakeViewPadding(top: 141, bottom: 60);
    addTearDown(tester.view.reset);
  }

  PublishedReel song(String id) => _songs.firstWhere((item) => item.id == id);

  testWidgets('now playing: liked, a sleep timer running', (tester) async {
    phone(tester);
    final counting = song('fp-counting-in-kasem-song');
    SharedPreferences.setMockInitialValues({
      musicLikedPreferenceKey: [counting.id],
    });
    await cacheArtwork(tester);
    await _pumpShot(
      tester,
      const NowPlayingScreen(),
      name: 'now-playing',
      overrides: [
        musicMediaItemProvider.overrideWith(
          (ref) => Stream.value(
            MediaItem(
              id: counting.id,
              title: counting.title,
              artist: counting.creatorName,
              album: counting.category,
              artUri: Uri.parse(counting.thumbnailUrl!),
              duration: const Duration(minutes: 2, seconds: 48),
            ),
          ),
        ),
        musicIsPlayingProvider.overrideWithValue(true),
        musicHasQueueProvider.overrideWithValue(true),
        musicPlaybackStateProvider.overrideWith(
          (ref) => Stream.value(PlaybackState(playing: true)),
        ),
        musicControllerProvider.overrideWith(_ShotController.new),
        musicSleepTimerProvider.overrideWith(_ShotSleep.new),
        musicCollectionProvider.overrideWith((ref) => Stream.value(_songs)),
        audiobookCollectionProvider.overrideWith(
          (ref) => Stream.value(const <PublishedReel>[]),
        ),
      ],
    );
    await _capture(tester, 'now-playing');
  });

  testWidgets('music library: liked songs first', (tester) async {
    phone(tester);
    SharedPreferences.setMockInitialValues({
      musicLikedPreferenceKey: [
        'fp-counting-in-kasem-song',
        'fp-de-n-lei-song',
      ],
      musicRecentPreferenceKey: ['pub_I4CxOEERgVg36hUL3hWU'],
    });
    await cacheArtwork(tester);
    final overrides = [
      musicHasQueueProvider.overrideWithValue(true),
      musicCollectionProvider.overrideWith((ref) => Stream.value(_songs)),
      audiobookCollectionProvider.overrideWith(
        (ref) => Stream.value(const <PublishedReel>[]),
      ),
    ];
    await _pumpShot(
      tester,
      Builder(
        builder: (context) => Scaffold(
          backgroundColor: context.brand.background,
          body: MusicLibraryTab(
            kind: CollectionKind.music,
            accent: context.brand.accent,
          ),
        ),
      ),
      name: 'music-library',
      overrides: overrides,
    );
    await _settle(tester);
    await _capture(tester, 'music-library');

    // And the song menu, held open on the second liked song.
    await tester.longPress(find.text(song('fp-de-n-lei-song').title).first);
    await _settle(tester);
    await _capture(tester, 'song-menu');
  });

  testWidgets('dictionary: recent lookups under the empty box', (tester) async {
    phone(tester);
    final recent = [
      for (final headword in ['kunkwolo', 'diim', 'asibiti', 'Zamese', 'Nu'])
        _words.firstWhere((word) => word.headword == headword).id,
    ];
    SharedPreferences.setMockInitialValues({
      recentLookupsPreferenceKey: recent,
    });
    await _pumpShot(
      tester,
      const DictionaryScreen(),
      name: 'dictionary-recent',
      overrides: [
        publishedDictionaryEntriesProvider.overrideWith(
          (ref) => Stream.value(_words),
        ),
        collectionAdsProvider.overrideWithValue(const []),
        savedDictionaryEntryIdsProvider.overrideWith((ref) async => <String>{}),
      ],
    );
    await _capture(tester, 'dictionary-recent');
  });

  testWidgets('review: English first', (tester) async {
    phone(tester);
    SharedPreferences.setMockInitialValues({
      reviewDirectionPreferenceKey: ReviewDirection.englishFirst.name,
    });
    final deck = [
      for (final headword in ['kunkwolo', 'diim', 'Nu'])
        _words.firstWhere((word) => word.headword == headword),
    ];
    await _pumpShot(
      tester,
      const ReviewWordsScreen(),
      name: 'review-english-first',
      overrides: [
        publishedDictionaryEntriesProvider.overrideWith(
          (ref) => Stream.value(deck),
        ),
        savedDictionaryEntryIdsProvider.overrideWith(
          (ref) async => {deck.first.id},
        ),
        kawuriCapabilitiesProvider.overrideWith(
          (ref) async => KawuriCapabilities.none,
        ),
      ],
    );
    await _capture(tester, 'review-english-first');
  });

  testWidgets('a conversation: a quoted reply, the day, and Seen', (
    tester,
  ) async {
    phone(tester);
    SharedPreferences.setMockInitialValues({});
    final today = DateTime.now();
    DateTime at(int hour, int minute) =>
        DateTime(today.year, today.month, today.day, hour, minute);
    final yesterday = today.subtract(const Duration(days: 1));
    final messages = [
      ChatMessage(
        id: 'm5',
        senderId: 'me',
        text: 'Yes — I will bring the recorder for the songs.',
        createdAt: at(18, 31),
        replyTo: const ChatReplyRef(
          messageId: 'm4',
          senderId: 'sample',
          excerpt: 'Can you record my grandmother singing on Saturday?',
        ),
      ),
      ChatMessage(
        id: 'm4',
        senderId: 'sample',
        text: 'Can you record my grandmother singing on Saturday?',
        createdAt: at(18, 24),
      ),
      ChatMessage(
        id: 'm3',
        senderId: 'sample',
        text: 'Thank you for the word list. I learned five today.',
        createdAt: at(9, 2),
      ),
      ChatMessage(
        id: 'm2',
        senderId: 'me',
        text: 'Here is the list from the dictionary, the one with recordings.',
        createdAt: DateTime(yesterday.year, yesterday.month, yesterday.day, 20),
      ),
      ChatMessage(
        id: 'm1',
        senderId: 'sample',
        text: 'Do you have the words for the market?',
        createdAt: DateTime(
          yesterday.year,
          yesterday.month,
          yesterday.day,
          19,
          40,
        ),
      ),
    ];
    await _pumpShot(
      tester,
      const ChatScreen(
        threadId: 'me_sample',
        otherUid: 'sample',
        otherName: 'Abena',
      ),
      name: 'chat',
      overrides: [
        currentUidProvider.overrideWithValue('me'),
        chatRepositoryProvider.overrideWithValue(null),
        chatMessagesProvider.overrideWith(
          (ref, threadId) => Stream.value(messages),
        ),
        chatThreadLiveProvider.overrideWith(
          (ref, threadId) => Stream.value(
            ChatThread(
              id: 'me_sample',
              other: const ChatParticipant(
                uid: 'sample',
                displayName: 'Abena',
                username: 'sample',
              ),
              unreadCount: 0,
              otherReadAt: at(18, 33),
            ),
          ),
        ),
        communityProfileProvider.overrideWith((ref, uid) => Stream.value(null)),
      ],
    );
    await _capture(tester, 'chat');
  });

  testWidgets('privacy: blocked and muted, with the way back', (tester) async {
    phone(tester);
    SharedPreferences.setMockInitialValues({});
    CommunityProfile person(String uid, String name) =>
        CommunityProfile(uid: uid, username: uid, displayName: name);
    await _pumpShot(
      tester,
      const PrivacyControlsScreen(),
      name: 'privacy',
      overrides: [
        currentUidProvider.overrideWithValue('me'),
        myBlockedProfilesProvider.overrideWith(
          (ref) => Stream.value({'sample_one'}),
        ),
        myMutedProfilesProvider.overrideWith(
          (ref) => Stream.value({'sample_two', 'sample_three'}),
        ),
        communityProfileProvider.overrideWith(
          (ref, uid) => Stream.value(switch (uid) {
            'sample_one' => person(uid, 'Member A'),
            'sample_two' => person(uid, 'Member B'),
            _ => person(uid, 'Member C'),
          }),
        ),
      ],
    );
    await _capture(tester, 'privacy');
  });

  testWidgets('reading: a folktale at a larger size', (tester) async {
    phone(tester);
    SharedPreferences.setMockInitialValues({readingScalePreferenceKey: 1.3});
    await cacheArtwork(tester);
    await _pumpShot(
      tester,
      CollectionItemDetailScreen(
        item: _folktale,
        kind: CollectionKind.literature,
      ),
      name: 'reading',
    );
    await tester.drag(find.byType(ListView).first, const Offset(0, -430));
    await _settle(tester);
    await _capture(tester, 'reading');
  });
}

class _ShotController extends MusicController {
  @override
  MusicSessionState build() =>
      const MusicSessionState(queueKind: CollectionKind.music);
}

class _ShotSleep extends MusicSleepTimerController {
  @override
  MusicSleepTimer? build() => MusicSleepTimer.at(
    DateTime.now().add(const Duration(minutes: 12, seconds: 5)),
  );
}
