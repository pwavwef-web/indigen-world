// What a link in a post turns into, and the one thing the phone and the
// backend have to agree on to make it cheap.
//
// The cache is keyed by a normalised form of the URL, computed twice — once in
// `link_preview.dart` and once in `services/functions/src/link-preview.ts`. The
// vectors below are the contract between them: if a change here moves a key,
// the same change is owed to `normaliseLinkUrl` in that TypeScript file, or
// every phone in the community starts missing a cache it should be hitting.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/app/app_theme.dart';
import 'package:indigen_world_mobile/features/community/data/community_models.dart';
import 'package:indigen_world_mobile/features/community/data/link_preview.dart';
import 'package:indigen_world_mobile/features/community/widgets/community_post_card.dart';
import 'package:indigen_world_mobile/l10n/app_localizations.dart';

const _link = 'https://example.test/harvest';

CommunityPost _post(String text, {List<CommunityMedia> media = const []}) =>
    CommunityPost(
      id: 'post-1',
      authorId: 'author-1',
      authorName: 'Ayine',
      authorUsername: 'ayine',
      text: text,
      media: media,
      likeCount: 0,
      replyCount: 0,
      createdAt: DateTime(2026, 9, 4),
    );

Future<void> _pumpPost(
  WidgetTester tester, {
  LinkPreview? preview,
  List<CommunityMedia> media = const [],
}) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        if (preview != null)
          linkPreviewProvider(_link).overrideWith((ref) async => preview),
      ],
      child: MaterialApp(
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        theme: buildIndigenTheme(),
        home: Scaffold(
          body: ListView(
            children: [
              CommunityPostCard(
                post: _post('Worth reading. $_link', media: media),
                liked: false,
                saved: false,
                onLike: () {},
                onReply: () {},
                onSave: () {},
                onOpen: () {},
                onOpenAuthor: () {},
                onMore: () {},
              ),
            ],
          ),
        ),
      ),
    ),
  );
  await tester.pump();
}

void main() {
  group('the one form of a link both ends agree on', () {
    test('a plain link keeps its shape and gains the empty path', () {
      // The backend's URL printer adds this slash; Dart's does not. Building
      // the string from parts is what stops that difference costing a cache.
      expect(normaliseLinkUrl('https://example.com'), 'https://example.com/');
    });

    test('the scheme and the host are folded to lower case', () {
      expect(
        normaliseLinkUrl('HTTPS://Example.COM/Path'),
        'https://example.com/Path',
      );
    });

    test('a default port is dropped and an unusual one is kept', () {
      expect(normaliseLinkUrl('https://example.com:443/a'), 'https://example.com/a');
      expect(
        normaliseLinkUrl('https://example.com:8443/a'),
        'https://example.com:8443/a',
      );
    });

    test('the fragment goes, because the page it names is the same page', () {
      expect(
        normaliseLinkUrl('https://example.com/a#part-two'),
        'https://example.com/a',
      );
    });

    test('the parts that describe the sharer are dropped', () {
      // One article shared twenty ways is one cached card, not twenty — and
      // the key never carries somebody's click id.
      expect(
        normaliseLinkUrl(
          'https://example.com/a?id=7&utm_source=whatsapp&fbclid=abc&page=2',
        ),
        'https://example.com/a?id=7&page=2',
      );
    });

    test('a query that was nothing but tracking leaves no question mark', () {
      expect(
        normaliseLinkUrl('https://example.com/a?utm_medium=social'),
        'https://example.com/a',
      );
    });

    test('a path that walks back on itself is the page it lands on', () {
      // The backend's parser collapses this on its own, so Dart has to as
      // well or the two never key the same document.
      expect(
        normaliseLinkUrl('https://example.com/news/../a/./b'),
        'https://example.com/a/b',
      );
    });

    test('anything that is not an ordinary web link is refused', () {
      for (final raw in [
        'javascript:alert(1)',
        'file:///etc/passwd',
        'mailto:hi@indigenworld.com',
        'not a link at all',
        // Credentials in a link are either a mistake or a trap.
        'https://user:secret@example.com/a',
      ]) {
        expect(normaliseLinkUrl(raw), isNull, reason: raw);
      }
    });
  });

  group('the document a link is cached under', () {
    // Pinned vectors. `printf '%s' <url> | sha256sum` produces the same digest,
    // and so must `linkPreviewKey` in link-preview.ts.
    test('is the sha-256 of the normalised link', () {
      expect(
        linkPreviewKey(normaliseLinkUrl('https://example.com')!),
        '0f115db062b7c0dd030b16878c99dea5c354b49dc37b38eb8846179c7783e9d7',
      );
      expect(
        linkPreviewKey(
          normaliseLinkUrl('https://WWW.bbc.co.uk/news/story?id=7&utm_source=x')!,
        ),
        '32e43d37b4ee8bbd5e80d823ca7639e002adb903a9c494d59b534fc1a67ebfb3',
      );
    });

    test('two spellings of the same link land on one document', () {
      final plain = linkPreviewKey(normaliseLinkUrl('https://example.com/a?b=1')!);
      final shared = linkPreviewKey(
        normaliseLinkUrl('HTTPS://Example.com:443/a?b=1&fbclid=zzz#top')!,
      );
      expect(shared, plain);
    });
  });

  group('what a card is drawn from', () {
    LinkPreview preview({
      String status = 'ok',
      String? title,
      String? imageUrl,
    }) => LinkPreview(
      url: _link,
      host: 'example.test',
      status: status,
      title: title,
      imageUrl: imageUrl,
    );

    test('a headline or a picture is enough to draw one', () {
      expect(preview(title: 'Harvest at Paga').isRich, isTrue);
      expect(preview(imageUrl: 'https://example.test/a.jpg').isRich, isTrue);
    });

    test('a page that said nothing is not dressed up as though it had', () {
      expect(preview().isRich, isFalse);
      expect(preview(status: 'bare', title: 'ignored').isRich, isFalse);
      expect(preview(status: 'failed', title: 'ignored').isRich, isFalse);
    });

    test('a document with no host or address is not a card', () {
      expect(LinkPreview.fromMap(null), isNull);
      expect(LinkPreview.fromMap({'host': 'example.test'}), isNull);
      expect(LinkPreview.fromMap({'url': _link}), isNull);
      expect(
        LinkPreview.fromMap({'url': _link, 'host': 'example.test'})?.status,
        'ok',
      );
    });

    test('empty strings in a document read as absent', () {
      final read = LinkPreview.fromMap({
        'url': _link,
        'host': 'example.test',
        'title': '   ',
        'description': '',
      });
      expect(read?.title, isNull);
      expect(read?.description, isNull);
      expect(read?.isRich, isFalse);
    });
  });

  group('the card a post draws', () {
    testWidgets('shows the headline and the site, not the address', (
      tester,
    ) async {
      await _pumpPost(
        tester,
        preview: const LinkPreview(
          url: _link,
          host: 'example.test',
          status: 'ok',
          title: 'Harvest drumming at Paga',
          description: 'What the season sounds like in the Upper East.',
          siteName: 'Example',
        ),
      );

      expect(find.text('Harvest drumming at Paga'), findsOneWidget);
      expect(
        find.text('What the season sounds like in the Upper East.'),
        findsOneWidget,
      );
      // The site, in capitals — the one line that says whether the headline
      // can be believed.
      expect(find.text('EXAMPLE.TEST'), findsOneWidget);
      // And the raw address is no longer handed back to the reader.
      expect(find.text(_link), findsNothing);
    });

    testWidgets('names the link it opens, not the place it was redirected to', (
      tester,
    ) async {
      // The disguise this closes: post a link to one place, redirect it to a
      // newspaper, and let the feed draw the newspaper's name over it.
      await _pumpPost(
        tester,
        preview: const LinkPreview(
          url: 'https://news.example.org/real-story',
          host: 'news.example.org',
          status: 'ok',
          title: 'A headline somebody else wrote',
        ),
      );

      // _link is example.test — which is what tapping the card opens.
      expect(find.text('EXAMPLE.TEST'), findsOneWidget);
      expect(find.text('NEWS.EXAMPLE.ORG'), findsNothing);
    });

    testWidgets('gives way to a picture the poster chose themselves', (
      tester,
    ) async {
      await _pumpPost(
        tester,
        media: const [
          CommunityMedia(url: 'https://example.test/drum.jpg', type: 'image'),
        ],
        preview: const LinkPreview(
          url: _link,
          host: 'example.test',
          status: 'ok',
          title: 'Harvest drumming at Paga',
          imageUrl: 'https://example.test/og.jpg',
        ),
      );

      // Two large pictures in one post says neither is the one that matters.
      expect(find.byType(CommunityLinkPreview), findsNothing);
      expect(find.text('Harvest drumming at Paga'), findsNothing);
      // The link is still there to tap, in the writing where it was typed.
      expect(find.textContaining(_link, findRichText: true), findsOneWidget);
    });

    testWidgets('falls back to the plain chip when nothing was read', (
      tester,
    ) async {
      // No override: Firebase is unavailable in a test, so the unfurler
      // answers null — which is also what a site that refuses to be read
      // looks like. The link must still be there.
      await _pumpPost(tester);

      expect(find.byIcon(Icons.link_rounded), findsOneWidget);
      expect(find.text('example.test'), findsOneWidget);
    });
  });
}
