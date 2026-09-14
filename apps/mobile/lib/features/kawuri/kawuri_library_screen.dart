import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/features/kawuri/kawuri_creation_screen.dart';
import 'package:indigen_world_mobile/features/kawuri/kawuri_home.dart';
import 'package:indigen_world_mobile/features/kawuri/kawuri_media_actions.dart';
import 'package:indigen_world_mobile/features/kawuri/kawuri_media_models.dart';
import 'package:indigen_world_mobile/features/kawuri/kawuri_media_repository.dart';
import 'package:indigen_world_mobile/shared/glass_popup.dart';
import 'package:indigen_world_mobile/shared/night_theme.dart';

IconData kawuriCreationIcon(KawuriCreation creation) => switch (creation.type) {
  'image_generation' => Icons.auto_awesome_outlined,
  'video_generation' => Icons.videocam_outlined,
  _ => Icons.image_search_rounded,
};

/// Every Kawuri creation the member has, newest first, live.
class KawuriLibraryScreen extends ConsumerStatefulWidget {
  const KawuriLibraryScreen({super.key});

  @override
  ConsumerState<KawuriLibraryScreen> createState() =>
      _KawuriLibraryScreenState();
}

class _KawuriLibraryScreenState extends ConsumerState<KawuriLibraryScreen> {
  KawuriCreationFilter _filter = KawuriCreationFilter.all;

  @override
  Widget build(BuildContext context) {
    final signedIn = ref.watch(kawuriMediaRepositoryProvider)?.uid != null;
    final creations = ref.watch(kawuriCreationsProvider(_filter));
    return NightTheme(
      child: Scaffold(
        backgroundColor: const Color(0xFF071D17),
        appBar: AppBar(
          backgroundColor: const Color(0xFF071D17),
          foregroundColor: Colors.white,
          title: const Text('Your creations'),
        ),
        body: SafeArea(
          child: Column(
            children: [
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(
                  horizontal: 16,
                  vertical: 8,
                ),
                child: Row(
                  children: [
                    for (final filter in KawuriCreationFilter.values)
                      Padding(
                        padding: const EdgeInsets.only(right: 8),
                        child: ChoiceChip(
                          label: Text(filter.label),
                          selected: _filter == filter,
                          onSelected: (_) => setState(() => _filter = filter),
                        ),
                      ),
                  ],
                ),
              ),
              Expanded(
                child: !signedIn
                    ? const _Empty(
                        'Sign in to keep images, videos and analyses in your account.',
                      )
                    : creations.when(
                        loading: () =>
                            const Center(child: CircularProgressIndicator()),
                        error: (_, _) => const _Empty(
                          'Your creations could not be loaded. Check your connection.',
                        ),
                        data: (items) => items.isEmpty
                            ? _Empty(
                                _filter == KawuriCreationFilter.all
                                    ? 'Nothing yet. Images, videos and media analyses you make with Kawuri appear here.'
                                    : 'No ${_filter.label.toLowerCase()} yet.',
                              )
                            : ListView.separated(
                                padding: const EdgeInsets.fromLTRB(
                                  16,
                                  4,
                                  16,
                                  24,
                                ),
                                itemCount: items.length,
                                separatorBuilder: (_, _) =>
                                    const SizedBox(height: 8),
                                itemBuilder: (context, index) =>
                                    KawuriCreationTile(creation: items[index]),
                              ),
                      ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Empty extends StatelessWidget {
  const _Empty(this.message);

  final String message;

  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.all(24),
      child: Text(
        message,
        textAlign: TextAlign.center,
        style: const TextStyle(color: Color(0xFFABC8BE), height: 1.45),
      ),
    ),
  );
}

/// One creation as a row: title, "Video · Generating", real progress when
/// there is any, and an overflow menu holding only what the state allows.
class KawuriCreationTile extends ConsumerWidget {
  const KawuriCreationTile({required this.creation, super.key});

  final KawuriCreation creation;

  Future<void> _open(BuildContext context) => Navigator.of(context).push(
    MaterialPageRoute<void>(
      builder: (_) =>
          KawuriCreationScreen(taskId: creation.id, initial: creation),
    ),
  );

  Future<void> _act(BuildContext context, WidgetRef ref, String action) async {
    final repository = ref.read(kawuriMediaRepositoryProvider);
    if (repository == null) return;
    try {
      switch (action) {
        case 'cancel':
          if (await kawuriConfirmCancel(context, creation)) {
            await repository.cancel(creation.id);
          }
        case 'delete':
          if (await kawuriConfirmDelete(context)) {
            await repository.delete(creation.id);
            if (context.mounted) showGlassToast(context, 'Deleted.');
          }
        case 'download':
          await kawuriSaveToDevice(context, ref, creation);
        case 'share':
          await kawuriShare(context, ref, creation);
        default:
          // Everything else needs the full screen: a player, a prompt editor
          // or a follow-up box.
          await _open(context);
      }
    } on KawuriMediaException catch (error) {
      if (context.mounted) showGlassToast(context, error.message);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final progress = creation.progressLabel;
    return Material(
      color: const Color(0xFF102F27),
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: () => _open(context),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 10, 4, 10),
          child: Row(
            children: [
              Icon(kawuriCreationIcon(creation), color: kawuriMint, size: 28),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      creation.title,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      creation.subtitle,
                      style: const TextStyle(
                        color: Color(0xFFABC8BE),
                        fontSize: 12.5,
                      ),
                    ),
                    if (creation.status.inFlight) ...[
                      const SizedBox(height: 6),
                      Row(
                        children: [
                          Expanded(
                            child: LinearProgressIndicator(
                              value: creation.progress == null
                                  ? null
                                  : creation.progress! / 100,
                              minHeight: 3,
                            ),
                          ),
                          if (progress != null) ...[
                            const SizedBox(width: 8),
                            Text(
                              progress,
                              style: const TextStyle(
                                color: kawuriMint,
                                fontSize: 12,
                              ),
                            ),
                          ],
                        ],
                      ),
                    ],
                  ],
                ),
              ),
              PopupMenuButton<String>(
                tooltip: 'Creation options',
                iconColor: Colors.white,
                onSelected: (action) => _act(context, ref, action),
                itemBuilder: (_) => [
                  for (final action in creation.actions)
                    PopupMenuItem(
                      value: action,
                      child: Text(kawuriActionLabel(action)),
                    ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
