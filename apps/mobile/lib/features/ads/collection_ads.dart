/// Adverts inside the Collection channels.
///
/// ── Why the grid was not enough ───────────────────────────────────────────
/// `AdPlacement.collection` used to reach exactly one card: a single tile at the
/// bottom of the Collection grid. Everything a member actually came to the
/// Collection *for* — the songs, the readings, the dictionary, the heroes, the
/// shop — sat one tap past the only advert the placement could serve, which made
/// "Collection" a placement advertisers were sold and nobody scrolled to.
///
/// So the channels carry them too. The same placement, the same rotation, the
/// same `placedAdsProvider` gate — which is the part that matters, because it is
/// the one gate a subscription passes through and it is enforced in one function
/// rather than remembered at nine call sites.
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/features/ads/data/ad_campaign.dart';
import 'package:indigen_world_mobile/features/ads/data/served_ad.dart';

/// How many rows of a channel a member reads between adverts.
///
/// Deliberately looser than the Community timeline's and looser than Explore's.
/// Those are feeds somebody scrolls without an errand; a channel is a list
/// somebody opened to find one song, and an advert every third row of a list of
/// nine songs is a shop that has hidden its own stock. Five puts at most one
/// paid row on a first screenful of anything, and none at all on a channel with
/// four things in it — [spliceSponsored] only places after a complete run.
const int kCollectionListAdCadence = 5;

/// The adverts a Collection channel may show right now, in the order it should
/// use them.
///
/// A named alias rather than nine copies of the same family read: a channel
/// that starts showing adverts should not have to know which placement it
/// belongs to, and an ad-free subscriber is ad-free here because this is
/// [placedAdsProvider] and nothing else.
final collectionAdsProvider = Provider<List<ServedAd>>(
  (ref) => ref.watch(placedAdsProvider(AdPlacement.collection)),
);

/// A channel's rows: its own items, with adverts dealt in between them.
///
/// Typed as `Object` because the caller's item type is its own — a song, a
/// hero, a product — and the one thing every caller shares is that an advert is
/// not one of them. Each call site tests for [ServedAd] first and casts the
/// rest, exactly as the Community timeline does.
List<Object> collectionRowsWithAds({
  required List<Object> items,
  required List<ServedAd> ads,
}) => spliceSponsored<Object>(
  rows: items,
  ads: ads,
  cadence: kCollectionListAdCadence,
  render: (ad) => ad,
);
