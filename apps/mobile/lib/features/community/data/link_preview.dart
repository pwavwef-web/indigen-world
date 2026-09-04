import 'dart:convert';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:crypto/crypto.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/firebase_ready.dart';
import 'package:indigen_world_mobile/features/community/data/community_providers.dart';

/// What a link in a post turns out to be.
///
/// ── Why a post shows this and not the URL ─────────────────────────────────
/// A bare `https://…` in a timeline is a dare. Nobody can tell from it whether
/// they are about to open a news article, a market listing, a video or a
/// phishing page, and on a metered connection the cost of finding out is real.
/// Every social product answers this the same way: go and read the page once,
/// and show the headline, the sentence and the picture that page publishes
/// about itself.
///
/// The reading is done by `fetchLinkPreview` on the backend rather than here —
/// see `services/functions/src/link-preview.ts` for why — and the result is
/// cached in `linkPreviews`, one document per link for the whole community.
class LinkPreview {
  const LinkPreview({
    required this.url,
    required this.host,
    required this.status,
    this.title,
    this.description,
    this.imageUrl,
    this.siteName,
  });

  /// The address that was actually read, after redirects.
  final String url;

  /// The site the unfurler finished at, without `www.`.
  ///
  /// Not what the card puts under the headline — see the note in
  /// `CommunityLinkPreview` about why a card names the link's *first* hop. This
  /// is here for the fallback case where the pasted address cannot be parsed at
  /// all, and for anything that later wants to know where a link really went.
  final String host;

  /// `ok` when the page told us something worth drawing, `bare` when it
  /// answered with nothing, `failed` when it could not be read at all.
  final String status;

  final String? title;
  final String? description;
  final String? imageUrl;
  final String? siteName;

  /// Whether there is enough here to draw a card rather than a chip.
  bool get isRich =>
      status == 'ok' &&
      ((title != null && title!.isNotEmpty) ||
          (imageUrl != null && imageUrl!.isNotEmpty));

  static LinkPreview? fromMap(Map<Object?, Object?>? data) {
    if (data == null) return null;
    String? text(String key) {
      final value = data[key];
      if (value is! String) return null;
      final trimmed = value.trim();
      return trimmed.isEmpty ? null : trimmed;
    }

    final host = text('host');
    final url = text('url');
    if (host == null || url == null) return null;
    return LinkPreview(
      url: url,
      host: host,
      status: text('status') ?? 'ok',
      title: text('title'),
      description: text('description'),
      imageUrl: text('imageUrl'),
      siteName: text('siteName'),
    );
  }

  /// How old the stored card is allowed to get before it is read again.
  ///
  /// Matches `OK_TTL_MS` / `FAILED_TTL_MS` on the backend, and is applied here
  /// as well so a stale document does not cost a callable to discover.
  static const freshFor = Duration(days: 7);
  static const retryFailedAfter = Duration(hours: 6);
}

/// The one form of a link that the phone and the backend agree on.
///
/// The same rules, in the same order, live in `normaliseLinkUrl` in
/// `services/functions/src/link-preview.ts`. Built from parts rather than from
/// [Uri.toString] because Dart and the backend's URL printer disagree about
/// small things — an empty path, a default port — and every disagreement is a
/// cache this phone could never hit.
///
/// Returns null for anything that is not an ordinary web link.
///
/// ── Where the two still disagree, and why that is survivable ──────────────
/// Dart's [Uri] and the backend's WHATWG `URL` are different parsers, and three
/// classes of address come out differently no matter how the string is
/// assembled afterwards:
///
///   * percent-escapes — `Uri` decodes `%7E` to `~` and uppercases the rest;
///     `URL` leaves whatever was written alone
///   * an internationalised host — `URL` punycodes `münchen.de`, `Uri` does not
///   * dot segments — handled below with [Uri.normalizePath], which is the one
///     of the three Dart can fix
///
/// A link of one of those shapes misses this cache *every* time it is drawn,
/// which is a callable per reader rather than a document read. It is never a
/// wrong card — the backend answers from the key it computed for itself — and
/// the shapes are rare enough in a pasted link to be worth the honesty of
/// writing them down instead of building a second URL parser to chase them.
String? normaliseLinkUrl(String raw) {
  final parsed = Uri.tryParse(raw.trim());
  if (parsed == null || !parsed.hasScheme) return null;
  final scheme = parsed.scheme.toLowerCase();
  if (scheme != 'http' && scheme != 'https') return null;
  // A link carrying credentials is either a mistake or a trap.
  if (parsed.userInfo.isNotEmpty) return null;

  final host = parsed.host.toLowerCase().replaceFirst(RegExp(r'\.$'), '');
  if (host.isEmpty) return null;

  // `/a/../b` and `/b` are one page, and the backend's parser already says so.
  final uri = parsed.normalizePath();
  final defaultPort = scheme == 'https' ? 443 : 80;
  final port = uri.hasPort && uri.port != defaultPort ? ':${uri.port}' : '';
  final path = uri.path.isEmpty ? '/' : uri.path;
  final query = _keepableQuery(uri.query);

  return '$scheme://$host$port$path$query';
}

/// Query parameters that identify the sharer rather than the page. Dropped so
/// that one article shared twenty ways is one cached card rather than twenty.
const _trackingParams = <String>{
  'fbclid',
  'gclid',
  'dclid',
  'msclkid',
  'igshid',
  'mc_cid',
  'mc_eid',
  'ref_src',
  'ref_url',
  's_cid',
  'twclid',
  'yclid',
  '_ga',
  '_gl',
};

String _keepableQuery(String query) {
  if (query.isEmpty) return '';
  final kept = query.split('&').where((pair) {
    if (pair.isEmpty) return false;
    final name = pair.split('=').first.toLowerCase();
    return !name.startsWith('utm_') && !_trackingParams.contains(name);
  }).toList(growable: false);
  return kept.isEmpty ? '' : '?${kept.join('&')}';
}

/// The document a normalised link is cached under.
String linkPreviewKey(String normalisedUrl) =>
    sha256.convert(utf8.encode(normalisedUrl)).toString();

/// Reads a link's card: the shared cache first, the unfurler only on a miss.
class LinkPreviewRepository {
  const LinkPreviewRepository(this._firestore, this._functions);

  final FirebaseFirestore _firestore;
  final FirebaseFunctions _functions;

  static const collection = 'linkPreviews';

  /// Long enough for a cold start plus the page fetch behind it. Past this the
  /// card simply does not appear, which is a chip rather than a failure.
  static const _timeout = Duration(seconds: 25);

  /// The card for [rawUrl], or null when there is nothing worth drawing.
  ///
  /// The cached document is tried first and costs one read — which Firestore
  /// serves from its own on-disk cache when the phone is offline, so a feed
  /// read on a bus still draws the cards it drew yesterday. The callable is
  /// only for a link nobody has shared yet, and is skipped entirely for a
  /// signed-out reader because it requires auth.
  Future<LinkPreview?> load(String rawUrl, {required bool signedIn}) async {
    final normalised = normaliseLinkUrl(rawUrl);
    if (normalised == null) return null;

    try {
      final snapshot = await _firestore
          .collection(collection)
          .doc(linkPreviewKey(normalised))
          .get();
      final data = snapshot.data();
      if (data != null && _isFresh(data)) return LinkPreview.fromMap(data);
    } catch (_) {
      // A rule that has not been deployed, or no connection. Either way the
      // callable below is the next thing to try.
    }

    if (!signedIn) return null;

    try {
      final result = await _functions
          .httpsCallable(
            'fetchLinkPreview',
            options: HttpsCallableOptions(timeout: _timeout),
          )
          .call<Map<Object?, Object?>>(<String, Object?>{'url': normalised});
      return LinkPreview.fromMap(result.data);
    } catch (_) {
      // A link that cannot be unfurled is not an error anybody needs to see;
      // the post still shows the address it always did.
      return null;
    }
  }

  /// Whether a stored card is young enough to use without asking again.
  bool _isFresh(Map<String, dynamic> data) {
    final stamped = data['fetchedAt'];
    if (stamped is! num) return false;
    final age = DateTime.now().difference(
      DateTime.fromMillisecondsSinceEpoch(stamped.toInt()),
    );
    if (age.isNegative) return false;
    return age <
        (data['status'] == 'failed'
            ? LinkPreview.retryFailedAfter
            : LinkPreview.freshFor);
  }
}

/// The unfurler, or null when Firebase is unavailable this launch.
final linkPreviewRepositoryProvider = Provider<LinkPreviewRepository?>((ref) {
  if (!ref.watch(firebaseReadyProvider)) return null;
  return LinkPreviewRepository(
    FirebaseFirestore.instance,
    FirebaseFunctions.instance,
  );
});

/// The card for one link.
///
/// Kept alive rather than auto-disposed: links repeat down a feed and a reader
/// scrolls back past them, and a card that had to be fetched again every time
/// it left the screen would be the slowest thing in the timeline.
final linkPreviewProvider = FutureProvider.family<LinkPreview?, String>((
  ref,
  url,
) async {
  final repository = ref.watch(linkPreviewRepositoryProvider);
  if (repository == null) return null;
  return repository.load(url, signedIn: ref.watch(currentUidProvider) != null);
});
