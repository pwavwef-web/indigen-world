import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/data/repositories.dart';

/// Saves and appreciations for Explore reels, kept on the device.
///
/// These reuse the same local table the dictionary's saved words live in, under
/// namespaced keys, for one reason: what a member keeps should survive closing
/// the app. Holding them in widget state meant a save vanished the moment the
/// feed rebuilt, which reads as the app losing your things.
///
/// They are deliberately local rather than server-side. A save is private, and
/// an appreciation on a public feed would need its own moderated collection and
/// abuse story before it could be trusted as a public number — so nothing here
/// pretends to be a shared count.
class ReelKeeps {
  const ReelKeeps(this._repository);

  final SavedEntryRepository _repository;

  static String saveKey(String reelId) => 'reel:$reelId';
  static String appreciationKey(String reelId) => 'reel-appreciated:$reelId';

  Future<bool> toggleSaved(String reelId) =>
      _repository.toggle(saveKey(reelId));

  Future<bool> toggleAppreciated(String reelId) =>
      _repository.toggle(appreciationKey(reelId));
}

final reelKeepsProvider = Provider<ReelKeeps>(
  (ref) => ReelKeeps(ref.watch(savedEntryRepositoryProvider)),
);

/// Reel ids this device has saved.
final savedReelIdsProvider = FutureProvider<Set<String>>((ref) async {
  final ids = await ref.watch(savedEntryIdsProvider.future);
  return {
    for (final id in ids)
      if (id.startsWith('reel:')) id.substring('reel:'.length),
  };
});

/// Reel ids this device has appreciated.
final appreciatedReelIdsProvider = FutureProvider<Set<String>>((ref) async {
  final ids = await ref.watch(savedEntryIdsProvider.future);
  return {
    for (final id in ids)
      if (id.startsWith('reel-appreciated:'))
        id.substring('reel-appreciated:'.length),
  };
});
