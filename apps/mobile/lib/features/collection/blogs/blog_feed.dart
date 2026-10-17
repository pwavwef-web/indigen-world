import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

/// The blog the team publishes updates on, read straight from Blogger.
///
/// ── Why the app reads Blogger directly ────────────────────────────────────
/// Blogger publishes every public blog as a JSON feed, so a post shows up here
/// the moment it is published there — nobody has to copy it into Firestore,
/// and there is no second place for it to go stale. The feed is public,
/// read-only and needs no key; the app never writes to it.
///
/// The host is pinned. A feed URL from anywhere else — a deep link, a remote
/// config typo — is never fetched.
const kBlogHost = 'updates.indigenworld.com';
const kBlogName = 'Indigen World Updates';
const _pageSize = 20;
const _cacheKey = 'indigen.blogs.feed.v1';

@immutable
class BlogPost {
  const BlogPost({
    required this.id,
    required this.title,
    required this.url,
    required this.html,
    this.published,
    this.updated,
    this.labels = const [],
    this.coverUrl,
    this.author = '',
  });

  final String id;
  final String title;

  /// The post on the blog itself — what "Open on the web" and Share use.
  final Uri url;

  /// The post body as Blogger serves it, rendered natively by [BlogBody].
  final String html;
  final DateTime? published;
  final DateTime? updated;
  final List<String> labels;
  final String? coverUrl;
  final String author;

  /// The opening of the post as plain text, for a card.
  String get excerpt {
    final text = html
        .replaceAll(RegExp(r'<figcaption[\s\S]*?</figcaption>'), ' ')
        .replaceAll(RegExp(r'<[^>]+>'), ' ')
        .replaceAll('&nbsp;', ' ')
        .replaceAll('&amp;', '&')
        .replaceAll('&quot;', '"')
        .replaceAll('&#39;', "'")
        .replaceAll(RegExp(r'\s+'), ' ')
        .trim();
    return text.length <= 220 ? text : '${text.substring(0, 217).trim()}…';
  }

  /// Roughly how long the post takes to read, at 220 words a minute.
  int get readingMinutes {
    final words = html
        .replaceAll(RegExp(r'<[^>]+>'), ' ')
        .split(RegExp(r'\s+'))
        .where((w) => w.isNotEmpty)
        .length;
    return (words / 220).ceil().clamp(1, 120);
  }

  /// [coverUrl] at a size worth drawing: Blogger's feed hands out a 72px
  /// square crop, and its image URLs take the size in the path.
  String? coverAt(int width, {int? height}) {
    final cover = coverUrl;
    if (cover == null) return null;
    final size = height == null ? 'w$width' : 'w$width-h$height-c';
    return cover.replaceFirst(RegExp(r'/s\d+(-c)?/'), '/$size/');
  }

  Map<String, Object?> toJson() => {
    'id': id,
    'title': title,
    'url': url.toString(),
    'html': html,
    'published': published?.toIso8601String(),
    'updated': updated?.toIso8601String(),
    'labels': labels,
    'coverUrl': coverUrl,
    'author': author,
  };

  static BlogPost? fromCache(Map<String, dynamic> json) {
    final url = Uri.tryParse('${json['url'] ?? ''}');
    if (url == null || url.host != kBlogHost) return null;
    return BlogPost(
      id: '${json['id']}',
      title: '${json['title'] ?? ''}',
      url: url,
      html: '${json['html'] ?? ''}',
      published: DateTime.tryParse('${json['published'] ?? ''}'),
      updated: DateTime.tryParse('${json['updated'] ?? ''}'),
      labels: [for (final l in json['labels'] as List? ?? const []) '$l'],
      coverUrl: json['coverUrl'] as String?,
      author: '${json['author'] ?? ''}',
    );
  }

  /// One `entry` of Blogger's JSON feed, or null if it is not a usable post.
  static BlogPost? fromFeedEntry(Map<String, dynamic> entry) {
    String text(Object? node) =>
        node is Map ? '${node[r'$t'] ?? ''}'.trim() : '';
    final links = (entry['link'] as List? ?? const []).whereType<Map>();
    final alternate = links
        .where((l) => l['rel'] == 'alternate')
        .map((l) => Uri.tryParse('${l['href']}'))
        .firstOrNull;
    if (alternate == null || alternate.host != kBlogHost) return null;
    final title = text(entry['title']);
    final html = text(entry['content']).isNotEmpty
        ? text(entry['content'])
        : text(entry['summary']);
    if (title.isEmpty && html.isEmpty) return null;
    final thumbnail = entry[r'media$thumbnail'];
    var cover = thumbnail is Map ? '${thumbnail['url'] ?? ''}' : '';
    if (cover.isEmpty) {
      cover =
          RegExp(r'''<img[^>]+src=["']([^"']+)["']''')
              .firstMatch(html)
              ?.group(1) ??
          '';
    }
    final coverUri = Uri.tryParse(cover);
    return BlogPost(
      id: text(entry['id']).isEmpty ? alternate.toString() : text(entry['id']),
      title: title.isEmpty ? 'Untitled update' : title,
      url: alternate.replace(scheme: 'https'),
      html: html,
      published: DateTime.tryParse(text(entry['published']))?.toLocal(),
      updated: DateTime.tryParse(text(entry['updated']))?.toLocal(),
      labels: [
        for (final c
            in (entry['category'] as List? ?? const []).whereType<Map>())
          if ('${c['term'] ?? ''}'.trim().isNotEmpty) '${c['term']}'.trim(),
      ],
      coverUrl: coverUri != null && coverUri.scheme == 'https' ? cover : null,
      author: (entry['author'] as List? ?? const [])
          .whereType<Map>()
          .map((a) => text(a['name']))
          .firstWhere((n) => n.isNotEmpty, orElse: () => ''),
    );
  }
}

@immutable
class BlogPage {
  const BlogPage({
    required this.posts,
    required this.total,
    this.fromCache = false,
  });
  final List<BlogPost> posts;
  final int total;

  /// True when the network failed and this is what the device kept.
  final bool fromCache;

  bool get hasMore => posts.length < total;
}

class BlogFeedRepository {
  BlogFeedRepository({http.Client? client}) : _client = client ?? http.Client();
  final http.Client _client;

  /// Posts [start] onwards (zero-based), newest first.
  Future<BlogPage> page({int start = 0}) async {
    final uri = Uri.https(kBlogHost, '/feeds/posts/default', {
      'alt': 'json',
      'max-results': '$_pageSize',
      'start-index': '${start + 1}',
    });
    final response = await _client
        .get(uri, headers: const {'Accept': 'application/json'})
        .timeout(const Duration(seconds: 15));
    if (response.statusCode != 200) {
      throw BlogFeedException('The blog answered ${response.statusCode}.');
    }
    // Bounded: a feed page is a few hundred kilobytes. Anything vastly larger
    // is not the feed this screen was written for.
    if (response.bodyBytes.length > 8 * 1024 * 1024) {
      throw const BlogFeedException('The blog feed was unexpectedly large.');
    }
    return parseFeed(utf8.decode(response.bodyBytes));
  }

  static BlogPage parseFeed(String body) {
    final json = jsonDecode(body);
    final feed = json is Map ? json['feed'] : null;
    if (feed is! Map) throw const BlogFeedException('Not a Blogger feed.');
    final entries = (feed['entry'] as List? ?? const [])
        .whereType<Map>()
        .map((e) => BlogPost.fromFeedEntry(Map<String, dynamic>.from(e)))
        .whereType<BlogPost>()
        .toList();
    final totalNode = feed[r'openSearch$totalResults'];
    final total =
        int.tryParse(totalNode is Map ? '${totalNode[r'$t']}' : '') ??
        entries.length;
    return BlogPage(posts: entries, total: total);
  }

  Future<void> saveFirstPage(BlogPage page) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(
        _cacheKey,
        jsonEncode({
          'total': page.total,
          'posts': [for (final p in page.posts) p.toJson()],
        }),
      );
    } on Object {
      // A cache that cannot be written only costs the offline copy.
    }
  }

  Future<BlogPage?> cachedFirstPage() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_cacheKey);
      if (raw == null) return null;
      final json = jsonDecode(raw) as Map<String, dynamic>;
      final posts = [
        for (final p in json['posts'] as List? ?? const [])
          if (p is Map) BlogPost.fromCache(Map<String, dynamic>.from(p)),
      ].whereType<BlogPost>().toList();
      if (posts.isEmpty) return null;
      return BlogPage(
        posts: posts,
        total: json['total'] as int? ?? posts.length,
        fromCache: true,
      );
    } on Object {
      return null;
    }
  }
}

class BlogFeedException implements Exception {
  const BlogFeedException(this.message);
  final String message;
  @override
  String toString() => message;
}

final blogFeedRepositoryProvider = Provider<BlogFeedRepository>(
  (ref) => BlogFeedRepository(),
);

/// The blog, newest first, paged on demand and kept for offline reading.
class BlogFeed extends AsyncNotifier<BlogPage> {
  bool _loadingMore = false;

  @override
  Future<BlogPage> build() async {
    final repository = ref.read(blogFeedRepositoryProvider);
    try {
      final page = await repository.page();
      unawaited(repository.saveFirstPage(page));
      return page;
    } on Object {
      final cached = await repository.cachedFirstPage();
      if (cached != null) return cached;
      rethrow;
    }
  }

  Future<void> loadMore() async {
    final current = state.value;
    if (current == null || !current.hasMore || _loadingMore) return;
    _loadingMore = true;
    try {
      final next = await ref
          .read(blogFeedRepositoryProvider)
          .page(start: current.posts.length);
      final seen = {for (final p in current.posts) p.id};
      state = AsyncData(
        BlogPage(
          posts: [...current.posts, ...next.posts.where((p) => seen.add(p.id))],
          // A page that came back empty means the total was stale.
          total: next.posts.isEmpty ? current.posts.length : next.total,
        ),
      );
    } finally {
      _loadingMore = false;
    }
  }
}

final blogFeedProvider = AsyncNotifierProvider<BlogFeed, BlogPage>(
  BlogFeed.new,
);
