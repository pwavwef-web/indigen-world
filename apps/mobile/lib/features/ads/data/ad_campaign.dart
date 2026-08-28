import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:indigen_world_mobile/core/brand.dart';

/// Money is held in pesewas — the smallest unit of the Ghana cedi — for the
/// same reason every ledger does it: a budget kept as a double eventually pays
/// somebody GH₵ 49.999999998.
const int kPesewasPerCedi = 100;

/// The floor and ceiling a member may set for one day's spend.
const int kMinDailyBudgetPesewas = 5 * kPesewasPerCedi;
const int kMaxDailyBudgetPesewas = 5000 * kPesewasPerCedi;

const int kMinCampaignDays = 1;
const int kMaxCampaignDays = 90;

/// Formats pesewas as cedis, always with two decimals.
String cedis(int pesewas) =>
    'GH₵ ${(pesewas / kPesewasPerCedi).toStringAsFixed(2)}';

/// Where a campaign asks to be shown.
enum AdPlacement {
  community,
  explore,
  collection;

  String get label => switch (this) {
    AdPlacement.community => 'Community feed',
    AdPlacement.explore => 'Explore reels',
    AdPlacement.collection => 'Collection',
  };

  IconData get icon => switch (this) {
    AdPlacement.community => Icons.forum_rounded,
    AdPlacement.explore => Icons.play_circle_fill_rounded,
    AdPlacement.collection => Icons.collections_bookmark_rounded,
  };

  static AdPlacement? fromName(String value) {
    for (final placement in AdPlacement.values) {
      if (placement.name == value) return placement;
    }
    return null;
  }
}

/// What the advertiser is trying to get out of it. Kept short and concrete —
/// three things a small Kasena business actually wants, not a taxonomy.
enum AdObjective {
  awareness,
  visits,
  messages;

  String get label => switch (this) {
    AdObjective.awareness => 'Be seen',
    AdObjective.visits => 'Send people to a link',
    AdObjective.messages => 'Start conversations',
  };

  IconData get icon => switch (this) {
    AdObjective.awareness => Icons.visibility_rounded,
    AdObjective.visits => Icons.open_in_new_rounded,
    AdObjective.messages => Icons.chat_bubble_rounded,
  };

  /// Only a link objective needs a destination, so only it asks for one.
  bool get needsLink => this == AdObjective.visits;

  static AdObjective fromName(String value) {
    for (final objective in AdObjective.values) {
      if (objective.name == value) return objective;
    }
    return AdObjective.awareness;
  }
}

/// Where a campaign is in its life.
///
/// The client never writes one of these — every transition goes through a
/// callable — but it has to be able to *read* them, because the difference
/// between "we are waiting on you" and "we are waiting on us" is the whole
/// content of this screen.
enum AdCampaignStatus {
  draft,
  pendingPayment,
  inReview,
  active,
  paused,
  completed,
  rejected,
  cancelled;

  /// The wire value. Statuses travel as SCREAMING_SNAKE like every other
  /// status in this backend.
  String get wire => switch (this) {
    AdCampaignStatus.draft => 'DRAFT',
    AdCampaignStatus.pendingPayment => 'PENDING_PAYMENT',
    AdCampaignStatus.inReview => 'IN_REVIEW',
    AdCampaignStatus.active => 'ACTIVE',
    AdCampaignStatus.paused => 'PAUSED',
    AdCampaignStatus.completed => 'COMPLETED',
    AdCampaignStatus.rejected => 'REJECTED',
    AdCampaignStatus.cancelled => 'CANCELLED',
  };

  String get label => switch (this) {
    AdCampaignStatus.draft => 'Draft',
    AdCampaignStatus.pendingPayment => 'Awaiting payment',
    AdCampaignStatus.inReview => 'In review',
    AdCampaignStatus.active => 'Running',
    AdCampaignStatus.paused => 'Paused',
    AdCampaignStatus.completed => 'Finished',
    AdCampaignStatus.rejected => 'Not approved',
    AdCampaignStatus.cancelled => 'Cancelled',
  };

  /// The colour this status is drawn in, resolved for [brand].
  ///
  /// A status is data, so it cannot read a palette off a context of its own —
  /// the screen drawing it passes one in.
  Color color(BrandPalette brand) => switch (this) {
    AdCampaignStatus.active => brand.success,
    AdCampaignStatus.pendingPayment => brand.gold,
    AdCampaignStatus.inReview => brand.accent,
    AdCampaignStatus.rejected => brand.danger,
    AdCampaignStatus.cancelled ||
    AdCampaignStatus.completed ||
    AdCampaignStatus.paused ||
    AdCampaignStatus.draft => brand.mutedInk,
  };

  IconData get icon => switch (this) {
    AdCampaignStatus.active => Icons.play_circle_fill_rounded,
    AdCampaignStatus.pendingPayment => Icons.payments_rounded,
    AdCampaignStatus.inReview => Icons.hourglass_top_rounded,
    AdCampaignStatus.rejected => Icons.block_rounded,
    AdCampaignStatus.cancelled => Icons.cancel_rounded,
    AdCampaignStatus.completed => Icons.check_circle_rounded,
    AdCampaignStatus.paused => Icons.pause_circle_filled_rounded,
    AdCampaignStatus.draft => Icons.edit_note_rounded,
  };

  /// Whether the owner may still call it off.
  bool get isCancellable => const {
    AdCampaignStatus.draft,
    AdCampaignStatus.pendingPayment,
    AdCampaignStatus.inReview,
    AdCampaignStatus.active,
    AdCampaignStatus.paused,
  }.contains(this);

  /// Whether the owner may still change the creative and the copy.
  bool get isEditable => const {
    AdCampaignStatus.draft,
    AdCampaignStatus.pendingPayment,
  }.contains(this);

  static AdCampaignStatus fromWire(String value) {
    for (final status in AdCampaignStatus.values) {
      if (status.wire == value.toUpperCase()) return status;
    }
    return AdCampaignStatus.draft;
  }
}

/// The image or clip an ad shows.
@immutable
class AdCreative {
  const AdCreative({
    required this.storagePath,
    required this.mimeType,
    required this.sizeBytes,
    required this.mediaType,
    this.previewUrl,
  });

  final String storagePath;
  final String mimeType;
  final int sizeBytes;

  /// `'image'` or `'video'`.
  final String mediaType;

  /// A download URL the *owner* can read. The creative stays in the member's
  /// private upload prefix until a paid, approved campaign is served, so this
  /// is a preview for the person who made it, not a public asset.
  final String? previewUrl;

  bool get isVideo => mediaType == 'video';

  Map<String, Object?> toMap() => {
    'storagePath': storagePath,
    'mimeType': mimeType,
    'sizeBytes': sizeBytes,
    'mediaType': mediaType,
  };

  static AdCreative? fromMap(Object? raw) {
    if (raw is! Map) return null;
    final path = raw['storagePath'];
    if (path is! String || path.isEmpty) return null;
    return AdCreative(
      storagePath: path,
      mimeType: raw['mimeType'] is String
          ? raw['mimeType'] as String
          : 'application/octet-stream',
      sizeBytes: raw['sizeBytes'] is num
          ? (raw['sizeBytes'] as num).round()
          : 0,
      mediaType: raw['mediaType'] == 'video' ? 'video' : 'image',
      previewUrl: raw['previewUrl'] is String
          ? raw['previewUrl'] as String
          : null,
    );
  }
}

/// One advertising campaign, as the member sees it.
@immutable
class AdCampaign {
  const AdCampaign({
    required this.id,
    required this.name,
    required this.objective,
    required this.headline,
    required this.body,
    required this.status,
    required this.placements,
    required this.dailyBudgetPesewas,
    required this.durationDays,
    required this.totalBudgetPesewas,
    this.ctaLabel = '',
    this.ctaUrl = '',
    this.regions = const [],
    this.creative,
    this.impressions = 0,
    this.clicks = 0,
    this.reviewFeedback = '',
    this.paymentStatus = 'unpaid',
    this.createdAt,
  });

  final String id;
  final String name;
  final AdObjective objective;
  final String headline;
  final String body;
  final AdCampaignStatus status;
  final List<AdPlacement> placements;
  final int dailyBudgetPesewas;
  final int durationDays;
  final int totalBudgetPesewas;
  final String ctaLabel;
  final String ctaUrl;
  final List<String> regions;
  final AdCreative? creative;
  final int impressions;
  final int clicks;
  final String reviewFeedback;
  final String paymentStatus;
  final DateTime? createdAt;

  bool get isPaid => paymentStatus == 'paid';

  static AdCampaign fromDoc(QueryDocumentSnapshot<Map<String, dynamic>> doc) =>
      fromData(doc.id, doc.data());

  static AdCampaign fromData(String id, Map<String, dynamic> data) {
    final created = data['createdAt'];
    final placements = <AdPlacement>[];
    final rawPlacements = data['placements'];
    if (rawPlacements is List) {
      for (final entry in rawPlacements) {
        if (entry is! String) continue;
        final placement = AdPlacement.fromName(entry);
        if (placement != null) placements.add(placement);
      }
    }
    final metrics = data['metrics'];
    final payment = data['payment'];
    return AdCampaign(
      id: id,
      name: _text(data['name'], fallback: 'Untitled campaign'),
      objective: AdObjective.fromName(_text(data['objective'])),
      headline: _text(data['headline']),
      body: _text(data['body']),
      status: AdCampaignStatus.fromWire(_text(data['status'])),
      // A campaign with no readable placement would be invisible rather than
      // broken, which is harder to notice. Fall back to the feed.
      placements: placements.isEmpty
          ? const [AdPlacement.community]
          : placements,
      dailyBudgetPesewas: _int(data['dailyBudgetPesewas']),
      durationDays: _int(data['durationDays']),
      totalBudgetPesewas: _int(data['totalBudgetPesewas']),
      ctaLabel: _text(data['ctaLabel']),
      ctaUrl: _text(data['ctaUrl']),
      regions: [
        if (data['regions'] case final List<Object?> list)
          for (final entry in list)
            if (entry is String && entry.isNotEmpty) entry,
      ],
      creative: AdCreative.fromMap(data['creative']),
      impressions: metrics is Map ? _int(metrics['impressions']) : 0,
      clicks: metrics is Map ? _int(metrics['clicks']) : 0,
      reviewFeedback: _text(data['reviewFeedback']),
      paymentStatus: payment is Map
          ? _text(payment['status'], fallback: 'unpaid')
          : 'unpaid',
      createdAt: created is Timestamp ? created.toDate() : null,
    );
  }
}

/// Everything the create-ad flow collects, before it is sent.
@immutable
class AdCampaignDraft {
  const AdCampaignDraft({
    required this.name,
    required this.objective,
    required this.headline,
    required this.body,
    required this.placements,
    required this.dailyBudgetPesewas,
    required this.durationDays,
    this.ctaLabel = '',
    this.ctaUrl = '',
    this.regions = const [],
    this.creative,
  });

  final String name;
  final AdObjective objective;
  final String headline;
  final String body;
  final List<AdPlacement> placements;
  final int dailyBudgetPesewas;
  final int durationDays;
  final String ctaLabel;
  final String ctaUrl;
  final List<String> regions;
  final AdCreative? creative;

  int get totalBudgetPesewas => dailyBudgetPesewas * durationDays;

  Map<String, Object?> toPayload() => {
    'name': name.trim(),
    'objective': objective.name,
    'headline': headline.trim(),
    'body': body.trim(),
    'placements': [for (final placement in placements) placement.name],
    'dailyBudgetPesewas': dailyBudgetPesewas,
    'durationDays': durationDays,
    'ctaLabel': ctaLabel.trim(),
    'ctaUrl': ctaUrl.trim(),
    'regions': regions,
    'creative': creative?.toMap(),
  };
}

/// What one campaign will cost, itemised.
///
/// The arithmetic is deliberately visible on the review step rather than
/// hidden behind a single total: somebody committing real money to a village
/// business should be able to check the sum themselves.
@immutable
class AdCostBreakdown {
  const AdCostBreakdown({
    required this.dailyBudgetPesewas,
    required this.durationDays,
  });

  final int dailyBudgetPesewas;
  final int durationDays;

  int get subtotalPesewas => dailyBudgetPesewas * durationDays;

  /// Ghana's VAT-inclusive levy stack on digital services, applied as one
  /// visible line rather than folded into the price.
  static const double taxRate = 0.06;

  int get taxPesewas => (subtotalPesewas * taxRate).round();

  int get totalPesewas => subtotalPesewas + taxPesewas;

  /// A rough reach estimate, stated as a range and clearly labelled as an
  /// estimate wherever it is shown. Anchored on a nominal cost per thousand
  /// impressions; it is not a promise and the UI must not present it as one.
  static const int _nominalCpmPesewas = 350;

  int get estimatedImpressionsLow =>
      (subtotalPesewas * 1000 / (_nominalCpmPesewas * 1.4)).round();

  int get estimatedImpressionsHigh =>
      (subtotalPesewas * 1000 / (_nominalCpmPesewas * 0.7)).round();
}

String _text(Object? value, {String fallback = ''}) {
  if (value is String && value.trim().isNotEmpty) return value.trim();
  return fallback;
}

int _int(Object? value) => value is num ? value.round() : 0;
