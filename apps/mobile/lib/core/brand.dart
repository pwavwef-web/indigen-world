import 'package:flutter/material.dart';

/// ─────────────────────────────────────────────────────────────────────────────
/// BRAND
///
/// Two layers live here.
///
/// [BrandColors] is the *identity*: the handful of fixed hues that are the same
/// pigment whatever the light — the ecosystem's deep indigo, the heritage
/// green, the kente gold, the terracotta. Reach for these when the colour is
/// the brand itself: a seed colour, a splash screen, a gradient over a
/// photograph.
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
  /// Deep Indigo — the ecosystem's brand colour, and the pigment every
  /// Indigen World website is built on.
  ///
  /// The authority is `packages/design-tokens/colors.json`, which carries the
  /// status `approved-ecosystem-standard`; the Website, TribeStudio and the
  /// Kasena dictionary all resolve to it. Deep enough to carry white text at
  /// any size, which is why the sites set their headers and hero bands in it.
  static const indigo = Color(0xFF1E365D);

  /// The dark end of the band the sites open every page with —
  /// `linear-gradient(160deg, var(--indigo-950), var(--indigo-900))`, whose
  /// lit end is [indigo].
  static const indigoDeep = Color(0xFF142543);

  /// The heritage green. No longer the daylight accent — the ecosystem's is
  /// [indigo] — but still the app's own pigment after dark, where an indigo
  /// panel sinks into the charcoal and this does not.
  static const heritageGreen = Color(0xFF0B3D2E);
  static const savannahGreen = Color(0xFF155B43);
  static const kenteGold = Color(0xFFD89B1D);
  static const terracotta = Color(0xFFB65A3A);

  /// The pressed shade of [terracotta]; the sites' `--terracotta-dark`.
  static const terracottaDark = Color(0xFF9A492E);

  /// The paper the sites are printed on, and the ground of this app by day.
  static const plasterCream = Color(0xFFFAF6ED);

  /// The quieter band of that paper — form wells, notes, unselected chips.
  static const sand = Color(0xFFF1EADA);

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
  /// Deep indigo on plaster, the same pigment the websites carry the brand in;
  /// a lit green on charcoal, because no indigo survives a dark ground.
  final Color accent;

  /// The brand accent as a *surface* — primary buttons, the composer FAB.
  ///
  /// Not the same hue as [accent] by day, and deliberately so: the websites
  /// set `.button--primary` in terracotta and reserve indigo for the brand
  /// itself, so the colour you press is never the colour that merely
  /// identifies. At night the two converge on the green.
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

  /// Daylight: the ecosystem's own paper and ink.
  ///
  /// This is the palette the websites are built from. The authority is
  /// `packages/design-tokens/colors.json` — the approved ecosystem standard
  /// that the Website, TribeStudio and the Kasena dictionary all resolve to —
  /// and the roles below are assigned the way those sites assign them:
  ///
  ///   * Deep Indigo is what *carries the brand*: links, selected icons,
  ///     focus rings, secondary buttons (`.button--secondary` on a light
  ///     section is indigo text in an indigo outline).
  ///   * Terracotta is what you *press*: it is `.button--primary` on every
  ///     site, so it is the filled button and the composer FAB here.
  ///   * Gold is a highlight, never a ground.
  ///
  /// Two values are deliberately not the literal token-file entry:
  ///
  /// [background] is the sites' plaster cream rather than the token file's
  /// near-white `--bg: #fffdf8`, for a reason the web does not have. The sites
  /// band their pages white / cream / sand, so a white card always has an edge
  /// to sit against; a phone has one continuous ground, and a white card on
  /// `#fffdf8` separates at 1.02:1 — invisible. Cream holds the cards up.
  ///
  /// [gold] is the token file's light-mode `warning`, which is the ecosystem's
  /// own answer to "what does kente gold become when it has to be legible on
  /// paper". The sites spend gold as a *fill* with dark text on it; this app
  /// spends it as small glyphs — verified marks, star ratings — and the raw
  /// `#c58a00` reads at 2.8:1 against cream, which is not a colour you can
  /// draw a 16px icon in. [BrandColors.kenteGold] is still the pigment for
  /// anything gold-on-dark.
  static const light = BrandPalette(
    brightness: Brightness.light,
    background: Color(0xFFFAF6ED),
    surface: Color(0xFFFFFFFF),
    surfaceMuted: Color(0xFFF1EADA),
    surfaceElevated: Color(0xFFFFFFFF),
    bar: Color(0xFFFFFDFA),
    border: Color(0xFFD8D2C6),
    divider: Color(0xFFE6E1D5),
    ink: Color(0xFF172033),
    mutedInk: Color(0xFF4C5568),
    faintInk: Color(0xFF7A8293),
    accent: Color(0xFF1E365D),
    accentFill: Color(0xFFB65A3A),
    onAccentFill: Color(0xFFFFFFFF),
    accentSoft: Color(0x141E365D),
    gold: Color(0xFF9A6700),
    terracotta: Color(0xFFB65A3A),
    like: Color(0xFF9A492E),
    repost: Color(0xFF1F5A3A),
    success: Color(0xFF1F6B45),
    danger: Color(0xFFA12A2A),
    shadow: Color(0xFF142543),
    glassFill: Color(0xFFFFFFFF),
    glassEdge: Color(0xFFFFFFFF),
    scrim: Color(0x8A0F1A2D),
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
  /// The ramp every filled hero panel is built from — deepest, mid, lit.
  ///
  /// This one *does* follow brightness, which is the exception in this class
  /// and is the point of it. By day the ramp is the indigo the websites open
  /// every page with (`linear-gradient(160deg, --indigo-950, --indigo-900)`),
  /// so a member arriving from indigenworld.com lands on the same band. After
  /// dark it is the heritage green: an indigo panel on a charcoal ground is a
  /// slightly bluer charcoal, and the hero stops reading as a panel at all.
  static List<Color> heroRamp(BrandPalette brand) => brand.isDark
      ? const [
          Color(0xFF082F25),
          BrandColors.heritageGreen,
          BrandColors.savannahGreen,
        ]
      : const [
          Color(0xFF0F1A2D),
          BrandColors.indigoDeep,
          BrandColors.indigo,
        ];

  /// Headers and hero cards: the brand colour falling to its lit end.
  static LinearGradient hero(BrandPalette brand) {
    final ramp = heroRamp(brand);
    return LinearGradient(
      begin: Alignment.topLeft,
      end: Alignment.bottomRight,
      colors: [ramp[1], ramp[2]],
    );
  }

  /// The three-stop hero, for the large panels — a profile, the ads desk —
  /// that want the top-left corner weighted.
  static LinearGradient heroRich(BrandPalette brand) => LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: heroRamp(brand),
  );

  /// A hero that ends in gold: the stand-in behind a community banner nobody
  /// has uploaded a cover for yet.
  static LinearGradient heroBanner(BrandPalette brand) {
    final ramp = heroRamp(brand);
    return LinearGradient(
      begin: Alignment.topLeft,
      end: Alignment.bottomRight,
      colors: [ramp[1], ramp[2], BrandColors.kenteGold],
    );
  }

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
    // By day the lit corner is the token file's own plaster cream, so the
    // wash lands on the same warmth the sites' `.section--cream` band has.
    (brand.isDark ? Colors.white : const Color(0xFFFFF8E7)).withValues(
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
