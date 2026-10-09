import 'dart:convert';
import 'dart:io';
import 'package:drift/drift.dart' show Value;
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/data/local/app_database.dart';
import 'package:indigen_world_mobile/features/collection/collection_data.dart';
import 'package:indigen_world_mobile/features/downloads/data/downloads_repository.dart';
import 'package:indigen_world_mobile/features/music/music_controller.dart';
import 'package:indigen_world_mobile/features/music/music_track.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  HttpOverrides.global = null;
  late AppDatabase database;
  late DownloadsRepository repository;
  late Directory directory;
  setUp(() async {
    database = AppDatabase.forTesting(NativeDatabase.memory());
    directory = await Directory.systemTemp.createTemp('indigen-offline-test-');
    repository = DownloadsRepository(
      database,
      directory: () async => directory,
    );
  });
  tearDown(() async {
    repository.dispose();
    await database.close();
    await directory.delete(recursive: true);
  });
  Future<void> row(String id, {String kind = 'music', int size = 3}) =>
      database.upsertDownload(
        DownloadedTrackRecordsCompanion.insert(
          trackId: id,
          title: 'Title $id',
          artist: const Value('Artist'),
          album: 'Collection $kind',
          artworkUrl: const Value('https://example.test/art.jpg'),
          kind: kind,
          sourceUrl: 'https://offline.invalid/$id.mp3',
          fileName: '$id.mp3',
          sizeBytes: size,
          downloadedAt: DateTime(2026, 10, 7),
        ),
      );
  test('offline queue spans collections without reading original collections or network', () async {
    await row('song');
    await row('chapter', kind: 'audiobooks');
    await File('${directory.path}/song.mp3').writeAsBytes([1, 2, 3]);
    await File('${directory.path}/chapter.mp3').writeAsBytes([4, 5, 6]);
    final rows = await database.getDownloads();
    final urls = await repository.playableIndex();
    final queue = downloadedQueue(rows, urls);
    expect(queue.length, 2);
    expect(queue.map((track) => track.id).toSet(), {'song', 'chapter'});
    expect(
      queue.every((track) => Uri.parse(track.url).scheme == 'file'),
      isTrue,
    );
    for (final track in queue) {
      expect(
        await File.fromUri(Uri.parse(track.url)).readAsBytes(),
        hasLength(3),
      );
      expect(track.artist, 'Artist');
      expect(track.artworkUrl, 'https://example.test/art.jpg');
      expect(track.album, startsWith('Collection'));
    }
  });
  test('missing, truncated and removed files cannot enter the queue; metadata is retained for retry', () async {
    await row('missing');
    await row('partial');
    await row('valid');
    await File('${directory.path}/partial.mp3').writeAsBytes([1]);
    await File('${directory.path}/valid.mp3').writeAsBytes([1, 2, 3]);
    expect((await repository.playableIndex()).keys, ['valid']);
    expect(await database.countDownloads(), 3);
    await repository.remove('valid');
    expect(await repository.playableIndex(), isEmpty);
    expect(await File('${directory.path}/valid.mp3').exists(), isFalse);
    expect(await database.countDownloads(), 2);
  });
  test(
    'successful download is playable after its source server disconnects',
    () async {
      final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
      server.listen((request) async {
        if (request.uri.path.endsWith('.png')) {
          request.response.headers.contentType = ContentType('image', 'png');
          request.response.add(
            base64Decode(
              'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
            ),
          );
        } else {
          request.response.contentLength = 3;
          request.response.add([1, 2, 3]);
        }
        await request.response.close();
      });
      final error = await repository.download(
        MusicTrack(
          id: 'new',
          title: 'Offline song',
          album: 'Music',
          url: 'http://127.0.0.1:${server.port}/audio.mp3',
          artworkUrl: 'http://127.0.0.1:${server.port}/art.png',
        ),
        kind: CollectionKind.music,
        limit: 2,
      );
      expect(error, isNull);
      await server.close(force: true);
      final urls = await repository.playableIndex();
      final art = await repository.artworkIndex();
      expect(Uri.parse(art['new']!).scheme, 'file');
      expect(
        downloadedQueue(
          await database.getDownloads(),
          urls,
          artwork: art,
        ).single.artworkUrl,
        art['new'],
      );
      await repository.sweep();
      expect(await File.fromUri(Uri.parse(art['new']!)).exists(), isTrue);
      expect(await File.fromUri(Uri.parse(urls['new']!)).readAsBytes(), [
        1,
        2,
        3,
      ]);
    },
  );
}
