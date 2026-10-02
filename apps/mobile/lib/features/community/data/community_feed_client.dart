import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:indigen_world_mobile/features/community/data/community_models.dart';

Object? decodeFeedValue(Object? value) {
  if (value is Map) {
    if (value.length == 1 && value['__timestampMillis'] is num) {
      return Timestamp.fromMillisecondsSinceEpoch(
        (value['__timestampMillis'] as num).toInt(),
      );
    }
    return value.map(
      (key, value) => MapEntry(key.toString(), decodeFeedValue(value)),
    );
  }
  if (value is List) return value.map(decodeFeedValue).toList();
  return value;
}

/// One immutable ranking session per tab; growing a window never reranks its head.
typedef CommunityFeedTransport = Future<Map<dynamic, dynamic>> Function(
  String name,
  Map<String, Object?> data,
);

class CommunityFeedClient {
  CommunityFeedClient(this.functions) : _transport = null;
  CommunityFeedClient.withTransport(this._transport) : functions = null;
  final FirebaseFunctions? functions;
  final CommunityFeedTransport? _transport;
  final _posts = <String, List<CommunityPost>>{};
  final _cursors = <String, String?>{};
  final _sessions = <String, String>{};
  final _events = <String>{};
  Future<void> _queue = Future.value();

  Future<Map<dynamic, dynamic>> _request(
    String name,
    Map<String, Object?> data,
  ) async {
    if (_transport != null) return _transport(name, data);
    final response = await functions!.httpsCallable(name).call<Object?>(data);
    return response.data as Map;
  }

  Future<List<CommunityPost>> load(String mode, int count) async {
    final previous = _queue;
    final next = () async {
      try {
        await previous;
      } on Object {
        /* A failed request can be retried. */
      }
      var posts = _posts[mode] ?? <CommunityPost>[];
      var refreshed = false;
      while (posts.length < count &&
          (!_cursors.containsKey(mode) || _cursors[mode] != null)) {
        Map<dynamic, dynamic> data;
        try {
          data = await _request('getCommunityFeed', {
            'mode': mode,
            'limit': (count - posts.length).clamp(1, 50),
            if (_cursors[mode] != null) 'cursor': _cursors[mode],
          });
        } on FirebaseFunctionsException catch (error) {
          if (error.code != 'failed-precondition' || refreshed) rethrow;
          // A ranking session expires after 15 minutes. Restart exactly once.
          refreshed = true;
          _cursors.remove(mode);
          posts = <CommunityPost>[];
          _posts.remove(mode);
          continue;
        }
        _sessions[mode] = data['sessionId'] as String;
        for (final value in data['items'] as List) {
          final item = Map<String, Object?>.from(value as Map);
          final raw = Map<String, dynamic>.from(
            decodeFeedValue(item['post']) as Map,
          );
          raw['recommendationReason'] = mode == 'for-you'
              ? item['reason']
              : null;
          var post = CommunityPost.fromMap(item['id'] as String, raw);
          if (item['reshare'] case final Map reshare) {
            post = post.withReshare(
              uid: reshare['uid'] as String,
              displayName: reshare['displayName'] as String,
              username: reshare['username'] as String,
              avatarUrl: reshare['avatarUrl'] as String?,
              createdAt: DateTime.fromMillisecondsSinceEpoch(
                (reshare['createdAt'] as num).toInt(),
              ),
            );
          }
          if (!posts.any((p) => p.id == post.id)) posts.add(post);
        }
        _cursors[mode] = data['nextCursor'] as String?;
        _posts[mode] = posts;
      }
    }();
    _queue = next;
    await next;
    return List.unmodifiable((_posts[mode] ?? <CommunityPost>[]).take(count));
  }

  Future<void> impression(String postId) => event(postId, 'impression');

  Future<void> event(String postId, String kind, {int milliseconds = 0}) async {
    final mode = _posts.keys
        .where((m) => _posts[m]!.any((p) => p.id == postId))
        .firstOrNull;
    if (mode == null) return;
    final session = _sessions[mode];
    final key = '$session:$postId:$kind';
    if (session == null || !_events.add(key)) return;
    try {
      await _request('recordCommunityRecommendationEvent', {
        'sessionId': session,
        'postId': postId,
        'kind': kind,
        if (milliseconds > 0) 'milliseconds': milliseconds,
      });
    } on Object {
      _events.remove(key);
    }
  }
}
