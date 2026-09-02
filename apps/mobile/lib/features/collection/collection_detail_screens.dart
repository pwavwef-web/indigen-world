import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/domain/dictionary_entry.dart';
import 'package:indigen_world_mobile/features/collection/collection_data.dart';
import 'package:indigen_world_mobile/features/collection/widgets/collection_card_surface.dart';
import 'package:indigen_world_mobile/features/community/widgets/community_avatar.dart';
import 'package:indigen_world_mobile/features/contribute/contribute_screen.dart';
import 'package:indigen_world_mobile/features/dictionary/entry_detail_screen.dart';
import 'package:indigen_world_mobile/features/dictionary/translation_display.dart';
import 'package:indigen_world_mobile/features/explore/published_content.dart';
import 'package:indigen_world_mobile/features/music/music_controller.dart';
import 'package:indigen_world_mobile/features/music/music_providers.dart';
import 'package:indigen_world_mobile/shared/app_widgets.dart';
import 'package:video_player/video_player.dart';

class MusicCollectionScreen extends ConsumerWidget {
  const MusicCollectionScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) =>
      PublishedCollectionScreen(
        kind: CollectionKind.music,
        items: ref.watch(musicCollectionProvider),
        onRetry: () => ref.invalidate(musicCollectionProvider),
      );
}

class LiteratureCollectionScreen extends ConsumerWidget {
  const LiteratureCollectionScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) =>
      PublishedCollectionScreen(
        kind: CollectionKind.literature,
        items: ref.watch(literatureCollectionProvider),
        onRetry: () => ref.invalidate(literatureCollectionProvider),
      );
}

class AudiobookCollectionScreen extends ConsumerWidget {
  const AudiobookCollectionScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) =>
      PublishedCollectionScreen(
        kind: CollectionKind.audiobooks,
        items: ref.watch(audiobookCollectionProvider),
        onRetry: () => ref.invalidate(audiobookCollectionProvider),
      );
}

class VideoCollectionScreen extends ConsumerWidget {
  const VideoCollectionScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) =>
      PublishedCollectionScreen(
        kind: CollectionKind.video,
        items: ref.watch(videoCollectionProvider),
        onRetry: () => ref.invalidate(videoCollectionProvider),
      );
}

class DictionaryCollectionScreen extends ConsumerStatefulWidget {
  const DictionaryCollectionScreen({super.key});

  @override
  ConsumerState<DictionaryCollectionScreen> createState() =>
      _DictionaryCollectionScreenState();
}

class _DictionaryCollectionScreenState
    extends ConsumerState<DictionaryCollectionScreen> {
  final _searchController = TextEditingController();
  String _query = '';

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final entries = ref.watch(publishedDictionaryEntriesProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Kasem dictionary')),
      body: ScreenContainer(
        child: RefreshIndicator(
          onRefresh: () async {
            ref.invalidate(publishedDictionaryEntriesProvider);
            await ref.read(publishedDictionaryEntriesProvider.future);
          },
          child: CustomScrollView(
            slivers: [
              const SliverToBoxAdapter(
                child: BrandHeader(
                  eyebrow: 'Collection · Dictionary',
                  title: 'Words with a living context.',
                ),
              ),
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
                  child: TextField(
                    controller: _searchController,
                    onChanged: (value) => setState(() => _query = value),
                    decoration: InputDecoration(
                      hintText: 'Search Kasem, English, or dialect',
                      prefixIcon: const Icon(Icons.search_rounded),
                      suffixIcon: _query.isEmpty
                          ? null
                          : IconButton(
                              tooltip: 'Clear search',
                              onPressed: () {
                                _searchController.clear();
                                setState(() => _query = '');
                              },
                              icon: const Icon(Icons.close_rounded),
                            ),
                    ),
                  ),
                ),
              ),
              entries.when(
                loading: () => const SliverFillRemaining(
                  hasScrollBody: false,
                  child: Center(child: CircularProgressIndicator()),
                ),
                error: (_, _) => SliverFillRemaining(
                  hasScrollBody: false,
                  child: _CollectionLoadError(
                    onRetry: () =>
                        ref.invalidate(publishedDictionaryEntriesProvider),
                  ),
                ),
                data: (allEntries) {
                  final query = _query.trim().toLowerCase();
                  final visible = query.isEmpty
                      ? allEntries
                      : allEntries
                            .where((entry) => entry.matches(query))
                            .toList(growable: false);
                  if (visible.isEmpty) {
                    return SliverFillRemaining(
                      hasScrollBody: false,
                      child: _CollectionEmptyState(
                        kind: CollectionKind.dictionary,
                        searching: query.isNotEmpty,
                      ),
                    );
                  }
                  return SliverPadding(
                    padding: const EdgeInsets.fromLTRB(20, 0, 20, 40),
                    sliver: SliverList.separated(
                      itemCount: visible.length,
                      separatorBuilder: (_, _) => const SizedBox(height: 10),
                      itemBuilder: (context, index) =>
                          _DictionaryCard(entry: visible[index]),
                    ),
                  );
                },
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class PublishedCollectionScreen extends StatelessWidget {
  const PublishedCollectionScreen({
    required this.kind,
    required this.items,
    required this.onRetry,
    super.key,
  });

  final CollectionKind kind;
  final AsyncValue<List<PublishedReel>> items;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: Text(kind.label)),
    body: ScreenContainer(
      child: CustomScrollView(
        slivers: [
          SliverToBoxAdapter(
            child: BrandHeader(
              eyebrow: 'Collection · ${kind.label}',
              title: _title,
            ),
          ),
          items.when(
            loading: () => const SliverFillRemaining(
              hasScrollBody: false,
              child: Center(child: CircularProgressIndicator()),
            ),
            error: (_, _) => SliverFillRemaining(
              hasScrollBody: false,
              child: _CollectionLoadError(onRetry: onRetry),
            ),
            data: (entries) {
              if (entries.isEmpty) {
                return SliverFillRemaining(
                  hasScrollBody: false,
                  child: _CollectionEmptyState(kind: kind),
                );
              }
              return SliverPadding(
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 42),
                sliver: SliverList.separated(
                  itemCount: entries.length,
                  separatorBuilder: (_, _) => const SizedBox(height: 14),
                  itemBuilder: (context, index) => _PublishedCollectionCard(
                    item: entries[index],
                    kind: kind,
                  ),
                ),
              );
            },
          ),
        ],
      ),
    ),
  );

  String get _title => switch (kind) {
    CollectionKind.music => 'Hear the rhythm of home.',
    CollectionKind.literature => 'Stories that remember.',
    CollectionKind.audiobooks => 'Listen, learn, and carry it forward.',
    CollectionKind.dictionary => 'Words with a living context.',
    CollectionKind.video => 'Watch it as it happened.',
  };
}

class _DictionaryCard extends StatelessWidget {
  const _DictionaryCard({required this.entry});

  final DictionaryEntry entry;

  @override
  Widget build(BuildContext context) => CollectionCardSurface(
    // Every meaning, not the one the row had room to print: the "+2 more" the
    // sighted row falls back to is a worse answer for a reader who is not
    // constrained by the width of the card.
    // Every meaning AND every rendering, not the ones the row had room to
    // print: the "+2 more" a sighted row falls back to is a worse answer for a
    // reader who is not constrained by the width of the card.
    semanticLabel: entry.furtherRenderings.isEmpty
        ? '${entry.headword}, ${entry.allTranslations}'
        : '${entry.headword}, also '
              '${entry.furtherRenderings.join(', ')}, '
              '${entry.allTranslations}',
    onTap: () => Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (context) =>
            EntryDetailScreen(entryId: entry.id, entry: entry),
      ),
    ),
    padding: const EdgeInsets.all(16),
    child: Row(
      children: [
        Container(
          width: 50,
          height: 50,
          decoration: BoxDecoration(
            color: context.brand.accent.withValues(alpha: 0.1),
            borderRadius: BorderRadius.circular(16),
          ),
          child: Icon(
            Icons.translate_rounded,
            color: context.brand.accent,
          ),
        ),
        const SizedBox(width: 14),
        // A Kasem headword can be long and a translation longer still, and the
        // row between a 50px glyph and a chevron has only so much width. Each
        // line ellipsises rather than growing the card into a paragraph; the
        // entry screen is where the full text belongs.
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Flexible(
                    child: Text(
                      entry.headword,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                  ),
                  // A count rather than the words themselves, for the same
                  // reason the meanings below are counted: a row that grows to
                  // fit its longest entry is a list nobody can scan.
                  if (entry.furtherRenderings.isNotEmpty) ...[
                    const SizedBox(width: 6),
                    Text(
                      '+${entry.furtherRenderings.length}',
                      style: TextStyle(
                        color: context.brand.accent,
                        fontSize: 11,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ],
                ],
              ),
              const SizedBox(height: 3),
              // The first meaning and a count of the rest. Wrapping all of them
              // into the row was the alternative and it makes a list whose
              // every row is a different height — unscannable, and for the sake
              // of text the entry screen shows properly one tap away.
              TranslationSummary(
                entry: entry,
                style: TextStyle(color: context.brand.mutedInk),
              ),
              const SizedBox(height: 6),
              Text(
                // Through the label helper: an unfamiliar word class shows as
                // itself here, and the row is never filtered on it, so an
                // `ideophone` is neither renamed nor hidden by the list that
                // predates it.
                [
                  if (partOfSpeechLabel(entry.partOfSpeech).isNotEmpty)
                    partOfSpeechLabel(entry.partOfSpeech),
                  if (entry.dialect.isNotEmpty) entry.dialect,
                ].join(' · '),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  color: context.brand.terracotta,
                  fontSize: 11,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ],
          ),
        ),
        const Icon(Icons.chevron_right_rounded),
      ],
    ),
  );
}

class _PublishedCollectionCard extends StatelessWidget {
  const _PublishedCollectionCard({required this.item, required this.kind});

  final PublishedReel item;
  final CollectionKind kind;

  @override
  Widget build(BuildContext context) => CollectionCardSurface(
    semanticLabel: '${item.title} by ${item.creatorName}',
    onTap: () => Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (context) =>
            CollectionItemDetailScreen(item: item, kind: kind),
      ),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        AspectRatio(
          aspectRatio: 4 / 3,
          child: Stack(
            fit: StackFit.expand,
            children: [
              item.posterUrl == null
                  ? _MediaFallback(kind: kind)
                  : CachedNetworkImage(
                      imageUrl: item.posterUrl!,
                      fit: BoxFit.cover,
                      placeholder: (_, _) => _MediaFallback(kind: kind),
                      errorWidget: (_, _, _) => _MediaFallback(kind: kind),
                    ),
              // A category is whatever the studio typed, so the badge is
              // bounded by the artwork rather than by the words inside it. It
              // still hugs the top right corner, but it gives up characters
              // before it gives up the edge of the card.
              Positioned(
                top: 10,
                left: 10,
                right: 10,
                child: Align(
                  alignment: Alignment.topRight,
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 9,
                      vertical: 5,
                    ),
                    decoration: BoxDecoration(
                      color: context.brand.accent.withValues(alpha: 0.9),
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          kind == CollectionKind.literature
                              ? Icons.menu_book_rounded
                              : Icons.play_arrow_rounded,
                          color: context.brand.gold,
                          size: 14,
                        ),
                        const SizedBox(width: 4),
                        Flexible(
                          child: Text(
                            (item.category.isEmpty ? kind.label : item.category)
                                .toUpperCase(),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 9,
                              fontWeight: FontWeight.w900,
                              letterSpacing: 0.5,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
              Positioned(
                left: 10,
                bottom: 10,
                child: CommunityAvatar(
                  initials: _creatorInitials,
                  imageUrl: item.creatorAvatarUrl,
                  size: 34,
                  ringed: true,
                  ringColor: Colors.white,
                ),
              ),
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.all(17),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'BY ${item.creatorName.toUpperCase()}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: context.brand.terracotta,
                        fontSize: 9,
                        letterSpacing: 1,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    const SizedBox(height: 5),
                    Text(
                      item.title,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                    const SizedBox(height: 9),
                    Row(
                      children: [
                        Icon(
                          Icons.public_rounded,
                          size: 14,
                          color: context.brand.mutedInk,
                        ),
                        const SizedBox(width: 5),
                        Expanded(
                          child: Text(
                            [
                              if (item.language.isNotEmpty) item.language,
                              if (item.dialect.isNotEmpty) item.dialect,
                              if (item.publishedAt != null) 'Published',
                            ].join(' · '),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              color: context.brand.mutedInk,
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 5),
                    Text(
                      item.description.isEmpty
                          ? 'Published by ${item.creatorName}'
                          : item.description,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(color: context.brand.mutedInk),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 10),
              Icon(
                kind == CollectionKind.literature
                    ? Icons.arrow_forward_rounded
                    : Icons.play_circle_fill_rounded,
                color: context.brand.accent,
                size: 34,
              ),
            ],
          ),
        ),
      ],
    ),
  );

  String get _creatorInitials {
    final parts = item.creatorName
        .trim()
        .split(RegExp(r'\s+'))
        .where((part) => part.isNotEmpty)
        .toList(growable: false);
    if (parts.isEmpty) return 'IW';
    if (parts.length == 1) return parts.first.substring(0, 1).toUpperCase();
    return '${parts.first[0]}${parts.last[0]}'.toUpperCase();
  }
}

class CollectionItemDetailScreen extends StatelessWidget {
  const CollectionItemDetailScreen({
    required this.item,
    required this.kind,
    super.key,
  });

  final PublishedReel item;
  final CollectionKind kind;

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: Text(kind.label)),
    body: ScreenContainer(
      child: ListView(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 42),
        children: [
          // Audio is handed to the shared player; only video still gets a
          // controller of its own here. A song that played from this screen
          // died the moment somebody navigated away from it, which is the
          // whole reason the music player exists.
          if (_playsAsMusic(item, kind))
            _CollectionAudioHeader(item: item, kind: kind)
          else
            _CollectionMedia(item: item, kind: kind),
          const SizedBox(height: 22),
          Text(
            item.category.isEmpty
                ? 'PUBLISHED ${kind.label.toUpperCase()}'
                : item.category.toUpperCase(),
            style: TextStyle(
              color: context.brand.terracotta,
              fontWeight: FontWeight.w900,
              fontSize: 10,
              letterSpacing: 1.1,
            ),
          ),
          const SizedBox(height: 8),
          Text(item.title, style: Theme.of(context).textTheme.headlineMedium),
          const SizedBox(height: 8),
          Text(
            'By ${item.creatorName}',
            style: TextStyle(
              color: context.brand.success,
              fontWeight: FontWeight.w800,
            ),
          ),
          if (item.description.isNotEmpty) ...[
            const SizedBox(height: 22),
            _DetailBlock(title: 'About', body: item.description),
          ],
          if (item.body.isNotEmpty) ...[
            const SizedBox(height: 12),
            _DetailBlock(title: _bodyTitle, body: item.body),
          ],
          if (item.englishSummary.isNotEmpty) ...[
            const SizedBox(height: 12),
            _DetailBlock(title: 'English summary', body: item.englishSummary),
          ],
          if (item.culturalNotes.isNotEmpty) ...[
            const SizedBox(height: 12),
            _DetailBlock(title: 'Cultural context', body: item.culturalNotes),
          ],
          const SizedBox(height: 12),
          _DetailBlock(
            title: 'Publication and rights',
            body: item.licenceDisplay.isEmpty
                ? 'Published with permission through Indigen World.'
                : item.licenceDisplay,
          ),
        ],
      ),
    ),
  );

  String get _bodyTitle => switch (kind) {
    CollectionKind.music => 'Lyrics or transcript',
    CollectionKind.literature => 'The work',
    CollectionKind.audiobooks => 'Transcript or text',
    CollectionKind.dictionary => 'Entry',
    CollectionKind.video => 'Transcript or notes',
  };
}

/// Whether this record belongs to the shared music player rather than to a
/// route-scoped video controller.
///
/// Keyed on the media rather than only on the channel: Literature occasionally
/// carries a reading, and a member who taps play on one wants it to survive
/// them leaving the page exactly as a song does.
bool _playsAsMusic(PublishedReel item, CollectionKind kind) =>
    item.isAudio && (item.mediaUrl?.isNotEmpty ?? false);

/// The play control for a published recording.
///
/// Holds no controller at all. Tapping it hands the whole channel to the music
/// player with this record as the starting point, so the rest of the collection
/// is queued behind it and the mini-player takes over from there.
class _CollectionAudioHeader extends ConsumerWidget {
  const _CollectionAudioHeader({required this.item, required this.kind});

  final PublishedReel item;
  final CollectionKind kind;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final nowPlaying = ref.watch(musicMediaItemProvider).asData?.value;
    final isCurrent = nowPlaying?.id == item.id;
    final playing = isCurrent && ref.watch(musicIsPlayingProvider);

    // The siblings this record should be queued with, read from the same
    // provider the list screen was built from. Watching it here rather than
    // threading a list down through three constructors keeps the card, the
    // list and this screen all agreeing about what the channel contains.
    final siblings =
        (kind == CollectionKind.audiobooks
                ? ref.watch(audiobookCollectionProvider)
                : ref.watch(musicCollectionProvider))
            .asData
            ?.value ??
        const <PublishedReel>[];

    return ClipRRect(
      borderRadius: BorderRadius.circular(26),
      child: AspectRatio(
        aspectRatio: 16 / 10,
        child: Stack(
          fit: StackFit.expand,
          children: [
            if (item.posterUrl case final poster? when poster.isNotEmpty)
              CachedNetworkImage(
                imageUrl: poster,
                fit: BoxFit.cover,
                errorWidget: (_, _, _) => _MediaFallback(kind: kind),
              )
            else
              _MediaFallback(kind: kind),
            Container(color: Colors.black.withValues(alpha: 0.28)),
            Center(
              child: IconButton.filled(
                iconSize: 44,
                tooltip: playing ? 'Pause' : 'Play',
                onPressed: () {
                  final controller = ref.read(musicControllerProvider.notifier);
                  if (playing) {
                    controller.pause();
                    return;
                  }
                  if (isCurrent) {
                    controller.play();
                    return;
                  }
                  // Falls back to this record alone when the channel has not
                  // arrived yet, so the button always does something.
                  final queue = siblings.isEmpty ? [item] : siblings;
                  final index = queue.indexWhere((sibling) => sibling.id == item.id);
                  controller.playCollection(
                    queue,
                    startIndex: index < 0 ? 0 : index,
                    kind: kind,
                  );
                },
                icon: Icon(
                  playing ? Icons.pause_rounded : Icons.play_arrow_rounded,
                ),
              ),
            ),
            if (item.mediaUrl == null || item.mediaUrl!.isEmpty)
              const Align(
                alignment: Alignment.bottomCenter,
                child: Padding(
                  padding: EdgeInsets.all(12),
                  child: Text(
                    'This recording is still being processed.',
                    style: TextStyle(color: Colors.white, fontSize: 12),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _CollectionMedia extends StatefulWidget {
  const _CollectionMedia({required this.item, required this.kind});

  final PublishedReel item;
  final CollectionKind kind;

  @override
  State<_CollectionMedia> createState() => _CollectionMediaState();
}

class _CollectionMediaState extends State<_CollectionMedia> {
  VideoPlayerController? _controller;
  Future<void>? _initializing;

  /// Video only now. Audio goes to the shared player — see
  /// [_CollectionAudioHeader] — so this widget no longer opens a
  /// `VideoPlayerController` for a file that has no pictures in it.
  bool get _canPlay =>
      widget.item.mediaUrl != null && widget.item.isVideo;

  @override
  void initState() {
    super.initState();
    if (_canPlay) {
      final controller = VideoPlayerController.networkUrl(
        Uri.parse(widget.item.mediaUrl!),
      );
      _controller = controller;
      _initializing = controller.initialize();
    }
  }

  @override
  void dispose() {
    _controller?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final controller = _controller;
    if (controller == null) {
      return ClipRRect(
        borderRadius: BorderRadius.circular(26),
        child: AspectRatio(
          aspectRatio: 16 / 10,
          child: widget.item.posterUrl == null
              ? _MediaFallback(kind: widget.kind)
              : CachedNetworkImage(
                  imageUrl: widget.item.posterUrl!,
                  fit: BoxFit.cover,
                  errorWidget: (_, _, _) => _MediaFallback(kind: widget.kind),
                ),
        ),
      );
    }
    return FutureBuilder<void>(
      future: _initializing,
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return const SizedBox(
            height: 220,
            child: Center(child: CircularProgressIndicator()),
          );
        }
        if (snapshot.hasError) {
          return _PlaybackUnavailable(kind: widget.kind);
        }
        return AnimatedBuilder(
          animation: controller,
          builder: (context, _) {
            final value = controller.value;
            final duration = value.duration.inMilliseconds;
            final position = value.position.inMilliseconds.clamp(0, duration);
            final isVideo =
                widget.item.mediaType?.toLowerCase().contains('video') ?? false;
            return Container(
              clipBehavior: Clip.antiAlias,
              decoration: BoxDecoration(
                color: context.brand.accent,
                borderRadius: BorderRadius.circular(26),
              ),
              child: Column(
                children: [
                  AspectRatio(
                    aspectRatio: isVideo && value.aspectRatio > 0
                        ? value.aspectRatio
                        : 16 / 8,
                    child: isVideo
                        ? VideoPlayer(controller)
                        : _MediaFallback(kind: widget.kind),
                  ),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(14, 6, 14, 10),
                    child: Row(
                      children: [
                        IconButton.filledTonal(
                          tooltip: value.isPlaying ? 'Pause' : 'Play',
                          onPressed: () => value.isPlaying
                              ? controller.pause()
                              : controller.play(),
                          icon: Icon(
                            value.isPlaying
                                ? Icons.pause_rounded
                                : Icons.play_arrow_rounded,
                          ),
                        ),
                        Expanded(
                          child: Slider(
                            value: duration == 0 ? 0 : position.toDouble(),
                            max: duration == 0 ? 1 : duration.toDouble(),
                            onChanged: duration == 0
                                ? null
                                : (next) => controller.seekTo(
                                    Duration(milliseconds: next.round()),
                                  ),
                          ),
                        ),
                        Text(
                          _durationLabel(value.position),
                          style: const TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.w700,
                            fontSize: 11,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            );
          },
        );
      },
    );
  }
}

class _MediaFallback extends StatelessWidget {
  const _MediaFallback({required this.kind});

  final CollectionKind kind;

  @override
  Widget build(BuildContext context) => DecoratedBox(
    decoration: const BoxDecoration(
      gradient: LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [BrandColors.heritageGreen, BrandColors.savannahGreen],
      ),
    ),
    child: Center(
      child: Icon(
        switch (kind) {
          CollectionKind.music => Icons.graphic_eq_rounded,
          CollectionKind.dictionary => Icons.translate_rounded,
          CollectionKind.literature => Icons.auto_stories_rounded,
          CollectionKind.audiobooks => Icons.headphones_rounded,
          CollectionKind.video => Icons.movie_creation_rounded,
        },
        color: context.brand.gold,
        size: 58,
      ),
    ),
  );
}

class _PlaybackUnavailable extends StatelessWidget {
  const _PlaybackUnavailable({required this.kind});

  final CollectionKind kind;

  @override
  Widget build(BuildContext context) => Container(
    // 210 is the height this panel wants, not the height it is held to: at a
    // large text scale the apology runs to three lines and a fixed box would
    // simply cut them off.
    constraints: const BoxConstraints(minHeight: 210),
    padding: const EdgeInsets.all(24),
    decoration: BoxDecoration(
      color: context.brand.accent,
      borderRadius: BorderRadius.circular(26),
    ),
    child: Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Icon(
          kind == CollectionKind.music
              ? Icons.music_off_rounded
              : Icons.headset_off_rounded,
          color: context.brand.gold,
          size: 42,
        ),
        const SizedBox(height: 10),
        const Text(
          'This recording could not be streamed right now.',
          textAlign: TextAlign.center,
          style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700),
        ),
      ],
    ),
  );
}

class _DetailBlock extends StatelessWidget {
  const _DetailBlock({required this.title, required this.body});

  final String title;
  final String body;

  @override
  Widget build(BuildContext context) => CollectionCardSurface(
    padding: const EdgeInsets.all(18),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title, style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 8),
        SelectableText(body, style: const TextStyle(height: 1.5)),
      ],
    ),
  );
}

class _CollectionEmptyState extends StatelessWidget {
  const _CollectionEmptyState({required this.kind, this.searching = false});

  final CollectionKind kind;
  final bool searching;

  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.fromLTRB(28, 24, 28, 80),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 78,
            height: 78,
            decoration: BoxDecoration(
              color: context.brand.accent.withValues(alpha: 0.09),
              shape: BoxShape.circle,
            ),
            child: Icon(
              searching ? Icons.search_off_rounded : Icons.eco_outlined,
              size: 38,
              color: context.brand.accent,
            ),
          ),
          const SizedBox(height: 18),
          Text(
            searching
                ? 'No matching words yet'
                : '${kind.label} is ready for its first published piece',
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.titleLarge,
          ),
          if (searching) ...[
            const SizedBox(height: 8),
            Text(
              'Try another spelling, English word, or dialect.',
              textAlign: TextAlign.center,
              style: TextStyle(color: context.brand.mutedInk, height: 1.4),
            ),
          ],
          // Audiobooks are the one shelf nobody fills from a phone. A narrated
          // book carries a rights holder, a narrator who is rarely the person
          // uploading, and hours of audio, so it is curated in the admin
          // console instead — and the chooser this button opens no longer
          // offers the kind. Saying so is the only honest option: an "add one"
          // button that leads somewhere without an audiobook in it is a promise
          // the flow cannot keep.
          if (!searching && kind == CollectionKind.audiobooks) ...[
            const SizedBox(height: 10),
            Text(
              'Audiobooks are recorded and added by the project team.',
              textAlign: TextAlign.center,
              style: TextStyle(color: context.brand.mutedInk, height: 1.4),
            ),
          ] else if (!searching) ...[
            const SizedBox(height: 18),
            FilledButton.icon(
              onPressed: () => Navigator.of(context).push(
                MaterialPageRoute<void>(
                  builder: (context) =>
                      ContributeScreen(initialKind: kind, standalone: true),
                ),
              ),
              icon: const Icon(Icons.add_rounded),
              label: Text('Contribute ${kind.contributionLabel}'),
            ),
          ],
        ],
      ),
    ),
  );
}

class _CollectionLoadError extends StatelessWidget {
  const _CollectionLoadError({this.onRetry});

  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.all(28),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            Icons.cloud_off_rounded,
            size: 44,
            color: context.brand.terracotta,
          ),
          const SizedBox(height: 14),
          Text(
            'The collection could not be refreshed.',
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.titleLarge,
          ),
          if (onRetry != null) ...[
            const SizedBox(height: 16),
            OutlinedButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh_rounded),
              label: const Text('Try again'),
            ),
          ],
        ],
      ),
    ),
  );
}

String _durationLabel(Duration duration) {
  final minutes = duration.inMinutes;
  final seconds = duration.inSeconds.remainder(60).toString().padLeft(2, '0');
  return '$minutes:$seconds';
}
