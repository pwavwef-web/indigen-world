// How the Home shelves decide what they hold.

import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/features/explore/published_content.dart';
import 'package:indigen_world_mobile/features/music/music_library.dart';

PublishedReel _song(String id, {String? published, String category = ''}) =>
    PublishedReel(
      id: id,
      title: 'Song $id',
      creatorName: 'Awuni Atia',
      mediaUrl: 'https://example.test/$id.mp3',
      mediaType: 'audio',
      publishedAt: published,
      category: category,
    );

void main() {
  group('newestFirst', () {
    test('orders by publication, newest first', () {
      final ordered = newestFirst([
        _song('old', published: '2026-01-02T00:00:00Z'),
        _song('new', published: '2026-09-20T00:00:00Z'),
        _song('mid', published: '2026-05-01T00:00:00Z'),
      ]);
      expect(ordered.map((song) => song.id), ['new', 'mid', 'old']);
    });

    test('an undated record is unknown, not old — it keeps its place '
        'behind the dated ones', () {
      final ordered = newestFirst([
        _song('undated-a'),
        _song('dated', published: '2026-03-01T00:00:00Z'),
        _song('undated-b'),
      ]);
      expect(ordered.map((song) => song.id), [
        'dated',
        'undated-a',
        'undated-b',
      ]);
    });
  });

  group('musicCategories', () {
    test('only kinds with enough pieces, fullest first', () {
      final categories = musicCategories([
        _song('1', category: 'Harvest'),
        _song('2', category: 'harvest '),
        _song('3', category: 'Harvest'),
        _song('4', category: 'Funeral'),
        _song('5', category: 'Funeral'),
        _song('6', category: 'Lullaby'),
        _song('7'),
      ]);
      expect(categories.map((category) => category.name), [
        'Harvest',
        'Funeral',
      ]);
      // Spelled three ways, filed once.
      expect(categories.first.tracks, hasLength(3));
    });

    test('one kind alone is not a browse grid', () {
      expect(
        musicCategories([
          _song('1', category: 'Harvest'),
          _song('2', category: 'Harvest'),
          _song('3', category: 'Lullaby'),
        ]),
        isEmpty,
      );
    });
  });
}
