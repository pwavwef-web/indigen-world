import 'package:flutter/material.dart';

/// ─────────────────────────────────────────────────────────────────────────────
/// BRAND
///
/// Two layers live here.
///
/// [BrandColors] is the *identity*: the handful of fixed hues that are the same
/// pigment whatever the light — the ecosystem's navy, its action blue and the
/// cyan it lights things with. Reach for these when the colour is the brand
/// itself: a seed colour, a splash screen, a gradient over a photograph.
///
/// [BrandPalette] is the *paint*: every semantic role a surface, a line or a
/// word can play, resolved for the brightness the member is actually reading
/// in. Reach for these — through `context.brand` — for anything drawn in the
/// app chrome. A palette token knows what it is *for* ("secondary text",
/// "hairline between rows"), which is what lets the same widget be legible on
/// paper and on navy without a single `if (isDark)` at the call site.
///
/// The rule of thumb: if swapping the value for its dark twin would be wrong,
/// it is a [BrandColors]; otherwise it is a [BrandPalette] token.
/// ─────────────────────────────────────────────────────────────────────────────

abstract final class BrandColors {
  /// Navy — the ecosystem's brand colour, and the pigment every Indigen World
  /// website is built on.
  ///
  /// The authority is the websites' live theme,
  /// `apps/website/src/styles/comitia-theme.css` (`--indigo-900`), which the
  /// admin console, TribeStudio, the Kasem Dictionary and the updates blog all
  /// follow. `packages/design-tokens/colors.json` still carries the retired
  /// indigo/terracotta palette and is no longer what the sites draw. Deep
  /// enough to carry white text at any size, which is why the sites set their
  /// headers and hero bands in it.
  static const indigo = Color(0xFF19327F);

  /// The dark end of the band the sites open every page with — the
  /// `--indigo-950` their header glass and ink are made of.
  static const indigoDeep = Color(0xFF0F1830);

  /// The action blue: `--indigo-700` on the sites, and what their primary
  /// buttons and current-page marks are filled with.
  static const actionBlue = Color(0xFF2F6BFF);

  /// The lit end of the sites' hero band, between [indigo] and [actionBlue].
  static const indigoLit = Color(0xFF2457D6);

  /// [actionBlue] a shade darker, for a fill that carries white text.
  ///
  /// White on `#2f6bff` is 4.4988:1 — a hair under AA — so the sites' text
  /// buttons use this one, and so does every filled button here.
  static const actionBlueText = Color(0xFF2C66F5);

  /// The cyan the sites light things with — the sun in the brand mark, the
  /// glow on the hero. Kept to highlights: it is far too light to carry text.
  static const cyan = Color(0xFF22D3EE);

  /// A warning on a night ground — an offline tag, a failed send. A signal,
  /// not a brand colour: the same hue the dark palette's `danger` is.
  static const warning = Color(0xFFE0685F);

  /// The paper the sites are printed on, and the ground of this app by day —
  /// the sites' `--cream`, which is a cool blue-white now rather than cream.
  static const plasterCream = Color(0xFFF6F7FB);

  /// The quieter band of that paper — form wells, notes, unselected chips.
  /// The sites' `--sand`.
  static const sand = Color(0xFFEAF0FF);

  /// Night ground for the immersive surfaces — the launch screen, Explore and
  /// Kawuri. These stay dark in *both* themes: a full-bleed reel is a cinema,
  /// not a page, so it does not follow the reading brightness. The dark end of
  /// the sites' hero, `#0b1225`.
  static const nightNavy = Color(0xFF0B1225);
  static const nightInk = Color(0xFF05080F);
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
    required this.highlight,
    required this.heroDeep,
    required this.heroMid,
    required this.heroLit,
    required this.nightGround,
    required this.nightGlow,
    required this.nightAccent,
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
  /// A deep blue on the pale ground, the same family the websites carry the
  /// brand in; a pale blue on navy, because no mid blue is legible on it.
  final Color accent;

  /// The brand accent as a *surface* — primary buttons, the composer FAB.
  ///
  /// The sites' action blue, and the same in both themes: it is the one blue
  /// that carries white text on paper and on navy alike, so the colour you
  /// press does not change when the lights go out.
  final Color accentFill;

  /// Text and icons drawn on [accentFill].
  final Color onAccentFill;

  /// A wash of the accent, for selected rows and tinted plates.
  final Color accentSoft;

  /// Gold, dimmed for daylight and lifted for night. Functional only — star
  /// ratings, verified marks — and never a brand highlight any more; that job
  /// is [BrandColors.cyan]'s.
  final Color gold;

  /// The secondary accent: eyebrows, section marks.
  ///
  /// Named for the terracotta it used to be. The websites kept the same name
  /// for the same role when it turned blue (`--terracotta: #2f6bff`), and so
  /// does this token, rather than renaming it at two hundred call sites.
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

  // ── Theme-level colours ───────────────────────────────────────────────────
  // The seven below belong to the *theme* rather than to one brightness: each
  // theme sets them to the same value in its light and its dark palette. They
  // are what the surfaces that stay dark in both appearances are painted with
  // — the hero bands, Kawuri, the launch screen — which is why they have to
  // live on the palette at all: a member who picks a theme expects those to
  // change with it.

  /// The theme's light-up colour: the sun in the mark, the rule down Kawuri's
  /// turn, a progress bar over media. Drawn on dark grounds; never body text
  /// on a pale one.
  final Color highlight;

  /// The hero band, deepest to lit. Every stop carries white text.
  final Color heroDeep;
  final Color heroMid;
  final Color heroLit;

  /// The ground of the immersive surfaces, and the lit centre of the radial
  /// wash laid over it.
  final Color nightGround;
  final Color nightGlow;

  /// An accent that reads on [nightGround] and on the hero band — for the
  /// controls drawn there by a page that is otherwise in daylight.
  final Color nightAccent;

  bool get isDark => brightness == Brightness.dark;

  /// The accent laid over [surface] as an opaque plate — a selected chip, a
  /// tinted tile. Opaque so it can sit on a gradient without the gradient
  /// showing through it.
  Color get accentPlate => Color.alphaBlend(
    accent.withValues(alpha: isDark ? 0.2 : 0.1),
    surface,
  );

  /// Picks between two values by brightness, for the handful of places where a
  /// whole token would be overkill.
  T pick<T>(T light, T dark) => isDark ? dark : light;

  /// Daylight: the ecosystem's own paper and ink.
  ///
  /// This is the palette the websites are built from. The authority is the
  /// sites' live theme, `apps/website/src/styles/comitia-theme.css`, which the
  /// admin console, TribeStudio and the Kasem Dictionary follow too — not
  /// `packages/design-tokens/colors.json`, which still describes the retired
  /// indigo-and-terracotta look. The roles are assigned the way those sites
  /// assign them:
  ///
  ///   * Navy-into-blue is what *carries the brand*: links, selected icons,
  ///     focus rings. [accent] is the sites' `--indigo-800`, a step lighter
  ///     than the navy so a link still reads as blue at 14px rather than as
  ///     near-black.
  ///   * Action blue is what you *press*: `.mobile-nav__cta` and every primary
  ///     button on the sites, so it is the filled button and the composer FAB
  ///     here — at `#2c66f5`, because white on the sites' `#2f6bff` misses AA
  ///     by a thousandth.
  ///   * Cyan is a highlight, never a ground and never text.
  ///
  /// [gold] survives only as a functional colour — star ratings, verified
  /// marks — and is the old token file's light-mode `warning`, the one gold
  /// that can be drawn as a 16px glyph on a pale ground.
  static const light = BrandPalette(
    brightness: Brightness.light,
    background: Color(0xFFF6F7FB),
    surface: Color(0xFFFFFFFF),
    surfaceMuted: Color(0xFFEEF2FB),
    surfaceElevated: Color(0xFFFFFFFF),
    bar: Color(0xFFFFFFFF),
    border: Color(0xFFDCE1EC),
    divider: Color(0xFFE6EAF2),
    ink: Color(0xFF0F1830),
    mutedInk: Color(0xFF5D667B),
    faintInk: Color(0xFF7A8296),
    accent: Color(0xFF2149B8),
    accentFill: Color(0xFF2C66F5),
    onAccentFill: Color(0xFFFFFFFF),
    accentSoft: Color(0x142F6BFF),
    gold: Color(0xFF9A6700),
    terracotta: Color(0xFF1F50D6),
    like: Color(0xFFB4412F),
    repost: Color(0xFF0369A1),
    success: Color(0xFF0F7A5A),
    danger: Color(0xFFB02A30),
    shadow: Color(0xFF0F1830),
    glassFill: Color(0xFFFFFFFF),
    glassEdge: Color(0xFFFFFFFF),
    scrim: Color(0x8A0F1830),
    highlight: Color(0xFF22D3EE),
    heroDeep: Color(0xFF0B1225),
    heroMid: Color(0xFF19327F),
    heroLit: Color(0xFF2457D6),
    nightGround: Color(0xFF0B1225),
    nightGlow: Color(0xFF1A2F6B),
    nightAccent: Color(0xFF8EB4FF),
  );

  /// Night: navy rather than a flat charcoal, so the brand is still present in
  /// a room with the lights off.
  ///
  /// The grounds are the ecosystem's dark tokens (`#0d1524` under `#142036`
  /// surfaces). The accent lifts to the pale blue the sites draw their brand
  /// mark's frame in, `#8eb4ff`, because no mid blue is legible as text on
  /// navy; the filled button stays the same action blue as by day, which
  /// carries white text on either ground.
  static const dark = BrandPalette(
    brightness: Brightness.dark,
    background: Color(0xFF0D1524),
    surface: Color(0xFF142036),
    surfaceMuted: Color(0xFF18263F),
    surfaceElevated: Color(0xFF1C2B47),
    bar: Color(0xFF101A2C),
    border: Color(0xFF283A5A),
    divider: Color(0xFF1F2F4B),
    ink: Color(0xFFF5F7FA),
    mutedInk: Color(0xFFBAC4D6),
    faintInk: Color(0xFF7D8B9F),
    accent: Color(0xFF8EB4FF),
    accentFill: Color(0xFF2C66F5),
    onAccentFill: Color(0xFFFFFFFF),
    accentSoft: Color(0x248EB4FF),
    gold: Color(0xFFE3B341),
    terracotta: Color(0xFF6D99FF),
    like: Color(0xFFFF8A7A),
    repost: Color(0xFF7DD3FC),
    success: Color(0xFF4FD1A5),
    danger: Color(0xFFF07167),
    shadow: Color(0xFF000000),
    glassFill: Color(0xFFFFFFFF),
    glassEdge: Color(0xFFFFFFFF),
    scrim: Color(0xB3050A14),
    highlight: Color(0xFF22D3EE),
    heroDeep: Color(0xFF0B1225),
    heroMid: Color(0xFF19327F),
    heroLit: Color(0xFF2457D6),
    nightGround: Color(0xFF0B1225),
    nightGlow: Color(0xFF1A2F6B),
    nightAccent: Color(0xFF8EB4FF),
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
    Color? highlight,
    Color? heroDeep,
    Color? heroMid,
    Color? heroLit,
    Color? nightGround,
    Color? nightGlow,
    Color? nightAccent,
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
    highlight: highlight ?? this.highlight,
    heroDeep: heroDeep ?? this.heroDeep,
    heroMid: heroMid ?? this.heroMid,
    heroLit: heroLit ?? this.heroLit,
    nightGround: nightGround ?? this.nightGround,
    nightGlow: nightGlow ?? this.nightGlow,
    nightAccent: nightAccent ?? this.nightAccent,
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
      highlight: mix(highlight, other.highlight),
      heroDeep: mix(heroDeep, other.heroDeep),
      heroMid: mix(heroMid, other.heroMid),
      heroLit: mix(heroLit, other.heroLit),
      nightGround: mix(nightGround, other.nightGround),
      nightGlow: mix(nightGlow, other.nightGlow),
      nightAccent: mix(nightAccent, other.nightAccent),
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
          other.scrim == scrim &&
          other.highlight == highlight &&
          other.heroDeep == heroDeep &&
          other.heroMid == heroMid &&
          other.heroLit == heroLit &&
          other.nightGround == nightGround &&
          other.nightGlow == nightGlow &&
          other.nightAccent == nightAccent;

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
    highlight,
    heroDeep,
    heroMid,
    heroLit,
    nightGround,
    nightGlow,
    nightAccent,
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
  /// The websites' own hero, `linear-gradient(145deg, #0b1225, #19327f 62%,
  /// #2457d6)`, so a member arriving from indigenworld.com lands on the same
  /// band. It takes the palette for symmetry with its callers but is the same
  /// in both themes: its navy-into-blue is lit enough to read as a panel on
  /// the night palette's navy ground, which the old indigo on charcoal never
  /// was.
  static List<Color> heroRamp(BrandPalette brand) => [
    brand.heroDeep,
    brand.heroMid,
    brand.heroLit,
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

  /// A hero that ends in cyan: the stand-in behind a community banner nobody
  /// has uploaded a cover for yet.
  static LinearGradient heroBanner(BrandPalette brand) {
    final ramp = heroRamp(brand);
    return LinearGradient(
      begin: Alignment.topLeft,
      end: Alignment.bottomRight,
      colors: [ramp[1], ramp[2], brand.highlight],
    );
  }

  /// Accents that should feel lit — send buttons, highlights. The sites'
  /// header call-to-action runs the same two colours.
  static LinearGradient ember(BrandPalette brand) => LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [brand.highlight, brand.accentFill],
  );

  /// The full-bleed ground behind immersive screens.
  static RadialGradient night(BrandPalette brand) => RadialGradient(
    radius: 1.35,
    center: const Alignment(0, -0.55),
    colors: [brand.nightGlow, brand.nightGround, BrandColors.nightInk],
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
    // By day the lit corner is the sites' `--sand` band, the same pale blue
    // their page ground glows toward in its top corner.
    (brand.isDark ? Colors.white : BrandColors.sand).withValues(
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
