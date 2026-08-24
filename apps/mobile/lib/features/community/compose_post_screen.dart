import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/community/data/community_models.dart';
import 'package:indigen_world_mobile/features/community/data/community_providers.dart';
import 'package:indigen_world_mobile/features/community/data/community_repository.dart';
import 'package:indigen_world_mobile/features/community/media_picker.dart';
import 'package:indigen_world_mobile/features/community/widgets/community_avatar.dart';
import 'package:indigen_world_mobile/features/community/widgets/people_widgets.dart';

/// Full-screen composer for a new post or a reply.
///
/// Attachments are staged locally and only uploaded when the member publishes,
/// so backing out of the screen never leaves orphaned files in Storage.
class ComposePostScreen extends ConsumerStatefulWidget {
  const ComposePostScreen({this.replyTo, this.initialText = '', super.key});

  /// When set, the composer publishes a reply threaded under this post.
  final CommunityPost? replyTo;

  /// Seeds the field — used when another screen sends somebody here with
  /// something to say, so they land on a draft rather than a blank page.
  final String initialText;

  @override
  ConsumerState<ComposePostScreen> createState() => _ComposePostScreenState();
}

class _ComposePostScreenState extends ConsumerState<ComposePostScreen> {
  late final _controller = TextEditingController(text: widget.initialText);
  final _attachments = <PendingUpload>[];

  var _kasemConfirmed = false;
  var _publishing = false;
  double? _progress;

  bool get _isReply => widget.replyTo != null;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _addMedia() async {
    final remaining = CommunityRepository.maxMediaPerPost - _attachments.length;
    if (remaining <= 0) {
      showCommunityMessage(
        context,
        'You can attach up to ${CommunityRepository.maxMediaPerPost} items.',
      );
      return;
    }
    final picked = await showMediaPickerSheet(
      context,
      remainingSlots: remaining,
    );
    if (picked.isEmpty || !mounted) return;
    setState(() => _attachments.addAll(picked.take(remaining)));
  }

  Future<void> _publish() async {
    final profile = ref.read(myCommunityProfileProvider).asData?.value;
    final repository = ref.read(communityRepositoryProvider);
    if (profile == null || repository == null) {
      showCommunityMessage(context, 'Set up your community profile first.');
      return;
    }
    if (_controller.text.trim().isEmpty && _attachments.isEmpty) {
      showCommunityMessage(context, 'Write something or add a photo first.');
      return;
    }
    if (!_kasemConfirmed) {
      showCommunityMessage(
        context,
        'Confirm this ${_isReply ? 'reply' : 'post'} is written in Kasem.',
      );
      return;
    }

    setState(() {
      _publishing = true;
      _progress = _attachments.isEmpty ? null : 0;
    });

    try {
      await repository.createPost(
        author: profile,
        text: _controller.text,
        attachments: _attachments,
        parentId: widget.replyTo?.id,
        rootId: widget.replyTo?.rootId ?? widget.replyTo?.id,
        kasemConfirmed: _kasemConfirmed,
        onUploadProgress: (value) {
          if (mounted) setState(() => _progress = value);
        },
      );
      if (!mounted) return;
      HapticFeedback.mediumImpact();
      Navigator.of(context).pop(true);
    } on CommunityFailure catch (error) {
      if (!mounted) return;
      setState(() {
        _publishing = false;
        _progress = null;
      });
      showCommunityMessage(context, error.message);
    } on Object {
      if (!mounted) return;
      setState(() {
        _publishing = false;
        _progress = null;
      });
      showCommunityMessage(context, 'Could not publish. Please try again.');
    }
  }

  @override
  Widget build(BuildContext context) {
    final profile = ref.watch(myCommunityProfileProvider).asData?.value;
    final length = _controller.text.characters.length;

    return Scaffold(
      appBar: AppBar(
        title: Text(_isReply ? 'Reply' : 'New post'),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 12),
            child: FilledButton(
              key: const Key('community-publish'),
              onPressed: _publishing ? null : _publish,
              style: FilledButton.styleFrom(
                minimumSize: const Size(0, 40),
                padding: const EdgeInsets.symmetric(horizontal: 18),
              ),
              child: Text(_publishing ? 'Posting…' : 'Post'),
            ),
          ),
        ],
        bottom: _progress != null
            ? PreferredSize(
                preferredSize: const Size.fromHeight(3),
                child: LinearProgressIndicator(
                  value: _progress,
                  minHeight: 3,
                  backgroundColor: BrandColors.divider,
                ),
              )
            : null,
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
          children: [
            if (widget.replyTo case final parent?) ...[
              _ReplyContext(post: parent),
              const SizedBox(height: 14),
            ],
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                CommunityAvatar(
                  initials: profile?.initials ?? '··',
                  imageUrl: profile?.avatarUrl,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: TextField(
                    key: const Key('community-composer'),
                    controller: _controller,
                    autofocus: true,
                    minLines: 5,
                    maxLines: 14,
                    maxLength: CommunityRepository.maxPostLength,
                    textCapitalization: TextCapitalization.sentences,
                    onChanged: (_) => setState(() {}),
                    decoration: InputDecoration(
                      hintText: _isReply ? 'Reply in Kasem…' : 'Bəŋə Kasem…',
                      filled: false,
                      border: InputBorder.none,
                      enabledBorder: InputBorder.none,
                      focusedBorder: InputBorder.none,
                      counterText: '',
                      contentPadding: EdgeInsets.zero,
                    ),
                    style: const TextStyle(fontSize: 17, height: 1.5),
                  ),
                ),
              ],
            ),
            if (_attachments.isNotEmpty) ...[
              const SizedBox(height: 14),
              _AttachmentStrip(
                attachments: _attachments,
                onRemove: (index) =>
                    setState(() => _attachments.removeAt(index)),
              ),
            ],
            const SizedBox(height: 18),
            CheckboxListTile(
              contentPadding: EdgeInsets.zero,
              dense: true,
              controlAffinity: ListTileControlAffinity.leading,
              value: _kasemConfirmed,
              onChanged: (value) =>
                  setState(() => _kasemConfirmed = value ?? false),
              title: Text(
                'I confirm this ${_isReply ? 'reply' : 'post'} is written in Kasem.',
                style: const TextStyle(
                  fontSize: 12.5,
                  fontWeight: FontWeight.w700,
                ),
              ),
              subtitle: const Text(
                'The community relies on a member pledge rather than automatic '
                'language detection.',
                style: TextStyle(fontSize: 10.5),
              ),
            ),
            const Divider(height: 26),
            Row(
              children: [
                IconButton.filledTonal(
                  tooltip: 'Add photo or video',
                  onPressed: _publishing ? null : _addMedia,
                  icon: const Icon(Icons.add_photo_alternate_outlined),
                ),
                const SizedBox(width: 8),
                Text(
                  '${_attachments.length}/${CommunityRepository.maxMediaPerPost}',
                  style: const TextStyle(
                    color: BrandColors.mutedInk,
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const Spacer(),
                Text(
                  '$length/${CommunityRepository.maxPostLength}',
                  style: TextStyle(
                    color: length > CommunityRepository.maxPostLength - 40
                        ? BrandColors.terracotta
                        : BrandColors.mutedInk,
                    fontSize: 12,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _ReplyContext extends StatelessWidget {
  const _ReplyContext({required this.post});

  final CommunityPost post;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(13),
    decoration: BoxDecoration(
      color: BrandColors.heritageGreen.withValues(alpha: 0.05),
      borderRadius: BorderRadius.circular(16),
      border: Border.all(
        color: BrandColors.heritageGreen.withValues(alpha: 0.12),
      ),
    ),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        CommunityAvatar(
          initials: post.initials,
          imageUrl: post.authorAvatarUrl,
          size: 32,
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Replying to ${post.handle}',
                style: const TextStyle(
                  color: BrandColors.heritageGreen,
                  fontSize: 11,
                  fontWeight: FontWeight.w900,
                ),
              ),
              const SizedBox(height: 3),
              Text(
                post.text.isEmpty ? '(media post)' : post.text,
                maxLines: 3,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 13, height: 1.4),
              ),
            ],
          ),
        ),
      ],
    ),
  );
}

class _AttachmentStrip extends StatelessWidget {
  const _AttachmentStrip({required this.attachments, required this.onRemove});

  final List<PendingUpload> attachments;
  final ValueChanged<int> onRemove;

  @override
  Widget build(BuildContext context) => SizedBox(
    height: 128,
    child: ListView.separated(
      scrollDirection: Axis.horizontal,
      itemCount: attachments.length,
      separatorBuilder: (context, index) => const SizedBox(width: 10),
      itemBuilder: (context, index) {
        final attachment = attachments[index];
        return Stack(
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(14),
              child: SizedBox(
                width: 128,
                height: 128,
                child: attachment.isVideo
                    ? const ColoredBox(
                        color: BrandColors.heritageGreen,
                        child: Center(
                          child: Icon(
                            Icons.play_circle_fill_rounded,
                            color: Colors.white,
                            size: 40,
                          ),
                        ),
                      )
                    : Image.file(
                        File(attachment.path),
                        fit: BoxFit.cover,
                        errorBuilder: (context, error, stack) =>
                            const ColoredBox(color: BrandColors.divider),
                      ),
              ),
            ),
            Positioned(
              top: 4,
              right: 4,
              child: IconButton.filled(
                tooltip: 'Remove',
                iconSize: 16,
                visualDensity: VisualDensity.compact,
                style: IconButton.styleFrom(
                  backgroundColor: Colors.black54,
                  foregroundColor: Colors.white,
                ),
                onPressed: () => onRemove(index),
                icon: const Icon(Icons.close_rounded),
              ),
            ),
          ],
        );
      },
    ),
  );
}
