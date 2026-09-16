import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand_themes.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Where the member's theme choice is kept.
const brandThemePreferenceKey = 'indigen_brand_theme_v1';

/// Whether the supporters' themes were open the last time anybody could tell.
///
/// ── Why this is stored at all ─────────────────────────────────────────────
/// Whether a theme is unlocked is decided by the member's entitlement, which
/// arrives from Firestore a moment after sign-in is restored — well after the
/// first frame. Without a remembered answer a Patron who reads in Kente Gold
/// would open the app in blue every single time and watch it turn gold a
/// second later. This is only ever a stand-in for that moment: as soon as the
/// entitlement is known, it decides, and this is rewritten to agree.
const premiumThemesUnlockedPreferenceKey = 'indigen_premium_themes_unlocked_v1';

/// The theme the member picked, as its [BrandTheme.id].
///
/// A *choice*, not the theme in force: a supporters' theme stays chosen after a
/// subscription lapses, and simply stops being drawn until it comes back. See
/// `activeBrandThemeProvider` for what is actually painted.
final brandThemeChoiceProvider =
    NotifierProvider<BrandThemeChoiceController, String>(
      BrandThemeChoiceController.new,
    );

class BrandThemeChoiceController extends Notifier<String> {
  @override
  String build() => BrandThemes.fallback.id;

  Future<void> choose(BrandTheme theme) async {
    if (state == theme.id) return;
    state = theme.id;
    try {
      final preferences = await SharedPreferences.getInstance();
      await preferences.setString(brandThemePreferenceKey, theme.id);
    } on Object {
      // The theme still changes for this session; it is only not remembered.
    }
  }
}

/// The last known answer to "may this member use the supporters' themes".
final lastKnownPremiumThemesUnlockedProvider =
    NotifierProvider<LastKnownThemeUnlockController, bool>(
      LastKnownThemeUnlockController.new,
    );

class LastKnownThemeUnlockController extends Notifier<bool> {
  @override
  bool build() => false;

  Future<void> remember(bool unlocked) async {
    if (state == unlocked) return;
    state = unlocked;
    try {
      final preferences = await SharedPreferences.getInstance();
      await preferences.setBool(premiumThemesUnlockedPreferenceKey, unlocked);
    } on Object {
      // Best effort: the worst case is one launch drawn in blue.
    }
  }
}

/// The stored choice and the remembered unlock, read before the first frame.
Future<({String themeId, bool premiumUnlocked})> readStoredBrandTheme() async {
  try {
    final preferences = await SharedPreferences.getInstance();
    return (
      themeId: BrandThemes.byId(preferences.getString(brandThemePreferenceKey))
          .id,
      premiumUnlocked:
          preferences.getBool(premiumThemesUnlockedPreferenceKey) ?? false,
    );
  } on Object {
    return (themeId: BrandThemes.fallback.id, premiumUnlocked: false);
  }
}
