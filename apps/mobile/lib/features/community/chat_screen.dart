import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/community/community_actions.dart';
import 'package:indigen_world_mobile/features/community/community_profile_screen.dart';
import 'package:indigen_world_mobile/features/community/data/chat_providers.dart';
import 'package:indigen_world_mobile/features/community/data/chat_repository.dart';
import 'package:indigen_world_mobile/features/community/data/community_models.dart';
import 'package:indigen_world_mobile/features/community/data/community_providers.dart';
import 'package:indigen_world_mobile/features/community/widgets/community_avatar.dart';
import 'package:indigen_world_mobile/features/community/widgets/people_widgets.dart';
import 'package:indigen_world_mobile/features/notifications/push_nudge.dart';
import 'package:indigen_world_mobile/shared/glass_popup.dart';

/// Opens the conversation with [profile], creating the thread on first use.
///
/// Returns without navigating when the member has not signed in or taken a
/// handle yet: a message needs a public identity on both ends, and the prompt
/// for that has already been shown by the time this gives up.
Future<void> openChatWith(
  BuildContext context,
  WidgetRef ref,
  CommunityProfile profile,
) async {
  final me = await CommunityActions(ref).requireProfile(context);
  final repository = ref.read(chatRepositoryProvider);
  if (me == null || repository == null || !context.mounted) return;
  if (me.uid == profile.uid) {
    showCommunityMessage(context, 'That is your own profile.');
    return;
  }
  String threadId;
  try {
    threadId = await repository.openThread(me: me, other: profile);
  } on Object {
    if (context.mounted) {
      showCommunityMessage(context, 'Could not open that conversation.');
    }
    return;
  }
  if (!context.mounted) return;
  await Navigator.of(context).push(
    MaterialPageRoute<void>(
      builder: (context) => ChatScreen(
        threadId: threadId,
        otherUid: profile.uid,
        otherName: profile.displayName,
        otherAvatarUrl: profile.avatarUrl,
      ),
    ),
  );
}

/// One private conversation.
class ChatScreen extends ConsumerStatefulWidget {
  const ChatScreen({
    required this.threadId,
    required this.otherUid,
    required this.otherName,
    this.otherAvatarUrl,
    super.key,
  });

  final String threadId;
  final String otherUid;
  final String otherName;
  final String? otherAvatarUrl;

  @override
  ConsumerState<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends ConsumerState<ChatScreen> {
  final _controller = TextEditingController();
  var _sending = false;

  @override
  void initState() {
    super.initState();
    // Opening the thread is what marks it read. Doing it after the first frame
    // keeps the write off the path that has to paint.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      _markRead();
      // Announce which conversation is on screen, so a push about this one is
      // not drawn over the very message being read.
      ref.read(activeChatThreadProvider.notifier).open(widget.threadId);
    });
  }

  @override
  void dispose() {
    ref.read(activeChatThreadProvider.notifier).close(widget.threadId);
    _controller.dispose();
    super.dispose();
  }

  Future<void> _markRead() async {
    final uid = ref.read(currentUidProvider);
    final repository = ref.read(chatRepositoryProvider);
    if (uid == null || repository == null) return;
    await repository.markRead(threadId: widget.threadId, uid: uid);
  }

  Future<void> _send() async {
    final body = _controller.text.trim();
    if (body.isEmpty || _sending) return;
    final me = ref.read(myCommunityProfileProvider).asData?.value;
    final repository = ref.read(chatRepositoryProvider);
    if (me == null || repository == null) {
      showCommunityMessage(context, 'Set up your community profile first.');
      return;
    }

    setState(() => _sending = true);
    var sent = false;
    try {
      await repository.sendMessage(
        threadId: widget.threadId,
        sender: me,
        recipientId: widget.otherUid,
        text: body,
      );
      sent = true;
      if (!mounted) return;
      _controller.clear();
      HapticFeedback.lightImpact();
    } on Object {
      if (mounted) showGlassToast(context, 'Message not sent. Try again.');
    } finally {
      if (mounted) setState(() => _sending = false);
    }

    // Outside the catch on purpose. Anything that fails while asking about
    // alerts is unrelated to whether the message went — reporting "Message not
    // sent" for one that was would have somebody send it twice.
    //
    // The message is away; there is now somebody who might answer it and no way
    // to be told when they do. A start-up decline gets exactly one second ask,
    // and this is the moment it means something.
    if (sent && mounted) await maybeOfferPushNudge(context, ref);
  }

  Future<void> _delete(ChatMessage message) async {
    final confirmed = await showGlassConfirm(
      context: context,
      title: 'Delete this message?',
      message: 'It is removed for both of you. This cannot be undone.',
      confirmLabel: 'Delete',
      isDestructive: true,
    );
    if (confirmed != true) return;
    final repository = ref.read(chatRepositoryProvider);
    if (repository == null) return;
    try {
      await repository.deleteMessage(
        threadId: widget.threadId,
        messageId: message.id,
      );
    } on Object {
      if (mounted) showGlassToast(context, 'Could not delete that message.');
    }
  }

  @override
  Widget build(BuildContext context) {
    final messages = ref.watch(chatMessagesProvider(widget.threadId));
    final myUid = ref.watch(currentUidProvider);
    final liveProfile = ref
        .watch(communityProfileProvider(widget.otherUid))
        .asData
        ?.value;
    final name = liveProfile?.displayName ?? widget.otherName;
    final avatarUrl = liveProfile?.avatarUrl ?? widget.otherAvatarUrl;

    // Arriving messages clear the badge while the thread is open, so a reply
    // that lands under the reader's eyes is not still counted as unread.
    ref.listen(chatMessagesProvider(widget.threadId), (_, _) => _markRead());

    return Scaffold(
      appBar: AppBar(
        titleSpacing: 0,
        title: InkWell(
          onTap: () => Navigator.of(context).push(
            MaterialPageRoute<void>(
              builder: (context) =>
                  CommunityProfileScreen(uid: widget.otherUid),
            ),
          ),
          child: Row(
            children: [
              CommunityAvatar(
                initials: liveProfile?.initials ?? _initialsFor(name),
                imageUrl: avatarUrl,
                size: 34,
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
      body: Column(
        children: [
          Expanded(
            child: switch (messages) {
              AsyncValue(:final value?) when value.isEmpty =>
                const CommunityEmptyState(
                  icon: Icons.waving_hand_outlined,
                  title: 'No messages yet',
                  message:
                      'This conversation is private — only the two of you can '
                      'read it.',
                ),
              AsyncValue(:final value?) => ListView.builder(
                // Newest first from Firestore, so the list is reversed and the
                // thread opens at the most recent message without a scroll.
                reverse: true,
                padding: const EdgeInsets.fromLTRB(14, 14, 14, 6),
                itemCount: value.length,
                itemBuilder: (context, index) {
                  final message = value[index];
                  final mine = message.senderId == myUid;
                  return _MessageBubble(
                    message: message,
                    mine: mine,
                    onLongPress: mine ? () => _delete(message) : null,
                  );
                },
              ),
              AsyncValue(hasError: true) => const CommunityEmptyState(
                icon: Icons.cloud_off_rounded,
                title: 'Messages unavailable',
                message: 'Check your connection and try again.',
              ),
              _ => const Center(child: CircularProgressIndicator()),
            },
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 4, 12, 8),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Expanded(
                    child: TextField(
                      controller: _controller,
                      minLines: 1,
                      maxLines: 5,
                      maxLength: ChatRepository.maxMessageLength,
                      textInputAction: TextInputAction.newline,
                      decoration: const InputDecoration(
                        hintText: 'Write a message…',
                        isDense: true,
                        counterText: '',
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  IconButton.filled(
                    tooltip: 'Send',
                    onPressed: _sending ? null : _send,
                    style: IconButton.styleFrom(
                      backgroundColor: BrandColors.heritageGreen,
                      foregroundColor: BrandColors.kenteGold,
                    ),
                    icon: _sending
                        ? const SizedBox.square(
                            dimension: 18,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: BrandColors.kenteGold,
                            ),
                          )
                        : const Icon(Icons.send_rounded),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  static String _initialsFor(String name) {
    final source = name.trim();
    if (source.isEmpty) return '·';
    final parts = source.split(RegExp(r'\s+')).where((part) => part.isNotEmpty);
    if (parts.length >= 2) {
      return '${parts.first[0]}${parts.elementAt(1)[0]}'.toUpperCase();
    }
    return source.substring(0, source.length >= 2 ? 2 : 1).toUpperCase();
  }
}

class _MessageBubble extends StatelessWidget {
  const _MessageBubble({
    required this.message,
    required this.mine,
    this.onLongPress,
  });

  final ChatMessage message;
  final bool mine;
  final VoidCallback? onLongPress;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 8),
    child: Row(
      mainAxisAlignment: mine ? MainAxisAlignment.end : MainAxisAlignment.start,
      children: [
        Flexible(
          child: GestureDetector(
            onLongPress: onLongPress,
            child: Container(
              padding: const EdgeInsets.fromLTRB(13, 9, 13, 7),
              decoration: BoxDecoration(
                color: mine ? BrandColors.heritageGreen : BrandColors.surface,
                borderRadius: BorderRadius.only(
                  topLeft: const Radius.circular(16),
                  topRight: const Radius.circular(16),
                  bottomLeft: Radius.circular(mine ? 16 : 4),
                  bottomRight: Radius.circular(mine ? 4 : 16),
                ),
                border: Border.all(
                  color: mine ? Colors.transparent : BrandColors.divider,
                ),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    message.text,
                    style: TextStyle(
                      fontSize: 15,
                      height: 1.35,
                      color: mine ? Colors.white : BrandColors.ink,
                    ),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    communityAgeLabel(message.createdAt),
                    style: TextStyle(
                      fontSize: 8.5,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 0.5,
                      color: mine ? Colors.white54 : BrandColors.mutedInk,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
    ),
  );
}
