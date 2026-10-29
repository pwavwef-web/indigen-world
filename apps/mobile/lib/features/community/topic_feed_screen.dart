import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/community/data/community_providers.dart';
import 'package:indigen_world_mobile/features/community/data/post_category.dart';
import 'package:indigen_world_mobile/features/community/widgets/people_widgets.dart';
import 'package:indigen_world_mobile/features/community/widgets/post_category_style.dart';
import 'package:indigen_world_mobile/features/community/widgets/standard_post_card.dart';
import 'package:indigen_world_mobile/l10n/app_localizations.dart';

/// Opens the page for [category] — what tapping a post's label does.
Future<void> openTopicFeed(BuildContext context, PostCategory category) =>
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (context) => TopicFeedScreen(category: category),
      ),
    );

/// Every recent public post carrying one label, newest first, with the other
/// labels a tap away along the top.
///
/// The labels were already on every post — a coloured rail and a word under
/// the byline — but they led nowhere. A reader who found one good question
/// had no way to ask for the others.
class TopicFeedScreen extends ConsumerStatefulWidget {
  const TopicFeedScreen({required this.category, super.key});

  final PostCategory category;

  @override
  ConsumerState<TopicFeedScreen> createState() => _TopicFeedScreenState();
}

class _TopicFeedScreenState extends ConsumerState<TopicFeedScreen> {
  late var _category = widget.category;
  final _chipKeys = {
    for (final topic in PostCategory.values) topic: GlobalKey(),
  };

  @override
  void initState() {
    super.initState();
    // Opened on Events, the sixth label, the chip row would otherwise start at
    // Questions with the one that matters scrolled out of sight.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final chip = _chipKeys[_category]?.currentContext;
      if (chip != null && chip.mounted) {
        Scrollable.ensureVisible(chip, alignment: 0.5);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final brand = context.brand;
    final posts = ref.watch(topicFeedProvider(_category));

    return Scaffold(
      appBar: AppBar(title: Text(_category.label(l10n))),
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // A row rather than a lazy list: eight chips cost nothing to build,
          // and the selected one has to exist to be scrolled to.
          SingleChildScrollView(
            key: const Key('topic-chips'),
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
            child: Row(
              children: [
                for (final topic in PostCategory.values)
                  Padding(
                    key: _chipKeys[topic],
                    padding: const EdgeInsets.only(right: 8),
                    child: ChoiceChip(
                      key: ValueKey('topic-chip-${topic.wire}'),
                      avatar: Icon(
                        topic.icon,
                        size: 16,
                        color: topic == _category
                            ? brand.onAccentFill
                            : topic.colorOn(brand),
                      ),
                      label: Text(topic.label(l10n)),
                      selected: topic == _category,
                      showCheckmark: false,
                      selectedColor: brand.accentFill,
                      labelStyle: TextStyle(
                        color: topic == _category
                            ? brand.onAccentFill
                            : brand.ink,
                        fontWeight: FontWeight.w700,
                      ),
                      onSelected: (_) => setState(() => _category = topic),
                    ),
                  ),
              ],
            ),
          ),
          Divider(height: 1, color: brand.divider),
          Expanded(
            child: RefreshIndicator(
              onRefresh: () async =>
                  ref.invalidate(rawTopicFeedProvider(_category)),
              child: switch (posts) {
                AsyncValue(:final value?) when value.isEmpty => ListView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  children: [
                    CommunityEmptyState(
                      icon: _category.icon,
                      title: 'Nothing labelled ${_category.label(l10n)} yet',
                      message:
                          'Choose this label when you post, and it will '
                          'show up here.',
                    ),
                  ],
                ),
                AsyncValue(:final value?) => ListView.builder(
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: const EdgeInsets.only(bottom: 40),
                  itemCount: value.length,
                  itemBuilder: (context, index) => StandardPostCard(
                    key: ValueKey('topic-post-${value[index].id}'),
                    post: value[index],
                  ),
                ),
                AsyncValue(hasError: true) => ListView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  children: const [
                    CommunityEmptyState(
                      icon: Icons.cloud_off_rounded,
                      title: 'Could not load this topic',
                      message: 'Pull down to try again.',
                    ),
                  ],
                ),
                _ => const Center(child: CircularProgressIndicator()),
              },
            ),
          ),
        ],
      ),
    );
  }
}
