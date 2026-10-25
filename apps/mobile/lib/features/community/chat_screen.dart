import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/community/community_actions.dart';
import 'package:indigen_world_mobile/features/community/community_profile_screen.dart';
import 'package:indigen_world_mobile/features/community/data/chat_drafts.dart';
import 'package:indigen_world_mobile/features/community/data/chat_providers.dart';
import 'package:indigen_world_mobile/features/community/data/chat_repository.dart';
import 'package:indigen_world_mobile/features/community/data/community_models.dart';
import 'package:indigen_world_mobile/features/community/data/community_providers.dart';
import 'package:indigen_world_mobile/features/community/widgets/community_avatar.dart';
import 'package:indigen_world_mobile/features/community/widgets/people_widgets.dart';
import 'package:indigen_world_mobile/features/dictionary/kasem_key_bar.dart';
import 'package:indigen_world_mobile/features/notifications/local_alerts.dart';
import 'package:indigen_world_mobile/features/notifications/push_nudge.dart';
import 'package:indigen_world_mobile/features/settings/kasem_keyboard_toggle.dart';
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
  final _focus = FocusNode();
  final _scroll = ScrollController();
  var _sending = false;

  /// The message the next one answers, while the reply bar is up.
  ChatReplyRef? _replyingTo;

  /// Messages older than the live window, loaded on request, newest first.
  final _earlier = <ChatMessage>[];
  var _loadingEarlier = false;
  var _noMoreEarlier = false;

  /// One key per drawn message, so tapping a quote can find its original.
  final _messageKeys = <String, GlobalKey>{};

  /// Writes the draft a moment after typing stops, rather than on every key.
  Timer? _draftSave;
  late final ChatDrafts _drafts;

  /// Held from the start because `dispose` may not use `ref`: Riverpod
  /// refuses it once the element is unmounting, which used to leave this
  /// conversation marked open — and its alerts suppressed — after leaving it.
  late final ActiveChatThread _activeThread;

  @override
  void initState() {
    super.initState();
    _drafts = ref.read(chatDraftsProvider.notifier);
    _activeThread = ref.read(activeChatThreadProvider.notifier);
    _controller.addListener(_scheduleDraftSave);
    // Opening the thread is what marks it read. Doing it after the first frame
    // keeps the write off the path that has to paint.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      _markRead();
      // Announce which conversation is on screen, so a push about this one is
      // not drawn over the very message being read.
      _activeThread.open(widget.threadId);
      // And take down the alert about it already in the shade: the member is
      // reading the conversation it was announcing.
      unawaited(clearAlertsFor(threadId: widget.threadId));
      unawaited(_restoreDraft());
    });
  }

  /// Puts back what was being written when the member last left. Only into an
  /// empty box — anything typed in the moment before it loads wins.
  Future<void> _restoreDraft() async {
    final draft = await _drafts.read(widget.threadId);
    if (!mounted || draft == null || _controller.text.isNotEmpty) return;
    _controller.value = TextEditingValue(
      text: draft,
      selection: TextSelection.collapsed(offset: draft.length),
    );
  }

  void _scheduleDraftSave() {
    _draftSave?.cancel();
    _draftSave = Timer(
      const Duration(milliseconds: 400),
      () => unawaited(_drafts.save(widget.threadId, _controller.text)),
    );
  }

  @override
  void dispose() {
    _activeThread.close(widget.threadId);
    // Whatever is in the box when the member leaves is the draft — saved now,
    // not left to a timer that dies with this screen.
    _draftSave?.cancel();
    unawaited(_drafts.save(widget.threadId, _controller.text));
    _controller
      ..removeListener(_scheduleDraftSave)
      ..dispose();
    _focus.dispose();
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _markRead() async {
    final uid = ref.read(currentUidProvider);
    final repository = ref.read(chatRepositoryProvider);
    if (uid == null || repository == null) return;
    await repository.markRead(
      threadId: widget.threadId,
      uid: uid,
      receipts: ref.read(chatReadReceiptsProvider),
    );
  }

  /// Fetches the page before the oldest message on screen.
  Future<void> _loadEarlier(ChatMessage oldest) async {
    final repository = ref.read(chatRepositoryProvider);
    if (repository == null || _loadingEarlier) return;
    setState(() => _loadingEarlier = true);
    try {
      final page = await repository.loadEarlier(
        threadId: widget.threadId,
        oldest: oldest,
      );
      if (!mounted) return;
      setState(() {
        _earlier.addAll(page);
        _noMoreEarlier = page.length < ChatRepository.messagePageSize;
      });
    } on Object {
      if (mounted) showGlassToast(context, 'Earlier messages did not load.');
    } finally {
      if (mounted) setState(() => _loadingEarlier = false);
    }
  }

  void _replyTo(ChatMessage message) {
    HapticFeedback.selectionClick();
    setState(() => _replyingTo = ChatReplyRef.of(message));
    _focus.requestFocus();
  }

  /// Brings the message a quote points at into view, when it is loaded.
  Future<void> _showOriginal(ChatReplyRef reply, List<ChatMessage> all) async {
    final index = all.indexWhere((message) => message.id == reply.messageId);
    if (index < 0) {
      showGlassToast(context, 'That message is further back, or was deleted.');
      return;
    }
    BuildContext? target() => _messageKeys[reply.messageId]?.currentContext;
    if (target() == null && _scroll.hasClients) {
      // Not built yet: jump near where it sits, then let the list build it.
      _scroll.jumpTo((index * 72.0).clamp(0, _scroll.position.maxScrollExtent));
      await WidgetsBinding.instance.endOfFrame;
    }
    final found = target();
    if (found != null && found.mounted) {
      await Scrollable.ensureVisible(
        found,
        alignment: 0.5,
        duration: const Duration(milliseconds: 260),
      );
    }
  }

  Future<void> _toggleMuted(bool muted) async {
    final uid = ref.read(currentUidProvider);
    final repository = ref.read(chatRepositoryProvider);
    if (uid == null || repository == null) return;
    try {
      await repository.setMuted(
        threadId: widget.threadId,
        uid: uid,
        muted: !muted,
      );
      if (mounted) {
        showGlassToast(
          context,
          muted
              ? 'Alerts are back on for this conversation.'
              : 'Muted. Messages still arrive, without alerts.',
        );
      }
    } on Object {
      if (mounted) showGlassToast(context, 'Could not change that. Try again.');
    }
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
        replyTo: _replyingTo,
      );
      sent = true;
      _draftSave?.cancel();
      unawaited(_drafts.clear(widget.threadId));
      if (!mounted) return;
      _controller.clear();
      setState(() => _replyingTo = null);
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

  /// What a held message offers: copying it, for anybody's message, and
  /// deleting it, for your own.
  ///
  /// Copying used to be impossible — the only thing a long press did was ask
  /// to delete, and only on your own messages — which is a strange gap in a
  /// conversation where people send each other Kasem spellings, phone
  /// numbers and directions.
  Future<void> _messageMenu(ChatMessage message, {required bool mine}) async {
    HapticFeedback.mediumImpact();
    final brand = context.brand;
    final choice = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      backgroundColor: brand.surface,
      builder: (sheet) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              key: const Key('chat-menu-reply'),
              leading: const Icon(Icons.reply_rounded),
              title: const Text('Reply'),
              onTap: () => Navigator.pop(sheet, 'reply'),
            ),
            ListTile(
              leading: const Icon(Icons.copy_rounded),
              title: const Text('Copy text'),
              onTap: () => Navigator.pop(sheet, 'copy'),
            ),
            if (mine)
              ListTile(
                leading: Icon(
                  Icons.delete_outline_rounded,
                  color: brand.danger,
                ),
                title: Text('Delete', style: TextStyle(color: brand.danger)),
                onTap: () => Navigator.pop(sheet, 'delete'),
              ),
          ],
        ),
      ),
    );
    if (!mounted) return;
    switch (choice) {
      case 'reply':
        _replyTo(message);
      case 'copy':
        await Clipboard.setData(ClipboardData(text: message.text));
        if (mounted) showGlassToast(context, 'Message copied');
      case 'delete':
        await _delete(message);
    }
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
    final thread = ref.watch(chatThreadLiveProvider(widget.threadId));
    final muted = thread.asData?.value?.muted ?? false;
    final receipts = ref.watch(chatReadReceiptsProvider);

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
                username: liveProfile?.username,
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
              if (muted)
                Padding(
                  padding: const EdgeInsets.only(left: 6),
                  child: Icon(
                    Icons.notifications_off_outlined,
                    key: const Key('chat-muted-icon'),
                    size: 18,
                    color: context.brand.mutedInk,
                  ),
                ),
            ],
          ),
        ),
        actions: [
          PopupMenuButton<String>(
            key: const Key('chat-menu'),
            tooltip: 'Conversation options',
            onSelected: (choice) {
              if (choice == 'mute') unawaited(_toggleMuted(muted));
            },
            itemBuilder: (context) => [
              PopupMenuItem(
                key: const Key('chat-menu-mute'),
                value: 'mute',
                child: ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: Icon(
                    muted
                        ? Icons.notifications_active_outlined
                        : Icons.notifications_off_outlined,
                  ),
                  title: Text(muted ? 'Unmute alerts' : 'Mute alerts'),
                ),
              ),
            ],
          ),
        ],
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
              AsyncValue(:final value?) => _messageList(
                // The live window, then anything older that was asked for.
                [
                  ...value,
                  ..._earlier.where(
                    (old) => !value.any((live) => live.id == old.id),
                  ),
                ],
                liveCount: value.length,
                myUid: myUid,
                otherReadAt: receipts
                    ? thread.asData?.value?.otherReadAt
                    : null,
              ),
              AsyncValue(hasError: true) => const CommunityEmptyState(
                icon: Icons.cloud_off_rounded,
                title: 'Messages unavailable',
                message: 'Check your connection and try again.',
              ),
              _ => const Center(child: CircularProgressIndicator()),
            },
          ),
          if (_replyingTo case final reply?)
            _ReplyBar(
              reply: reply,
              toSelf: reply.senderId == myUid,
              otherName: name,
              onCancel: () => setState(() => _replyingTo = null),
            ),
          // The letters a phone keyboard has no key for, while the box has the
          // cursor — people write each other Kasem here more than anywhere.
          KasemKeyBar(targets: {_controller: _focus}),
          KasemKeyboardToggle(targets: {_controller: _focus}),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 4, 12, 8),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Expanded(
                    child: TextField(
                      key: const Key('chat-composer'),
                      controller: _controller,
                      focusNode: _focus,
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
                      backgroundColor: context.brand.accentFill,
                      foregroundColor: context.brand.onAccentFill,
                    ),
                    icon: _sending
                        ? SizedBox.square(
                            dimension: 18,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: context.brand.gold,
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

  /// The conversation, newest at the bottom: day headings between days, a
  /// "Seen" under the last thing you said once it has been read, and — past
  /// the live window — the way to what came before.
  Widget _messageList(
    List<ChatMessage> all, {
    required int liveCount,
    required String? myUid,
    required DateTime? otherReadAt,
  }) {
    // More can exist only once the live window is full; after that, until a
    // page comes back short.
    final mayHaveEarlier =
        liveCount >= ChatRepository.messagePageSize && !_noMoreEarlier;
    final newest = all.firstOrNull;
    final seen =
        newest != null &&
        newest.senderId == myUid &&
        chatMessageSeen(newestMine: newest, otherReadAt: otherReadAt);
    final now = DateTime.now();
    return ListView.builder(
      key: const Key('chat-messages'),
      controller: _scroll,
      // Newest first from Firestore, so the list is reversed and the thread
      // opens at the most recent message without a scroll.
      reverse: true,
      padding: const EdgeInsets.fromLTRB(14, 14, 14, 6),
      itemCount: all.length + (mayHaveEarlier ? 1 : 0),
      itemBuilder: (context, index) {
        if (index == all.length) {
          return Padding(
            padding: const EdgeInsets.symmetric(vertical: 10),
            child: Center(
              child: _loadingEarlier
                  ? const SizedBox.square(
                      dimension: 22,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : OutlinedButton.icon(
                      key: const Key('chat-load-earlier'),
                      onPressed: () => _loadEarlier(all.last),
                      icon: const Icon(Icons.history_rounded),
                      label: const Text('Load earlier messages'),
                    ),
            ),
          );
        }
        final message = all[index];
        final mine = message.senderId == myUid;
        final day = chatDayLabel(
          message,
          index + 1 < all.length ? all[index + 1] : null,
          now: now,
        );
        final key = _messageKeys.putIfAbsent(message.id, GlobalKey.new);
        return Column(
          key: ValueKey('message-${message.id}'),
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (day != null) _DayDivider(label: day),
            _SwipeToReply(
              onReply: () => _replyTo(message),
              child: _MessageBubble(
                key: key,
                message: message,
                mine: mine,
                replyAuthor: switch (message.replyTo?.senderId) {
                  null => null,
                  final sender when sender == myUid => 'You',
                  _ => widget.otherName,
                },
                onQuoteTap: message.replyTo == null
                    ? null
                    : () => _showOriginal(message.replyTo!, all),
                onLongPress: () => _messageMenu(message, mine: mine),
              ),
            ),
            if (index == 0 && seen)
              Padding(
                padding: const EdgeInsets.only(right: 4, bottom: 4),
                child: Text(
                  'Seen',
                  key: const Key('chat-seen'),
                  textAlign: TextAlign.end,
                  style: TextStyle(
                    color: context.brand.mutedInk,
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
          ],
        );
      },
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
    this.replyAuthor,
    this.onQuoteTap,
    this.onLongPress,
    super.key,
  });

  final ChatMessage message;
  final bool mine;

  /// Who wrote the message this one answers — "You" or their name.
  final String? replyAuthor;
  final VoidCallback? onQuoteTap;
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
                color: mine ? context.brand.accent : context.brand.surface,
                borderRadius: BorderRadius.only(
                  topLeft: const Radius.circular(16),
                  topRight: const Radius.circular(16),
                  bottomLeft: Radius.circular(mine ? 16 : 4),
                  bottomRight: Radius.circular(mine ? 4 : 16),
                ),
                border: Border.all(
                  color: mine ? Colors.transparent : context.brand.divider,
                ),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  if (message.replyTo case final reply?)
                    _Quote(
                      author: replyAuthor ?? '',
                      excerpt: reply.excerpt,
                      onMine: mine,
                      onTap: onQuoteTap,
                    ),
                  Text(
                    message.text,
                    style: TextStyle(
                      fontSize: 15,
                      height: 1.35,
                      color: mine ? Colors.white : context.brand.ink,
                    ),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    communityAgeLabel(message.createdAt),
                    style: TextStyle(
                      fontSize: 8.5,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 0.5,
                      color: mine ? Colors.white54 : context.brand.mutedInk,
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

/// The message a reply answers, drawn inside the reply above its words.
class _Quote extends StatelessWidget {
  const _Quote({
    required this.author,
    required this.excerpt,
    required this.onMine,
    this.onTap,
  });

  final String author;
  final String excerpt;

  /// Drawn on the sender's coloured bubble rather than the plain one.
  final bool onMine;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final ink = onMine ? Colors.white : brand.ink;
    return Semantics(
      button: onTap != null,
      label: 'Replying to $author: $excerpt',
      excludeSemantics: true,
      child: GestureDetector(
        key: const Key('chat-quote'),
        onTap: onTap,
        child: Container(
          margin: const EdgeInsets.only(bottom: 6),
          padding: const EdgeInsets.fromLTRB(9, 6, 9, 6),
          decoration: BoxDecoration(
            color: onMine
                ? Colors.white.withValues(alpha: 0.16)
                : brand.surfaceMuted,
            borderRadius: BorderRadius.circular(9),
            border: Border(
              left: BorderSide(
                color: onMine ? Colors.white : brand.accent,
                width: 3,
              ),
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              if (author.isNotEmpty)
                Text(
                  author,
                  style: TextStyle(
                    color: ink,
                    fontSize: 11.5,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              Text(
                excerpt,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  color: ink.withValues(alpha: 0.82),
                  fontSize: 12.5,
                  height: 1.3,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// "Replying to …" above the composer, with the way out of it.
class _ReplyBar extends StatelessWidget {
  const _ReplyBar({
    required this.reply,
    required this.toSelf,
    required this.otherName,
    required this.onCancel,
  });

  final ChatReplyRef reply;
  final bool toSelf;
  final String otherName;
  final VoidCallback onCancel;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return Container(
      key: const Key('chat-reply-bar'),
      padding: const EdgeInsets.fromLTRB(16, 8, 4, 6),
      decoration: BoxDecoration(
        color: brand.surface,
        border: Border(top: BorderSide(color: brand.divider)),
      ),
      child: Row(
        children: [
          Icon(Icons.reply_rounded, color: brand.accent, size: 20),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  toSelf ? 'Replying to yourself' : 'Replying to $otherName',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: brand.accent,
                    fontSize: 12,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                Text(
                  reply.excerpt,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(color: brand.mutedInk, fontSize: 12.5),
                ),
              ],
            ),
          ),
          IconButton(
            key: const Key('chat-reply-cancel'),
            tooltip: 'Cancel reply',
            onPressed: onCancel,
            icon: const Icon(Icons.close_rounded),
          ),
        ],
      ),
    );
  }
}

/// "Today", "Yesterday", "Mon 20 Oct" between the days of a conversation.
class _DayDivider extends StatelessWidget {
  const _DayDivider({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: Row(
        children: [
          Expanded(child: Divider(color: brand.divider)),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 10),
            child: Text(
              label,
              style: TextStyle(
                color: brand.mutedInk,
                fontSize: 11,
                fontWeight: FontWeight.w800,
                letterSpacing: 0.4,
              ),
            ),
          ),
          Expanded(child: Divider(color: brand.divider)),
        ],
      ),
    );
  }
}

/// A message that follows the finger a little way right, and answers it with
/// a reply once pulled far enough — the gesture every messaging app has taught.
class _SwipeToReply extends StatefulWidget {
  const _SwipeToReply({required this.onReply, required this.child});

  final VoidCallback onReply;
  final Widget child;

  @override
  State<_SwipeToReply> createState() => _SwipeToReplyState();
}

class _SwipeToReplyState extends State<_SwipeToReply> {
  static const _trigger = 56.0;
  var _dx = 0.0;
  var _armed = false;

  @override
  Widget build(BuildContext context) => GestureDetector(
    behavior: HitTestBehavior.translucent,
    onHorizontalDragUpdate: (details) {
      final next = (_dx + details.delta.dx).clamp(0.0, _trigger * 1.3);
      final armed = next >= _trigger;
      if (armed && !_armed) HapticFeedback.selectionClick();
      setState(() {
        _dx = next;
        _armed = armed;
      });
    },
    onHorizontalDragEnd: (_) {
      if (_armed) widget.onReply();
      setState(() {
        _dx = 0;
        _armed = false;
      });
    },
    onHorizontalDragCancel: () => setState(() {
      _dx = 0;
      _armed = false;
    }),
    child: Stack(
      alignment: Alignment.centerLeft,
      children: [
        if (_dx > 0)
          Opacity(
            opacity: (_dx / _trigger).clamp(0.0, 1.0),
            child: Icon(
              Icons.reply_rounded,
              color: context.brand.accent,
              size: 22,
            ),
          ),
        AnimatedContainer(
          duration: _dx == 0
              ? const Duration(milliseconds: 180)
              : Duration.zero,
          curve: Curves.easeOut,
          transform: Matrix4.translationValues(_dx, 0, 0),
          child: widget.child,
        ),
      ],
    ),
  );
}
