import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/features/explore/create_reel/reel_draft.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Where unfinished reels wait on this phone.
///
/// ── Why on the phone and not in Firestore ────────────────────────────────────
/// A draft is mostly a video file, and the app has no remote draft storage to
/// put one in: uploading a clip somebody may never publish would spend their
/// data on it and leave an unpublished recording on a server. The text of a
/// draft is small, but a draft without its video is not one anybody can
/// resume. So both stay here — the text in shared preferences beside the
/// composer's own draft, the files in a folder per draft under the app's
/// documents directory, which the system does not clear the way it clears the
/// cache the picker hands files back in.
abstract interface class ReelDraftStore {
  /// Every draft, most recently edited first. A draft whose video file has
  /// gone missing comes back without its video rather than not at all.
  Future<List<ReelDraft>> list();

  Future<ReelDraft?> load(String id);

  /// Writes the draft's text and choices. Never copies media.
  Future<void> save(ReelDraft draft);

  /// Removes the draft and every file in its folder.
  Future<void> delete(String id);

  /// Moves [sourcePath] into the draft's folder as [fileName] and returns the
  /// new path. A file already inside the folder is left where it is.
  Future<String> adoptFile(
    String draftId,
    String sourcePath, {
    required String fileName,
  });

  /// A path inside the draft's folder for a file about to be written there.
  Future<String> pathFor(String draftId, String fileName);

  /// Deletes [path] if, and only if, it lies inside the drafts folder. Never
  /// touches a file the app did not put there.
  Future<void> discardFile(String? path);
}

final reelDraftStoreProvider = Provider<ReelDraftStore>(
  (ref) => LocalReelDraftStore(),
);

/// [ReelDraftStore] backed by shared preferences and the documents directory.
class LocalReelDraftStore implements ReelDraftStore {
  LocalReelDraftStore({
    Future<Directory> Function()? documents,
    Future<Directory> Function()? temporary,
  }) : _documents = documents ?? getApplicationDocumentsDirectory,
       _temporary = temporary ?? getTemporaryDirectory;

  static const _key = 'explore.reelDrafts.v1';
  static const _folderName = 'reel_drafts';

  final Future<Directory> Function() _documents;
  final Future<Directory> Function() _temporary;

  /// Writes are chained so two saves racing from a debounce and a lifecycle
  /// callback cannot read the same map and drop each other's change.
  Future<void> _queue = Future<void>.value();

  Future<Directory> _root() async {
    final documents = await _documents();
    final root = Directory(p.join(documents.path, _folderName));
    if (!await root.exists()) await root.create(recursive: true);
    return root;
  }

  Future<Directory> _folder(String draftId) async {
    final safe = draftId.replaceAll(RegExp(r'[^A-Za-z0-9_-]'), '_');
    final folder = Directory(p.join((await _root()).path, safe));
    if (!await folder.exists()) await folder.create(recursive: true);
    return folder;
  }

  Future<Map<String, Object?>> _readAll(SharedPreferences prefs) async {
    final raw = prefs.getString(_key);
    if (raw == null || raw.isEmpty) return <String, Object?>{};
    try {
      final decoded = jsonDecode(raw);
      return decoded is Map
          ? decoded.map((key, value) => MapEntry('$key', value))
          : <String, Object?>{};
    } on FormatException {
      await prefs.remove(_key);
      return <String, Object?>{};
    }
  }

  Future<T> _serial<T>(Future<T> Function() task) {
    final result = _queue.then((_) => task());
    _queue = result.then<void>((_) {}, onError: (Object _) {});
    return result;
  }

  @override
  Future<List<ReelDraft>> list() => _serial(() async {
    final prefs = await SharedPreferences.getInstance();
    final drafts = <ReelDraft>[];
    for (final raw in (await _readAll(prefs)).values) {
      final draft = ReelDraft.fromJson(raw);
      if (draft != null) drafts.add(await _withSurvivingFiles(draft));
    }
    drafts.sort((a, b) => b.updatedAt.compareTo(a.updatedAt));
    return drafts;
  });

  @override
  Future<ReelDraft?> load(String id) => _serial(() async {
    final prefs = await SharedPreferences.getInstance();
    final draft = ReelDraft.fromJson((await _readAll(prefs))[id]);
    return draft == null ? null : _withSurvivingFiles(draft);
  });

  /// [draft] without references to files that no longer exist.
  Future<ReelDraft> _withSurvivingFiles(ReelDraft draft) async {
    var result = draft;
    final video = draft.video;
    if (video != null && !await File(video.path).exists()) {
      result = result.copyWith(
        video: null,
        trimStartMs: 0,
        trimEndMs: null,
        coverSource: ReelCoverSource.automatic,
        coverTimeMs: null,
        coverPath: null,
      );
    }
    final cover = result.coverPath;
    if (cover != null && !await File(cover).exists()) {
      result = result.copyWith(
        coverPath: null,
        coverSource: ReelCoverSource.automatic,
        coverTimeMs: null,
      );
    }
    return result;
  }

  @override
  Future<void> save(ReelDraft draft) => _serial(() async {
    final prefs = await SharedPreferences.getInstance();
    final all = await _readAll(prefs);
    all[draft.id] = draft.toJson();
    await prefs.setString(_key, jsonEncode(all));
  });

  @override
  Future<void> delete(String id) => _serial(() async {
    final prefs = await SharedPreferences.getInstance();
    final all = await _readAll(prefs)
      ..remove(id);
    await prefs.setString(_key, jsonEncode(all));
    try {
      final folder = await _folder(id);
      if (await folder.exists()) await folder.delete(recursive: true);
    } on FileSystemException catch (error) {
      debugPrint('Reel draft folder not removed: $error');
    }
  });

  @override
  Future<String> pathFor(String draftId, String fileName) async =>
      p.join((await _folder(draftId)).path, fileName);

  @override
  Future<String> adoptFile(
    String draftId,
    String sourcePath, {
    required String fileName,
  }) async {
    final folder = await _folder(draftId);
    if (p.isWithin(folder.path, sourcePath)) return sourcePath;
    final target = p.join(folder.path, fileName);
    final source = File(sourcePath);
    try {
      // The picker's copy lives in the app cache, on the same volume as the
      // documents directory, so this is a rename rather than a second copy of
      // a large file.
      return (await source.rename(target)).path;
    } on FileSystemException {
      final copied = await source.copy(target);
      // Only the picker's own cache copy is ours to remove; a file the app was
      // pointed at anywhere else stays exactly where it was.
      final temporary = await _temporary();
      if (p.isWithin(temporary.path, sourcePath)) {
        unawaited(source.delete().then((_) {}, onError: (Object _) {}));
      }
      return copied.path;
    }
  }

  @override
  Future<void> discardFile(String? path) async {
    if (path == null) return;
    final root = await _root();
    if (!p.isWithin(root.path, path)) return;
    try {
      final file = File(path);
      if (await file.exists()) await file.delete();
    } on FileSystemException {
      // Already gone, or held open by a decoder that is about to let go.
    }
  }
}
