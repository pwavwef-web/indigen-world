import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/app/app_theme.dart';
import 'package:indigen_world_mobile/features/collection/blogs/blog_feed.dart';
import 'package:indigen_world_mobile/features/collection/collection_data.dart';
import 'package:indigen_world_mobile/features/collection/collection_detail_screens.dart';
import 'package:indigen_world_mobile/features/collection/literature_categories.dart';
import 'package:indigen_world_mobile/features/collection/literature_screen.dart';
import 'package:indigen_world_mobile/features/explore/published_content.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _folktale = PublishedReel(
  id: 'kasem-sky-far-away',
  title: 'Kolo ŋwane kunkwanu tem na ye yiga yiga to',
  creatorName: 'Indigen World',
  mediaType: 'document',
  category: 'Folktale',
  body: 'The written folktale.',
);

PublishedReel _piece(String id, String category, {String writer = 'Test'}) =>
    PublishedReel(
      id: id,
      title: id,
      creatorName: writer,
      category: category,
      body: 'Written work.',
    );

Widget _page(
  AsyncValue<List<PublishedReel>> items, {
  LiteratureCategory? category,
  TextScaler textScaler = TextScaler.noScaling,
  CollectionKind kind = CollectionKind.literature,
}) => ProviderScope(
  child: MaterialApp(
    theme: buildIndigenTheme(),
    builder: (context, child) => MediaQuery(
      data: MediaQuery.of(context).copyWith(textScaler: textScaler),
      child: child!,
    ),
    home: PublishedCollectionScreen(
      kind: kind,
      items: items,
      category: category,
      onReload: () async {},
    ),
  ),
);

Widget _channel(List<PublishedReel> items) => ProviderScope(
  overrides: [
    literatureCollectionProvider.overrideWith((ref) => Stream.value(items)),
  ],
  child: MaterialApp(
    theme: buildIndigenTheme(),
    home: const LiteratureScreen(),
  ),
);

const _poetry = LiteratureCategory.poetry;

/// Takes the tree away and runs out the timers a visible card leaves behind
/// (qualified-exposure counting waits a moment before it records a view).
Future<void> _finish(WidgetTester tester) async {
  await tester.pumpWidget(const SizedBox.shrink());
  await tester.pump(const Duration(seconds: 2));
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  testWidgets('the library shows everything and opens a piece', (tester) async {
    await tester.pumpWidget(_page(const AsyncData([_folktale])));
    await tester.pumpAndSettle();
    // The genre strip that used to scroll along the top is gone.
    expect(find.byType(TabBar), findsNothing);
    expect(find.text(_folktale.title), findsOneWidget);

    await tester.ensureVisible(find.text(_folktale.title));
    await tester.pumpAndSettle();
    await tester.tap(find.text(_folktale.title));
    await tester.pumpAndSettle();
    expect(find.byType(CollectionItemDetailScreen), findsOneWidget);
    expect(tester.takeException(), isNull);
    await _finish(tester);
  });

  testWidgets('an empty genre says so and offers the way back', (tester) async {
    await tester.pumpWidget(
      _page(const AsyncData([_folktale]), category: _poetry),
    );
    await tester.pumpAndSettle();
    expect(find.text(_folktale.title), findsNothing);
    expect(find.text('No poetry published yet'), findsOneWidget);
    expect(find.text('View all literature'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('each genre page holds only its genre, and search stays in it', (
    tester,
  ) async {
    final items = [
      _folktale,
      _piece('Market morning', 'Short story'),
      _piece('A family play', 'Drama'),
      _piece('Rain poem', 'Poetry'),
      _piece('Millet porridge', 'Cooking recipes'),
      _piece('An elder remembers', 'oral-history'),
    ];
    final cases = {
      LiteratureCategory.shortStories: 'Market morning',
      LiteratureCategory.drama: 'A family play',
      LiteratureCategory.poetry: 'Rain poem',
      LiteratureCategory.recipes: 'Millet porridge',
      literatureCategoryFor(items.last): 'An elder remembers',
    };
    for (final entry in cases.entries) {
      await tester.pumpWidget(
        _page(AsyncData(items), category: entry.key),
        duration: Duration.zero,
      );
      await tester.pumpAndSettle();
      expect(find.text(entry.value), findsOneWidget, reason: entry.key.id);
      expect(find.text(_folktale.title), findsNothing);
      await _finish(tester);
    }

    await tester.pumpWidget(_page(AsyncData(items), category: _poetry));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const Key('published-collection-search')),
      'Millet',
    );
    await tester.pumpAndSettle();
    expect(find.text('No matches in Poetry'), findsOneWidget);
    expect(find.text('Millet porridge'), findsNothing);
    expect(tester.takeException(), isNull);
    await _finish(tester);
  });

  testWidgets('the channel puts Library, Genres, Writers and Blogs on a rail', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(800, 2400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(
      _channel([
        _folktale,
        _piece('Rain poem', 'Poetry', writer: 'Akua'),
        _piece('Dry season', 'Poetry', writer: 'Akua'),
      ]),
    );
    await tester.pumpAndSettle();
    for (final label in ['Library', 'Genres', 'Writers', 'Blogs']) {
      expect(find.text(label), findsWidgets, reason: label);
    }

    await tester.tap(find.text('Genres').last);
    await tester.pumpAndSettle();
    expect(
      find.byKey(const ValueKey('literature-genre-folktales')),
      findsOneWidget,
    );
    // Primary genres stay discoverable before their first piece.
    expect(
      find.byKey(const ValueKey('literature-genre-recipes')),
      findsOneWidget,
    );
    expect(find.text('2 pieces'), findsOneWidget);
    expect(find.text('Nothing yet'), findsWidgets);

    await tester.tap(find.byKey(const ValueKey('literature-genre-poetry')));
    await tester.pumpAndSettle();
    expect(find.text('Rain poem'), findsOneWidget);
    expect(find.text('Dry season'), findsOneWidget);
    expect(find.text(_folktale.title), findsNothing);
    await tester.pageBack();
    await tester.pumpAndSettle();

    await tester.tap(find.text('Writers').last);
    await tester.pumpAndSettle();
    expect(find.text('Akua'), findsOneWidget);
    expect(find.textContaining('2 pieces'), findsOneWidget);
    expect(tester.takeException(), isNull);
    await _finish(tester);
  });

  testWidgets('genre pages fit a narrow screen with large text', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(320, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(
      _page(
        const AsyncData([_folktale]),
        category: LiteratureCategory.recipes,
        textScaler: const TextScaler.linear(2),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('No food & recipes published yet'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('loading and errors never claim zero pieces', (tester) async {
    await tester.pumpWidget(_page(const AsyncLoading()));
    await tester.pump();
    expect(find.textContaining('0 pieces'), findsNothing);
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
    await tester.pumpWidget(
      _page(AsyncError(Exception('Offline'), StackTrace.empty)),
    );
    await tester.pumpAndSettle();
    expect(find.text('Try again'), findsOneWidget);
    expect(find.textContaining('0 pieces'), findsNothing);
  });

  testWidgets('other channels keep their existing layout', (tester) async {
    await tester.pumpWidget(
      _page(const AsyncData([]), kind: CollectionKind.video),
    );
    await tester.pumpAndSettle();
    expect(find.byType(AppBar), findsOneWidget);
    expect(
      find.text('Video is ready for its first published piece'),
      findsOneWidget,
    );
  });

  group('blog feed', () {
    String feed(List<Map<String, Object?>> entries, {int total = 2}) =>
        jsonEncode({
          'feed': {
            r'openSearch$totalResults': {r'$t': '$total'},
            'entry': entries,
          },
        });
    Map<String, Object?> entry(String slug, {String host = kBlogHost}) => {
      'id': {r'$t': 'tag:blogger.com,1999:post-$slug'},
      'title': {r'$t': 'Post $slug'},
      'published': {r'$t': '2026-10-15T16:43:37.126-07:00'},
      'content': {
        r'$t':
            '<p>First <strong>line</strong> of $slug.</p><figure><img src="https://example.test/a.png" alt="x"><figcaption>Caption</figcaption></figure>',
      },
      'category': [
        {'term': 'Community'},
      ],
      r'media$thumbnail': {
        'url': 'https://blogger.googleusercontent.com/img/b/x/s72-c/cover.png',
      },
      'link': [
        {'rel': 'alternate', 'href': 'https://$host/2026/10/$slug.html'},
      ],
    };

    test('reads posts, covers, labels and paging', () {
      final page = BlogFeedRepository.parseFeed(
        feed([entry('one'), entry('two')], total: 46),
      );
      expect(page.posts, hasLength(2));
      expect(page.hasMore, isTrue);
      final post = page.posts.first;
      expect(post.title, 'Post one');
      expect(post.labels, ['Community']);
      expect(post.excerpt, 'First line of one.');
      expect(post.url.host, kBlogHost);
      expect(
        post.coverAt(800, height: 450),
        'https://blogger.googleusercontent.com/img/b/x/w800-h450-c/cover.png',
      );
    });

    test('ignores entries that point anywhere but the blog', () {
      final page = BlogFeedRepository.parseFeed(
        feed([entry('one'), entry('bad', host: 'evil.test')]),
      );
      expect(page.posts.map((p) => p.title), ['Post one']);
    });

    test('a cached copy round-trips', () {
      final post = BlogFeedRepository.parseFeed(feed([entry('one')]))
          .posts
          .single;
      final back = BlogPost.fromCache(
        jsonDecode(jsonEncode(post.toJson())) as Map<String, dynamic>,
      );
      expect(back?.title, post.title);
      expect(back?.html, post.html);
    });
  });
}
