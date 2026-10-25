import 'dart:io';

import 'package:flutter/painting.dart';
import 'package:flutter_cache_manager/flutter_cache_manager.dart';
import 'package:path_provider/path_provider.dart';

/// The pictures and artwork this phone keeps so they need not be fetched
/// twice — how much room they take, and the way to give it back.
///
/// ── What counts, and what never does ──────────────────────────────────────
/// Only copies the app can fetch again: the image cache behind every poster,
/// avatar and cover (`flutter_cache_manager`'s default store, which is what
/// `cached_network_image` uses), and the pictures drawn into alerts. Never
/// downloads, which somebody chose and may be relying on with no signal; never
/// reel drafts, which live in the same temporary folder and are somebody's
/// unfinished work. Those are named folders, so this touches nothing else.

/// The folders under the temporary directory that hold re-fetchable copies.
const _cacheFolders = [
  // flutter_cache_manager's default store key.
  'libCachedImageData',
  'notification-images',
  'notification-attachments',
];

/// The total size of [directory], or 0 when it is missing or unreadable.
Future<int> directoryBytes(Directory directory) async {
  if (!await directory.exists()) return 0;
  var total = 0;
  try {
    await for (final entity in directory.list(
      recursive: true,
      followLinks: false,
    )) {
      if (entity is File) {
        try {
          total += await entity.length();
        } on FileSystemException {
          // Removed while it was being counted.
        }
      }
    }
  } on FileSystemException {
    // A folder that cannot be listed counts as what was counted so far.
  }
  return total;
}

/// How much the re-fetchable media takes on this phone.
Future<int> cachedMediaBytes() async {
  final temporary = await getTemporaryDirectory();
  var total = 0;
  for (final name in _cacheFolders) {
    total += await directoryBytes(Directory('${temporary.path}/$name'));
  }
  return total;
}

/// Lets go of every re-fetchable copy, on disk and in memory.
Future<void> clearCachedMedia() async {
  await DefaultCacheManager().emptyCache();
  final temporary = await getTemporaryDirectory();
  for (final name in _cacheFolders.skip(1)) {
    final folder = Directory('${temporary.path}/$name');
    if (await folder.exists()) {
      try {
        await folder.delete(recursive: true);
      } on FileSystemException {
        // Something is reading it right now; the next clear gets it.
      }
    }
  }
  PaintingBinding.instance.imageCache
    ..clear()
    ..clearLiveImages();
}

/// "0 B", "840 KB", "12.4 MB", "1.2 GB" — sizes the way a phone's own
/// storage screen writes them.
String formatBytes(int bytes) {
  if (bytes < 1024) return '$bytes B';
  const units = ['KB', 'MB', 'GB'];
  var value = bytes / 1024;
  var unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  final text = value >= 100 || unit == 0
      ? value.round().toString()
      : value.toStringAsFixed(1);
  return '$text ${units[unit]}';
}
