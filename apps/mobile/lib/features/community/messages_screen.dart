import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/community/chat_screen.dart';
import 'package:indigen_world_mobile/features/community/community_actions.dart';
import 'package:indigen_world_mobile/features/community/data/chat_drafts.dart';
import 'package:indigen_world_mobile/features/community/data/chat_providers.dart';
import 'package:indigen_world_mobile/features/community/data/chat_repository.dart';
import 'package:indigen_world_mobile/features/community/data/community_models.dart';
import 'package:indigen_world_mobile/features/community/data/community_providers.dart';
import 'package:indigen_world_mobile/features/community/people_screen.dart';
import 'package:indigen_world_mobile/features/community/widgets/community_avatar.dart';
import 'package:indigen_world_mobile/features/community/widgets/people_widgets.dart';

/// The inbox: every conversation this member is part of.
class MessagesScreen extends ConsumerStatefulWidget {
  const MessagesScreen({super.key});

  @override
  ConsumerState<MessagesScreen> createState() => _MessagesScreenState();
}

class _MessagesScreenState extends ConsumerState<MessagesScreen> {
  final _search = TextEditingController();
  var _query = '';

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final inbox = ref.watch(chatInboxProvider);
    final signedIn = ref.watch(currentUidProvider) != null;
    final drafts = ref.watch(chatDraftsProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Messages'),
        actions: [
          IconButton(
            tooltip: 'Start a conversation',
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute<void>(
                builder: (context) => const PeopleScreen(),
              ),
            ),
            icon: const Icon(Icons.edit_square),
          ),
        ],
      ),
      body: !signedIn
          ? CommunityEmptyState(
              icon: Icons.lock_outline_rounded,
              title: 'Sign in to message',
              message:
                  'Conversations are private between two members, so they '
                  'need an account to belong to.',
              action: FilledButton(
                onPressed: () => CommunityActions(ref).requireProfile(context),
                child: const Text('Sign in'),
              ),
            )
          : switch (inbox) {
              AsyncValue(:final value?) when value.isEmpty =>
                CommunityEmptyState(
                  icon: Icons.forum_outlined,
                  title: 'No conversations yet',
                  message:
                      'Open any member’s profile and tap Message to start '
                      'one.',
                  action: FilledButton.icon(
                    onPressed: () => Navigator.of(context).push(
                      MaterialPageRoute<void>(
                        builder: (context) => const PeopleScreen(),
                      ),
                    ),
                    icon: const Icon(Icons.search_rounded),
                    label: const Text('Find people'),
                  ),
                ),
              AsyncValue(:final value?) => _inbox(value, drafts),
              AsyncValue(hasError: true) => const CommunityEmptyState(
                icon: Icons.cloud_off_rounded,
                title: 'Messages unavailable',
                message: 'Check your connection and try again.',
              ),
              _ => const Center(child: CircularProgressIndicator()),
            },
    );
  }

  /// The conversations, under a box that narrows them by name, handle or the
  /// last thing said. The box appears once there is enough to search.
  Widget _inbox(List<ChatThread> threads, Map<String, String> drafts) {
    final shown = threads.where((thread) => thread.matches(_query)).toList();
    return Column(
      children: [
        if (threads.length > 5 || _query.isNotEmpty)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 10, 16, 4),
            child: TextField(
              key: const Key('inbox-search'),
              controller: _search,
              onChanged: (value) => setState(() => _query = value),
              textInputAction: TextInputAction.search,
              decoration: InputDecoration(
                hintText: 'Search conversations',
                isDense: true,
                prefixIcon: const Icon(Icons.search_rounded),
                suffixIcon: _query.isEmpty
                    ? null
                    : IconButton(
                        tooltip: 'Clear search',
                        onPressed: () {
                          _search.clear();
                          setState(() => _query = '');
                        },
                        icon: const Icon(Icons.close_rounded),
                      ),
              ),
            ),
          ),
        Expanded(
          child: shown.isEmpty
              ? CommunityEmptyState(
                  icon: Icons.search_off_rounded,
                  title: 'No conversation matches',
                  message:
                      'Nothing with “${_query.trim()}” in the name, the '
                      'handle or the last message.',
                )
              : ListView.separated(
                  padding: const EdgeInsets.symmetric(vertical: 6),
                  itemCount: shown.length,
                  separatorBuilder: (context, index) =>
                      const Divider(height: 1, indent: 76, endIndent: 16),
                  itemBuilder: (context, index) => _ThreadTile(
                    thread: shown[index],
                    draft: drafts[shown[index].id],
                  ),
                ),
        ),
      ],
    );
  }
}

class _ThreadTile extends StatelessWidget {
  const _ThreadTile({required this.thread, this.draft});

  final ChatThread thread;

  /// Words typed here and not sent. Shown in place of the last message, the
  /// way a half-written reply would be if it were a letter on the table.
  final String? draft;

  @override
  Widget build(BuildContext context) {
    final preview = thread.lastMessage.trim().isEmpty
        ? 'Say something first.'
        : thread.lastMessage.trim();
    final unsent = draft?.trim().replaceAll(RegExp(r'\s+'), ' ') ?? '';
    return ListTile(
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      leading: CommunityAvatar(
        initials: thread.other.initials,
        imageUrl: thread.other.avatarUrl,
        username: thread.other.username,
        size: 46,
      ),
      title: Row(
        children: [
          Flexible(
            child: Text(
              thread.other.displayName,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                fontSize: 14.5,
                fontWeight: FontWeight.w900,
              ),
            ),
          ),
          if (thread.muted) ...[
            const SizedBox(width: 4),
            Icon(
              Icons.notifications_off_outlined,
              key: ValueKey('inbox-muted-${thread.id}'),
              size: 14,
              color: context.brand.mutedInk,
            ),
          ],
          const SizedBox(width: 6),
          Text(
            communityAgeLabel(thread.lastMessageAt),
            style: TextStyle(
              color: context.brand.mutedInk,
              fontSize: 10,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
      subtitle: Padding(
        padding: const EdgeInsets.only(top: 2),
        child: Text.rich(
          TextSpan(
            children: [
              if (unsent.isNotEmpty)
                TextSpan(
                  text: 'Draft: ',
                  style: TextStyle(
                    color: context.brand.danger,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              TextSpan(text: unsent.isNotEmpty ? unsent : preview),
            ],
          ),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: TextStyle(
            fontSize: 12.5,
            color: thread.hasUnread
                ? context.brand.ink
                : context.brand.mutedInk,
            fontWeight: thread.hasUnread ? FontWeight.w800 : FontWeight.w500,
          ),
        ),
      ),
      trailing: thread.hasUnread
          ? Container(
              padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
              constraints: const BoxConstraints(minWidth: 22),
              decoration: BoxDecoration(
                color: context.brand.terracotta,
                borderRadius: BorderRadius.circular(999),
              ),
              child: Text(
                thread.unreadCount > 99 ? '99+' : '${thread.unreadCount}',
                textAlign: TextAlign.center,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 10,
                  fontWeight: FontWeight.w900,
                ),
              ),
            )
          : null,
      onTap: () => Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (context) => ChatScreen(
            threadId: thread.id,
            otherUid: thread.other.uid,
            otherName: thread.other.displayName,
            otherAvatarUrl: thread.other.avatarUrl,
          ),
        ),
      ),
    );
  }
}
