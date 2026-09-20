import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_mobile_ads/google_mobile_ads.dart';
import 'package:indigen_world_mobile/features/subscriptions/data/subscription_providers.dart';

enum AdConsentAvailability { unresolved, canRequestAds, cannotRequestAds }

class AdConsentState {
  const AdConsentState({
    this.availability = AdConsentAvailability.unresolved,
    this.privacyOptionsRequired = false,
  });

  final AdConsentAvailability availability;
  final bool privacyOptionsRequired;

  bool get canRequestAds => availability == AdConsentAvailability.canRequestAds;
}

abstract interface class AdConsentGateway {
  Future<AdConsentState> gather();
  Future<AdConsentState> showPrivacyOptions();

  /// Whether UMP requires a permanent privacy-options entry point, asked
  /// without showing any form and without making an advertising request.
  ///
  /// This is the question a member who will never see an advert still needs
  /// answered — see [AdConsentController.ensurePrivacyOptionsKnown].
  Future<bool> privacyOptionsRequired();
}

class GoogleAdConsentGateway implements AdConsentGateway {
  const GoogleAdConsentGateway();

  @override
  Future<AdConsentState> gather() async {
    await _requestUpdate();

    final form = Completer<void>();
    await ConsentForm.loadAndShowConsentFormIfRequired((error) {
      if (error == null) {
        form.complete();
      } else {
        form.completeError(error);
      }
    });
    await form.future;
    return _currentState();
  }

  @override
  Future<AdConsentState> showPrivacyOptions() async {
    final shown = Completer<void>();
    await ConsentForm.showPrivacyOptionsForm((error) {
      if (error == null) {
        shown.complete();
      } else {
        shown.completeError(error);
      }
    });
    await shown.future;
    return _currentState();
  }

  @override
  Future<bool> privacyOptionsRequired() async {
    // Deliberately not `loadAndShowConsentFormIfRequired`. Asking UMP for the
    // current consent information is not an advertising request and shows
    // nobody a form; it is only how the stored decision becomes readable.
    await _requestUpdate();
    final options = await ConsentInformation.instance
        .getPrivacyOptionsRequirementStatus();
    return options == PrivacyOptionsRequirementStatus.required;
  }

  Future<void> _requestUpdate() {
    final update = Completer<void>();
    ConsentInformation.instance.requestConsentInfoUpdate(
      ConsentRequestParameters(),
      update.complete,
      update.completeError,
    );
    return update.future;
  }

  Future<AdConsentState> _currentState() async {
    final canRequest = await ConsentInformation.instance.canRequestAds();
    final options = await ConsentInformation.instance
        .getPrivacyOptionsRequirementStatus();
    return AdConsentState(
      availability: canRequest
          ? AdConsentAvailability.canRequestAds
          : AdConsentAvailability.cannotRequestAds,
      privacyOptionsRequired:
          options == PrivacyOptionsRequirementStatus.required,
    );
  }
}

final adConsentGatewayProvider = Provider<AdConsentGateway>(
  (ref) => const GoogleAdConsentGateway(),
);

class AdConsentController extends Notifier<AdConsentState> {
  Future<void>? _gathering;
  Future<void>? _probing;

  @override
  AdConsentState build() => const AdConsentState();

  Future<void> ensureReady() => _gathering ??= _gather();

  /// Makes the Settings entry point available to somebody who will never see
  /// an advert.
  ///
  /// ── Why a paid member needs this at all ───────────────────────────────
  /// Consent can be withdrawn at any time, and a member who consented while
  /// they were free and then subscribed still owns that stored decision. The
  /// full [ensureReady] path is wrong for them twice over: it would show the
  /// consent form to somebody who is not being shown adverts, and it only runs
  /// when advertising is allowed, which for them it never is. So this asks UMP
  /// the one question that matters — is the entry point required — and shows
  /// nothing.
  ///
  /// It deliberately leaves [AdConsentState.availability] alone. Writing a
  /// resolved availability here would make [AdMobNativeSlot] believe consent
  /// had already been gathered, and a member who later returns to the free
  /// tier would then be served adverts without ever having seen the form.
  Future<void> ensurePrivacyOptionsKnown() =>
      _probing ??= _probePrivacyOptions();

  Future<void> _probePrivacyOptions() async {
    try {
      final required = await ref
          .read(adConsentGatewayProvider)
          .privacyOptionsRequired();
      if (required == state.privacyOptionsRequired) return;
      state = AdConsentState(
        availability: state.availability,
        privacyOptionsRequired: required,
      );
    } on Object {
      // No entry point is better than one that opens a form UMP cannot show.
    }
  }

  Future<void> _gather() async {
    try {
      state = await ref.read(adConsentGatewayProvider).gather();
    } on Object {
      // Consent outages are an advertising outage, never an app outage.
      state = const AdConsentState(
        availability: AdConsentAvailability.cannotRequestAds,
      );
    }
  }

  Future<void> openPrivacyOptions() async {
    try {
      state = await ref.read(adConsentGatewayProvider).showPrivacyOptions();
    } on Object {
      // Keep the last known state. A transient form failure should neither
      // grant consent nor revoke a valid choice already stored by UMP.
    }
  }
}

final adConsentProvider = NotifierProvider<AdConsentController, AdConsentState>(
  AdConsentController.new,
);

/// Starts UMP only after the single membership gate has resolved, and starts a
/// different amount of it depending on which way it resolved. It never delays
/// the first frame and never initializes Mobile Ads itself.
///
/// The three cases are deliberately spelled out rather than written as "allowed
/// or not". `unresolved` must do nothing at all: it is the ordinary state for
/// the first moments of every launch, and probing there would answer the
/// privacy-options question for members who are about to become eligible and
/// need the full consent flow instead.
class AdConsentBootstrap extends ConsumerWidget {
  const AdConsentBootstrap({required this.child, super.key});

  final Widget child;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final controller = ref.read(adConsentProvider.notifier);
    switch (ref.watch(advertisingEligibilityProvider)) {
      case AdvertisingEligibility.allowed:
        Future<void>.microtask(controller.ensureReady);
      case AdvertisingEligibility.blocked:
        Future<void>.microtask(controller.ensurePrivacyOptionsKnown);
      case AdvertisingEligibility.unresolved:
        break;
    }
    return child;
  }
}
