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
}

class GoogleAdConsentGateway implements AdConsentGateway {
  const GoogleAdConsentGateway();

  @override
  Future<AdConsentState> gather() async {
    final update = Completer<void>();
    ConsentInformation.instance.requestConsentInfoUpdate(
      ConsentRequestParameters(),
      update.complete,
      update.completeError,
    );
    await update.future;

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

  @override
  AdConsentState build() => const AdConsentState();

  Future<void> ensureReady() => _gathering ??= _gather();

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

/// Starts UMP only after the single membership gate has resolved to allowed.
/// It never delays the first frame and never initializes Mobile Ads itself.
class AdConsentBootstrap extends ConsumerWidget {
  const AdConsentBootstrap({required this.child, super.key});

  final Widget child;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (ref.watch(adsAllowedProvider)) {
      Future<void>.microtask(
        () => ref.read(adConsentProvider.notifier).ensureReady(),
      );
    }
    return child;
  }
}
