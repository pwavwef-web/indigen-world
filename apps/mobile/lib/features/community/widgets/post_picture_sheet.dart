import 'dart:io';
import 'dart:ui' as ui;

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/community/data/community_models.dart';
import 'package:indigen_world_mobile/features/community/widgets/community_avatar.dart';
import 'package:indigen_world_mobile/shared/glass_popup.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

/// Shows [post] drawn as a picture, with a button that shares the picture.
///
/// ── Why a picture as well as a link ───────────────────────────────────────
/// Much of the community reads and passes things on through WhatsApp status
/// and group chats, where a link is a grey line nobody taps and a picture is
/// the message. The link still travels with the picture, as its caption.
///
/// The card is drawn on screen first and captured from there, rather than
/// rendered somewhere unseen: what the member shares is exactly what they
/// were shown, photograph and all.
Future<void> showPostPictureSheet(BuildContext context, CommunityPost post) =>
    showModalBottomSheet<void>(
      context: context,
      useSafeArea: true,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (context) => _PostPictureSheet(post: post),
    );

class _PostPictureSheet extends StatefulWidget {
  const _PostPictureSheet({required this.post});

  final CommunityPost post;

  @override
  State<_PostPictureSheet> createState() => _PostPictureSheetState();
}

class _PostPictureSheetState extends State<_PostPictureSheet> {
  final _boundary = GlobalKey();
  var _sharing = false;

  Future<void> _share() async {
    setState(() => _sharing = true);
    try {
      final render =
          _boundary.currentContext?.findRenderObject()
              as RenderRepaintBoundary?;
      if (render == null) throw StateError('Card not drawn yet');
      final image = await render.toImage(pixelRatio: 3);
      final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
      image.dispose();
      if (bytes == null) throw StateError('Card could not be encoded');
      final directory = await getTemporaryDirectory();
      final file = File(
        '${directory.path}${Platform.pathSeparator}'
        'indigen-post-${widget.post.id}.png',
      );
      await file.writeAsBytes(bytes.buffer.asUint8List(), flush: true);
      await Share.shareXFiles([
        XFile(file.path, mimeType: 'image/png'),
      ], text: 'https://indigenworld.com/post/${widget.post.id}');
      if (mounted) Navigator.of(context).pop();
    } on Object {
      if (mounted) {
        setState(() => _sharing = false);
        showGlassToast(context, 'The picture could not be made. Try again.');
      }
    }
  }

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
    child: Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          'Share as a picture',
          style: Theme.of(context).textTheme.titleLarge,
        ),
        const SizedBox(height: 4),
        Text(
          'For a status or a group chat. The post’s link goes with it.',
          style: TextStyle(color: context.brand.mutedInk, fontSize: 13),
        ),
        const SizedBox(height: 16),
        Flexible(
          child: SingleChildScrollView(
            child: Center(
              child: RepaintBoundary(
                key: _boundary,
                child: PostPictureCard(post: widget.post),
              ),
            ),
          ),
        ),
        const SizedBox(height: 16),
        FilledButton.icon(
          key: const Key('post-picture-share'),
          onPressed: _sharing ? null : _share,
          icon: _sharing
              ? const SizedBox.square(
                  dimension: 16,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Icon(Icons.ios_share_rounded),
          label: Text(_sharing ? 'Making the picture…' : 'Share picture'),
        ),
      ],
    ),
  );
}

/// The post as a self-contained card: who wrote it, what they wrote, the
/// first photograph, and where to read the rest.
///
/// Drawn in fixed light colours whatever the app's theme, because the picture
/// leaves the app: a dark card dropped into somebody's light chat is a black
/// hole in it.
class PostPictureCard extends StatelessWidget {
  const PostPictureCard({required this.post, super.key});

  final CommunityPost post;

  static const _ink = Color(0xFF14213D);
  static const _muted = Color(0xFF5B6478);
  static const _accent = Color(0xFF2F6BFF);
  static const _paper = Color(0xFFFFFFFF);
  static const _wash = Color(0xFFEFF4FF);

  @override
  Widget build(BuildContext context) {
    final photo = post.media
        .where((item) => item.type == 'image')
        .map((item) => item.url)
        .firstOrNull;
    final text = post.text.trim();
    return MediaQuery.withNoTextScaling(
      child: Container(
        // Narrower on a small phone rather than wider than its screen.
        constraints: const BoxConstraints(maxWidth: 340),
        decoration: BoxDecoration(
          color: _wash,
          borderRadius: BorderRadius.circular(22),
        ),
        padding: const EdgeInsets.all(14),
        child: Container(
          decoration: BoxDecoration(
            color: _paper,
            borderRadius: BorderRadius.circular(16),
          ),
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  CommunityAvatar(
                    initials: post.initials,
                    imageUrl: post.authorAvatarUrl,
                    size: 38,
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          post.authorName,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: _ink,
                            fontSize: 15,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        Text(
                          post.handle,
                          style: const TextStyle(color: _muted, fontSize: 12.5),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              if (text.isNotEmpty) ...[
                const SizedBox(height: 12),
                Text(
                  text,
                  maxLines: photo == null ? 14 : 7,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: _ink,
                    fontSize: 16,
                    height: 1.45,
                  ),
                ),
              ],
              if (photo != null) ...[
                const SizedBox(height: 12),
                ClipRRect(
                  borderRadius: BorderRadius.circular(12),
                  child: AspectRatio(
                    aspectRatio: 4 / 3,
                    child: CachedNetworkImage(
                      imageUrl: photo,
                      fit: BoxFit.cover,
                      placeholder: (context, url) =>
                          const ColoredBox(color: _wash),
                      errorWidget: (context, url, error) =>
                          const ColoredBox(color: _wash),
                    ),
                  ),
                ),
              ],
              const SizedBox(height: 14),
              const Divider(height: 1, color: _wash),
              const SizedBox(height: 10),
              const Row(
                children: [
                  Icon(Icons.forum_outlined, size: 15, color: _accent),
                  SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      'Read and reply on Indigen World',
                      style: TextStyle(
                        color: _accent,
                        fontSize: 12.5,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
