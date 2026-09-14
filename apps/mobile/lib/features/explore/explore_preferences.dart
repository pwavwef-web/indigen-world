import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

// ── What a member has told Explore to leave out ─────────────────────────────
//
// Community posts already have server-side answers for most of this: hiding a
// post, muting its author and blocking them are edges the Community feed
// filters on, and Explore reads that same filtered feed. Published archive
// work and whole sub-communities have no such edges on the backend yet, so the
// choices that have nowhere else to live are kept here, on the device.
//
// That is a real limitation and it is named rather than hidden: a member who
// says "not interested" to a published reel on one phone will still see it on
// another. When `exploreHidden` edges exist server-side this becomes a cache of
// them instead of the only copy.

const _hiddenReelsKey = 'explore.hidden.reels.v1';
const _hiddenCreatorsKey = 'explore.hidden.creators.v1';
const _hiddenCommunitiesKey = 'explore.hidden.communities.v1';
const _soundMutedKey = 'explore.sound.muted.v1';

/// How many ids of each kind are remembered. A list that grows for ever is a
/// preference file that eventually costs a launch to read.
const int kExploreHiddenCap = 500;

class ExploreHiddenState {
  const ExploreHiddenState({
    this.reelIds = const <String>{},
    this.creatorIds = const <String>{},
    this.communityIds = const <String>{},
  });

  final Set<String> reelIds;
  final Set<String> creatorIds;
  final Set<String> communityIds;

  bool get isEmpty =>
      reelIds.isEmpty && creatorIds.isEmpty && communityIds.isEmpty;

  ExploreHiddenState copyWith({
    Set<String>? reelIds,
    Set<String>? creatorIds,
    Set<String>? communityIds,
  }) => ExploreHiddenState(
    reelIds: reelIds ?? this.reelIds,
    creatorIds: creatorIds ?? this.creatorIds,
    communityIds: communityIds ?? this.communityIds,
  );
}

class ExploreHidden extends Notifier<ExploreHiddenState> {
  @override
  ExploreHiddenState build() {
    unawaited(_restore());
    return const ExploreHiddenState();
  }

  Future<void> _restore() async {
    try {
      final preferences = await SharedPreferences.getInstance();
      final restored = ExploreHiddenState(
        reelIds: {...?preferences.getStringList(_hiddenReelsKey)},
        creatorIds: {...?preferences.getStringList(_hiddenCreatorsKey)},
        communityIds: {...?preferences.getStringList(_hiddenCommunitiesKey)},
      );
      // Anything hidden during the read wins over what was on disk.
      state = ExploreHiddenState(
        reelIds: {...restored.reelIds, ...state.reelIds},
        creatorIds: {...restored.creatorIds, ...state.creatorIds},
        communityIds: {...restored.communityIds, ...state.communityIds},
      );
    } on Object {
      // No stored choices is the same as none made.
    }
  }

  Future<void> hideReel(String id) =>
      _update(_hiddenReelsKey, state.reelIds, id, (next) {
        state = state.copyWith(reelIds: next);
      });

  Future<void> hideCreator(String id) =>
      _update(_hiddenCreatorsKey, state.creatorIds, id, (next) {
        state = state.copyWith(creatorIds: next);
      });

  Future<void> hideCommunity(String id) =>
      _update(_hiddenCommunitiesKey, state.communityIds, id, (next) {
        state = state.copyWith(communityIds: next);
      });

  /// Takes back one of the choices above — the Undo on the toast that follows.
  Future<void> unhide({
    String? reelId,
    String? creatorId,
    String? communityId,
  }) async {
    state = state.copyWith(
      reelIds: reelId == null ? null : ({...state.reelIds}..remove(reelId)),
      creatorIds: creatorId == null
          ? null
          : ({...state.creatorIds}..remove(creatorId)),
      communityIds: communityId == null
          ? null
          : ({...state.communityIds}..remove(communityId)),
    );
    await _persistAll();
  }

  Future<void> _update(
    String key,
    Set<String> current,
    String id,
    void Function(Set<String> next) apply,
  ) async {
    if (id.isEmpty || current.contains(id)) return;
    final next = {...current, id};
    final capped = next.length > kExploreHiddenCap
        ? next.skip(next.length - kExploreHiddenCap).toSet()
        : next;
    apply(capped);
    try {
      final preferences = await SharedPreferences.getInstance();
      await preferences.setStringList(key, capped.toList(growable: false));
    } on Object {
      // Still hidden for this session; only the memory of it failed.
    }
  }

  Future<void> _persistAll() async {
    try {
      final preferences = await SharedPreferences.getInstance();
      await Future.wait([
        preferences.setStringList(_hiddenReelsKey, state.reelIds.toList()),
        preferences.setStringList(
          _hiddenCreatorsKey,
          state.creatorIds.toList(),
        ),
        preferences.setStringList(
          _hiddenCommunitiesKey,
          state.communityIds.toList(),
        ),
      ]);
    } on Object {
      // Session state already holds the answer.
    }
  }
}

final exploreHiddenProvider =
    NotifierProvider<ExploreHidden, ExploreHiddenState>(ExploreHidden.new);

/// Whether Explore plays its reels without sound.
///
/// Separate from the Community feed's `videoMutedProvider`, and with the
/// opposite default. An inline clip in a timeline starts silent because a
/// phone that talks while somebody scrolls past it is a bad surprise; Explore
/// is somewhere a member goes *to* watch and listen, and a reel feed that
/// opens mute makes every performance in it a silent film. What the two share
/// is that the choice sticks: muting one reel mutes the next.
class ExploreSoundMuted extends Notifier<bool> {
  @override
  bool build() {
    unawaited(_restore());
    return false;
  }

  Future<void> _restore() async {
    try {
      final preferences = await SharedPreferences.getInstance();
      final stored = preferences.getBool(_soundMutedKey);
      if (stored != null && stored != state) state = stored;
    } on Object {
      // The default stands.
    }
  }

  Future<void> set(bool muted) async {
    if (state == muted) return;
    state = muted;
    try {
      final preferences = await SharedPreferences.getInstance();
      await preferences.setBool(_soundMutedKey, muted);
    } on Object {
      // Holds for the session.
    }
  }

  Future<void> toggle() => set(!state);
}

final exploreSoundMutedProvider = NotifierProvider<ExploreSoundMuted, bool>(
  ExploreSoundMuted.new,
);
