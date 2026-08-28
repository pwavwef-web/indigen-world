import 'package:flutter/cupertino.dart' show CupertinoPageTransitionsBuilder;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/shared/frosted_nav_bar.dart'
    show kFrostedNavBarReservedSpace;
import 'package:indigen_world_mobile/shared/glass_popup.dart'
    show kGlassPopupRadius;
import 'package:indigen_world_mobile/shared/glass_surface.dart'
    show kGlassRadius;

/// The app in daylight.
ThemeData buildIndigenTheme() => _buildTheme(BrandPalette.light);

/// The app at night.
///
/// Not an inversion: the ground is a charcoal with a green undertone, the
/// accent lifts from the logo green to something that can actually be read
/// against it, and the gold warms up rather than staying a daylight ochre.
/// See [BrandPalette] for the reasoning behind each token.
ThemeData buildIndigenDarkTheme() => _buildTheme(BrandPalette.dark);

/// The palette for [brightness], for the places that resolve a theme before
/// there is a [BuildContext] to read one from.
BrandPalette brandPaletteFor(Brightness brightness) =>
    brightness == Brightness.dark ? BrandPalette.dark : BrandPalette.light;

/// The theme for [brightness].
ThemeData buildIndigenThemeFor(Brightness brightness) =>
    _buildTheme(brandPaletteFor(brightness));

/// The status- and navigation-bar styling that matches [brand].
///
/// The system bars are the one part of the app Flutter does not paint, so they
/// have to be told about the theme explicitly or they keep drawing dark icons
/// over a black page.
SystemUiOverlayStyle brandOverlayStyle(BrandPalette brand) {
  final iconBrightness = brand.isDark ? Brightness.light : Brightness.dark;
  return SystemUiOverlayStyle(
    statusBarColor: Colors.transparent,
    statusBarIconBrightness: iconBrightness,
    statusBarBrightness: brand.brightness,
    systemNavigationBarColor: brand.background,
    systemNavigationBarIconBrightness: iconBrightness,
    systemNavigationBarDividerColor: brand.background,
  );
}

ThemeData _buildTheme(BrandPalette brand) {
  final colorScheme =
      ColorScheme.fromSeed(
        seedColor: BrandColors.heritageGreen,
        brightness: brand.brightness,
      ).copyWith(
        primary: brand.accent,
        onPrimary: brand.onAccentFill,
        secondary: brand.terracotta,
        tertiary: brand.gold,
        surface: brand.surface,
        onSurface: brand.ink,
        onSurfaceVariant: brand.mutedInk,
        outline: brand.border,
        outlineVariant: brand.divider,
        error: brand.danger,
      );

  final base = ThemeData(
    colorScheme: colorScheme,
    useMaterial3: true,
    brightness: brand.brightness,
    scaffoldBackgroundColor: brand.background,
    canvasColor: brand.background,
    fontFamily: 'Noto Sans',
    splashFactory: InkSparkle.splashFactory,
    extensions: [brand],
  );

  return base.copyWith(
    // Headings are drawn in ink rather than in the brand green.
    //
    // Green type on a warm ground was the single loudest thing in the app: it
    // put the accent on the one element that is on every screen, which left
    // nothing louder for the elements that actually want attention. The green
    // now belongs to what you can *press*.
    textTheme: base.textTheme.copyWith(
      // Display and headline sizes tighten as they grow: large type set at
      // default tracking reads loose and soft, and this brand wants its
      // headings to feel carved.
      displaySmall: base.textTheme.displaySmall?.copyWith(
        color: brand.ink,
        fontWeight: FontWeight.w800,
        letterSpacing: -1.4,
        height: 1.02,
      ),
      headlineLarge: base.textTheme.headlineLarge?.copyWith(
        color: brand.ink,
        fontWeight: FontWeight.w800,
        letterSpacing: -1,
        height: 1.06,
      ),
      headlineMedium: base.textTheme.headlineMedium?.copyWith(
        color: brand.ink,
        fontWeight: FontWeight.w800,
        letterSpacing: -0.6,
        height: 1.1,
      ),
      headlineSmall: base.textTheme.headlineSmall?.copyWith(
        color: brand.ink,
        fontWeight: FontWeight.w700,
        letterSpacing: -0.3,
      ),
      titleLarge: base.textTheme.titleLarge?.copyWith(
        color: brand.ink,
        fontWeight: FontWeight.w700,
        letterSpacing: -0.2,
      ),
      titleMedium: base.textTheme.titleMedium?.copyWith(
        color: brand.ink,
        fontWeight: FontWeight.w700,
      ),
      bodyLarge: base.textTheme.bodyLarge?.copyWith(
        color: brand.ink,
        fontSize: 16,
        height: 1.5,
      ),
      bodyMedium: base.textTheme.bodyMedium?.copyWith(
        color: brand.ink,
        fontSize: 16,
        height: 1.45,
      ),
      bodySmall: base.textTheme.bodySmall?.copyWith(color: brand.mutedInk),
      labelLarge: base.textTheme.labelLarge?.copyWith(
        fontWeight: FontWeight.w700,
        letterSpacing: 0.1,
      ),
    ),
    iconTheme: IconThemeData(color: brand.mutedInk),
    appBarTheme: AppBarTheme(
      backgroundColor: brand.background,
      foregroundColor: brand.ink,
      elevation: 0,
      scrolledUnderElevation: 0,
      surfaceTintColor: Colors.transparent,
      centerTitle: false,
      systemOverlayStyle: brandOverlayStyle(brand),
      iconTheme: IconThemeData(color: brand.ink),
      titleTextStyle: TextStyle(
        color: brand.ink,
        fontSize: 19,
        fontWeight: FontWeight.w800,
        letterSpacing: -0.3,
      ),
    ),
    // A card is a plain panel with a hairline, not a tinted pane with a halo.
    // Surfaces that want the fuller treatment reach for `GlassSurface` /
    // `GlassCard` in lib/shared/glass_surface.dart; this keeps anything still
    // built as a bare `Card` in the same material.
    cardTheme: CardThemeData(
      color: brand.surface,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      margin: EdgeInsets.zero,
      shadowColor: Colors.transparent,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(kGlassRadius),
        side: BorderSide(color: brand.border),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: brand.surfaceMuted,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
      hintStyle: TextStyle(color: brand.faintInk),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(16),
        borderSide: BorderSide(color: brand.border),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(16),
        borderSide: BorderSide(color: brand.border),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(16),
        borderSide: BorderSide(color: brand.accent, width: 1.6),
      ),
      labelStyle: TextStyle(color: brand.mutedInk),
      floatingLabelStyle: TextStyle(
        color: brand.accent,
        fontWeight: FontWeight.w700,
      ),
    ),
    navigationBarTheme: NavigationBarThemeData(
      height: 72,
      backgroundColor: brand.bar,
      indicatorColor: brand.accentSoft,
      surfaceTintColor: Colors.transparent,
      iconTheme: WidgetStateProperty.resolveWith((states) {
        final selected = states.contains(WidgetState.selected);
        return IconThemeData(
          color: selected ? brand.accent : brand.mutedInk,
          size: selected ? 25 : 22,
        );
      }),
      labelTextStyle: WidgetStateProperty.resolveWith(
        (states) => TextStyle(
          color: states.contains(WidgetState.selected)
              ? brand.accent
              : brand.mutedInk,
          fontSize: 9,
          fontWeight: FontWeight.w700,
        ),
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: brand.accentFill,
        foregroundColor: brand.onAccentFill,
        minimumSize: const Size(44, 52),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: brand.accent,
        minimumSize: const Size(44, 52),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        side: BorderSide(color: brand.border),
        textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: brand.accent,
        textStyle: const TextStyle(fontWeight: FontWeight.w700),
      ),
    ),
    floatingActionButtonTheme: FloatingActionButtonThemeData(
      backgroundColor: brand.accentFill,
      foregroundColor: brand.onAccentFill,
      elevation: 3,
      focusElevation: 4,
      highlightElevation: 6,
      splashColor: Colors.white.withValues(alpha: 0.12),
    ),
    chipTheme: base.chipTheme.copyWith(
      backgroundColor: brand.surfaceMuted,
      selectedColor: brand.accentSoft,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
      side: BorderSide(color: brand.border),
      labelStyle: TextStyle(color: brand.ink, fontWeight: FontWeight.w600),
    ),
    dividerTheme: DividerThemeData(
      color: brand.divider,
      thickness: 1,
      space: 1,
    ),
    listTileTheme: ListTileThemeData(
      iconColor: brand.mutedInk,
      textColor: brand.ink,
      subtitleTextStyle: TextStyle(color: brand.mutedInk, fontSize: 13),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
    ),
    switchTheme: SwitchThemeData(
      thumbColor: WidgetStateProperty.resolveWith(
        (states) => states.contains(WidgetState.selected)
            ? brand.onAccentFill
            : brand.pick(Colors.white, brand.mutedInk),
      ),
      trackColor: WidgetStateProperty.resolveWith(
        (states) => states.contains(WidgetState.selected)
            ? brand.accentFill
            : brand.surfaceMuted,
      ),
      trackOutlineColor: WidgetStatePropertyAll(brand.border),
    ),
    radioTheme: RadioThemeData(
      fillColor: WidgetStateProperty.resolveWith(
        (states) => states.contains(WidgetState.selected)
            ? brand.accent
            : brand.faintInk,
      ),
    ),
    checkboxTheme: CheckboxThemeData(
      fillColor: WidgetStateProperty.resolveWith(
        (states) => states.contains(WidgetState.selected)
            ? brand.accentFill
            : Colors.transparent,
      ),
      checkColor: WidgetStatePropertyAll(brand.onAccentFill),
      side: BorderSide(color: brand.border, width: 1.5),
    ),
    // Floating, rounded and dark: a message that sits over the floating nav
    // rail rather than fighting it for the bottom edge. The inset clears the
    // rail entirely, so even a SnackBar nobody has migrated to
    // `showGlassToast` yet lands above it instead of behind it.
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: brand.pick(
        const Color(0xFF232826),
        const Color(0xFF2A302E),
      ),
      contentTextStyle: const TextStyle(
        color: Colors.white,
        fontSize: 14,
        fontWeight: FontWeight.w600,
        height: 1.35,
      ),
      actionTextColor: brand.pick(
        const Color(0xFF8FD3B6),
        const Color(0xFF8FD3B6),
      ),
      insetPadding: const EdgeInsets.fromLTRB(
        16,
        8,
        16,
        kFrostedNavBarReservedSpace + 8,
      ),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
      elevation: 4,
    ),
    // Still defined, because a few genuinely full-height flows — composing a
    // post, picking media at length — are honestly sheets. New work should
    // reach for `showGlassPopup` in lib/shared/glass_popup.dart instead: a
    // centered card that does not compete with the nav rail.
    bottomSheetTheme: BottomSheetThemeData(
      backgroundColor: brand.surfaceElevated,
      surfaceTintColor: Colors.transparent,
      showDragHandle: true,
      dragHandleColor: brand.border,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
      ),
    ),
    // The glass popups paint their own surface, so the Material dialog surface
    // underneath them has to get out of the way — an opaque panel with an
    // elevation tint behind a translucent card would show as a dull rectangle
    // around it. Anything still built as a plain AlertDialog should move to
    // `showGlassConfirm`.
    dialogTheme: DialogThemeData(
      backgroundColor: Colors.transparent,
      surfaceTintColor: Colors.transparent,
      shadowColor: Colors.transparent,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(kGlassPopupRadius),
      ),
      titleTextStyle: TextStyle(
        color: brand.ink,
        fontSize: 20,
        fontWeight: FontWeight.w800,
        letterSpacing: -0.3,
      ),
      contentTextStyle: TextStyle(
        color: brand.mutedInk,
        fontSize: 15,
        height: 1.5,
      ),
    ),
    popupMenuTheme: PopupMenuThemeData(
      color: brand.surfaceElevated,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: brand.border),
      ),
      textStyle: TextStyle(color: brand.ink, fontSize: 14),
    ),
    drawerTheme: DrawerThemeData(
      backgroundColor: brand.background,
      surfaceTintColor: Colors.transparent,
      scrimColor: brand.scrim,
    ),
    tabBarTheme: TabBarThemeData(
      labelColor: brand.ink,
      unselectedLabelColor: brand.mutedInk,
      indicatorColor: brand.accent,
      dividerColor: brand.divider,
    ),
    progressIndicatorTheme: ProgressIndicatorThemeData(
      color: brand.accent,
      linearTrackColor: brand.divider,
      circularTrackColor: Colors.transparent,
    ),
    tooltipTheme: TooltipThemeData(
      decoration: BoxDecoration(
        color: brand.pick(const Color(0xFF232826), const Color(0xFF2F3634)),
        borderRadius: BorderRadius.circular(10),
      ),
      textStyle: const TextStyle(
        color: Colors.white,
        fontSize: 12,
        fontWeight: FontWeight.w600,
      ),
    ),
    textSelectionTheme: TextSelectionThemeData(
      cursorColor: brand.accent,
      selectionColor: brand.accent.withValues(alpha: 0.28),
      selectionHandleColor: brand.accent,
    ),
    // A page arriving from the side rather than snapping in place: small, but
    // it is what makes navigation feel considered instead of abrupt.
    pageTransitionsTheme: const PageTransitionsTheme(
      builders: {
        TargetPlatform.android: FadeForwardsPageTransitionsBuilder(),
        TargetPlatform.iOS: CupertinoPageTransitionsBuilder(),
      },
    ),
  );
}
