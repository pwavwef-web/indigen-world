import 'package:indigen_world_mobile/features/subscriptions/data/billing_service.dart';
import 'package:indigen_world_mobile/features/subscriptions/data/subscription_catalog.dart';

/// The arithmetic the membership screen does on Play's prices.
///
/// ── None of it invents a price ────────────────────────────────────────────
/// Every figure here starts from what Google Play returned for this member —
/// `ProductDetails.price`, already in their currency after regional pricing
/// and tax — and every function returns null the moment the arithmetic would
/// be a guess. A number this file cannot reproduce from Play's own string is a
/// number the screen does not show.

/// The offer that states a plan's everyday price.
///
/// The base plan itself rather than a trial or introductory offer layered on
/// it: Play formats an offer's *first* pricing phase into `price`, so a free
/// trial's price reads "Free" and an introductory one reads the discount. The
/// layered offer is only used when Play returned nothing else for the period.
SubscriptionOffer? listedOffer(
  List<SubscriptionOffer> offers,
  BillingPeriod period,
) {
  SubscriptionOffer? layered;
  for (final offer in offers) {
    if (offer.plan.billingPeriod != period) continue;
    if (offer.offerId?.isNotEmpty ?? false) {
      layered ??= offer;
    } else {
      return offer;
    }
  }
  return layered;
}

/// The offer to buy for a period.
///
/// A trial or introductory offer when Play returned one — Play only returns
/// developer offers this account is eligible for, so one being here means this
/// member gets it — and the base plan otherwise.
SubscriptionOffer? purchaseOffer(
  List<SubscriptionOffer> offers,
  BillingPeriod period,
) {
  SubscriptionOffer? base;
  for (final offer in offers) {
    if (offer.plan.billingPeriod != period) continue;
    if (offer.hasTrial || offer.introductoryPrice != null) return offer;
    base ??= offer;
  }
  return base;
}

/// What a year costs against twelve months of the same plan, as a percentage.
///
/// ── Why this is computed and not written down ─────────────────────────────
/// For exactly the reason no price on the screen is written down. The discount
/// is a property of the two base plans in Play Console, it differs by region
/// once Play's own local pricing has been applied, and it changes the day
/// somebody edits either plan. A "Save 20%" typed into a file is a claim the
/// app cannot keep, and a wrong one is worse than none.
///
/// Null whenever the arithmetic would be a guess: one of the two plans missing,
/// a price Play reported as zero, two different currencies — which should not
/// happen for one member but is cheap to refuse — or a saving too small to be
/// worth a badge. Below five per cent the badge is noise, and a rounded "Save
/// 1%" reads as a rounding error rather than an offer.
int? yearlySavingsPercent(List<SubscriptionOffer> offers) {
  final monthly = listedOffer(offers, BillingPeriod.monthly);
  final yearly = listedOffer(offers, BillingPeriod.yearly);
  if (monthly == null || yearly == null) return null;
  if (monthly.details.currencyCode != yearly.details.currencyCode) return null;

  final twelveMonths = monthly.details.rawPrice * 12;
  final year = yearly.details.rawPrice;
  if (twelveMonths <= 0 || year <= 0 || year >= twelveMonths) return null;

  final saved = ((1 - year / twelveMonths) * 100).round();
  return saved >= 5 ? saved : null;
}

/// A yearly plan's price spread over twelve months, in Play's own formatting —
/// "GH₵240.00" becomes "GH₵20.00".
///
/// It is a comparison, not a charge: the member is billed the yearly figure
/// once. Null for anything but a yearly plan with a real price, and whenever
/// [restatePrice] cannot read Play's string back.
String? perMonthPrice(SubscriptionOffer? yearly) {
  if (yearly == null || yearly.plan.billingPeriod != BillingPeriod.yearly) {
    return null;
  }
  final raw = yearly.details.rawPrice;
  if (raw <= 0) return null;
  return restatePrice(yearly.price, raw, raw / 12);
}

/// [formatted] — a price string exactly as Play formatted [original] — with
/// its number replaced by [amount], keeping Play's currency symbol, where the
/// symbol sits, and its separators.
///
/// ── Why the string is read back before it is rewritten ────────────────────
/// Because "1.200" is twelve hundred in Accra and one point two in Manama, and
/// nothing in the string says which. So the separators are guessed, the guess
/// is used to read Play's own number back out, and the result is compared with
/// the price Play reported as a number. If the two disagree the guess was
/// wrong, and this returns null rather than restating a price in the wrong
/// place value.
String? restatePrice(String formatted, double original, double amount) {
  final match = RegExp(r'\d(?:[\d.,\s]*\d)?').firstMatch(formatted);
  if (match == null) return null;
  final number = match.group(0)!;

  // A run of exactly three digits after the last mark is a thousands group
  // ("1,200"); any other run is the fraction ("240.00", "9,5").
  final lastMark = number.lastIndexOf(RegExp('[.,]'));
  var decimals = 0;
  var decimalMark = '';
  if (lastMark != -1 && number.length - lastMark - 1 != 3) {
    decimals = number.length - lastMark - 1;
    decimalMark = number[lastMark];
  }
  final whole = decimals == 0 ? number : number.substring(0, lastMark);
  final groupMark = RegExp(r'\D').firstMatch(whole)?.group(0) ?? '';

  final readBack = double.tryParse(
    '${whole.replaceAll(RegExp(r'\D'), '')}'
    '${decimals == 0 ? '' : '.${number.substring(lastMark + 1)}'}',
  );
  if (readBack == null || (readBack - original).abs() > 0.005) return null;

  final fixed = amount.toStringAsFixed(decimals).split('.');
  final digits = fixed.first;
  final grouped = StringBuffer();
  for (var i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 == 0) grouped.write(groupMark);
    grouped.write(digits[i]);
  }
  final restated = decimals == 0
      ? grouped.toString()
      : '$grouped$decimalMark${fixed.last}';
  return formatted.replaceRange(match.start, match.end, restated);
}
