import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/features/explore/explore_search.dart';
import 'package:indigen_world_mobile/features/explore/reel_view.dart';

Reel _reel({
  required String id,
  String title = '',
  String creator = '',
  String caption = '',
  String label = '',
  String sound = '',
  bool isLive = true,
}) => Reel(
  id: id,
  imageUrl: '',
  label: label,
  title: title,
  creator: creator,
  initials: 'XX',
  caption: caption,
  sound: sound,
  credit: '',
  isLive: isLive,
);

void main() {
  group('searchReels', () {
    final drumming = _reel(
      id: 'a',
      title: 'Every rhythm remembers',
      creator: '@afi.dances',
      caption: 'The drum calls everyone home.',
      label: 'REEL · NORTHERN GHANA',
    );
    final weaving = _reel(
      id: 'b',
      title: 'What we wear can speak',
      creator: '@heritage',
      caption: 'Colour and memory, carried on.',
      label: 'STORY · CAPE COAST',
    );

    test('an empty query matches nothing rather than everything', () {
      expect(searchReels([drumming, weaving], '   '), isEmpty);
    });

    test('matches across the title, the creator and the caption', () {
      expect(searchReels([drumming, weaving], 'drum').map((reel) => reel.id), [
        'a',
      ]);
      expect(
        searchReels([drumming, weaving], 'heritage').map((reel) => reel.id),
        ['b'],
      );
    });

    test('is case-insensitive', () {
      expect(searchReels([drumming, weaving], 'RHYTHM'), hasLength(1));
    });

    test('every word has to land somewhere', () {
      // "rhythm" is in the first reel and "colour" in the second, so a query
      // asking for both belongs to neither.
      expect(searchReels([drumming, weaving], 'rhythm colour'), isEmpty);
      expect(searchReels([drumming, weaving], 'rhythm drum'), hasLength(1));
    });

    test('a title match outranks one buried in the caption', () {
      final titled = _reel(id: 'titled', title: 'Kasem songs');
      final captioned = _reel(id: 'captioned', caption: 'sung in Kasem');
      expect(searchReels([captioned, titled], 'kasem').map((reel) => reel.id), [
        'titled',
        'captioned',
      ]);
    });

    test('a live reel outranks the curated preview on an equal match', () {
      final live = _reel(id: 'live', title: 'Kasem songs');
      final preview = _reel(id: 'preview', title: 'Kasem songs', isLive: false);
      expect(searchReels([preview, live], 'kasem').map((reel) => reel.id), [
        'live',
        'preview',
      ]);
    });
  });

  group('trendingTerms', () {
    test('reads the eyebrow and tidies it back into words', () {
      final terms = trendingTerms([
        _reel(id: 'a', label: 'STORY REEL · CAPE COAST'),
        _reel(id: 'b', label: 'STORY REEL · NAVRONGO'),
      ]);
      expect(terms, contains('Story Reel'));
      expect(terms, contains('Cape Coast'));
      // The most common fragment leads.
      expect(terms.first, 'Story Reel');
    });

    test('ignores the curated preview, which nobody means to search for', () {
      expect(
        trendingTerms([
          _reel(id: 'a', label: 'REEL PREVIEW · SOMEWHERE', isLive: false),
        ]),
        isEmpty,
      );
    });

    test('drops fragments too short or too long to be a search term', () {
      expect(
        trendingTerms([
          _reel(
            id: 'a',
            label:
                'AB · A CATEGORY NAME FAR TOO LONG TO TYPE INTO A SEARCH FIELD',
          ),
        ]),
        isEmpty,
      );
    });
  });
}
