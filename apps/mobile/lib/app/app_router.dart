import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:indigen_world_mobile/features/ads/ads_screen.dart';
import 'package:indigen_world_mobile/features/collection/collection_data.dart';
import 'package:indigen_world_mobile/features/community/chat_thread_loader.dart';
import 'package:indigen_world_mobile/features/community/messages_screen.dart';
import 'package:indigen_world_mobile/features/community/post_detail_screen.dart';
import 'package:indigen_world_mobile/features/contribute/contribute_screen.dart';
import 'package:indigen_world_mobile/features/dictionary/entry_detail_screen.dart';
import 'package:indigen_world_mobile/features/downloads/downloads_screen.dart';
import 'package:indigen_world_mobile/features/kawuri/kawuri_screen.dart';
import 'package:indigen_world_mobile/features/music/now_playing_screen.dart';
import 'package:indigen_world_mobile/features/notifications/notifications_screen.dart';
import 'package:indigen_world_mobile/features/onboarding/startup_gate.dart';
import 'package:indigen_world_mobile/features/subscriptions/manage_subscription_screen.dart';
import 'package:indigen_world_mobile/features/subscriptions/paywall_screen.dart';

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
        path: '/messages',
        builder: (context, state) => const MessagesScreen(),
      ),
      // A message push carries only the thread id, so the screen's other half
      // is recovered from the thread document first.
      GoRoute(
        path: '/chat/:threadId',
        builder: (context, state) =>
            ChatThreadLoader(threadId: state.pathParameters['threadId']!),
      ),
      // Where an advertising notification lands.
      GoRoute(
        path: '/ads',
        builder: (context, state) => const AdsScreen(standalone: true),
      ),
      GoRoute(
        path: '/kawuri',
        builder: (context, state) => const KawuriScreen(),
      ),
      // Routes rather than pushes, because both are places a notification or a
      // link can want to land: a renewal reminder points at the subscription,
      // and a finished download at the list it landed in.
      GoRoute(
        path: '/subscribe',
        builder: (context, state) => const PaywallScreen(),
      ),
      GoRoute(
        path: '/subscription',
        builder: (context, state) => const ManageSubscriptionScreen(),
      ),
      GoRoute(
        path: '/downloads',
        builder: (context, state) => const DownloadsScreen(),
      ),
      // A route rather than a `Navigator.push`, for two reasons. The
      // mini-player that opens it is mounted above the Navigator and cannot
      // reach a router through context, so it pushes by provider instead; and a
      // media notification wants somewhere to land when it is tapped.
      GoRoute(
        path: '/now-playing',
        builder: (context, state) => const NowPlayingScreen(),
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

/// The kind a `/contribute` link names, or null when it names none.
///
/// Null rather than a default, now that Contribute opens on a hub. An absent
/// `category` used to mean "the dictionary", which was harmless while every
/// kind lived behind one picker on one screen — a member who wanted something
/// else tapped a tile. It stopped being harmless the moment the form became a
/// destination: `submitCollectionContribution` writes a receipt notification
/// with `link: '/contribute'`, so tapping "your contribution was received"
/// would have opened a blank dictionary form rather than the screen that shows
/// what happened to it.
///
/// An unknown value folds to null for the same reason: a link from a build
/// that knows a kind this one does not should ask, rather than guess wrong.
CollectionKind? _collectionKind(String? value) => switch (value) {
  'music' => CollectionKind.music,
  'dictionary' || 'word' => CollectionKind.dictionary,
  'literature' => CollectionKind.literature,
  'audiobook' || 'audiobooks' => CollectionKind.audiobooks,
  'video' || 'film' => CollectionKind.video,
  _ => null,
};
