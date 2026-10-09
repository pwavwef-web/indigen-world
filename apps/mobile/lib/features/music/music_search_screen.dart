import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/collection/collection_data.dart';
import 'package:indigen_world_mobile/features/music/artist_screen.dart';
import 'package:indigen_world_mobile/features/music/music_controller.dart';
import 'package:indigen_world_mobile/features/music/music_home_tab.dart';
import 'package:indigen_world_mobile/features/music/music_library.dart';
import 'package:indigen_world_mobile/features/music/widgets/music_widgets.dart';
import 'package:indigen_world_mobile/shared/frosted_nav_bar.dart';
import 'package:indigen_world_mobile/shared/motion.dart';

/// Find a song, or the person who made it — the channel's Search tab.
///
/// ── Why the search is local ───────────────────────────────────────────────
/// The collection is already streamed and already in memory — it is what draws
/// the Home tab beside this one. Matching against that list costs nothing,
/// works with no signal, and answers on the keystroke rather than after a round
/// trip somebody is paying for by the megabyte. A server-side search becomes
/// worth its cost when the archive is too large to hold, and the honest answer
/// today is that it is not.
///
/// ── Why the field does not grab the keyboard ──────────────────────────────
/// The tab opens on something to browse — the kinds of song and the people —
/// because half the people who open Search do not yet know the word they
/// want. The field is at the top and one tap away; a keyboard that leapt up
/// every time the tab was visited would cover the answers to that half.
class MusicSearchScreen extends ConsumerStatefulWidget {
  const MusicSearchScreen({
    this.kind = CollectionKind.music,
    this.accent,
    this.scrollController,
    super.key,
  });

  final CollectionKind kind;
  final Color? accent;
  final ScrollController? scrollController;

  @override
  ConsumerState<MusicSearchScreen> createState() => _MusicSearchScreenState();
}

class _MusicSearchScreenState extends ConsumerState<MusicSearchScreen> {
  final _controller = TextEditingController();
  var _query = '';

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _openArtist(MusicArtist artist) => Navigator.of(context).push(
    MaterialPageRoute<void>(
      builder: (context) =>
          MusicArtistScreen(artistId: artist.id, kind: widget.kind),
    ),
  );

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final kind = widget.kind;
    final accent = widget.accent ?? brand.accent;
    final tracks =
        ref.watch(playableMusicProvider(kind)).asData?.value ?? const [];
    final artists = ref.watch(musicArtistsProvider(kind));
    final results = searchMusicLibrary(
      tracks: tracks,
      artists: artists,
      query: _query,
    );
    final player = ref.read(musicControllerProvider.notifier);
    final searching = _query.trim().isNotEmpty;

    final List<Widget> body;
    if (!searching) {
      body = _browse(context, kind: kind, artists: artists);
    } else if (results.isEmpty) {
      body = [
        SliverFillRemaining(
          hasScrollBody: false,
          child: _NoResults(query: _query),
        ),
      ];
    } else {
      body = [
        if (results.artists.isNotEmpty) ...[
          MusicSliverHeading(
            title: kind == CollectionKind.audiobooks ? 'Readers' : 'Artists',
          ),
          SliverList.builder(
            itemCount: results.artists.take(6).length,
            itemBuilder: (context, index) {
              final artist = results.artists[index];
              return _ArtistRow(
                artist: artist,
                kind: kind,
                onOpen: () => _openArtist(artist),
              );
            },
          ),
        ],
        if (results.tracks.isNotEmpty) ...[
          MusicSliverHeading(
            title: kind == CollectionKind.audiobooks ? 'Readings' : 'Songs',
          ),
          SliverList.builder(
            itemCount: results.tracks.length,
            itemBuilder: (context, index) => MusicTrackRow(
              item: results.tracks[index],
              accent: accent,
              // The queue is the result list, so playing the third result and
              // letting it run plays the rest of what was searched for rather
              // than jumping back to the archive.
              onPlay: () => player.playCollection(
                results.tracks,
                startIndex: index,
                kind: kind,
              ),
            ),
          ),
        ],
      ];
    }

    return CustomScrollView(
      controller: widget.scrollController,
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      slivers: [
        MusicTabAppBar(
          title: 'Search',
          bottom: PreferredSize(
            preferredSize: const Size.fromHeight(64),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
              child: _SearchField(
                controller: _controller,
                accent: accent,
                hint: kind == CollectionKind.audiobooks
                    ? 'Readings, readers'
                    : 'Songs, artists',
                onChanged: (value) => setState(() => _query = value),
                onClear: () {
                  _controller.clear();
                  setState(() => _query = '');
                },
              ),
            ),
          ),
        ),
        ...body,
        SliverToBoxAdapter(
          child: SizedBox(height: shellBottomReserve(context) + 12),
        ),
      ],
    );
  }

  /// The empty search: the kinds of song and the people, as things to tap
  /// rather than a blank page.
  List<Widget> _browse(
    BuildContext context, {
    required CollectionKind kind,
    required List<MusicArtist> artists,
  }) {
    if (artists.isEmpty) {
      return [
        SliverFillRemaining(
          hasScrollBody: false,
          child: Center(
            child: Padding(
              padding: const EdgeInsets.all(32),
              child: Text(
                'Nothing is published here yet to search.',
                textAlign: TextAlign.center,
                style: TextStyle(color: context.brand.mutedInk),
              ),
            ),
          ),
        ),
      ];
    }
    final categories = musicCategories(
      ref.watch(playableMusicProvider(kind)).asData?.value ?? const [],
    );
    return [
      if (categories.isNotEmpty) ...[
        const MusicSliverHeading(title: 'Browse by kind'),
        SliverPadding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          sliver: SliverGrid(
            gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
              maxCrossAxisExtent: 260,
              mainAxisSpacing: 12,
              crossAxisSpacing: 12,
              childAspectRatio: 1.7,
            ),
            delegate: SliverChildBuilderDelegate(
              (context, index) => MusicCategoryTile(
                category: categories[index],
                color: musicCategoryColor(index),
                kind: kind,
              ),
              childCount: categories.length,
            ),
          ),
        ),
      ],
      MusicSliverHeading(
        title: kind == CollectionKind.audiobooks
            ? 'Browse by reader'
            : 'Browse by artist',
      ),
      SliverList.builder(
        itemCount: artists.length,
        itemBuilder: (context, index) => _ArtistRow(
          artist: artists[index],
          kind: kind,
          onOpen: () => _openArtist(artists[index]),
        ),
      ),
    ];
  }
}

/// The app bar every channel tab but Home wears: the way back out of the
/// channel, the tab's name set large, and whatever the tab keeps under it.
class MusicTabAppBar extends StatelessWidget {
  const MusicTabAppBar({
    required this.title,
    this.bottom,
    this.actions,
    super.key,
  });

  final String title;
  final PreferredSizeWidget? bottom;
  final List<Widget>? actions;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return SliverAppBar(
      pinned: true,
      backgroundColor: brand.background,
      surfaceTintColor: Colors.transparent,
      scrolledUnderElevation: 0,
      automaticallyImplyLeading: Navigator.of(context).canPop(),
      titleSpacing: Navigator.of(context).canPop() ? 0 : 20,
      title: Text(
        title,
        style: TextStyle(
          color: brand.ink,
          fontSize: 24,
          fontWeight: FontWeight.w900,
          letterSpacing: -0.5,
        ),
      ),
      actions: actions,
      bottom: bottom,
    );
  }
}

/// A section heading, as a sliver.
class MusicSliverHeading extends StatelessWidget {
  const MusicSliverHeading({required this.title, this.eyebrow, super.key});

  final String title;
  final String? eyebrow;

  @override
  Widget build(BuildContext context) => SliverToBoxAdapter(
    child: MusicSectionHeader(title: title, eyebrow: eyebrow),
  );
}

class _SearchField extends StatelessWidget {
  const _SearchField({
    required this.controller,
    required this.accent,
    required this.hint,
    required this.onChanged,
    required this.onClear,
  });

  final TextEditingController controller;
  final Color accent;
  final String hint;
  final ValueChanged<String> onChanged;
  final VoidCallback onClear;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return TextField(
      controller: controller,
      textInputAction: TextInputAction.search,
      onChanged: onChanged,
      style: TextStyle(
        color: brand.ink,
        fontSize: 16,
        fontWeight: FontWeight.w600,
      ),
      decoration: InputDecoration(
        hintText: hint,
        hintStyle: TextStyle(color: brand.faintInk),
        prefixIcon: Icon(Icons.search_rounded, color: brand.mutedInk),
        suffixIcon: ValueListenableBuilder<TextEditingValue>(
          valueListenable: controller,
          builder: (context, value, _) => AnimatedSwitcher(
            duration: motionOr(context, AppMotion.quick),
            child: value.text.isEmpty
                ? const SizedBox.shrink()
                : IconButton(
                    tooltip: 'Clear',
                    onPressed: onClear,
                    icon: const Icon(Icons.close_rounded),
                  ),
          ),
        ),
        filled: true,
        fillColor: Color.alphaBlend(
          accent.withValues(alpha: brand.isDark ? 0.08 : 0.05),
          brand.surfaceMuted,
        ),
        contentPadding: const EdgeInsets.symmetric(horizontal: 18),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(26),
          borderSide: BorderSide(color: brand.border),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(26),
          borderSide: BorderSide(color: brand.border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(26),
          borderSide: BorderSide(color: accent, width: 1.6),
        ),
      ),
    );
  }
}

/// One artist as a list row, for results rather than for a shelf.
class _ArtistRow extends StatelessWidget {
  const _ArtistRow({
    required this.artist,
    required this.kind,
    required this.onOpen,
  });

  final MusicArtist artist;
  final CollectionKind kind;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return ListTile(
      onTap: onOpen,
      leading: Hero(
        tag: musicArtistHeroTag(kind, artist.id),
        child: MusicArtwork(
          url: artist.imageUrl,
          size: 46,
          circle: true,
          initial: artist.initial,
        ),
      ),
      title: Text(
        artist.name,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: TextStyle(
          color: brand.ink,
          fontSize: 14.5,
          fontWeight: FontWeight.w700,
        ),
      ),
      subtitle: Text(
        '${artist.trackCount} ${artist.trackCount == 1 ? 'piece' : 'pieces'}',
        style: TextStyle(color: brand.mutedInk, fontSize: 12.5),
      ),
      trailing: Icon(Icons.chevron_right_rounded, color: brand.faintInk),
    );
  }
}

class _NoResults extends StatelessWidget {
  const _NoResults({required this.query});

  final String query;

  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.all(32),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            Icons.search_off_rounded,
            size: 40,
            color: context.brand.faintInk,
          ),
          const SizedBox(height: 12),
          Text(
            'Nothing here matches “${query.trim()}”.',
            textAlign: TextAlign.center,
            style: TextStyle(
              color: context.brand.ink,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'The archive only holds what has been published to it. If you know '
            'the piece, it may be waiting for somebody to contribute it.',
            textAlign: TextAlign.center,
            style: TextStyle(color: context.brand.mutedInk, fontSize: 13),
          ),
        ],
      ),
    ),
  );
}
