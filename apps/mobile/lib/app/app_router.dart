import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:indigen_world_mobile/features/collection/collection_data.dart';
import 'package:indigen_world_mobile/features/community/post_detail_screen.dart';
import 'package:indigen_world_mobile/features/contribute/contribute_screen.dart';
import 'package:indigen_world_mobile/features/dictionary/entry_detail_screen.dart';
import 'package:indigen_world_mobile/features/kawuri/kawuri_screen.dart';
import 'package:indigen_world_mobile/features/notifications/notifications_screen.dart';
import 'package:indigen_world_mobile/features/onboarding/startup_gate.dart';

final appRouterProvider = Provider<GoRouter>((ref) {
  final router = GoRouter(
    initialLocation: '/',
    routes: [
      GoRoute(path: '/', builder: (context, state) => const StartupGate()),
      GoRoute(
        path: '/entry/:entryId',
        builder: (context, state) =>
            EntryDetailScreen(entryId: state.pathParameters['entryId']!),
      ),
      // Push deep links land on these two.
      GoRoute(
        path: '/notifications',
        builder: (context, state) => const NotificationsScreen(),
      ),
      GoRoute(
        path: '/post/:postId',
        builder: (context, state) =>
            PostDetailScreen(postId: state.pathParameters['postId']!),
      ),
      GoRoute(
        path: '/kawuri',
        builder: (context, state) => const KawuriScreen(),
      ),
      GoRoute(
        path: '/contribute',
        builder: (context, state) => ContributeScreen(
          initialSource: state.uri.queryParameters['source'] ?? '',
          relatedEntryId: state.uri.queryParameters['entryId'],
          initialKind: _collectionKind(state.uri.queryParameters['category']),
          standalone: true,
        ),
      ),
    ],
    errorBuilder: (context, state) => Scaffold(
      appBar: AppBar(title: const Text('Page unavailable')),
      body: Center(
        child: FilledButton(
          onPressed: () => context.go('/'),
          child: const Text('Return home'),
        ),
      ),
    ),
  );
  ref.onDispose(router.dispose);
  return router;
});

CollectionKind _collectionKind(String? value) => switch (value) {
  'music' => CollectionKind.music,
  'literature' => CollectionKind.literature,
  'audiobook' || 'audiobooks' => CollectionKind.audiobooks,
  _ => CollectionKind.dictionary,
};
