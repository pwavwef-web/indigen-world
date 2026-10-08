import 'dart:io';
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/data/local/app_database.dart';
import 'package:indigen_world_mobile/features/downloads/data/downloads_repository.dart';
import 'package:indigen_world_mobile/features/collection/collection_data.dart';
import 'package:indigen_world_mobile/features/music/music_track.dart';
import 'package:indigen_world_mobile/features/music/music_controller.dart';

void main() {
  late Directory dir;
  late AppDatabase db;
  late DownloadsRepository repo;
  late HttpServer server;
  var requests = 0;
  MusicTrack track(String id, [String route = 'ok']) => MusicTrack(id: id, title: 'Synthetic ɛ ɔ ŋ', album: 'Test collection', url: 'http://127.0.0.1:${server.port}/$route.mp3');
  setUp(() async {
    dir = await Directory.systemTemp.createTemp('indigen-offline-test-');
    db = AppDatabase.forTesting(NativeDatabase.memory());
    repo = DownloadsRepository(db, directory: () async => dir);
    requests = 0;
    server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    server.listen((request) async {
      requests++;
      if (request.uri.path.startsWith('/failed')) { request.response.statusCode = 503; }
      else if (request.uri.path.startsWith('/corrupt')) { request.response.add(List.filled(20, 1)); }
      else { request.response.add('ID3 synthetic test bytes'.codeUnits); }
      await request.response.close();
    });
  });
  tearDown(() async { repo.dispose(); await server.close(force: true); await db.close(); await dir.delete(recursive: true); });
  test('restart and offline queue use stored metadata and verified local files', () async {
    expect(await repo.download(track('first'), kind: CollectionKind.music, limit: 3), isNull);
    expect(await repo.download(track('second'), kind: CollectionKind.music, limit: 3), isNull);
    repo.dispose(); repo = DownloadsRepository(db, directory: () async => dir);
    final urls = await repo.playableIndex();
    final queue = buildDownloadedQueue(await db.getDownloads(), trackId: 'first', urls: urls);
    expect(queue.tracks[queue.startIndex].id, 'first');
    expect(queue.tracks.every((track) => track.url.startsWith('file:')), isTrue);
    expect(queue.tracks[queue.startIndex].title, 'Synthetic ɛ ɔ ŋ');
    expect(requests, 2);
    expect(buildDownloadedQueue(await db.getDownloads(), trackId: 'missing', urls: urls).isEmpty, isTrue);
  });
  test('missing and damaged files stay repairable at the subscription limit', () async {
    expect(await repo.download(track('one'), kind: CollectionKind.music, limit: 1), isNull);
    final row = (await db.getDownloads()).single;
    await File('${dir.path}/${row.fileName}').writeAsBytes(List.filled(row.sizeBytes, 1));
    expect(await repo.playableIndex(), isEmpty);
    expect(await repo.download(track('one'), kind: CollectionKind.music, limit: 1), isNull);
    await File('${dir.path}/${row.fileName}').delete();
    expect(await repo.playableIndex(), isEmpty);
    expect(await db.countDownloads(), 1);
    expect(await repo.download(track('one'), kind: CollectionKind.music, limit: 1), isNull);
    expect((await repo.playableIndex()).containsKey('one'), isTrue);
  });
  test('failed/corrupt responses and interrupted parts never become playable', () async {
    expect(await repo.download(track('bad', 'failed'), kind: CollectionKind.music, limit: 2), isNotNull);
    expect(await repo.download(track('bad', 'corrupt'), kind: CollectionKind.music, limit: 2), isNotNull);
    await File('${dir.path}/interrupted.mp3.part').writeAsString('ID3 partial');
    await repo.sweep();
    expect(await dir.list().toList(), isEmpty); expect(await db.countDownloads(), 0);
  });
  test('serialized requests enforce quota; inactive access sends no request', () async {
    final results = await Future.wait([repo.download(track('one'), kind: CollectionKind.music, limit: 1), repo.download(track('two'), kind: CollectionKind.music, limit: 1)]);
    expect(results.where((value) => value == null).length, 1); expect(requests, 1);
    expect(await repo.download(track('third'), kind: CollectionKind.music, limit: 0), isNotNull); expect(requests, 1);
  });
}
