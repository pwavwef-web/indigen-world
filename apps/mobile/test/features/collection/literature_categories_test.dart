import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/features/collection/literature_categories.dart';
import 'package:indigen_world_mobile/features/explore/published_content.dart';

PublishedReel _piece(String category, {List<String> tags = const []}) =>
    PublishedReel(
      id: category,
      title: 'A written piece',
      creatorName: 'Indigen World',
      category: category,
      tags: tags,
    );

void main() {
  test('the existing illustrated folktale belongs to Folktales', () {
    final data = jsonDecode(
      File('../../output/pdf/sky-folktale/publication.json').readAsStringSync(),
    ) as Map<String, dynamic>;
    final item = PublishedReel.fromMap('kasem-sky-far-away', data);
    expect(literatureCategoryFor(item).id, LiteratureCategory.folktales.id);
    expect(item.isDocument, isTrue);
    expect(item.body, isNotEmpty);
  });

  test('legacy spelling variants share one shelf', () {
    final examples = {
      ' Folktale ': LiteratureCategory.folktales,
      'folk-tales': LiteratureCategory.folktales,
      'Folklore': LiteratureCategory.folktales,
      'SHORT_STORY': LiteratureCategory.shortStories,
      'short stories': LiteratureCategory.shortStories,
      'Plays': LiteratureCategory.drama,
      'Poem': LiteratureCategory.poetry,
      'Food/cooking recipes': LiteratureCategory.recipes,
      'Cooking': LiteratureCategory.recipes,
    };
    for (final entry in examples.entries) {
      expect(literatureCategoryFor(_piece(entry.key)).id, entry.value.id);
    }
  });

  test('explicit genres win over topical tags and story text', () {
    final poem = _piece('Poetry', tags: ['recipe', 'folktale']);
    expect(literatureCategoryFor(poem).id, LiteratureCategory.poetry.id);
    const story = PublishedReel(
      id: 'story',
      title: 'Cooking with clouds',
      creatorName: 'Indigen World',
      category: 'Folktale',
      description: 'A poem and a recipe appear in this story.',
    );
    expect(literatureCategoryFor(story).id, LiteratureCategory.folktales.id);
    expect(
      literatureCategoryFor(_piece('Literature', tags: ['kasem', 'poem'])).id,
      LiteratureCategory.poetry.id,
    );
    expect(
      literatureCategoryFor(_piece('History', tags: ['food'])).id,
      'custom:history',
    );
  });

  test('primary tabs always show; extra genres appear only with work', () {
    expect(literatureCategoriesFor([]), LiteratureCategory.primary);
    final categories = literatureCategoriesFor([
      _piece('oral-history'),
      _piece('Proverb'),
      _piece('History'),
      _piece(' HISTORY '),
      _piece(''),
    ]);
    expect(categories.map((category) => category.label), [
      'All',
      'Folktales',
      'Drama',
      'Poetry',
      'Food & recipes',
      'History',
      'Oral history',
      'Proverbs & sayings',
      'Other',
    ]);
  });

  test('a blank or separator-only category never loses the piece', () {
    for (final category in ['', ' ', ' / ', '---', '_']) {
      expect(
        literatureCategoryFor(_piece(category)).id,
        LiteratureCategory.other.id,
      );
    }
  });
}
