import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/collection/blogs/blog_body.dart';
import 'package:indigen_world_mobile/features/collection/blogs/blog_feed.dart';
import 'package:indigen_world_mobile/shared/channel_stage.dart';
import 'package:indigen_world_mobile/shared/frosted_nav_bar.dart';
import 'package:indigen_world_mobile/shared/motion.dart';
import 'package:share_plus/share_plus.dart';
import 'package:url_launcher/url_launcher.dart';

String _date(DateTime? date) =>
    date == null ? '' : DateFormat('d MMM y').format(date);

Future<void> _openWeb(Uri url) =>
    launchUrl(url, mode: LaunchMode.externalApplication);

/// Literature's Blogs destination: every post on the updates blog, newest
/// first, the moment it is published there.
class BlogsTab extends ConsumerWidget {
  const BlogsTab({this.scrollController, this.accent, super.key});

  final ScrollController? scrollController;
  final Color? accent;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final feed = ref.watch(blogFeedProvider);
    final page = feed.value;
    return RefreshIndicator(
      edgeOffset: MediaQuery.paddingOf(context).top + 100,
      onRefresh: () async {
        ref.invalidate(blogFeedProvider);
        try {
          await ref.read(blogFeedProvider.future);
        } on Object {
          // The error state is drawn from the provider.
        }
      },
      child: NotificationListener<ScrollNotification>(
        onNotification: (n) {
          if (n.metrics.extentAfter < 700 && (page?.hasMore ?? false)) {
            ref.read(blogFeedProvider.notifier).loadMore().ignore();
          }
          return false;
        },
        child: CustomScrollView(
          key: const PageStorageKey('literature-blogs'),
          controller: scrollController,
          physics: const AlwaysScrollableScrollPhysics(),
          slivers: [
            SliverPersistentHeader(
              pinned: true,
              delegate: ChannelStageDelegate(
                eyebrow: 'From the blog',
                title: kBlogName,
                subtitle: 'Release notes and stories, as they are published.',
                accent: accent,
                topPadding: MediaQuery.paddingOf(context).top,
                textScale: MediaQuery.textScalerOf(context)
                    .scale(1)
                    .clamp(1, 1.4),
                actions: [
                  IconButton(
                    tooltip: 'Open the blog in your browser',
                    onPressed: () => _openWeb(Uri.https(kBlogHost)),
                    icon: const Icon(Icons.open_in_new_rounded),
                  ),
                ],
              ),
            ),
            if (page == null && feed.hasError)
              SliverFillRemaining(
                hasScrollBody: false,
                child: _BlogState(
                  icon: Icons.cloud_off_rounded,
                  title: 'The blog could not load',
                  body: 'Check your connection and pull down to try again.',
                  action: OutlinedButton.icon(
                    onPressed: () => ref.invalidate(blogFeedProvider),
                    icon: const Icon(Icons.refresh_rounded),
                    label: const Text('Try again'),
                  ),
                ),
              )
            else if (page == null)
              const _BlogSkeleton()
            else if (page.posts.isEmpty)
              const SliverFillRemaining(
                hasScrollBody: false,
                child: _BlogState(
                  icon: Icons.article_outlined,
                  title: 'No posts yet',
                  body: 'New posts appear here as soon as they are published.',
                ),
              )
            else ...[
              if (page.fromCache)
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(16, 14, 16, 0),
                    child: Row(
                      children: [
                        Icon(
                          Icons.offline_pin_outlined,
                          size: 16,
                          color: context.brand.mutedInk,
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            'Offline — showing the posts saved on this phone.',
                            style: TextStyle(
                              color: context.brand.mutedInk,
                              fontSize: 12.5,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 6),
                  child: Entrance(
                    index: 0,
                    child: _LeadPost(post: page.posts.first),
                  ),
                ),
              ),
              if (page.posts.length > 1)
                const SliverToBoxAdapter(
                  child: ChannelSectionHeader(
                    eyebrow: 'Earlier',
                    title: 'More from the blog',
                  ),
                ),
              SliverList.separated(
                itemCount: page.posts.length - 1,
                separatorBuilder: (_, _) => Divider(
                  height: 1,
                  indent: 16,
                  endIndent: 16,
                  color: context.brand.divider,
                ),
                itemBuilder: (context, index) =>
                    _PostRow(post: page.posts[index + 1]),
              ),
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.all(20),
                  child: Center(
                    child: page.hasMore
                        ? const SizedBox(
                            width: 22,
                            height: 22,
                            child: CircularProgressIndicator(strokeWidth: 2.4),
                          )
                        : Text(
                            'You have read back to the first post.',
                            style: TextStyle(color: context.brand.mutedInk),
                          ),
                  ),
                ),
              ),
            ],
            SliverToBoxAdapter(
              child: SizedBox(height: shellBottomReserve(context)),
            ),
          ],
        ),
      ),
    );
  }
}

void _openPost(BuildContext context, BlogPost post) => Navigator.of(context)
    .push(MaterialPageRoute<void>(builder: (_) => BlogPostScreen(post: post)));

class _Labels extends StatelessWidget {
  const _Labels({required this.labels});
  final List<String> labels;
  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final shown = labels.where((l) => l != 'Product updates').take(3).toList();
    if (shown.isEmpty) return const SizedBox.shrink();
    return Wrap(
      spacing: 6,
      runSpacing: 6,
      children: [
        for (final label in shown)
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
            decoration: BoxDecoration(
              color: brand.accentSoft,
              borderRadius: BorderRadius.circular(99),
            ),
            child: Text(
              label,
              style: TextStyle(
                color: brand.accent,
                fontSize: 11,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
      ],
    );
  }
}

class _LeadPost extends StatelessWidget {
  const _LeadPost({required this.post});
  final BlogPost post;
  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final cover = post.coverAt(1200, height: 675);
    return Semantics(
      button: true,
      label: 'Latest post: ${post.title}. ${_date(post.published)}',
      excludeSemantics: true,
      child: PressScale(
        pressed: 0.98,
        child: Material(
          color: brand.surface,
          clipBehavior: Clip.antiAlias,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(24),
            side: BorderSide(color: brand.border),
          ),
          child: InkWell(
            onTap: () => _openPost(context, post),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                AspectRatio(
                  aspectRatio: 16 / 9,
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      if (cover != null)
                        CachedNetworkImage(
                          imageUrl: cover,
                          fit: BoxFit.cover,
                          placeholder: (_, _) =>
                              ColoredBox(color: brand.surfaceMuted),
                          errorWidget: (_, _, _) =>
                              ColoredBox(color: brand.heroMid),
                        )
                      else
                        ColoredBox(color: brand.heroMid),
                      Positioned(
                        left: 12,
                        top: 12,
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 10,
                            vertical: 5,
                          ),
                          decoration: BoxDecoration(
                            color: brand.gold,
                            borderRadius: BorderRadius.circular(99),
                          ),
                          child: Text(
                            'LATEST',
                            style: TextStyle(
                              color: brand.heroDeep,
                              fontSize: 10,
                              fontWeight: FontWeight.w900,
                              letterSpacing: 1,
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _Labels(labels: post.labels),
                      const SizedBox(height: 8),
                      Text(
                        post.title,
                        maxLines: 3,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: brand.ink,
                          fontSize: 20,
                          height: 1.2,
                          fontWeight: FontWeight.w900,
                          letterSpacing: -0.3,
                        ),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        post.excerpt,
                        maxLines: 3,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: brand.mutedInk,
                          fontSize: 14,
                          height: 1.45,
                        ),
                      ),
                      const SizedBox(height: 10),
                      _Meta(post: post),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _Meta extends StatelessWidget {
  const _Meta({required this.post});
  final BlogPost post;
  @override
  Widget build(BuildContext context) => Text(
    [
      _date(post.published),
      '${post.readingMinutes} min read',
    ].where((s) => s.isNotEmpty).join('  ·  '),
    style: TextStyle(
      color: context.brand.mutedInk,
      fontSize: 12.5,
      fontWeight: FontWeight.w600,
    ),
  );
}

class _PostRow extends StatelessWidget {
  const _PostRow({required this.post});
  final BlogPost post;
  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final cover = post.coverAt(300, height: 300);
    return Semantics(
      button: true,
      label: '${post.title}. ${_date(post.published)}',
      excludeSemantics: true,
      child: InkWell(
        onTap: () => _openPost(context, post),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (post.labels.isNotEmpty)
                      Text(
                        post.labels
                            .firstWhere(
                              (l) => l != 'Product updates',
                              orElse: () => post.labels.first,
                            )
                            .toUpperCase(),
                        style: TextStyle(
                          color: brand.terracotta,
                          fontSize: 10,
                          fontWeight: FontWeight.w900,
                          letterSpacing: 1,
                        ),
                      ),
                    const SizedBox(height: 3),
                    Text(
                      post.title,
                      maxLines: 3,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: brand.ink,
                        fontSize: 15.5,
                        height: 1.28,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 6),
                    _Meta(post: post),
                  ],
                ),
              ),
              if (cover != null) ...[
                const SizedBox(width: 14),
                ClipRRect(
                  borderRadius: BorderRadius.circular(14),
                  child: CachedNetworkImage(
                    imageUrl: cover,
                    width: 88,
                    height: 88,
                    memCacheWidth: 264,
                    fit: BoxFit.cover,
                    placeholder: (_, _) => ColoredBox(
                      color: brand.surfaceMuted,
                      child: const SizedBox(width: 88, height: 88),
                    ),
                    errorWidget: (_, _, _) => const SizedBox.shrink(),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _BlogSkeleton extends StatelessWidget {
  const _BlogSkeleton();
  @override
  Widget build(BuildContext context) {
    final muted = context.brand.surfaceMuted;
    return SliverPadding(
      padding: const EdgeInsets.all(16),
      sliver: SliverList.list(
        children: [
          AspectRatio(
            aspectRatio: 16 / 11,
            child: DecoratedBox(
              decoration: BoxDecoration(
                color: muted,
                borderRadius: BorderRadius.circular(24),
              ),
            ),
          ),
          for (var i = 0; i < 4; i++)
            Padding(
              padding: const EdgeInsets.only(top: 18),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        for (final w in [220.0, 160.0, 90.0])
                          Container(
                            margin: const EdgeInsets.only(bottom: 8),
                            height: 11,
                            width: w,
                            decoration: BoxDecoration(
                              color: muted,
                              borderRadius: BorderRadius.circular(99),
                            ),
                          ),
                      ],
                    ),
                  ),
                  Container(
                    width: 88,
                    height: 88,
                    decoration: BoxDecoration(
                      color: muted,
                      borderRadius: BorderRadius.circular(14),
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _BlogState extends StatelessWidget {
  const _BlogState({
    required this.icon,
    required this.title,
    required this.body,
    this.action,
  });
  final IconData icon;
  final String title, body;
  final Widget? action;
  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return Padding(
      padding: const EdgeInsets.all(32),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(icon, size: 40, color: brand.mutedInk),
          const SizedBox(height: 14),
          Text(
            title,
            textAlign: TextAlign.center,
            style: TextStyle(
              color: brand.ink,
              fontSize: 18,
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            body,
            textAlign: TextAlign.center,
            style: TextStyle(color: brand.mutedInk),
          ),
          if (action != null) ...[const SizedBox(height: 16), action!],
        ],
      ),
    );
  }
}

/// One post, read in the app.
class BlogPostScreen extends StatelessWidget {
  const BlogPostScreen({required this.post, super.key});
  final BlogPost post;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final cover = post.coverAt(1600);
    final top = MediaQuery.paddingOf(context).top;
    return Scaffold(
      backgroundColor: brand.background,
      body: CustomScrollView(
        slivers: [
          SliverAppBar(
            pinned: true,
            expandedHeight: cover == null ? null : 260 + top,
            backgroundColor: brand.heroDeep,
            foregroundColor: Colors.white,
            iconTheme: const IconThemeData(color: Colors.white),
            actions: [
              IconButton(
                tooltip: 'Share post',
                onPressed: () => Share.share('${post.title}\n${post.url}'),
                icon: const Icon(Icons.ios_share_rounded),
              ),
              IconButton(
                tooltip: 'Open on the web',
                onPressed: () => _openWeb(post.url),
                icon: const Icon(Icons.open_in_new_rounded),
              ),
            ],
            flexibleSpace: cover == null
                ? null
                : FlexibleSpaceBar(
                    background: Stack(
                      fit: StackFit.expand,
                      children: [
                        CachedNetworkImage(
                          imageUrl: cover,
                          fit: BoxFit.cover,
                          errorWidget: (_, _, _) =>
                              ColoredBox(color: brand.heroMid),
                        ),
                        DecoratedBox(
                          decoration: BoxDecoration(
                            gradient: LinearGradient(
                              begin: Alignment.topCenter,
                              end: Alignment.bottomCenter,
                              colors: [
                                Colors.black.withValues(alpha: 0.4),
                                Colors.transparent,
                              ],
                              stops: const [0, 0.5],
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
          ),
          SliverToBoxAdapter(
            child: Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 680),
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(20, 22, 20, 40),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      _Labels(labels: post.labels),
                      const SizedBox(height: 12),
                      Semantics(
                        header: true,
                        child: Text(
                          post.title,
                          style: TextStyle(
                            color: brand.ink,
                            fontSize: 27,
                            height: 1.15,
                            fontWeight: FontWeight.w900,
                            letterSpacing: -0.6,
                          ),
                        ),
                      ),
                      const SizedBox(height: 10),
                      Text(
                        [
                          if (post.author.isNotEmpty) post.author,
                          _date(post.published),
                          '${post.readingMinutes} min read',
                        ].where((s) => s.isNotEmpty).join('  ·  '),
                        style: TextStyle(
                          color: brand.mutedInk,
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      Divider(height: 34, color: brand.divider),
                      BlogBody(
                        html: post.html,
                        onOpenWeb: () => _openWeb(post.url),
                      ),
                      const SizedBox(height: 18),
                      OutlinedButton.icon(
                        onPressed: () => _openWeb(post.url),
                        icon: const Icon(Icons.open_in_new_rounded, size: 18),
                        label: const Text('Read it on the blog'),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
