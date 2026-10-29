import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/community/data/chat_providers.dart';
import 'package:indigen_world_mobile/features/community/data/chat_repository.dart';
import 'package:indigen_world_mobile/features/community/data/community_models.dart';
import 'package:indigen_world_mobile/features/community/widgets/community_avatar.dart';
import 'package:indigen_world_mobile/features/community/widgets/people_widgets.dart';

/// The address a post is shared by — and what a chat bubble recognises as a
/// post to draw as a card.
String communityPostLink(String postId) =>
    'https://indigenworld.com/post/$postId';

final _postLinkPattern = RegExp(
  r'https?://(?:www\.)?indigenworld\.com/post/([A-Za-z0-9_-]{1,64})',
);

/// The id of the first community post [text] links to, or null.
String? linkedCommunityPostId(String text) =>
    _postLinkPattern.firstMatch(text)?.group(1);

/// Lets the member send [post] into one of their conversations.
///
/// The recent conversations only, newest first: sending something to
/// somebody you have never spoken to is what the profile's Message button is
/// for, and a picker of every member would be a directory nobody needs here.
Future<void> showSendPostSheet(
  BuildContext context,
  CommunityProfile me,
  CommunityPost post,
) => showModalBottomSheet<void>(
  context: context,
  useSafeArea: true,
  isScrollControlled: true,
  showDragHandle: true,
  builder: (context) => _SendPostSheet(me: me, post: post),
);

class _SendPostSheet extends ConsumerStatefulWidget {
  const _SendPostSheet({required this.me, required this.post});

  final CommunityProfile me;
  final CommunityPost post;

  @override
  ConsumerState<_SendPostSheet> createState() => _SendPostSheetState();
}

class _SendPostSheetState extends ConsumerState<_SendPostSheet> {
  final _note = TextEditingController();
  final _sentTo = <String>{};
  String? _sending;

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  Future<void> _send(ChatThread thread) async {
    final repository = ref.read(chatRepositoryProvider);
    if (repository == null || _sending != null) return;
    setState(() => _sending = thread.id);
    final note = _note.text.trim();
    try {
      await repository.sendMessage(
        threadId: thread.id,
        sender: widget.me,
        recipientId: thread.other.uid,
        text: [
          if (note.isNotEmpty) note,
          communityPostLink(widget.post.id),
        ].join('\n'),
      );
      HapticFeedback.lightImpact();
      if (!mounted) return;
      setState(() {
        _sending = null;
        _sentTo.add(thread.id);
      });
    } on Object {
      if (!mounted) return;
      setState(() => _sending = null);
      showCommunityMessage(context, 'Not sent. Try again.');
    }
  }

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final inbox = ref.watch(chatInboxProvider);
    return Padding(
      padding: EdgeInsets.fromLTRB(
        20,
        0,
        20,
        16 + MediaQuery.viewInsetsOf(context).bottom,
      ),
      child: SizedBox(
        height: MediaQuery.sizeOf(context).height * 0.6,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Send in a message',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 10),
            TextField(
              key: const Key('send-post-note'),
              controller: _note,
              maxLength: 200,
              textCapitalization: TextCapitalization.sentences,
              decoration: const InputDecoration(
                hintText: 'Add a note (optional)',
                counterText: '',
              ),
            ),
            const SizedBox(height: 8),
            Expanded(
              child: switch (inbox) {
                AsyncValue(:final value?) when value.isEmpty => Center(
                  child: Text(
                    'No conversations yet. Message somebody from their '
                    'profile first.',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: brand.mutedInk),
                  ),
                ),
                AsyncValue(:final value?) => ListView.builder(
                  itemCount: value.length,
                  itemBuilder: (context, index) {
                    final thread = value[index];
                    final sent = _sentTo.contains(thread.id);
                    return ListTile(
                      key: ValueKey('send-post-to-${thread.id}'),
                      contentPadding: EdgeInsets.zero,
                      leading: CommunityAvatar(
                        initials: thread.other.initials,
                        imageUrl: thread.other.avatarUrl,
                        size: 40,
                      ),
                      title: Text(
                        thread.other.displayName,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontWeight: FontWeight.w800),
                      ),
                      subtitle: Text(
                        thread.other.handle,
                        style: TextStyle(color: brand.mutedInk, fontSize: 12),
                      ),
                      trailing: sent
                          ? Icon(
                              Icons.check_circle_rounded,
                              color: brand.accent,
                            )
                          : FilledButton.tonal(
                              onPressed: _sending == null
                                  ? () => _send(thread)
                                  : null,
                              child: Text(
                                _sending == thread.id ? 'Sending…' : 'Send',
                              ),
                            ),
                    );
                  },
                ),
                AsyncValue(hasError: true) => Center(
                  child: Text(
                    'Your conversations could not load.',
                    style: TextStyle(color: brand.mutedInk),
                  ),
                ),
                _ => const Center(child: CircularProgressIndicator()),
              },
            ),
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: Text(_sentTo.isEmpty ? 'Cancel' : 'Done'),
            ),
          ],
        ),
      ),
    );
  }
}
