import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/features/community/chat_screen.dart';
import 'package:indigen_world_mobile/features/community/data/chat_providers.dart';
import 'package:indigen_world_mobile/features/community/data/community_providers.dart';
import 'package:indigen_world_mobile/features/community/messages_screen.dart';
import 'package:indigen_world_mobile/features/community/widgets/people_widgets.dart';

/// Opens a conversation from nothing but its id.
///
/// Everywhere else in the app a chat is reached from a profile, so the other
/// member's name and face are already in hand. A tapped push has only the
/// thread id, and the screen needs the rest — so it is recovered here from the
/// stamps on the thread itself, behind a spinner, before [ChatScreen] is built.
class ChatThreadLoader extends ConsumerWidget {
  const ChatThreadLoader({required this.threadId, super.key});

  final String threadId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final signedIn = ref.watch(currentUidProvider) != null;
    if (!signedIn) {
      // The likeliest way to arrive here signed out is a push tapped after
      // signing out on a shared handset. The inbox is the honest destination:
      // it explains what is needed instead of failing at a blank thread.
      return const MessagesScreen();
    }

    final thread = ref.watch(chatThreadProvider(threadId));
    return switch (thread) {
      AsyncValue(:final value?) => ChatScreen(
        threadId: value.id,
        otherUid: value.other.uid,
        otherName: value.other.displayName,
        otherAvatarUrl: value.other.avatarUrl,
      ),
      // Gone, or no longer ours to read — the rules answer both the same way,
      // and so does this.
      AsyncValue(hasValue: true) => const _Unavailable(),
      AsyncValue(hasError: true) => const _Unavailable(),
      _ => const Scaffold(body: Center(child: CircularProgressIndicator())),
    };
  }
}

class _Unavailable extends StatelessWidget {
  const _Unavailable();

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Conversation')),
    body: CommunityEmptyState(
      icon: Icons.forum_outlined,
      title: 'Conversation unavailable',
      message:
          'It may have been removed, or it belongs to a different account on '
          'this device.',
      action: FilledButton(
        onPressed: () => Navigator.of(context).pushReplacement(
          MaterialPageRoute<void>(builder: (context) => const MessagesScreen()),
        ),
        child: const Text('Open messages'),
      ),
    ),
  );
}
