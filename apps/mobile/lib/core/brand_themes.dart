import 'package:flutter/material.dart';
import 'package:indigen_world_mobile/core/brand.dart';

/// ─────────────────────────────────────────────────────────────────────────────
/// THEMES
///
/// A theme is a pair of [BrandPalette]s — one for daylight, one for night — and
/// a name. Everything the app paints reads its colours through `context.brand`,
/// so swapping the pair swaps the app: pages, hero bands, Kawuri, the launch
/// screen.
///
/// ── Who may use which ────────────────────────────────────────────────────
/// Two themes are free and always will be: the websites' blue, and the
/// heritage green the app was first built in. The rest are a thank-you to the
/// members who carry the cost of this archive — Patron and Creator subscribers
/// — and nothing else. A theme is paint. It never changes what anybody can
/// read, hear or contribute, and a lapsed subscription only puts the app back
/// in blue; the member's choice is kept for the day it comes back.
///
/// Every palette here is held to the same contrast floor by
/// `test/core/brand_contrast_test.dart`. A new theme that fails it does not
/// ship.
/// ─────────────────────────────────────────────────────────────────────────────

/// Who a theme is open to.
enum BrandThemeAccess {
  /// Everybody, signed in or not.
  free,

  /// Indigen Patron and Indigen Creator subscribers.
  supporters,
}

@immutable
class BrandTheme {
  const BrandTheme({
    required this.id,
    required this.name,
    required this.description,
    required this.access,
    required this.light,
    required this.dark,
  });

  /// The stored value. Never renamed: a member's saved choice is this string.
  final String id;

  final String name;

  /// One line for the picker — what the theme looks like, and where from.
  final String description;

  final BrandThemeAccess access;

  final BrandPalette light;
  final BrandPalette dark;

  bool get isPremium => access == BrandThemeAccess.supporters;

  BrandPalette paletteFor(Brightness brightness) =>
      brightness == Brightness.dark ? dark : light;
}

abstract final class BrandThemes {
  /// The websites' navy and blue. The default, and what every locked or
  /// unrecognised choice resolves to.
  static const blue = BrandTheme(
    id: 'blue',
    name: 'Indigen Blue',
    description: 'The navy and blue of the Indigen World websites.',
    access: BrandThemeAccess.free,
    light: BrandPalette.light,
    dark: BrandPalette.dark,
  );

  /// The palette the app was first built in, restored as it was: cream paper,
  /// heritage green, kente gold, and a charcoal with a green undertone after
  /// dark.
  static const green = BrandTheme(
    id: 'green',
    name: 'Heritage Green',
    description: 'The original green, on warm paper, with kente gold.',
    access: BrandThemeAccess.free,
    light: BrandPalette(
      brightness: Brightness.light,
      background: Color(0xFFF6F4EF),
      surface: Color(0xFFFFFFFF),
      surfaceMuted: Color(0xFFF0EEE8),
      surfaceElevated: Color(0xFFFFFFFF),
      bar: Color(0xFFFBFAF7),
      border: Color(0xFFE3E0D8),
      divider: Color(0xFFEAE7E0),
      ink: Color(0xFF1A1D1C),
      mutedInk: Color(0xFF5F6764),
      faintInk: Color(0xFF7F8783),
      accent: Color(0xFF0B3D2E),
      accentFill: Color(0xFF0B3D2E),
      onAccentFill: Color(0xFFFFFFFF),
      accentSoft: Color(0x140B3D2E),
      gold: Color(0xFFA8801F),
      terracotta: Color(0xFFA4553C),
      like: Color(0xFFB4472F),
      repost: Color(0xFF2E7D5B),
      success: Color(0xFF2E7D5B),
      danger: Color(0xFFA12A2A),
      shadow: Color(0xFF0B3D2E),
      glassFill: Color(0xFFFFFFFF),
      glassEdge: Color(0xFFFFFFFF),
      scrim: Color(0x8A0B1410),
      highlight: Color(0xFFD89B1D),
      heroDeep: Color(0xFF082F25),
      heroMid: Color(0xFF0B3D2E),
      heroLit: Color(0xFF155B43),
      nightGround: Color(0xFF071D17),
      nightGlow: Color(0xFF175340),
      nightAccent: Color(0xFF80F4CF),
    ),
    dark: BrandPalette(
      brightness: Brightness.dark,
      background: Color(0xFF0E1211),
      surface: Color(0xFF151A18),
      surfaceMuted: Color(0xFF1B211F),
      surfaceElevated: Color(0xFF1E2523),
      bar: Color(0xFF111615),
      border: Color(0xFF262E2B),
      divider: Color(0xFF1F2624),
      ink: Color(0xFFE9EDEB),
      mutedInk: Color(0xFF98A29E),
      faintInk: Color(0xFF6C7673),
      accent: Color(0xFF56B693),
      accentFill: Color(0xFF1C6B52),
      onAccentFill: Color(0xFFFFFFFF),
      accentSoft: Color(0x2456B693),
      gold: Color(0xFFD3AB53),
      terracotta: Color(0xFFCE7D60),
      like: Color(0xFFDE7259),
      repost: Color(0xFF56B693),
      success: Color(0xFF56B693),
      danger: Color(0xFFE0685F),
      shadow: Color(0xFF000000),
      glassFill: Color(0xFFFFFFFF),
      glassEdge: Color(0xFFFFFFFF),
      scrim: Color(0xB3000000),
      highlight: Color(0xFFD89B1D),
      heroDeep: Color(0xFF082F25),
      heroMid: Color(0xFF0B3D2E),
      heroLit: Color(0xFF155B43),
      nightGround: Color(0xFF071D17),
      nightGlow: Color(0xFF175340),
      nightAccent: Color(0xFF80F4CF),
    ),
  );

  /// After the painted compounds of Tiébélé and the Kassena homeland: oxide
  /// red, charcoal and chalk, the three earths the walls are painted in.
  static const tiebele = BrandTheme(
    id: 'tiebele',
    name: 'Tiébélé',
    description:
        'Oxide red, charcoal and chalk — the earths of Kassena painted walls.',
    access: BrandThemeAccess.supporters,
    light: BrandPalette(
      brightness: Brightness.light,
      background: Color(0xFFF7F1E8),
      surface: Color(0xFFFFFDF9),
      surfaceMuted: Color(0xFFEFE5D6),
      surfaceElevated: Color(0xFFFFFDF9),
      bar: Color(0xFFFFFBF5),
      border: Color(0xFFDDCFBD),
      divider: Color(0xFFE8DDCE),
      ink: Color(0xFF1F1712),
      mutedInk: Color(0xFF62544A),
      faintInk: Color(0xFF85766A),
      accent: Color(0xFF8F2F17),
      accentFill: Color(0xFF9E3A1E),
      onAccentFill: Color(0xFFFFFFFF),
      accentSoft: Color(0x149E3A1E),
      gold: Color(0xFF8A6300),
      terracotta: Color(0xFF6E3B1C),
      like: Color(0xFFB0301F),
      repost: Color(0xFF1E6A87),
      success: Color(0xFF2F6F3E),
      danger: Color(0xFFA12A2A),
      shadow: Color(0xFF2A1810),
      glassFill: Color(0xFFFFFFFF),
      glassEdge: Color(0xFFFFFFFF),
      scrim: Color(0x8A1A100B),
      highlight: Color(0xFFF4B183),
      heroDeep: Color(0xFF140B07),
      heroMid: Color(0xFF5A2213),
      heroLit: Color(0xFF9E3A1E),
      nightGround: Color(0xFF120C09),
      nightGlow: Color(0xFF4A1E12),
      nightAccent: Color(0xFFF0A27E),
    ),
    dark: BrandPalette(
      brightness: Brightness.dark,
      background: Color(0xFF14100D),
      surface: Color(0xFF1D1713),
      surfaceMuted: Color(0xFF251D18),
      surfaceElevated: Color(0xFF2B221C),
      bar: Color(0xFF17120F),
      border: Color(0xFF3A2E26),
      divider: Color(0xFF2C231D),
      ink: Color(0xFFF4EDE6),
      mutedInk: Color(0xFFC5B5A8),
      faintInk: Color(0xFF8F7F73),
      accent: Color(0xFFF0A27E),
      accentFill: Color(0xFFA63A1F),
      onAccentFill: Color(0xFFFFFFFF),
      accentSoft: Color(0x24F0A27E),
      gold: Color(0xFFE3B341),
      terracotta: Color(0xFFE8B48A),
      like: Color(0xFFFF8A7A),
      repost: Color(0xFF7CC6E0),
      success: Color(0xFF7FCB8A),
      danger: Color(0xFFF07167),
      shadow: Color(0xFF000000),
      glassFill: Color(0xFFFFFFFF),
      glassEdge: Color(0xFFFFFFFF),
      scrim: Color(0xB30A0705),
      highlight: Color(0xFFF4B183),
      heroDeep: Color(0xFF140B07),
      heroMid: Color(0xFF5A2213),
      heroLit: Color(0xFF9E3A1E),
      nightGround: Color(0xFF120C09),
      nightGlow: Color(0xFF4A1E12),
      nightAccent: Color(0xFFF0A27E),
    ),
  );

  /// Black and gold with a thread of kente green: filled buttons are black
  /// cloth with gold lettering by day, and gold with black lettering at night.
  static const kente = BrandTheme(
    id: 'kente',
    name: 'Kente Gold',
    description: 'Black and gold, with a thread of kente green.',
    access: BrandThemeAccess.supporters,
    light: BrandPalette(
      brightness: Brightness.light,
      background: Color(0xFFFBF7EC),
      surface: Color(0xFFFFFFFF),
      surfaceMuted: Color(0xFFF3ECD9),
      surfaceElevated: Color(0xFFFFFFFF),
      bar: Color(0xFFFFFDF6),
      border: Color(0xFFE2D7BD),
      divider: Color(0xFFECE4D0),
      ink: Color(0xFF1C1810),
      mutedInk: Color(0xFF5E5540),
      faintInk: Color(0xFF837961),
      accent: Color(0xFF7A5700),
      accentFill: Color(0xFF1C1810),
      onAccentFill: Color(0xFFF2C94C),
      accentSoft: Color(0x147A5700),
      gold: Color(0xFF8A6300),
      terracotta: Color(0xFF0F6B3A),
      like: Color(0xFFB3261E),
      repost: Color(0xFF0F6B3A),
      success: Color(0xFF0F6B3A),
      danger: Color(0xFFA12A2A),
      shadow: Color(0xFF3D2E08),
      glassFill: Color(0xFFFFFFFF),
      glassEdge: Color(0xFFFFFFFF),
      scrim: Color(0x8A14100A),
      highlight: Color(0xFFF2C94C),
      heroDeep: Color(0xFF0C0A05),
      heroMid: Color(0xFF3A2B06),
      heroLit: Color(0xFF6B4E00),
      nightGround: Color(0xFF0C0A05),
      nightGlow: Color(0xFF3D2E08),
      nightAccent: Color(0xFFF2C94C),
    ),
    dark: BrandPalette(
      brightness: Brightness.dark,
      background: Color(0xFF0D0B07),
      surface: Color(0xFF17140D),
      surfaceMuted: Color(0xFF1F1B11),
      surfaceElevated: Color(0xFF262114),
      bar: Color(0xFF110F09),
      border: Color(0xFF3A3220),
      divider: Color(0xFF29231A),
      ink: Color(0xFFF7F1E1),
      mutedInk: Color(0xFFCFC3A3),
      faintInk: Color(0xFF8F8466),
      accent: Color(0xFFF2C94C),
      accentFill: Color(0xFFF2C94C),
      onAccentFill: Color(0xFF1C1810),
      accentSoft: Color(0x24F2C94C),
      gold: Color(0xFFF2C94C),
      terracotta: Color(0xFF7BD389),
      like: Color(0xFFFF7A6B),
      repost: Color(0xFF7BD389),
      success: Color(0xFF7BD389),
      danger: Color(0xFFFF7A6B),
      shadow: Color(0xFF000000),
      glassFill: Color(0xFFFFFFFF),
      glassEdge: Color(0xFFFFFFFF),
      scrim: Color(0xB3000000),
      highlight: Color(0xFFF2C94C),
      heroDeep: Color(0xFF0C0A05),
      heroMid: Color(0xFF3A2B06),
      heroLit: Color(0xFF6B4E00),
      nightGround: Color(0xFF0C0A05),
      nightGlow: Color(0xFF3D2E08),
      nightAccent: Color(0xFFF2C94C),
    ),
  );

  /// The savannah sky when the harmattan dust settles at evening: plum,
  /// with amber where the light still is.
  static const harmattan = BrandTheme(
    id: 'harmattan',
    name: 'Harmattan Dusk',
    description: 'Plum and amber — the sky when the dust wind settles.',
    access: BrandThemeAccess.supporters,
    light: BrandPalette(
      brightness: Brightness.light,
      background: Color(0xFFFBF6F4),
      surface: Color(0xFFFFFFFF),
      surfaceMuted: Color(0xFFF3E9EA),
      surfaceElevated: Color(0xFFFFFFFF),
      bar: Color(0xFFFFFBFA),
      border: Color(0xFFE3D3D6),
      divider: Color(0xFFEDE2E3),
      ink: Color(0xFF221626),
      mutedInk: Color(0xFF62536A),
      faintInk: Color(0xFF87788C),
      accent: Color(0xFF7B2E6B),
      accentFill: Color(0xFF8E3576),
      onAccentFill: Color(0xFFFFFFFF),
      accentSoft: Color(0x147B2E6B),
      gold: Color(0xFF8A5A00),
      terracotta: Color(0xFFA8441C),
      like: Color(0xFFB3261E),
      repost: Color(0xFF6A4BC4),
      success: Color(0xFF2F7A4E),
      danger: Color(0xFFA12A2A),
      shadow: Color(0xFF3A1535),
      glassFill: Color(0xFFFFFFFF),
      glassEdge: Color(0xFFFFFFFF),
      scrim: Color(0x8A1A0C18),
      highlight: Color(0xFFFFB36B),
      heroDeep: Color(0xFF1A0C1C),
      heroMid: Color(0xFF5B1F55),
      heroLit: Color(0xFFA3456B),
      nightGround: Color(0xFF140A16),
      nightGlow: Color(0xFF4B1F45),
      nightAccent: Color(0xFFF2A7D6),
    ),
    dark: BrandPalette(
      brightness: Brightness.dark,
      background: Color(0xFF140D16),
      surface: Color(0xFF1E1421),
      surfaceMuted: Color(0xFF26192A),
      surfaceElevated: Color(0xFF2D1F31),
      bar: Color(0xFF170F19),
      border: Color(0xFF3F2D44),
      divider: Color(0xFF2F2233),
      ink: Color(0xFFF7EEF5),
      mutedInk: Color(0xFFD2BFD0),
      faintInk: Color(0xFF947F96),
      accent: Color(0xFFF2A7D6),
      accentFill: Color(0xFF8E3576),
      onAccentFill: Color(0xFFFFFFFF),
      accentSoft: Color(0x24F2A7D6),
      gold: Color(0xFFF4B860),
      terracotta: Color(0xFFFFB38A),
      like: Color(0xFFFF8A7A),
      repost: Color(0xFFC4B0FF),
      success: Color(0xFF7FD1A0),
      danger: Color(0xFFF07167),
      shadow: Color(0xFF000000),
      glassFill: Color(0xFFFFFFFF),
      glassEdge: Color(0xFFFFFFFF),
      scrim: Color(0xB30C060D),
      highlight: Color(0xFFFFB36B),
      heroDeep: Color(0xFF1A0C1C),
      heroMid: Color(0xFF5B1F55),
      heroLit: Color(0xFFA3456B),
      nightGround: Color(0xFF140A16),
      nightGlow: Color(0xFF4B1F45),
      nightAccent: Color(0xFFF2A7D6),
    ),
  );

  /// Night over the Volta: violet water, lit with teal.
  static const aurora = BrandTheme(
    id: 'aurora',
    name: 'Volta Aurora',
    description: 'Violet night over the river, lit with teal.',
    access: BrandThemeAccess.supporters,
    light: BrandPalette(
      brightness: Brightness.light,
      background: Color(0xFFF7F6FD),
      surface: Color(0xFFFFFFFF),
      surfaceMuted: Color(0xFFEEEBFA),
      surfaceElevated: Color(0xFFFFFFFF),
      bar: Color(0xFFFFFFFF),
      border: Color(0xFFDCD7F0),
      divider: Color(0xFFE7E3F6),
      ink: Color(0xFF1B1633),
      mutedInk: Color(0xFF585173),
      faintInk: Color(0xFF7D7696),
      accent: Color(0xFF5236B8),
      accentFill: Color(0xFF5B3CD0),
      onAccentFill: Color(0xFFFFFFFF),
      accentSoft: Color(0x145B3CD0),
      gold: Color(0xFF8A6300),
      terracotta: Color(0xFF0B6E80),
      like: Color(0xFFB3261E),
      repost: Color(0xFF0B6E80),
      success: Color(0xFF2F7A4E),
      danger: Color(0xFFA12A2A),
      shadow: Color(0xFF1B1440),
      glassFill: Color(0xFFFFFFFF),
      glassEdge: Color(0xFFFFFFFF),
      scrim: Color(0x8A0E0A20),
      highlight: Color(0xFF5EEAD4),
      heroDeep: Color(0xFF0B0818),
      heroMid: Color(0xFF3B2A8C),
      heroLit: Color(0xFF6D3FE0),
      nightGround: Color(0xFF0B0818),
      nightGlow: Color(0xFF2A1F63),
      nightAccent: Color(0xFFB9A5FF),
    ),
    dark: BrandPalette(
      brightness: Brightness.dark,
      background: Color(0xFF0E0B1C),
      surface: Color(0xFF171330),
      surfaceMuted: Color(0xFF1D1839),
      surfaceElevated: Color(0xFF241E45),
      bar: Color(0xFF110E22),
      border: Color(0xFF332C5C),
      divider: Color(0xFF251F47),
      ink: Color(0xFFF3F1FF),
      mutedInk: Color(0xFFC6BFE6),
      faintInk: Color(0xFF857DA8),
      accent: Color(0xFFB9A5FF),
      accentFill: Color(0xFF5B3CD0),
      onAccentFill: Color(0xFFFFFFFF),
      accentSoft: Color(0x24B9A5FF),
      gold: Color(0xFFE3B341),
      terracotta: Color(0xFF5EEAD4),
      like: Color(0xFFFF8A9A),
      repost: Color(0xFF5EEAD4),
      success: Color(0xFF6EE7B7),
      danger: Color(0xFFF07167),
      shadow: Color(0xFF000000),
      glassFill: Color(0xFFFFFFFF),
      glassEdge: Color(0xFFFFFFFF),
      scrim: Color(0xB3070512),
      highlight: Color(0xFF5EEAD4),
      heroDeep: Color(0xFF0B0818),
      heroMid: Color(0xFF3B2A8C),
      heroLit: Color(0xFF6D3FE0),
      nightGround: Color(0xFF0B0818),
      nightGlow: Color(0xFF2A1F63),
      nightAccent: Color(0xFFB9A5FF),
    ),
  );

  /// Every theme, free first, in the order the picker shows them.
  static const all = <BrandTheme>[
    blue,
    green,
    tiebele,
    kente,
    harmattan,
    aurora,
  ];

  static const fallback = blue;

  /// The theme stored as [id], or [fallback] for an unknown or missing one —
  /// a choice made on a newer build must never leave an older one unpainted.
  static BrandTheme byId(String? id) {
    for (final theme in all) {
      if (theme.id == id) return theme;
    }
    return fallback;
  }
}

/// Which theme a [ThemeData] was built from.
///
/// Carried on the theme itself so a subtree that needs the *other* brightness
/// of the same theme — [NightTheme], the surfaces that are dark in both
/// appearances — can find it without reaching for a provider.
@immutable
class ActiveBrandTheme extends ThemeExtension<ActiveBrandTheme> {
  const ActiveBrandTheme(this.theme);

  final BrandTheme theme;

  static BrandTheme of(BuildContext context) =>
      Theme.of(context).extension<ActiveBrandTheme>()?.theme ??
      BrandThemes.fallback;

  @override
  ActiveBrandTheme copyWith({BrandTheme? theme}) =>
      ActiveBrandTheme(theme ?? this.theme);

  @override
  ActiveBrandTheme lerp(ActiveBrandTheme? other, double t) =>
      other == null || t < 0.5 ? this : other;
}
