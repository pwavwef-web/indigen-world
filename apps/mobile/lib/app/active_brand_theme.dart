import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand_theme_choice.dart';
import 'package:indigen_world_mobile/core/brand_themes.dart';
import 'package:indigen_world_mobile/features/auth/auth_repository.dart';
import 'package:indigen_world_mobile/features/subscriptions/data/entitlement.dart';
import 'package:indigen_world_mobile/features/subscriptions/data/subscription_catalog.dart';
import 'package:indigen_world_mobile/features/subscriptions/data/subscription_providers.dart';

/// Whether this member may use the supporters' themes.
///
/// Two answers are accepted, either one enough. The backend's benefit table
/// says so (`premiumThemes`); or the entitlement itself — written only by the
/// backend — is an active Patron or Creator subscription. The second is there
/// so a build carrying this feature works for supporters before the functions
/// deploy that teaches the benefit table the new field has gone out.
///
/// Neither is a security boundary, and neither needs to be: a theme is paint,
/// and a patched build that unlocks one gains a colour.
///
/// ── While nobody can tell yet ─────────────────────────────────────────────
/// Sign-in is restored a moment after launch, and the entitlement a moment
/// after that. Until both are known the last remembered answer stands, so a
/// supporter's app is not repainted blue and back on every launch.
final premiumThemesUnlockedProvider = Provider<bool>((ref) {
  final auth = ref.watch(authStateProvider);
  if (!auth.hasValue || auth.isLoading) {
    return ref.watch(lastKnownPremiumThemesUnlockedProvider);
  }
  if (auth.value != null) {
    final entitlement = ref.watch(entitlementProvider);
    if (!entitlement.hasValue || entitlement.isLoading) {
      return ref.watch(lastKnownPremiumThemesUnlockedProvider);
    }
    final current = entitlement.value ?? Entitlement.none;
    if (current.isActive && current.tier.rank >= SubscriptionTier.patron.rank) {
      return true;
    }
  }
  return ref.watch(tierBenefitsProvider).premiumThemes;
});

/// The theme actually painted: the member's choice, unless it is a
/// supporters' theme they cannot use right now, in which case the default.
///
/// The choice itself is left alone, so a subscription that lapses and returns
/// brings the member's theme back with it.
final activeBrandThemeProvider = Provider<BrandTheme>((ref) {
  final chosen = BrandThemes.byId(ref.watch(brandThemeChoiceProvider));
  if (!chosen.isPremium) return chosen;
  return ref.watch(premiumThemesUnlockedProvider)
      ? chosen
      : BrandThemes.fallback;
});
