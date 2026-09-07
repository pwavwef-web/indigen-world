// Who is allowed a link the community can tap.
//
// ── What these tests are actually protecting ──────────────────────────────
// Scams travel on links, and a link only works on somebody if it can be
// tapped. The rule is therefore not "unverified accounts may not post links" —
// a ban pushes the same scammer into spelling the address out in words, which
// no pattern can see and every reader can still follow — but "an unverified
// account's links are shown and dead". Two things have to hold for that to
// mean anything:
//
//   * The composer and the reader have to agree about what a link *is*. They
//     used to disagree — the reader linkified only `https?://` while nothing
//     gated anything — and the gap was exactly the move worth making: post
//     `wa.me/233…` and it renders as ordinary text a reader types by hand.
//   * A masked link has to look dead and say why. A control that looks live
//     and does nothing reads as a broken app, and teaches the reader nothing.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/app/app_theme.dart';
import 'package:indigen_world_mobile/features/community/data/community_links.dart';
import 'package:indigen_world_mobile/features/community/widgets/post_text.dart';
import 'package:indigen_world_mobile/l10n/app_localizations.dart';

Future<void> _pumpBody(
  WidgetTester tester,
  String text, {
  required bool linksEnabled,
  ValueChanged<String>? onOpenLink,
}) async {
  await tester.pumpWidget(
    ProviderScope(
      child: MaterialApp(
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        theme: buildIndigenTheme(),
        home: Scaffold(
          body: PostText(
            text: text,
            onOpenHandle: null,
            onOpenLink: onOpenLink,
            linksEnabled: linksEnabled,
          ),
        ),
      ),
    ),
  );
  await tester.pump();
}

void main() {
  group('what counts as a link', () {
    test('a full address, with or without its scheme', () {
      expect(containsCommunityLink('read this https://example.com/a'), isTrue);
      expect(containsCommunityLink('read this http://example.com'), isTrue);
      expect(containsCommunityLink('read this www.example.com'), isTrue);
    });

    test('a bare host with an ending people actually get sent to', () {
      // The three shapes a scam takes in this community, none of which the
      // old `https?://`-only reader could see at all.
      expect(containsCommunityLink('message me on wa.me/233200000000'), isTrue);
      expect(containsCommunityLink('join t.me/somechannel'), isTrue);
      expect(containsCommunityLink('claim it at bit.ly/abc'), isTrue);
    });

    test('an ordinary sentence with a full stop in it is not a link', () {
      // The cost of the looser rule, and why the ending list is short: a reader
      // shown a warning on ordinary writing stops reading warnings.
      expect(containsCommunityLink('Ko gara. Ba de zaanem.'), isFalse);
      expect(containsCommunityLink('two things.three things'), isFalse);
      expect(containsCommunityLink('N na wo.Ko gara'), isFalse);
    });

    test('the sentence’s full stop is not part of the address', () {
      // A preview fetched for `example.com.` is a preview of nothing.
      expect(firstCommunityLink('go to example.com.'), 'example.com');
      expect(
        firstCommunityLink('see https://example.com/a, then go'),
        'https://example.com/a',
      );
    });

    test('a post with nothing in it has nothing to gate', () {
      expect(containsCommunityLink(''), isFalse);
      expect(firstCommunityLink('Ko gara'), isNull);
    });
  });

  group('what a reader sees', () {
    testWidgets('a verified account’s link is live', (tester) async {
      final opened = <String>[];
      await _pumpBody(
        tester,
        'Worth reading https://example.com/a',
        linksEnabled: true,
        onOpenLink: opened.add,
      );

      expect(find.textContaining('not tappable', findRichText: true), findsNothing);
      await tester.tapOnText(find.textRange.ofSubstring('https://example.com/a'));
      expect(opened, ['https://example.com/a']);
    });

    testWidgets('an unverified account’s link is shown and dead', (
      tester,
    ) async {
      // Shown, not blanked. Hiding the address makes the post unintelligible —
      // "click here to claim" with a gap reads as a rendering bug — and leaves
      // the reader with no way to judge what they are being kept from.
      final opened = <String>[];
      await _pumpBody(
        tester,
        'Worth reading https://example.com/a',
        linksEnabled: false,
        onOpenLink: opened.add,
      );

      expect(
        find.textContaining('https://example.com/a', findRichText: true),
        findsOneWidget,
      );
      await tester.tapOnText(find.textRange.ofSubstring('https://example.com/a'));
      expect(opened, isEmpty);
    });

    testWidgets('the reason is said once, under the post', (tester) async {
      // Once. Three masked links in one post is one situation, and three
      // copies of the same sentence is the app shouting.
      await _pumpBody(
        tester,
        'a.com and b.com and https://c.com',
        linksEnabled: false,
      );

      expect(find.text(kMaskedLinkNotice), findsOneWidget);
    });

    testWidgets('a post with no link says nothing about links', (tester) async {
      await _pumpBody(tester, 'Ko gara, de zaanem.', linksEnabled: false);
      expect(find.text(kMaskedLinkNotice), findsNothing);
    });

    testWidgets('a bare host is masked too, not only a full address', (
      tester,
    ) async {
      // THE test. The composer gates on this pattern and the reader draws on
      // it; if the two ever diverge, the shape that slips through is exactly
      // the shape somebody chose because it slips through.
      await _pumpBody(
        tester,
        'message me on wa.me/233200000000',
        linksEnabled: false,
      );
      expect(find.text(kMaskedLinkNotice), findsOneWidget);
    });

    testWidgets('a mention is still a mention beside a masked link', (
      tester,
    ) async {
      // The two share one pass over the text, so a capture group added to the
      // link half would silently shift the handle's index and turn every
      // mention into a link.
      final handles = <String>[];
      await tester.pumpWidget(
        ProviderScope(
          child: MaterialApp(
            localizationsDelegates: AppLocalizations.localizationsDelegates,
            supportedLocales: AppLocalizations.supportedLocales,
            theme: buildIndigenTheme(),
            home: Scaffold(
              body: PostText(
                text: '@nyaaba look at https://example.com/a',
                onOpenHandle: handles.add,
                linksEnabled: false,
              ),
            ),
          ),
        ),
      );
      await tester.pump();

      await tester.tapOnText(find.textRange.ofSubstring('@nyaaba'));
      expect(handles, ['nyaaba']);
    });
  });
}
