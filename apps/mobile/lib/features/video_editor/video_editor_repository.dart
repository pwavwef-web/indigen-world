import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';
import 'package:indigen_world_mobile/features/video_editor/mobile_timeline.dart';

class VideoEditorRepository {
  String? get currentUserUid => FirebaseAuth.instance.currentUser?.uid;
  UploadTask? _activeUpload;
  bool _cancelled = false;
  Future<void> cancelPreparation() async {
    _cancelled = true;
    await _activeUpload?.cancel();
  }

  void _checkCancelled() {
    if (_cancelled)
      throw StateError('Preparation cancelled. Your draft is saved.');
  }

  Future<Directory> directory(String uid, String project) async {
    if (!RegExp(r'^[\w-]+$').hasMatch(uid) ||
        !RegExp(r'^[\w-]+$').hasMatch(project))
      throw StateError('Invalid project.');
    return Directory(
      '${(await getApplicationDocumentsDirectory()).path}/video-editor/$uid/$project',
    ).create(recursive: true);
  }

  Future<void> saveLocal(MobileTimeline project) async {
    final dir = await directory(project.ownerUid, project.id),
        temp = File('${dir.path}/project.tmp');
    await temp.writeAsString(jsonEncode(project.toJson()), flush: true);
    await temp.rename('${dir.path}/project.json');
  }

  Future<MobileTimeline?> loadLocal(String uid, String id) async {
    final file = File('${(await directory(uid, id)).path}/project.json');
    return await file.exists()
        ? MobileTimeline.fromJson(
            Map<String, dynamic>.from(
              jsonDecode(await file.readAsString()) as Map,
            ),
          )
        : null;
  }

  Future<String> adopt(MobileTimeline project, String path, String name) async {
    final source = File(path);
    if (!await source.exists())
      throw StateError('The selected file is unavailable. Choose it again.');
    if (await source.length() > 300 * 1024 * 1024)
      throw StateError('Choose a clip smaller than 300 MB.');
    return (await source.copy(
      '${(await directory(project.ownerUid, project.id)).path}/$name',
    )).path;
  }

  Future<void> saveRemote(MobileTimeline project) async {
    await FirebaseFirestore.instance
        .collection('videoProjects')
        .doc(project.id)
        .set({
          'ownerUid': project.ownerUid,
          'title': 'Mobile video',
          'aspect': project.aspect,
          'status': 'draft',
          'origin': 'mobile',
          'schemaVersion': 1,
          'revision': project.revision,
          'timeline': project.toJson(),
          'updatedAt': DateTime.now().toIso8601String(),
          'createdAt': DateTime.now().toIso8601String(),
        }, SetOptions(merge: true));
  }

  Future<void> uploadMedia(
    MobileTimeline project,
    TimelineRow media,
    void Function(double) progress,
  ) async {
    final mediaId = media['mediaId'] as String,
        file = File(media['localPath'] as String);
    final storagePath =
        'video-projects/${project.ownerUid}/${project.id}/media/$mediaId/${file.uri.pathSegments.last}';
    final ref = FirebaseFirestore.instance
        .collection('videoProjects')
        .doc(project.id)
        .collection('media')
        .doc(mediaId);
    final existing = await ref.get();
    if (existing.exists && existing.data()?['status'] == 'ready') return;
    try {
      final uploaded = await FirebaseStorage.instance
          .ref(storagePath)
          .getMetadata();
      if (uploaded.size == await file.length()) {
        await ref.set({
          'kind': media['kind'],
          'storagePath': storagePath,
          'status': 'ready',
          'name': file.uri.pathSegments.last,
        }, SetOptions(merge: true));
        return;
      }
      throw StateError(
        'The saved upload does not match this source. Reimport the clip.',
      );
    } on FirebaseException catch (e) {
      if (e.code != 'object-not-found') rethrow;
    }
    await ref.set({
      'kind': media['kind'],
      'storagePath': storagePath,
      'status': 'uploading',
      'name': file.uri.pathSegments.last,
      'duration': media['sourceDuration'] ?? 0,
    });
    final task = FirebaseStorage.instance
        .ref(storagePath)
        .putFile(
          file,
          SettableMetadata(
            contentType: media['kind'] == 'image'
                ? 'image/jpeg'
                : media['kind'] == 'audio'
                ? 'audio/mp4'
                : 'video/mp4',
          ),
        );
    _activeUpload = task;
    final subscription = task.snapshotEvents.listen(
      (s) =>
          progress(s.totalBytes == 0 ? 0 : s.bytesTransferred / s.totalBytes),
    );
    try {
      await task;
      await ref.update({'status': 'ready'});
    } finally {
      _activeUpload = null;
      await subscription.cancel();
    }
  }

  static void paintOverlay(Canvas canvas, Size size, TimelineRow layer) {
    final text = TextPainter(
      textDirection: TextDirection.ltr,
      textAlign: TextAlign.center,
      text: TextSpan(
        text: layer['text'] ?? '',
        style: TextStyle(
          fontFamily: 'Roboto',
          fontSize: (layer['fontSize'] as num? ?? 38).toDouble(),
          height: 1.2,
          fontWeight: FontWeight.w600,
          color: Colors.white,
          shadows: const [Shadow(color: Colors.black87, blurRadius: 5)],
        ),
      ),
    )..layout(maxWidth: size.width * .86);
    final x =
        ((layer['x'] as num? ?? .5).toDouble() * size.width - text.width / 2)
            .clamp(0, size.width - text.width)
            .toDouble();
    final y =
        ((layer['y'] as num? ?? .8).toDouble() * size.height - text.height / 2)
            .clamp(0, size.height - text.height)
            .toDouble();
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromLTWH(x - 8, y - 5, text.width + 16, text.height + 10),
        const Radius.circular(8),
      ),
      Paint()..color = Colors.black.withValues(alpha: .65),
    );
    text.paint(canvas, Offset(x, y));
  }

  Future<String> render(
    MobileTimeline project,
    void Function(String, double) progress,
  ) async {
    _cancelled = false;
    await saveLocal(project);
    await saveRemote(project);
    final media = <String, TimelineRow>{};
    for (final scene in project.scenes) {
      media[scene['mediaId']] = scene;
      if (scene['voice'] is Map) {
        final voice = Map<String, dynamic>.from(scene['voice'] as Map);
        media[voice['mediaId']] = voice;
      }
    }
    var index = 0;
    for (final asset in media.values) {
      _checkCancelled();
      await uploadMedia(
        project,
        asset,
        (p) => progress(
          'Uploading source ${index + 1} of ${media.length}',
          (index + p) / media.length,
        ),
      );
      index++;
    }
    final requestId =
            'mobile-${project.revision}-${DateTime.now().microsecondsSinceEpoch}',
        raster = <String, String>{},
        size = MobileTimeline.frameSize(project.aspect);
    for (final scene in project.scenes) {
      for (final layer in timelineRows(scene['overlays'])) {
        _checkCancelled();
        if (layer['type'] == 'sticker' || raster.containsKey(layer['id']))
          continue;
        progress('Preparing text & captions', 0);
        final recorder = ui.PictureRecorder(), canvas = Canvas(recorder);
        paintOverlay(
          canvas,
          Size(size.$1.toDouble(), size.$2.toDouble()),
          layer,
        );
        final picture = recorder.endRecording(),
            image = await picture.toImage(size.$1, size.$2),
            bytes = await image.toByteData(format: ui.ImageByteFormat.png);
        final path =
            'video-projects/${project.ownerUid}/${project.id}/layers/$requestId/${layer['id']}.png';
        await FirebaseStorage.instance
            .ref(path)
            .putData(
              bytes!.buffer.asUint8List(),
              SettableMetadata(contentType: 'image/png'),
            );
        image.dispose();
        picture.dispose();
        raster[layer['id']] = path;
      }
    }
    final response = await call('startVideoRender', {
      'projectId': project.id,
      'projectRevision': project.revision,
      'requestId': requestId,
      'spec': project.renderSpec(raster),
      'settings': {'resolution': '720p', 'quality': 'standard'},
    });
    project.renderId = response['id'];
    project.renderRevision = project.revision;
    await saveLocal(project);
    return project.renderId!;
  }

  Stream<TimelineRow> watchRender(String id) => FirebaseFirestore.instance
      .collection('videoRenders')
      .doc(id)
      .snapshots()
      .map((s) => s.data() ?? {});
  Future<TimelineRow> call(String name, TimelineRow data) async =>
      Map<String, dynamic>.from(
        (await FirebaseFunctions.instance
                    .httpsCallable(name)
                    .call<dynamic>(data))
                .data
            as Map,
      );
  Future<String> downloadForPosting(MobileTimeline project) async {
    final result = await call('getMobileEditedVideo', {
      'renderId': project.renderId,
      'revision': project.revision,
    });
    final uri = Uri.parse(result['url'] as String);
    if (uri.scheme != 'https' ||
        !(uri.host == 'storage.googleapis.com' ||
            uri.host.endsWith('.googleapis.com')))
      throw StateError('The render download address is unavailable.');
    final client = HttpClient()
      ..connectionTimeout = const Duration(seconds: 20);
    final output = File(
      '${(await directory(project.ownerUid, project.id)).path}/edited-${project.revision}.mp4',
    );
    try {
      final response = await (await client.getUrl(uri)).close();
      if (response.statusCode != 200 ||
          response.contentLength > 500 * 1024 * 1024)
        throw StateError('The rendered output could not be downloaded.');
      final sink = output.openWrite();
      var bytes = 0;
      try {
        await for (final chunk in response.timeout(
          const Duration(seconds: 30),
        )) {
          bytes += chunk.length;
          if (bytes > 500 * 1024 * 1024)
            throw StateError('Rendered output is too large.');
          sink.add(chunk);
        }
      } finally {
        await sink.close();
      }
      return output.path;
    } finally {
      client.close(force: true);
    }
  }
}
