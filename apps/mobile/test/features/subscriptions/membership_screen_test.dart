import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:in_app_purchase/in_app_purchase.dart';
import 'package:indigen_world_mobile/app/app_theme.dart';
import 'package:indigen_world_mobile/features/subscriptions/data/billing_service.dart';
import 'package:indigen_world_mobile/features/subscriptions/data/entitlement.dart';
import 'package:indigen_world_mobile/features/subscriptions/data/subscription_catalog.dart';
import 'package:indigen_world_mobile/features/subscriptions/data/subscription_providers.dart';
import 'package:indigen_world_mobile/features/subscriptions/membership_screen.dart';

/// The membership screen, drawn from stubbed Play offers.
///
/// Nothing here can buy anything — there is no Firebase in a widget test, so
/// the billing service is null — which is exactly what makes it safe to tap
/// through. What it pins is what somebody sees: which tier is on screen, which
/// prices belong to it, and what the button offers to do.

SubscriptionOffer _offer(
  SubscriptionTier tier,
  BillingPeriod period,
  double rawPrice,
) {
  final product = productForTier(tier)!;
  final plan = product.plans.firstWhere((p) => p.billingPeriod == period);
  return SubscriptionOffer(
    product: product,
    plan: plan,
    details: ProductDetails(
      id: product.productId,
      title: product.name,
      description: '',
      price: 'GH₵${rawPrice.toStringAsFixed(2)}',
      rawPrice: rawPrice,
      currencyCode: 'GHS',
    ),
    offerToken: '${plan.basePlanId}-token',
  );
}

final _offers = SubscriptionOfferings(
  offers: [
    _offer(SubscriptionTier.plus, BillingPeriod.monthly, 30),
    _offer(SubscriptionTier.plus, BillingPeriod.yearly, 240),
    _offer(SubscriptionTier.patron, BillingPeriod.monthly, 60),
    _offer(SubscriptionTier.patron, BillingPeriod.yearly, 540),
    _offer(SubscriptionTier.creator, BillingPeriod.monthly, 90),
    _offer(SubscriptionTier.creator, BillingPeriod.yearly, 900),
  ],
);

Future<void> _pump(
  WidgetTester tester, {
  Entitlement entitlement = Entitlement.none,
  SubscriptionOfferings? offerings,
}) async {
  tester.view
    ..physicalSize = const Size(1080, 2400)
    ..devicePixelRatio = 2.75;
  addTearDown(tester.view.reset);

  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        entitlementProvider.overrideWith((ref) => Stream.value(entitlement)),
        subscriptionOffersProvider.overrideWith(
          (ref) async => offerings ?? _offers,
        ),
      ],
      child: MaterialApp(
        theme: buildIndigenDarkTheme(),
        home: const MembershipScreen(),
      ),
    ),
  );
  // The hero loops forever, so the screen never settles; step past its
  // entrance and the offers future instead.
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 1200));
}

Future<void> _scrollTo(WidgetTester tester, Finder finder) async {
  await tester.scrollUntilVisible(
    finder,
    160,
    scrollable: find.byType(Scrollable).first,
  );
  await tester.pump(const Duration(milliseconds: 300));
}

void main() {
  testWidgets('opens on Plus with the hero, the tabs and Play prices', (
    tester,
  ) async {
    await _pump(tester);

    expect(find.text('Support the archive'), findsOneWidget);
    expect(
      find.text('Keep our stories alive for generations.'),
      findsOneWidget,
    );
    expect(find.text('Restore'), findsOneWidget);
    for (final tab in ['Plus', 'Patron', 'Creator']) {
      expect(find.text(tab), findsOneWidget);
    }
    expect(find.text('Up to 200 Kawuri questions a day'), findsWidgets);

    await _scrollTo(tester, find.text('Subscribe & pay'));
    expect(find.text('GH₵30.00 / month', findRichText: true), findsOneWidget);
    expect(find.text('GH₵240.00 / year', findRichText: true), findsOneWidget);
    // 240 against 12 × 30 is a third off, and a year is twenty a month.
    expect(find.text('SAVE 33%'), findsOneWidget);
    expect(find.text('GH₵20.00 / month'), findsOneWidget);

    // Yearly leads for somebody with no plan yet: it is the better deal.
    final semantics = tester.ensureSemantics();
    expect(
      tester.getSemantics(find.bySemanticsLabel(RegExp('^Yearly'))),
      isSemantics(isSelected: true),
    );
    expect(
      tester.getSemantics(find.bySemanticsLabel(RegExp('^Monthly'))),
      isSemantics(isSelected: false),
    );
    semantics.dispose();
  });

  testWidgets('a tab moves the carousel and the prices with it', (
    tester,
  ) async {
    await _pump(tester);

    await tester.tap(find.text('Patron'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));

    await _scrollTo(tester, find.text('Subscribe & pay'));
    expect(find.text('GH₵60.00 / month', findRichText: true), findsOneWidget);
    expect(find.text('GH₵30.00 / month', findRichText: true), findsNothing);
    // 540 against 720 is a quarter off.
    expect(find.text('SAVE 25%'), findsOneWidget);
  });

  testWidgets('a swipe does the same as a tab', (tester) async {
    await _pump(tester);

    await tester.fling(find.byType(PageView), const Offset(-300, 0), 1200);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 600));

    await _scrollTo(tester, find.text('Subscribe & pay'));
    expect(find.text('GH₵60.00 / month', findRichText: true), findsOneWidget);
  });

  testWidgets('a member sees their plan, and the button will not resell it', (
    tester,
  ) async {
    await _pump(
      tester,
      entitlement: Entitlement(
        tier: SubscriptionTier.patron,
        status: EntitlementStatus.active,
        productId: 'indigen_patron',
        basePlanId: 'patron-yearly',
        autoRenewing: true,
        expiresAt: DateTime.now().add(const Duration(days: 90)),
      ),
    );

    expect(find.text('You keep the archive alive'), findsOneWidget);
    expect(find.text('Manage'), findsOneWidget);
    // The carousel followed the subscription to Patron once it arrived.
    expect(find.text('Your plan'), findsWidgets);

    await _scrollTo(tester, find.text('Your current plan'));
    expect(find.text('GH₵540.00 / year', findRichText: true), findsOneWidget);
    final button = tester.widget<FilledButton>(
      find.ancestor(
        of: find.text('Your current plan'),
        matching: find.byType(FilledButton),
      ),
    );
    expect(button.onPressed, isNull);

    // The other period of the same tier is a switch, not a new subscription.
    await tester.tap(find.text('Monthly'));
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.text('Switch to monthly'), findsOneWidget);
  });

  testWidgets('with no plans from Play the tiers still read, and say why', (
    tester,
  ) async {
    await _pump(
      tester,
      offerings: const SubscriptionOfferings(
        reason: SubscriptionUnavailableReason.billingUnavailable,
      ),
    );

    expect(find.text('Support the archive'), findsOneWidget);
    expect(find.text('No adverts anywhere in the app'), findsWidgets);
    await _scrollTo(tester, find.text('Try again'));
    expect(find.text('Why?'), findsOneWidget);
    expect(find.text('Subscribe & pay'), findsNothing);
  });
}
