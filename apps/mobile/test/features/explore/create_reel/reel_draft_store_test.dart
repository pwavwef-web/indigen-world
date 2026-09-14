import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/features/explore/create_reel/reel_draft.dart';
import 'package:indigen_world_mobile/features/explore/create_reel/reel_draft_store.dart';
import 'package:path/path.dart' as p;
import 'package:shared_preferences/shared_preferences.dart';

import 'reel_test_fakes.dart';

void main() {
  late Directory documents;
  late Directory cache;
  late LocalReelDraftStore store;

  setUp(() {
    SharedPreferences.setMockInitialValues({});
    documents = Directory.systemTemp.createTempSync('reel_docs');
    cache = Directory.systemTemp.createTempSync('reel_cache');
    store = LocalReelDraftStore(
      documents: () async => documents,
      temporary: () async => cache,
    );
  });

  tearDown(() {
    documents.deleteSync(recursive: true);
    cache.deleteSync(recursive: true);
  });

  Future<ReelDraft> savedDraft(String id, DateTime updated) async {
    final picked = File(p.join(cache.path, '$id.mp4'))
      ..writeAsBytesSync([1, 2]);
    final path = await store.adoptFile(id, picked.path, fileName: 'video.mp4');
    final draft = completeTestDraft(
      id: id,
      video: testVideo(path: path),
    ).copyWith(updatedAt: updated, coverPath: null);
    await store.save(draft);
    return draft;
  }

  test('saves and lists drafts, most recently edited first', () async {
    await savedDraft('reel_old', DateTime(2026, 9, 1));
    await savedDraft('reel_new', DateTime(2026, 9, 13));
    final drafts = await store.list();
    expect(drafts.map((draft) => draft.id), ['reel_new', 'reel_old']);
    expect((await store.load('reel_old'))?.caption, contains('Harvest'));
    expect(await store.load('missing'), isNull);
  });

  test('adopting moves the picked file into the draft folder', () async {
    final picked = File(p.join(cache.path, 'picked.mp4'))
      ..writeAsBytesSync(List.filled(64, 7));
    final adopted = await store.adoptFile(
      'reel_1',
      picked.path,
      fileName: 'video_1.mp4',
    );
    expect(p.isWithin(documents.path, adopted), isTrue);
    expect(File(adopted).lengthSync(), 64);
    expect(picked.existsSync(), isFalse);
    // A file already in the folder stays where it is.
    expect(
      await store.adoptFile('reel_1', adopted, fileName: 'other.mp4'),
      adopted,
    );
  });

  test('deleting removes the record and every file', () async {
    final draft = await savedDraft('reel_gone', DateTime(2026, 9, 13));
    final folder = File(draft.video!.path).parent;
    expect(folder.existsSync(), isTrue);
    await store.delete('reel_gone');
    expect(await store.load('reel_gone'), isNull);
    expect(folder.existsSync(), isFalse);
  });

  test('never deletes a file outside the drafts folder', () async {
    final outside = File(p.join(cache.path, 'keep.jpg'))..writeAsBytesSync([1]);
    await store.discardFile(outside.path);
    expect(outside.existsSync(), isTrue);
    final inside = File(await store.pathFor('reel_1', 'cover.jpg'))
      ..writeAsBytesSync([1]);
    await store.discardFile(inside.path);
    expect(inside.existsSync(), isFalse);
  });

  test('a draft whose video vanished comes back without it', () async {
    final draft = await savedDraft('reel_lost', DateTime(2026, 9, 13));
    File(draft.video!.path).deleteSync();
    final restored = await store.load('reel_lost');
    expect(restored, isNotNull);
    expect(restored!.video, isNull);
    expect(restored.caption, draft.caption);
    expect(restored.trimEndMs, isNull);
  });

  test('a corrupted store is cleared rather than crashing', () async {
    SharedPreferences.setMockInitialValues({
      'explore.reelDrafts.v1': '{not json',
    });
    expect(await store.list(), isEmpty);
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getString('explore.reelDrafts.v1'), isNull);
  });

  test('racing saves do not lose each other', () async {
    final now = DateTime(2026, 9, 13);
    await Future.wait([
      for (var i = 0; i < 5; i++)
        store.save(
          ReelDraft(
            id: 'reel_$i',
            createdAt: now,
            updatedAt: now,
            caption: '$i',
          ),
        ),
    ]);
    expect(await store.list(), hasLength(5));
  });
}
