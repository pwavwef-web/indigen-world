import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/community/data/community_providers.dart';
import 'package:indigen_world_mobile/features/community/post_detail_screen.dart';

/// A community post linked in a message, drawn as the post rather than as an
/// address — who wrote it, the start of it, its first photo.
///
/// Reads the post live, so it says so when the post has been deleted rather
/// than advertising writing that is no longer there. Only public posts can be
/// linked this way; a private community's posts have no address.
class ChatPostLinkCard extends ConsumerWidget {
  const ChatPostLinkCard({
    required this.postId,
    required this.onMine,
    super.key,
  });

  final String postId;

  /// Whether the bubble around this is the reader's own, which is drawn on the
  /// accent colour and needs light ink.
  final bool onMine;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final brand = context.brand;
    final post = ref.watch(postProvider(postId));
    final ink = onMine ? Colors.white : brand.ink;
    final muted = onMine ? Colors.white70 : brand.mutedInk;
    final ground = onMine
        ? Colors.white.withValues(alpha: 0.14)
        : brand.accentSoft;

    final value = post.asData?.value;
    final photo = value?.media
        .where((item) => item.type == 'image')
        .map((item) => item.thumbnailUrl ?? item.url)
        .firstOrNull;

    return Semantics(
      button: value != null,
      label: value == null ? null : 'Post by ${value.authorName}',
      child: GestureDetector(
        key: ValueKey('chat-post-card-$postId'),
        behavior: HitTestBehavior.opaque,
        onTap: value == null
            ? null
            : () => Navigator.of(context).push(
                MaterialPageRoute<void>(
                  builder: (context) => PostDetailScreen(postId: postId),
                ),
              ),
        child: Container(
          margin: const EdgeInsets.only(top: 6, bottom: 2),
          padding: const EdgeInsets.all(9),
          constraints: const BoxConstraints(maxWidth: 260),
          decoration: BoxDecoration(
            color: ground,
            borderRadius: BorderRadius.circular(12),
          ),
          child: switch (post) {
            AsyncValue(hasValue: true) when value == null => Text(
              'This post is no longer available.',
              style: TextStyle(color: muted, fontSize: 12.5),
            ),
            AsyncValue(hasValue: true) => Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (photo != null) ...[
                  ClipRRect(
                    borderRadius: BorderRadius.circular(8),
                    child: SizedBox.square(
                      dimension: 48,
                      child: CachedNetworkImage(
                        imageUrl: photo,
                        fit: BoxFit.cover,
                        errorWidget: (context, url, error) =>
                            ColoredBox(color: brand.divider),
                      ),
                    ),
                  ),
                  const SizedBox(width: 9),
                ],
                Flexible(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        value!.authorName,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: ink,
                          fontSize: 12.5,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      if (value.text.trim().isNotEmpty)
                        Text(
                          value.text.trim(),
                          maxLines: 3,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            color: ink,
                            fontSize: 13,
                            height: 1.3,
                          ),
                        ),
                      const SizedBox(height: 2),
                      Text(
                        'Community post',
                        style: TextStyle(
                          color: muted,
                          fontSize: 10.5,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            AsyncValue(hasError: true) => Text(
              'This post could not load.',
              style: TextStyle(color: muted, fontSize: 12.5),
            ),
            _ => SizedBox(
              height: 36,
              child: Center(
                child: SizedBox.square(
                  dimension: 16,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: muted,
                  ),
                ),
              ),
            ),
          },
        ),
      ),
    );
  }
}
