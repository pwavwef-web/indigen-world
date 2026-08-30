import 'package:flutter/material.dart';

/// ─────────────────────────────────────────────────────────────────────────────
/// BRAND
///
/// Two layers live here.
///
/// [BrandColors] is the *identity*: the handful of fixed hues that are the same
/// pigment whatever the light — the heritage green of the logo, the kente gold,
/// the terracotta. Reach for these when the colour is the brand itself: a seed
/// colour, a splash screen, a gradient over a photograph.
///
/// [BrandPalette] is the *paint*: every semantic role a surface, a line or a
/// word can play, resolved for the brightness the member is actually reading
/// in. Reach for these — through `context.brand` — for anything drawn in the
/// app chrome. A palette token knows what it is *for* ("secondary text",
/// "hairline between rows"), which is what lets the same widget be legible on
/// plaster and on charcoal without a single `if (isDark)` at the call site.
///
/// The rule of thumb: if swapping the value for its dark twin would be wrong,
/// it is a [BrandColors]; otherwise it is a [BrandPalette] token.
/// ─────────────────────────────────────────────────────────────────────────────

abstract final class BrandColors {
  /// The logo green. Deep enough to carry white text at any size.
  static const heritageGreen = Color(0xFF0B3D2E);
  static const savannahGreen = Color(0xFF155B43);
  static const kenteGold = Color(0xFFD89B1D);
  static const terracotta = Color(0xFFB65A3A);

  /// Night ground for the immersive surfaces — the launch screen, Explore and
  /// Kawuri. These stay dark in *both* themes: a full-bleed reel is a cinema,
  /// not a page, so it does not follow the reading brightness.
  static const nightGreen = Color(0xFF071D17);
  static const nightInk = Color(0xFF050807);
}

/// Every colour role in the app, resolved for one brightness.
///
/// Read it with `context.brand`. It rides on [ThemeData.extensions], so a
/// widget that uses a token rebuilds when the theme changes — which is the
/// whole reason this is a [ThemeExtension] rather than a global.
@immutable
class BrandPalette extends ThemeExtension<BrandPalette> {
  const BrandPalette({
    required this.brightness,
    required this.background,
    required this.surface,
    required this.surfaceMuted,
    required this.surfaceElevated,
    required this.bar,
    required this.border,
    required this.divider,
    required this.ink,
    required this.mutedInk,
    required this.faintInk,
    required this.accent,
    required this.accentFill,
    required this.onAccentFill,
    required this.accentSoft,
    required this.gold,
    required this.terracotta,
    required this.like,
    required this.repost,
    required this.success,
    required this.danger,
    required this.shadow,
    required this.glassFill,
    required this.glassEdge,
    required this.scrim,
  });

  final Brightness brightness;

  /// The page ground. Everything else is measured against this.
  final Color background;

  /// A card, panel or sheet lying on [background].
  final Color surface;

  /// The quieter fill — inputs, compose bars, unselected chips, media wells.
  final Color surfaceMuted;

  /// Dialogs, popups and menus, which float above everything else.
  final Color surfaceElevated;

  /// Navigation and app bars.
  final Color bar;

  /// The hairline around a surface.
  final Color border;

  /// The hairline *between* rows — fainter than [border], because a list of
  /// twenty of them adds up fast.
  final Color divider;

  /// Body and heading text.
  final Color ink;

  /// Supporting text: handles, timestamps, captions, inactive icons.
  final Color mutedInk;

  /// Third-rank text and disabled glyphs. Legible, not attention-seeking.
  final Color faintInk;

  /// The brand accent as a *foreground* — links, selected icons, small marks.
  /// Deep green on plaster; a lit green on charcoal, because the logo green
  /// disappears against a dark ground.
  final Color accent;

  /// The brand accent as a *surface* — primary buttons, the composer FAB.
  final Color accentFill;

  /// Text and icons drawn on [accentFill].
  final Color onAccentFill;

  /// A wash of the accent, for selected rows and tinted plates.
  final Color accentSoft;

  /// Kente gold, dimmed for daylight and lifted for night. Used sparingly —
  /// it is a highlight, not a background.
  final Color gold;

  /// The warm earth accent: eyebrows, section marks.
  final Color terracotta;

  /// Appreciation.
  final Color like;

  /// Reshare.
  final Color repost;

  final Color success;
  final Color danger;

  /// The colour depth is tinted with, so a lift reads as part of the material
  /// rather than as grey haze.
  final Color shadow;

  /// The base fill of a glass surface, before opacity is applied.
  final Color glassFill;

  /// The lit edge of a glass surface.
  final Color glassEdge;

  /// Behind modals and over media.
  final Color scrim;

  bool get isDark => brightness == Brightness.dark;

  /// Picks between two values by brightness, for the handful of places where a
  /// whole token would be overkill.
  T pick<T>(T light, T dark) => isDark ? dark : light;

  /// Daylight: warm paper, deep green, quiet lines.
  ///
  /// The cream is deliberately close to neutral. The old plaster was a
  /// saturated ochre, and a saturated ground makes every accent laid on it
  /// shout to be heard.
  static const light = BrandPalette(
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
    faintInk: Color(0xFF8B938F),
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
  );

  /// Night: a charcoal with a green undertone rather than a flat grey, so the
  /// brand is still present in a room with the lights off.
  static const dark = BrandPalette(
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
  );

  @override
  BrandPalette copyWith({
    Brightness? brightness,
    Color? background,
    Color? surface,
    Color? surfaceMuted,
    Color? surfaceElevated,
    Color? bar,
    Color? border,
    Color? divider,
    Color? ink,
    Color? mutedInk,
    Color? faintInk,
    Color? accent,
    Color? accentFill,
    Color? onAccentFill,
    Color? accentSoft,
    Color? gold,
    Color? terracotta,
    Color? like,
    Color? repost,
    Color? success,
    Color? danger,
    Color? shadow,
    Color? glassFill,
    Color? glassEdge,
    Color? scrim,
  }) => BrandPalette(
    brightness: brightness ?? this.brightness,
    background: background ?? this.background,
    surface: surface ?? this.surface,
    surfaceMuted: surfaceMuted ?? this.surfaceMuted,
    surfaceElevated: surfaceElevated ?? this.surfaceElevated,
    bar: bar ?? this.bar,
    border: border ?? this.border,
    divider: divider ?? this.divider,
    ink: ink ?? this.ink,
    mutedInk: mutedInk ?? this.mutedInk,
    faintInk: faintInk ?? this.faintInk,
    accent: accent ?? this.accent,
    accentFill: accentFill ?? this.accentFill,
    onAccentFill: onAccentFill ?? this.onAccentFill,
    accentSoft: accentSoft ?? this.accentSoft,
    gold: gold ?? this.gold,
    terracotta: terracotta ?? this.terracotta,
    like: like ?? this.like,
    repost: repost ?? this.repost,
    success: success ?? this.success,
    danger: danger ?? this.danger,
    shadow: shadow ?? this.shadow,
    glassFill: glassFill ?? this.glassFill,
    glassEdge: glassEdge ?? this.glassEdge,
    scrim: scrim ?? this.scrim,
  );

  @override
  BrandPalette lerp(BrandPalette? other, double t) {
    if (other == null) return this;
    Color mix(Color a, Color b) => Color.lerp(a, b, t)!;
    return BrandPalette(
      // Brightness is a switch, not a slope: it flips at the halfway point so
      // that anything keyed off it — an icon set, a status bar style — never
      // reads a value belonging to neither theme.
      brightness: t < 0.5 ? brightness : other.brightness,
      background: mix(background, other.background),
      surface: mix(surface, other.surface),
      surfaceMuted: mix(surfaceMuted, other.surfaceMuted),
      surfaceElevated: mix(surfaceElevated, other.surfaceElevated),
      bar: mix(bar, other.bar),
      border: mix(border, other.border),
      divider: mix(divider, other.divider),
      ink: mix(ink, other.ink),
      mutedInk: mix(mutedInk, other.mutedInk),
      faintInk: mix(faintInk, other.faintInk),
      accent: mix(accent, other.accent),
      accentFill: mix(accentFill, other.accentFill),
      onAccentFill: mix(onAccentFill, other.onAccentFill),
      accentSoft: mix(accentSoft, other.accentSoft),
      gold: mix(gold, other.gold),
      terracotta: mix(terracotta, other.terracotta),
      like: mix(like, other.like),
      repost: mix(repost, other.repost),
      success: mix(success, other.success),
      danger: mix(danger, other.danger),
      shadow: mix(shadow, other.shadow),
      glassFill: mix(glassFill, other.glassFill),
      glassEdge: mix(glassEdge, other.glassEdge),
      scrim: mix(scrim, other.scrim),
    );
  }

  /// Value equality, so anything that caches on the palette — a
  /// [CustomPainter]'s `shouldRepaint`, a memoised decoration — repaints when
  /// the theme changes and stays still when it does not.
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is BrandPalette &&
          other.brightness == brightness &&
          other.background == background &&
          other.surface == surface &&
          other.surfaceMuted == surfaceMuted &&
          other.surfaceElevated == surfaceElevated &&
          other.bar == bar &&
          other.border == border &&
          other.divider == divider &&
          other.ink == ink &&
          other.mutedInk == mutedInk &&
          other.faintInk == faintInk &&
          other.accent == accent &&
          other.accentFill == accentFill &&
          other.onAccentFill == onAccentFill &&
          other.accentSoft == accentSoft &&
          other.gold == gold &&
          other.terracotta == terracotta &&
          other.like == like &&
          other.repost == repost &&
          other.success == success &&
          other.danger == danger &&
          other.shadow == shadow &&
          other.glassFill == glassFill &&
          other.glassEdge == glassEdge &&
          other.scrim == scrim;

  @override
  int get hashCode => Object.hashAll([
    brightness,
    background,
    surface,
    surfaceMuted,
    surfaceElevated,
    bar,
    border,
    divider,
    ink,
    mutedInk,
    faintInk,
    accent,
    accentFill,
    onAccentFill,
    accentSoft,
    gold,
    terracotta,
    like,
    repost,
    success,
    danger,
    shadow,
    glassFill,
    glassEdge,
    scrim,
  ]);
}

/// `context.brand.ink` — the way every widget reaches the palette.
extension BrandPaletteContext on BuildContext {
  BrandPalette get brand =>
      Theme.of(this).extension<BrandPalette>() ??
      (Theme.of(this).brightness == Brightness.dark
          ? BrandPalette.dark
          : BrandPalette.light);
}

/// Shared gradients, so the same warmth appears on every hero surface instead
/// of each screen inventing its own three-stop blend.
abstract final class BrandGradients {
  /// Headers and hero cards. Brand pigment, so it does not follow brightness.
  static const heritage = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [BrandColors.heritageGreen, BrandColors.savannahGreen],
  );

  /// Accents that should feel like firelight — send buttons, highlights.
  static const ember = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [BrandColors.kenteGold, BrandColors.terracotta],
  );

  /// The full-bleed ground behind immersive screens.
  static const night = RadialGradient(
    radius: 1.35,
    center: Alignment(0, -0.55),
    colors: [Color(0xFF175340), Color(0xFF08221B), BrandColors.nightInk],
  );

  /// A barely-there wash that lifts a plain card off the ground.
  static LinearGradient parchment(BrandPalette brand) => LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [brand.surface, brand.surfaceMuted],
  );

  /// The daylight falling across a whole page — a profile, a lesson.
  ///
  /// The lit corner used to be a literal cream at every call site, which is
  /// the right warmth on plaster and a pale smear on charcoal: it is why
  /// profile pages kept a whitish patch in dark mode. Lifting the shade off
  /// the palette's own ground keeps the gradient in both themes.
  static LinearGradient pageWash(BrandPalette brand) => LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [pageWashTop(brand), brand.background],
  );

  /// The lit corner of [pageWash], for the rare caller that needs the colour
  /// on its own.
  static Color pageWashTop(BrandPalette brand) => Color.alphaBlend(
    (brand.isDark ? Colors.white : const Color(0xFFFFF6DC)).withValues(
      alpha: brand.isDark ? 0.045 : 0.75,
    ),
    brand.background,
  );
}

/// Elevation the brand actually uses. Shadows are tinted with the palette's
/// own [BrandPalette.shadow] rather than neutral black, so depth reads as part
/// of the material instead of as grey haze.
abstract final class BrandShadows {
  static List<BoxShadow> card(BrandPalette brand) => [
    BoxShadow(
      color: brand.shadow.withValues(alpha: brand.isDark ? 0.32 : 0.05),
      blurRadius: 18,
      offset: const Offset(0, 8),
    ),
  ];

  static List<BoxShadow> lifted(BrandPalette brand) => [
    BoxShadow(
      color: brand.shadow.withValues(alpha: brand.isDark ? 0.5 : 0.12),
      blurRadius: 26,
      offset: const Offset(0, 12),
    ),
  ];

  static List<BoxShadow> glow(Color color, {double strength = 1}) => [
    BoxShadow(
      color: color.withValues(alpha: 0.3 * strength),
      blurRadius: 20 * strength,
      spreadRadius: 1 * strength,
    ),
  ];
}

abstract final class AppSpacing {
  static const xs = 4.0;
  static const sm = 8.0;
  static const md = 12.0;
  static const lg = 16.0;
  static const xl = 24.0;
  static const xxl = 32.0;
}
