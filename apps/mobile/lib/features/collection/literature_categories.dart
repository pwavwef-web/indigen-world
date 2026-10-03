import 'package:indigen_world_mobile/features/explore/published_content.dart';

/// Reading shelves derived from published metadata, without rewriting records.
class LiteratureCategory {
  const LiteratureCategory(this.id, this.label);

  final String id;
  final String label;

  static const all = LiteratureCategory('all', 'All');
  static const folktales = LiteratureCategory('folktales', 'Folktales');
  static const shortStories = LiteratureCategory(
    'short-stories',
    'Short stories',
  );
  static const drama = LiteratureCategory('drama', 'Drama');
  static const poetry = LiteratureCategory('poetry', 'Poetry');
  static const recipes = LiteratureCategory('recipes', 'Food & recipes');
  static const other = LiteratureCategory('other', 'Other');

  /// These remain discoverable even before their first piece is published.
  static const primary = [all, folktales, drama, poetry, recipes];
}

String _normalise(String value) =>
    value.trim().toLowerCase().replaceAll(RegExp(r'[-_\s/&]+'), ' ').trim();

LiteratureCategory? _knownCategory(String value) => switch (_normalise(value)) {
  'folktale' ||
  'folktales' ||
  'folk tale' ||
  'folk tales' ||
  'folklore' => LiteratureCategory.folktales,
  'short story' || 'short stories' => LiteratureCategory.shortStories,
  'drama' ||
  'play' ||
  'plays' ||
  'theatre' ||
  'theater' => LiteratureCategory.drama,
  'poetry' || 'poem' || 'poems' => LiteratureCategory.poetry,
  'recipe' ||
  'recipes' ||
  'food' ||
  'cooking' ||
  'food cooking' ||
  'food recipes' ||
  'cooking recipes' ||
  'food cooking recipes' => LiteratureCategory.recipes,
  'proverb' || 'proverbs' || 'saying' || 'sayings' || 'proverbs sayings' =>
    const LiteratureCategory('proverbs', 'Proverbs & sayings'),
  'oral history' ||
  'oral histories' => const LiteratureCategory('oral-history', 'Oral history'),
  'essay' || 'essays' => const LiteratureCategory('essays', 'Essays'),
  'novel' || 'novels' => const LiteratureCategory('novels', 'Novels'),
  'biography' ||
  'biographies' => const LiteratureCategory('biographies', 'Biographies'),
  _ => null,
};

LiteratureCategory literatureCategoryFor(PublishedReel item) {
  final known = _knownCategory(item.category);
  if (known != null) return known;

  final category = _normalise(item.category);
  // Older work can have a channel name instead of a genre. Only then use tags;
  // a poem tagged "food" must still appear under its explicit Poetry category.
  if (const [
    '',
    'literature',
    'written',
    'writing',
    'book',
    'books',
    'other',
  ].contains(category)) {
    for (final tag in item.tags) {
      final tagged = _knownCategory(tag);
      if (tagged != null) return tagged;
    }
    return LiteratureCategory.other;
  }

  // Preserve categories we do not yet know, rather than losing their work in a
  // catch-all shelf. Case, underscores and hyphens share one tab.
  final label = category
      .split(' ')
      .map((word) => '${word[0].toUpperCase()}${word.substring(1)}')
      .join(' ');
  return LiteratureCategory('custom:$category', label);
}

List<LiteratureCategory> literatureCategoriesFor(List<PublishedReel> items) {
  final categories = {
    for (final category in LiteratureCategory.primary) category.id: category,
  };
  final additional = <String, LiteratureCategory>{};
  for (final item in items) {
    final category = literatureCategoryFor(item);
    if (!categories.containsKey(category.id)) {
      additional.putIfAbsent(category.id, () => category);
    }
  }
  final sorted = additional.values.toList()
    ..sort((a, b) {
      if (a.id == b.id) return 0;
      if (a.id == LiteratureCategory.other.id) return 1;
      if (b.id == LiteratureCategory.other.id) return -1;
      return a.label.compareTo(b.label);
    });
  return [...categories.values, ...sorted];
}
