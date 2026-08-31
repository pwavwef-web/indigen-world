import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/firebase_ready.dart';
import 'package:indigen_world_mobile/features/ads/data/ad_campaign.dart';

/// An advert as a *reader* sees it, rather than as its owner does.
///
/// `AdCampaign` is the advertiser's object: what it cost, what it has been
/// charged, where it is in review, how much of the budget is left. None of that
/// is any of a reader's business, and none of it is readable by a phone that
/// does not own the campaign — the Security Rules see to that. So the backend
/// projects the handful of fields a consumer surface actually draws into the
/// world-readable `adPlacements` collection, and this is that projection.
///
/// The placement vocabulary is deliberately the same [AdPlacement] the create
/// flow collects. A second slot enum would have let the wizard and the feed
/// drift apart, and an advert that was bought for Explore and shown in the
/// Collection is a refund.
@immutable
class ServedAd {
  const ServedAd({
    required this.campaignId,
    required this.headline,
    required this.body,
    required this.creativeUrl,
    required this.mediaType,
    this.objective = AdObjective.awareness,
    this.ctaLabel = '',
    this.ctaUrl = '',
    this.placements = const [],
    this.regions = const [],
    this.startsAt,
    this.endsAt,
    this.active = true,
  });

  /// The campaign this advert belongs to — the id `recordAdEvent` counts
  /// against, and the id the once-only impression guard is keyed by.
  final String campaignId;

  final String headline;
  final String body;

  /// Public download URL of the approved creative. Unlike `AdCreative`'s
  /// owner-only preview, this one is served to everybody, which is the whole
  /// difference between a campaign and a placement.
  final String creativeUrl;

  /// `'image'` or `'video'`.
  final String mediaType;

  final AdObjective objective;
  final String ctaLabel;
  final String ctaUrl;
  final List<AdPlacement> placements;
  final List<String> regions;

  /// The window the campaign was bought for. Null on either end means "no
  /// bound stated", which is how a campaign with an open finish arrives.
  final DateTime? startsAt;
  final DateTime? endsAt;

  /// The backend's own switch: paused, cancelled and rejected campaigns are
  /// written `false` rather than deleted, so the row keeps its history.
  final bool active;

  bool get isVideo => mediaType == 'video';

  bool get hasCreative => creativeUrl.isNotEmpty;

  /// Whether there is anywhere to send somebody who taps.
  ///
  /// An awareness campaign has no destination by design — see
  /// [AdObjective.needsLink] — so the card shows no button rather than a dead
  /// one.
  bool get hasLink => ctaUrl.isNotEmpty;

  /// The words on the button. An advertiser who left the field blank still gets
  /// a button that says what it does.
  String get callToAction => ctaLabel.isNotEmpty ? ctaLabel : 'Learn more';

  bool servesIn(AdPlacement placement) => placements.contains(placement);

  /// Whether [now] falls inside the window this campaign was bought for.
  ///
  /// Judged against the device clock, which is the one thing here that can be
  /// wrong. It is still the right trade: a phone whose clock is a day out shows
  /// one advert it should not, where a feed that trusted `active` alone would
  /// show every finished campaign until the expiry job next ran.
  bool isRunningAt(DateTime now) {
    final startsAt = this.startsAt;
    final endsAt = this.endsAt;
    if (startsAt != null && startsAt.isAfter(now)) return false;
    // Ends *at*, not after: a campaign bought until midnight is finished at
    // midnight, not one advert later.
    if (endsAt != null && !endsAt.isAfter(now)) return false;
    return true;
  }

  static ServedAd fromDoc(DocumentSnapshot<Map<String, dynamic>> doc) =>
      fromData(doc.id, doc.data() ?? const <String, dynamic>{});

  static ServedAd fromData(String id, Map<String, dynamic> data) => ServedAd(
    campaignId: _text(data['campaignId'], fallback: id),
    headline: _text(data['headline']),
    body: _text(data['body']),
    creativeUrl: _text(data['creativeUrl']),
    mediaType: data['mediaType'] == 'video' ? 'video' : 'image',
    objective: AdObjective.fromName(_text(data['objective'])),
    ctaLabel: _text(data['ctaLabel']),
    ctaUrl: _text(data['ctaUrl']),
    // No fallback placement here, unlike `AdCampaign.fromData`. That fallback
    // exists so an advertiser can still find their own campaign in their own
    // list; doing the same on the serving side would put an advert nobody
    // bought in front of the whole community.
    placements: [
      if (data['placements'] case final List<Object?> list)
        for (final entry in list)
          if (entry is String) ?AdPlacement.fromName(entry),
    ],
    regions: [
      if (data['regions'] case final List<Object?> list)
        for (final entry in list)
          if (entry is String && entry.isNotEmpty) entry,
    ],
    startsAt: _date(data['startsAt']),
    endsAt: _date(data['endsAt']),
    active: data['active'] != false,
  );
}

String _text(Object? value, {String fallback = ''}) {
  if (value is String && value.trim().isNotEmpty) return value.trim();
  return fallback;
}

/// Dates arrive as ISO strings on this collection, but a backend that later
/// writes a `Timestamp` should not silently un-expire every campaign.
DateTime? _date(Object? value) {
  if (value is Timestamp) return value.toDate();
  if (value is String && value.trim().isNotEmpty) {
    return DateTime.tryParse(value.trim());
  }
  return null;
}

/// Which advert holds the top of a placement, as a function of the clock.
///
/// A window rather than a shuffle. Picking at random would re-pick on every
/// rebuild, so the advert under somebody's thumb would change while they were
/// reaching for it; a fixed order would give whichever campaign sorts first a
/// permanent monopoly on every surface.
///
/// ── What this does not do ──────────────────────────────────────────────────
/// It does not rotate on a timer. The offset is computed when the placement
/// list is rebuilt, which happens when the `adPlacements` snapshot changes and
/// not otherwise — so within one sitting a reader keeps the advert they were
/// given, and the five minutes is what separates two readers arriving at
/// different times rather than two adverts shown to the same one. Rotating
/// inside a session would need a ticker, and a ticker that rebuilds three feeds
/// every five minutes to change an advert nobody asked to change is a worse
/// trade than the monopoly it prevents.
const Duration kAdRotationWindow = Duration(minutes: 5);

/// The adverts that may be shown in [placement] at [now], in the order they
/// should be used.
///
/// ── Why every one of these filters is here and not in the query ───────────
/// The query this list comes from is `active == true` and nothing else — see
/// [ServedAdRepository.watchServed]. Placement, the campaign window and the
/// rotation are all decided here, on the device.
///
/// [now] is a parameter rather than a `DateTime.now()` inside, so the rotation
/// and the expiry are both things a test can state rather than race.
List<ServedAd> adsForPlacement(
  Iterable<ServedAd> ads,
  AdPlacement placement, {
  required DateTime now,
}) {
  final eligible =
      [
        for (final ad in ads)
          // An advert with no headline has nothing to say and would render as
          // a blank pane somebody paid for.
          if (ad.active &&
              ad.headline.isNotEmpty &&
              ad.servesIn(placement) &&
              ad.isRunningAt(now))
            ad,
      ]
      // Sorted before rotating so the rotation is a rotation of a stable list
      // rather than of whatever order Firestore happened to return.
      ..sort((left, right) => left.campaignId.compareTo(right.campaignId));
  if (eligible.length < 2) return List.unmodifiable(eligible);
  final window = kAdRotationWindow.inMilliseconds;
  final offset = (now.millisecondsSinceEpoch ~/ window) % eligible.length;
  return List.unmodifiable([
    ...eligible.skip(offset),
    ...eligible.take(offset),
  ]);
}

/// Splices adverts into a list of content at a fixed cadence.
///
/// One implementation for every surface, because the rule is the same one on
/// all of them and it is easy to get subtly wrong per screen: an advert lands
/// only after a *complete* run of [cadence] rows, so a feed with four posts in
/// it carries no advert at all, and two adverts can never end up adjacent. When
/// several campaigns are eligible they take turns down the list rather than the
/// first one repeating.
///
/// [render] is what turns an advert into whatever the surface builds — a
/// [ServedAd] stays a [ServedAd] in the Community timeline and becomes a `Reel`
/// in Explore.
List<T> spliceSponsored<T>({
  required List<T> rows,
  required List<ServedAd> ads,
  required int cadence,
  required T Function(ServedAd ad) render,
}) {
  if (ads.isEmpty || rows.isEmpty || cadence < 1) return rows;
  final spliced = <T>[];
  var served = 0;
  for (var index = 0; index < rows.length; index++) {
    spliced.add(rows[index]);
    if ((index + 1) % cadence != 0) continue;
    spliced.add(render(ads[served % ads.length]));
    served++;
  }
  return spliced;
}

/// Reads the adverts the backend has cleared for serving.
///
/// `adPlacements` is world-readable and holds nothing an advertiser would mind
/// a reader seeing. Nothing here writes to it: impressions and clicks go
/// through [recordEvent], because a counter a phone could set is a counter a
/// phone could set to a million.
class ServedAdRepository {
  const ServedAdRepository(this._firestore, this._functions);

  final FirebaseFirestore _firestore;
  final FirebaseFunctions _functions;

  static const _timeout = Duration(seconds: 20);

  /// How many active adverts are pulled down at once. The whole eligible set
  /// for the whole app, not per placement — see below.
  static const servedLimit = 50;

  /// Every active advert, filtered and rotated on the device.
  ///
  /// ── Why the query is a single equality ────────────────────────────────
  /// Sorted and narrowed on the device so the query stays a single-field
  /// equality and needs no composite index — the same trade every other queue
  /// in the app makes. Asking Firestore for `placements array-contains x` and
  /// `endsAt > now` together would need an index deployed separately from the
  /// app, and an index that has not been deployed yet is a feed that silently
  /// shows nothing.
  ///
  /// Doing the `endsAt` comparison here has a second effect worth stating: an
  /// advert whose window has closed drops out on the next rebuild, rather than
  /// waiting for whatever hour the daily expiry job next flips `active` to
  /// false. That is a session-length guarantee and not an instant one — the
  /// comparison runs when the snapshot changes, so a campaign that ends
  /// mid-sitting can linger until something else moves. It costs the advertiser
  /// nothing, because a campaign is paid for up front and charged by the
  /// calendar rather than by what it was shown; and the cases that must come
  /// down at once — paused, rejected, cancelled — all write to the document
  /// itself, which re-fires this snapshot and takes them out immediately.
  ///
  /// One subscription feeds all three placements. Three identical queries
  /// filtered three ways would be three snapshot listeners open on a phone for
  /// the same fifty documents.
  Stream<List<ServedAd>> watchServed() => _firestore
      .collection('adPlacements')
      .where('active', isEqualTo: true)
      .limit(servedLimit)
      .snapshots()
      .map(
        (snapshot) =>
            snapshot.docs.map(ServedAd.fromDoc).toList(growable: false),
      );

  /// Counts one impression or click against [campaignId].
  ///
  /// Unlike `AdReviewRepository.decide`, which turns a failure into something a
  /// reviewer can read, this one swallows everything. There is no member-facing
  /// half of an impression: the failure modes are a refused write, a callable
  /// that has not been deployed, and a phone on no signal, and none of the
  /// three is worth a word to somebody who is reading their feed.
  Future<void> recordEvent({
    required String campaignId,
    required AdEventKind kind,
  }) async {
    try {
      final callable = _functions.httpsCallable(
        'recordAdEvent',
        options: HttpsCallableOptions(timeout: _timeout),
      );
      await callable.call<Map<Object?, Object?>>({
        'campaignId': campaignId,
        'kind': kind.name,
      });
    } on FirebaseFunctionsException {
      // Telemetry. Never interrupts, never surfaces.
    } on Object {
      // As above, for everything that is not a callable failure.
    }
  }
}

/// What `recordAdEvent` counts. The names are the wire values.
enum AdEventKind { impression, click }

/// The once-only guard in front of [ServedAdRepository.recordEvent].
///
/// Copies the discipline the Community feed already keeps for post views: an
/// advert is counted the first time it is genuinely on screen and never again
/// this session, *including* when the write was refused. A card that keeps
/// drifting past the visibility threshold must not turn a permanently refused
/// write into an endless retry, and a reader who scrolls back up has not seen a
/// second advert.
///
/// The guard is keyed by campaign rather than by widget, so the same advert
/// showing in the Community feed and again in Explore is still one impression.
/// Clicks are not guarded: somebody who taps twice meant it twice.
class ServedAdTelemetry {
  ServedAdTelemetry(this._send);

  /// How an event actually leaves the device. A function rather than the
  /// repository itself so the ordering this class promises — recorded, *then*
  /// opened — is something a test can observe without a Firebase project.
  final Future<void> Function(String campaignId, AdEventKind kind) _send;

  final _counted = <String>{};

  Future<void> recordImpression(String campaignId) async {
    if (campaignId.isEmpty || !_counted.add(campaignId)) return;
    await _send(campaignId, AdEventKind.impression);
  }

  Future<void> recordClick(String campaignId) async {
    if (campaignId.isEmpty) return;
    await _send(campaignId, AdEventKind.click);
  }
}

final servedAdRepositoryProvider = Provider<ServedAdRepository?>((ref) {
  if (!ref.watch(firebaseReadyProvider)) return null;
  return ServedAdRepository(
    FirebaseFirestore.instance,
    FirebaseFunctions.instance,
  );
});

/// Every advert cleared for serving, unfiltered. Empty rather than an error
/// when Firebase is not up, so a surface that shows adverts is never a surface
/// that fails because of them.
final servedAdsProvider = StreamProvider<List<ServedAd>>((ref) {
  final repository = ref.watch(servedAdRepositoryProvider);
  if (repository == null) return Stream.value(const <ServedAd>[]);
  return repository.watchServed();
});

/// The adverts one surface may show, in the order it should use them.
///
/// A derived family rather than a query per placement: the three surfaces read
/// three views of the same subscription.
final placedAdsProvider = Provider.family<List<ServedAd>, AdPlacement>((
  ref,
  placement,
) {
  final ads = ref.watch(servedAdsProvider).asData?.value;
  if (ads == null || ads.isEmpty) return const <ServedAd>[];
  return adsForPlacement(ads, placement, now: DateTime.now());
});

/// Session-wide, so an advert counted in one tab is not counted again in
/// another.
final servedAdTelemetryProvider = Provider<ServedAdTelemetry>((ref) {
  final repository = ref.watch(servedAdRepositoryProvider);
  return ServedAdTelemetry(
    (campaignId, kind) async =>
        repository?.recordEvent(campaignId: campaignId, kind: kind),
  );
});
