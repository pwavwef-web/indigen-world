import 'dart:async';
import 'dart:io';

import 'package:drift/drift.dart' show Value;
import 'package:flutter/foundation.dart';
import 'package:indigen_world_mobile/data/local/app_database.dart';
import 'package:indigen_world_mobile/features/collection/collection_data.dart';
import 'package:indigen_world_mobile/features/music/music_track.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

/// Keeping collection audio on the device.
///
/// ── What this feature actually is ─────────────────────────────────────────
/// Convenience, not access control, and the code should not pretend otherwise.
/// Published media lives behind public download URLs — the same URLs the
/// streaming player already uses — so keeping a copy locally unlocks nothing
/// that a member could not already play. What a subscription buys here is the
/// *managed* version of it: a place these files live, a limit that keeps them
/// from filling a 32 GB handset, and one screen to clear them from.
///
/// That is why the limit is enforced on the device and there is no server-side
/// equivalent. A patched build could download the same files by hand with no
/// help from anything here, and adding a backend check would be security
/// theatre over a public URL. The paid capabilities that *do* cost money —
/// Kawuri's daily allowance, the entitlement itself — are enforced on the
/// server, where they belong.
///
/// ── Why a partial file is never left behind ───────────────────────────────
/// Every download writes to `<name>.part` and renames only once the last byte
/// has landed. A half-written MP3 that the index calls complete is a song that
/// plays for ninety seconds and then stops, on a phone with no network to
/// recover from — which is exactly the situation somebody downloaded it for.
class DownloadsRepository {
  DownloadsRepository(this._database);

  final AppDatabase _database;

  /// Where the audio goes. One directory so a "delete everything" is one call.
  static const _folder = 'offline-audio';

  /// Nothing in the collection is anywhere near this. It exists to stop a
  /// misconfigured record — a video URL that slipped into an audio field, a
  /// content-length header that lies — filling somebody's storage silently.
  static const _maxBytes = 200 * 1024 * 1024;

  static const _timeout = Duration(minutes: 10);

  final _httpClient = HttpClient()
    ..connectionTimeout = const Duration(seconds: 20);

  /// The index, live.
  Stream<List<DownloadedTrackRecord>> watch() => _database.watchDownloads();

  Future<int> count() => _database.countDownloads();

  /// Downloads [track], reporting progress from 0 to 1.
  ///
  /// Returns null when it succeeded and a sentence when it did not — the
  /// caller shows that sentence, so it is written for a person rather than for
  /// a log.
  Future<String?> download(
    MusicTrack track, {
    required CollectionKind kind,
    required int limit,
    void Function(double progress)? onProgress,
  }) async {
    if (limit <= 0) {
      return 'Offline listening is part of a subscription.';
    }
    final existing = await _database.getDownloads();
    if (existing.any((row) => row.trackId == track.id)) return null;
    if (existing.length >= limit) {
      return 'You can keep $limit tracks offline. Remove one to make room.';
    }

    final directory = await _directory();
    final fileName = _fileNameFor(track);
    final target = File(p.join(directory.path, fileName));
    final partial = File('${target.path}.part');

    try {
      final uri = Uri.parse(track.url);
      final request = await _httpClient.getUrl(uri).timeout(_timeout);
      final response = await request.close().timeout(_timeout);
      if (response.statusCode != HttpStatus.ok) {
        return 'That file could not be downloaded right now.';
      }
      final expected = response.contentLength;
      if (expected > _maxBytes) {
        return 'That file is too large to keep offline.';
      }

      final sink = partial.openWrite();
      var written = 0;
      try {
        await for (final chunk in response.timeout(_timeout)) {
          written += chunk.length;
          if (written > _maxBytes) {
            await sink.close();
            await _quietlyDelete(partial);
            return 'That file is too large to keep offline.';
          }
          sink.add(chunk);
          if (expected > 0) onProgress?.call(written / expected);
        }
        await sink.flush();
      } finally {
        await sink.close();
      }

      // Only now is it a download. Before the rename it is a temporary file
      // with no row, which is precisely what the orphan sweep cleans up.
      await partial.rename(target.path);

      await _database.upsertDownload(
        DownloadedTrackRecordsCompanion.insert(
          trackId: track.id,
          title: track.title,
          artist: Value(track.artist),
          album: track.album,
          artworkUrl: Value(track.artworkUrl),
          kind: kind.name,
          sourceUrl: track.url,
          fileName: fileName,
          sizeBytes: written,
          downloadedAt: DateTime.now(),
        ),
      );
      onProgress?.call(1);
      return null;
    } on Object catch (error) {
      debugPrint('Download failed for ${track.id}: $error');
      await _quietlyDelete(partial);
      return 'That download did not finish. Try again on a better connection.';
    }
  }

  /// Removes the row and the file. Safe when either is already gone.
  Future<void> remove(String trackId) async {
    final rows = await _database.getDownloads();
    final row = rows.where((entry) => entry.trackId == trackId).firstOrNull;
    await _database.deleteDownload(trackId);
    if (row == null) return;
    final directory = await _directory();
    await _quietlyDelete(File(p.join(directory.path, row.fileName)));
  }

  Future<void> removeAll() async {
    for (final row in await _database.getDownloads()) {
      await remove(row.trackId);
    }
    // And whatever is left over from an interrupted download.
    await sweep();
  }

  /// Track id to a playable `file://` URL, for everything present on disk.
  ///
  /// Rows whose file has vanished are dropped from the index as they are found
  /// rather than reported: the system clears app storage under pressure without
  /// telling anybody, and a queue entry pointing at a file that is not there
  /// would fail mid-album with no explanation.
  Future<Map<String, String>> playableIndex() async {
    final directory = await _directory();
    final index = <String, String>{};
    for (final row in await _database.getDownloads()) {
      final file = File(p.join(directory.path, row.fileName));
      if (await file.exists()) {
        index[row.trackId] = file.uri.toString();
      } else {
        await _database.deleteDownload(row.trackId);
      }
    }
    return index;
  }

  /// How much of the device this is using, in bytes.
  Future<int> bytesUsed() async {
    var total = 0;
    for (final row in await _database.getDownloads()) {
      total += row.sizeBytes;
    }
    return total;
  }

  /// Deletes files with no row: interrupted downloads, and anything left by an
  /// uninstalled-and-reinstalled index.
  Future<void> sweep() async {
    final directory = await _directory();
    if (!await directory.exists()) return;
    final known = {
      for (final row in await _database.getDownloads()) row.fileName,
    };
    await for (final entity in directory.list()) {
      if (entity is! File) continue;
      final name = p.basename(entity.path);
      if (known.contains(name)) continue;
      await _quietlyDelete(entity);
    }
  }

  Future<Directory> _directory() async {
    final documents = await getApplicationDocumentsDirectory();
    final directory = Directory(p.join(documents.path, _folder));
    if (!await directory.exists()) await directory.create(recursive: true);
    return directory;
  }

  /// The record id plus the source's extension.
  ///
  /// A published record id is already safe for a file name — it is a Firestore
  /// id — and using it means the file can always be found from the row without
  /// storing a second key. The extension is carried across because some
  /// players, and Android's own media scanner, decide what a file is by
  /// looking at it.
  static String _fileNameFor(MusicTrack track) {
    final path = Uri.tryParse(track.url)?.path ?? '';
    final extension = p.extension(path);
    final safe = RegExp(r'^\.[A-Za-z0-9]{1,5}$').hasMatch(extension)
        ? extension
        : '.mp3';
    return '${track.id}$safe';
  }

  static Future<void> _quietlyDelete(File file) async {
    try {
      if (await file.exists()) await file.delete();
    } on Object catch (error) {
      debugPrint('Could not delete ${file.path}: $error');
    }
  }

  void dispose() => _httpClient.close(force: true);
}

extension<T> on Iterable<T> {
  T? get firstOrNull {
    final iterator = this.iterator;
    return iterator.moveNext() ? iterator.current : null;
  }
}
