import 'package:flutter/material.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/community/data/post_category.dart';
import 'package:indigen_world_mobile/l10n/app_localizations.dart';

/// How a post category is drawn: a colour for the rail and the label, an icon,
/// and the words.
///
/// The colours are the category's own rather than palette roles. The palette
/// has one blue family for accent, eyebrows and reshare, and six categories
/// drawn in three shades of it would be a legend nobody can read.
/// Every value clears 4.5:1 against its own ground, because the label is text.
extension PostCategoryStyle on PostCategory {
  Color colorOn(BrandPalette brand) => switch (this) {
    PostCategory.question => brand.pick(
      const Color(0xFF2149B8),
      const Color(0xFF8EB4FF),
    ),
    PostCategory.language => brand.pick(
      const Color(0xFF0E7490),
      const Color(0xFF67E8F9),
    ),
    PostCategory.culture => brand.pick(
      const Color(0xFFA24E30),
      const Color(0xFFCE7D60),
    ),
    PostCategory.music => brand.pick(
      const Color(0xFF6B3FA0),
      const Color(0xFFB9A3E3),
    ),
    PostCategory.story => brand.pick(
      const Color(0xFF8A5C00),
      const Color(0xFFD3AB53),
    ),
    PostCategory.announcement => brand.pick(
      const Color(0xFFA12A2A),
      const Color(0xFFE0685F),
    ),
  };

  IconData get icon => switch (this) {
    PostCategory.question => Icons.help_outline_rounded,
    PostCategory.language => Icons.translate_rounded,
    PostCategory.culture => Icons.diversity_3_rounded,
    PostCategory.music => Icons.music_note_rounded,
    PostCategory.story => Icons.auto_stories_outlined,
    PostCategory.announcement => Icons.campaign_outlined,
  };

  String label(AppLocalizations l10n) => switch (this) {
    PostCategory.question => l10n.postCategoryQuestion,
    PostCategory.language => l10n.postCategoryLanguage,
    PostCategory.culture => l10n.postCategoryCulture,
    PostCategory.music => l10n.postCategoryMusic,
    PostCategory.story => l10n.postCategoryStory,
    PostCategory.announcement => l10n.postCategoryAnnouncement,
  };
}

/// The small label under a byline: an icon and a word in the category colour.
class PostCategoryLabel extends StatelessWidget {
  const PostCategoryLabel({required this.category, super.key});

  final PostCategory category;

  @override
  Widget build(BuildContext context) {
    final color = category.colorOn(context.brand);
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(category.icon, size: 13, color: color),
        const SizedBox(width: 4),
        Flexible(
          child: Text(
            category.label(AppLocalizations.of(context)),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              color: color,
              fontSize: 12,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.1,
            ),
          ),
        ),
      ],
    );
  }
}
