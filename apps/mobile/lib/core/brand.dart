import 'package:flutter/material.dart';

abstract final class BrandColors {
  static const heritageGreen = Color(0xFF0B3D2E);
  static const savannahGreen = Color(0xFF155B43);
  static const kenteGold = Color(0xFFD89B1D);
  static const terracotta = Color(0xFFB65A3A);
  static const plasterCream = Color(0xFFF7F3E8);
  static const ink = Color(0xFF1E2522);
  static const mutedInk = Color(0xFF58615D);
  static const surface = Color(0xFFFFFDF8);
  static const divider = Color(0xFFE2DDD0);

  /// Night ground for the immersive surfaces — the launch screen, Explore and
  /// Kawuri. Deep enough for gold to read as light against it.
  static const nightGreen = Color(0xFF071D17);
  static const nightInk = Color(0xFF050807);
}

/// Shared gradients, so the same warmth appears on every hero surface instead
/// of each screen inventing its own three-stop blend.
abstract final class BrandGradients {
  /// Headers and hero cards.
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

  /// A barely-there wash that lifts a plain card off the plaster background.
  static LinearGradient get parchment => LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Colors.white, BrandColors.plasterCream.withValues(alpha: 0.55)],
  );
}

/// Elevation the brand actually uses. Shadows are tinted heritage green rather
/// than neutral black, so depth reads as warm rather than as grey haze.
abstract final class BrandShadows {
  static List<BoxShadow> get card => [
    BoxShadow(
      color: BrandColors.heritageGreen.withValues(alpha: 0.07),
      blurRadius: 18,
      offset: const Offset(0, 8),
    ),
  ];

  static List<BoxShadow> get lifted => [
    BoxShadow(
      color: BrandColors.heritageGreen.withValues(alpha: 0.16),
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
