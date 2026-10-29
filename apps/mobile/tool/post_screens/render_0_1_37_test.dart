// Renders the app screens for the 0.1.37 release post — the twenty community
// upgrades.
//
//   flutter test tool/post_screens/render_0_1_37_test.dart
//
// Kept under tool/ so an ordinary `flutter test` never runs it. The screens
// are the real widgets from this release, drawn with the app's own Noto Sans
// and theme. Every post, person and conversation in them is sample data made
// up for the pictures and written in English: nothing here is presented as
// Kasem, and nothing is anybody's real post.

// Run as a tool, not a test of the app: test-only seams are the point.
// ignore_for_file: invalid_use_of_visible_for_testing_member

import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/app/app_theme.dart';
import 'package:indigen_world_mobile/features/community/chat_screen.dart';
import 'package:indigen_world_mobile/features/community/community_profile_screen.dart';
import 'package:indigen_world_mobile/features/community/compose_post_screen.dart';
import 'package:indigen_world_mobile/features/community/data/chat_providers.dart';
import 'package:indigen_world_mobile/features/community/data/chat_repository.dart';
import 'package:indigen_world_mobile/features/community/data/community_local_prefs.dart';
import 'package:indigen_world_mobile/features/community/data/community_models.dart';
import 'package:indigen_world_mobile/features/community/data/community_providers.dart';
import 'package:indigen_world_mobile/features/community/data/community_space_providers.dart';
import 'package:indigen_world_mobile/features/community/data/event_reminders.dart';
import 'package:indigen_world_mobile/features/community/data/post_category.dart';
import 'package:indigen_world_mobile/features/community/data/post_event.dart';
import 'package:indigen_world_mobile/features/community/data/saved_drafts.dart';
import 'package:indigen_world_mobile/features/community/drafts_screen.dart';
import 'package:indigen_world_mobile/features/community/post_detail_screen.dart';
import 'package:indigen_world_mobile/features/community/topic_feed_screen.dart';
import 'package:indigen_world_mobile/features/community/widgets/post_picture_sheet.dart';
import 'package:indigen_world_mobile/features/settings/privacy_controls_screen.dart';
import 'package:indigen_world_mobile/l10n/app_localizations.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../test/features/community/community_test_harness.dart';

const _out =
    '../updates-blog/posts/2026-10-29-twenty-community-upgrades/screens';
const _shot = ValueKey('post-shot');

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
    // The profile banner's ornament is a dingbat Noto Sans lacks; a phone
    // finds it in a system font, and so does the picture.
    textTheme: base.textTheme.apply(
      fontFamily: family,
      fontFamilyFallback: const ['Segoe UI Symbol'],
    ),
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
    inputDecorationTheme: base.inputDecorationTheme.copyWith(
      hintStyle: named(base.inputDecorationTheme.hintStyle),
    ),
    popupMenuTheme: base.popupMenuTheme.copyWith(
      textStyle: named(base.popupMenuTheme.textStyle),
    ),
  );
}

// ── Sample people and posts ──────────────────────────────────────────────────

final _me = fakeProfile(
  uid: 'me',
  username: 'akua_writes',
  displayName: 'Akua Mensah',
  bio: 'Learning with my grandmother.',
  location: 'Accra',
  dialect: '',
);
final _ama = fakeProfile(
  uid: 'ama',
  username: 'ama_navrongo',
  displayName: 'Ama Atia',
  bio: 'Teacher in Navrongo. I collect old songs and the stories behind them.',
  location: 'Navrongo',
  dialect: '',
  phoneVerified: true,
);
final _kofi = fakeProfile(
  uid: 'kofi',
  username: 'kofi_drums',
  displayName: 'Kofi Ayine',
  bio: 'Drummer.',
  location: 'Paga',
  dialect: '',
);
final _esi = fakeProfile(
  uid: 'esi',
  username: 'esi_paga',
  displayName: 'Esi Azure',
  bio: '',
  location: 'Paga',
  dialect: '',
);

DateTime _ago(Duration duration) => DateTime.now().subtract(duration);

CommunityPost _post(
  String id,
  CommunityProfile author,
  String text, {
  PostCategory? category,
  PostEvent? event,
  String? parentId,
  int likes = 0,
  int replies = 0,
  Duration age = const Duration(hours: 2),
}) => fakePost(
  id: id,
  authorId: author.uid,
  authorName: author.displayName,
  authorUsername: author.username,
  text: text,
  category: category,
  event: event,
  parentId: parentId,
  likeCount: likes,
  replyCount: replies,
  createdAt: _ago(age),
  authorPhoneVerified: author.phoneVerified,
);

final _questions = [
  _post(
    'q1',
    _ama,
    'Which songs did your grandparents sing at harvest? I am collecting '
        'them for the school, with who sang them and where.',
    category: PostCategory.question,
    likes: 14,
    replies: 6,
    age: const Duration(minutes: 40),
  ),
  _post(
    'q2',
    _kofi,
    'Does anyone have a recording of the old market drum calls? Even a '
        'phone recording would help.',
    category: PostCategory.question,
    likes: 8,
    replies: 3,
    age: const Duration(hours: 3),
  ),
  _post(
    'q3',
    _esi,
    'What is the best way to start learning as an adult? I understand a '
        'little but I cannot answer back yet.',
    category: PostCategory.question,
    likes: 21,
    replies: 11,
    age: const Duration(hours: 9),
  ),
];

DateTime _at(int days, int hour, [int minute = 0]) {
  final day = DateTime.now().add(Duration(days: days));
  return DateTime(day.year, day.month, day.day, hour, minute);
}

final _events = [
  _post(
    'e1',
    _ama,
    'Harvest songs evening at the school. Bring the songs your family '
        'sings — we will record them for the collection.',
    category: PostCategory.event,
    event: PostEvent(
      startsAt: _at(3, 16, 30),
      place: 'Navrongo Primary School',
    ),
    likes: 32,
    replies: 9,
    age: const Duration(hours: 5),
  ),
  _post(
    'e2',
    _kofi,
    'Drumming lesson for beginners. Drums provided, just come.',
    category: PostCategory.event,
    event: PostEvent(startsAt: _at(1, 9), place: 'Paga community centre'),
    likes: 12,
    replies: 4,
    age: const Duration(hours: 20),
  ),
];

final _threadRoot = _post(
  'root',
  _ama,
  'Which songs did your grandparents sing at harvest? I am collecting them '
      'for the school, with who sang them and where.',
  category: PostCategory.question,
  likes: 14,
  replies: 3,
  age: const Duration(hours: 4),
);
final _threadReplies = [
  _post(
    'r1',
    _kofi,
    'My grandfather sang one every evening of the harvest. I can ask my '
        'uncle to sing it for you.',
    parentId: 'root',
    likes: 3,
    age: const Duration(hours: 3, minutes: 30),
  ),
  _post(
    'r2',
    _ama,
    'Thank you all. I will put every song in the collection with the name '
        'of the family who shared it.',
    parentId: 'root',
    likes: 18,
    age: const Duration(hours: 2),
  ),
  _post(
    'r3',
    _esi,
    'Ours was a call and answer song. I will record my mother this weekend.',
    parentId: 'root',
    likes: 7,
    age: const Duration(hours: 1),
  ),
];

final _profilePosts = [
  _post(
    'pinned',
    _ama,
    'Start here: I collect harvest songs and the stories behind them. If '
        'your family has one, reply or message me.',
    likes: 46,
    replies: 12,
    age: const Duration(days: 20),
  ),
  ..._events.where((post) => post.authorId == 'ama'),
  _post(
    'p2',
    _ama,
    'Twelve songs recorded so far. Thank you to every family that sang.',
    likes: 29,
    replies: 5,
    age: const Duration(days: 2),
  ),
];

class _TopOrder extends ReplyOrderController {
  @override
  ReplyOrder build() => ReplyOrder.top;
}

// ── Harness ──────────────────────────────────────────────────────────────────

Future<void> _pumpShot(
  WidgetTester tester,
  Widget screen, {
  required FakeCommunityRepository repository,
  List<Override> overrides = const [],
  required String name,
}) async {
  await tester.pumpWidget(
    ProviderScope(
      key: ValueKey(name),
      overrides: [
        communityRepositoryProvider.overrideWithValue(repository),
        currentUidProvider.overrideWithValue(_me.uid),
        currentDisplayNameProvider.overrideWithValue(_me.displayName),
        currentPhotoUrlProvider.overrideWithValue(null),
        myCommunityProfileProvider.overrideWith(
          (ref) => Stream<CommunityProfile?>.value(_me),
        ),
        communitySpaceRepositoryProvider.overrideWithValue(null),
        ...overrides,
      ],
      child: MaterialApp(
        debugShowCheckedModeBanner: false,
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        locale: const Locale('en'),
        theme: _patched(buildIndigenTheme()),
        builder: (context, child) => RepaintBoundary(key: _shot, child: child!),
        home: screen,
      ),
    ),
  );
  await _settle(tester);
}

/// Lets streams arrive and animations land.
Future<void> _settle(WidgetTester tester) async {
  for (var round = 0; round < 8; round++) {
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 120)),
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
    // FlutterTest is the face a style with no family falls to under test —
    // a button that sets its own text style, for one — and it draws boxes.
    for (final (family, files) in [
      ('Noto Sans', ['NotoSans-Regular.ttf', 'NotoSans-Bold.ttf']),
      ('Roboto', ['NotoSans-Regular.ttf', 'NotoSans-Bold.ttf']),
      ('FlutterTest', ['NotoSans-Regular.ttf', 'NotoSans-Bold.ttf']),
    ]) {
      final loader = FontLoader(family);
      for (final file in files) {
        loader.addFont(
          File('assets/fonts/$file').readAsBytes().then(ByteData.sublistView),
        );
      }
      await loader.load();
    }
    final symbols = File('C:/Windows/Fonts/seguisym.ttf');
    if (symbols.existsSync()) {
      final loader = FontLoader('Segoe UI Symbol')
        ..addFont(symbols.readAsBytes().then(ByteData.sublistView));
      await loader.load();
    }
    final icons = FontLoader('MaterialIcons')
      ..addFont(rootBundle.load('fonts/MaterialIcons-Regular.otf'));
    await icons.load();
  });

  setUp(() async {
    final temp = await Directory.systemTemp.createTemp('post-shots');
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
      ..setMockMethodCallHandler(
        const MethodChannel('plugins.flutter.io/path_provider'),
        (call) async => temp.path,
      )
      // The composer holds a voice recorder; nothing is recorded here.
      ..setMockMethodCallHandler(
        const MethodChannel('com.llfbandit.record/messages'),
        (call) async => null,
      );
  });

  void phone(WidgetTester tester) {
    tester.view
      ..physicalSize = const Size(1170, 2532)
      ..devicePixelRatio = 3
      ..padding = const FakeViewPadding(top: 141, bottom: 60)
      ..viewPadding = const FakeViewPadding(top: 141, bottom: 60);
    addTearDown(tester.view.reset);
  }

  final everyone = [_me, _ama, _kofi, _esi];

  testWidgets('a topic page: Questions', (tester) async {
    phone(tester);
    SharedPreferences.setMockInitialValues({});
    await _pumpShot(
      tester,
      const TopicFeedScreen(category: PostCategory.question),
      name: 'topic',
      repository: FakeCommunityRepository(
        profiles: everyone,
        posts: [..._questions, ..._events],
      ),
    );
    await _capture(tester, 'topic');
  });

  testWidgets('events with a date, a place and a reminder', (tester) async {
    phone(tester);
    SharedPreferences.setMockInitialValues({});
    await _pumpShot(
      tester,
      const TopicFeedScreen(category: PostCategory.event),
      name: 'events',
      repository: FakeCommunityRepository(
        profiles: everyone,
        posts: [..._questions, ..._events],
      ),
      overrides: [eventRemindersProvider.overrideWith(_OneReminder.new)],
    );
    await _capture(tester, 'events');
  });

  testWidgets('composing an event', (tester) async {
    phone(tester);
    SharedPreferences.setMockInitialValues({});
    await _pumpShot(
      tester,
      ComposePostScreen(
        initialText:
            'Harvest songs evening at the school. Bring the songs your '
            'family sings — we will record them for the collection.',
        initialCategory: PostCategory.event,
        initialEvent: PostEvent(
          startsAt: _at(3, 16, 30),
          place: 'Navrongo Primary School',
        ),
      ),
      name: 'compose-event',
      repository: FakeCommunityRepository(profiles: everyone),
    );
    FocusManager.instance.primaryFocus?.unfocus();
    await _settle(tester);
    await _capture(tester, 'compose-event');
  });

  testWidgets('a conversation: the author marked, most appreciated first', (
    tester,
  ) async {
    phone(tester);
    SharedPreferences.setMockInitialValues({});
    await _pumpShot(
      tester,
      const PostDetailScreen(postId: 'root'),
      name: 'thread',
      repository: FakeCommunityRepository(
        profiles: everyone,
        posts: [_threadRoot, ..._threadReplies],
      ),
      overrides: [replyOrderProvider.overrideWith(_TopOrder.new)],
    );
    await tester.drag(find.byType(ListView).first, const Offset(0, -260));
    await _settle(tester);
    await _capture(tester, 'thread');
  });

  testWidgets('a profile: pinned post, Follows you, people in common', (
    tester,
  ) async {
    phone(tester);
    SharedPreferences.setMockInitialValues({});
    final ama = CommunityProfile(
      uid: _ama.uid,
      username: _ama.username,
      displayName: _ama.displayName,
      bio: _ama.bio,
      location: _ama.location,
      phoneVerified: true,
      pinnedPostId: 'pinned',
    );
    await _pumpShot(
      tester,
      const CommunityProfileScreen(uid: 'ama'),
      name: 'profile',
      repository: FakeCommunityRepository(
        profiles: [_me, ama, _kofi, _esi],
        posts: _profilePosts,
        following: const ['kofi', 'esi'],
        followsMe: const {'ama'},
      ),
      overrides: [
        followersYouKnowProvider.overrideWith(
          (ref, uid) async => (named: [_kofi, _esi], total: 5),
        ),
      ],
    );
    await _capture(tester, 'profile');
  });

  testWidgets('share as a picture', (tester) async {
    phone(tester);
    SharedPreferences.setMockInitialValues({});
    await _pumpShot(
      tester,
      Builder(
        builder: (context) => Scaffold(
          appBar: AppBar(title: const Text('Conversation')),
          body: Center(
            child: FilledButton(
              onPressed: () => showPostPictureSheet(context, _events.first),
              child: const Text('open'),
            ),
          ),
        ),
      ),
      name: 'picture',
      repository: FakeCommunityRepository(profiles: everyone),
    );
    await tester.tap(find.text('open'));
    await _settle(tester);
    await _capture(tester, 'picture');
  });

  testWidgets('a post sent in a message', (tester) async {
    phone(tester);
    SharedPreferences.setMockInitialValues({});
    final today = DateTime.now();
    DateTime at(int hour, int minute) =>
        DateTime(today.year, today.month, today.day, hour, minute);
    final messages = [
      ChatMessage(
        id: 'm3',
        senderId: 'esi',
        text: 'Yes! My mother knows two of these. Can we come?',
        createdAt: at(18, 40),
      ),
      ChatMessage(
        id: 'm2',
        senderId: 'me',
        text:
            'This is the evening I told you about\n'
            'https://indigenworld.com/post/e1',
        createdAt: at(18, 31),
      ),
      ChatMessage(
        id: 'm1',
        senderId: 'esi',
        text: 'Is anyone recording the old harvest songs?',
        createdAt: at(18, 12),
      ),
    ];
    await _pumpShot(
      tester,
      const ChatScreen(
        threadId: 'esi_me',
        otherUid: 'esi',
        otherName: 'Esi Azure',
      ),
      name: 'chat-post',
      repository: FakeCommunityRepository(profiles: everyone, posts: _events),
      overrides: [
        chatRepositoryProvider.overrideWithValue(null),
        chatMessagesProvider.overrideWith(
          (ref, threadId) => Stream.value(messages),
        ),
        chatThreadLiveProvider.overrideWith(
          (ref, threadId) => Stream.value(
            ChatThread(
              id: 'esi_me',
              other: const ChatParticipant(
                uid: 'esi',
                displayName: 'Esi Azure',
                username: 'esi_paga',
              ),
              unreadCount: 0,
              otherReadAt: at(18, 41),
            ),
          ),
        ),
      ],
    );
    await _capture(tester, 'chat-post');
  });

  testWidgets('muted words in Settings', (tester) async {
    phone(tester);
    SharedPreferences.setMockInitialValues({
      '${mutedWordsKeyPrefix}me': ['spoilers', 'football transfer', 'giveaway'],
    });
    await _pumpShot(
      tester,
      const PrivacyControlsScreen(),
      name: 'muted-words',
      repository: FakeCommunityRepository(profiles: everyone),
      overrides: [
        myBlockedProfilesProvider.overrideWith(
          (ref) => Stream.value(const <String>{}),
        ),
        myMutedProfilesProvider.overrideWith(
          (ref) => Stream.value(const <String>{}),
        ),
      ],
    );
    await _capture(tester, 'muted-words');
  });

  testWidgets('drafts, saved on this phone', (tester) async {
    phone(tester);
    SharedPreferences.setMockInitialValues({});
    await _pumpShot(
      tester,
      const DraftsScreen(),
      name: 'drafts',
      repository: FakeCommunityRepository(profiles: everyone),
      overrides: [savedDraftsProvider.overrideWith(_SampleDrafts.new)],
    );
    await _capture(tester, 'drafts');
  });
}

class _OneReminder extends EventRemindersController {
  @override
  Map<String, EventReminder> build() => {
    'e1': EventReminder(
      postId: 'e1',
      title: 'Harvest songs evening',
      startsAt: _events.first.event!.startsAt,
    ),
  };
}

class _SampleDrafts extends SavedDraftsController {
  @override
  List<SavedDraft> build() => [
    SavedDraft(
      id: 'd1',
      text:
          'Thank you to everyone who came to the harvest evening. The '
          'recordings will be in the collection by',
      savedAt: DateTime.now().subtract(const Duration(minutes: 20)),
      category: PostCategory.update,
    ),
    SavedDraft(
      id: 'd2',
      text: 'A question for the elders about the names of the months',
      savedAt: DateTime.now().subtract(const Duration(hours: 5)),
      category: PostCategory.question,
    ),
    SavedDraft(
      id: 'd3',
      text: 'Drumming lesson, second week',
      savedAt: DateTime.now().subtract(const Duration(days: 2)),
      category: PostCategory.event,
      event: PostEvent(startsAt: _at(8, 9), place: 'Paga community centre'),
    ),
  ];
}
