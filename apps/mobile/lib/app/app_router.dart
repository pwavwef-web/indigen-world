import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:indigen_world_mobile/features/contribute/contribute_screen.dart';
import 'package:indigen_world_mobile/features/dictionary/entry_detail_screen.dart';
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
      GoRoute(
        path: '/contribute',
        builder: (context, state) => Scaffold(
          appBar: AppBar(title: const Text('Contribution')),
          body: ContributeScreen(
            initialSource: state.uri.queryParameters['source'] ?? '',
            relatedEntryId: state.uri.queryParameters['entryId'],
          ),
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
