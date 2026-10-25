import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/community/community_actions.dart';
import 'package:indigen_world_mobile/features/community/compose_post_screen.dart';

/// Where the app icon's "Write a post" shortcut lands.
///
/// Posting needs an account and a handle, and the composer button in
/// Community asks for both first — so this asks the same way, then swaps
/// itself for the composer. Somebody who backs out of signing in is returned
/// to wherever they were, not left on an empty page.
class ComposeFromShortcut extends ConsumerStatefulWidget {
  const ComposeFromShortcut({super.key});

  @override
  ConsumerState<ComposeFromShortcut> createState() =>
      _ComposeFromShortcutState();
}

class _ComposeFromShortcutState extends ConsumerState<ComposeFromShortcut> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _open());
  }

  Future<void> _open() async {
    if (!mounted) return;
    final profile = await CommunityActions(ref).requireProfile(context);
    if (!mounted) return;
    final navigator = Navigator.of(context);
    if (profile == null) {
      navigator.maybePop();
      return;
    }
    await navigator.pushReplacement(
      MaterialPageRoute<bool>(builder: (context) => const ComposePostScreen()),
    );
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: context.brand.background,
    body: const Center(child: CircularProgressIndicator()),
  );
}
