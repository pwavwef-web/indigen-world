import 'package:flutter/cupertino.dart' show CupertinoPageTransitionsBuilder;
import 'package:flutter/material.dart';
import 'package:indigen_world_mobile/core/brand.dart';

ThemeData buildIndigenTheme() {
  final colorScheme = ColorScheme.fromSeed(
    seedColor: BrandColors.heritageGreen,
    brightness: Brightness.light,
    primary: BrandColors.heritageGreen,
    secondary: BrandColors.terracotta,
    tertiary: BrandColors.kenteGold,
    surface: BrandColors.surface,
    error: const Color(0xFFA12A2A),
  );

  final base = ThemeData(
    colorScheme: colorScheme,
    useMaterial3: true,
    scaffoldBackgroundColor: BrandColors.plasterCream,
    fontFamily: 'Noto Sans',
    splashFactory: InkSparkle.splashFactory,
  );

  return base.copyWith(
    textTheme: base.textTheme.copyWith(
      // Display and headline sizes tighten as they grow: large type set at
      // default tracking reads loose and soft, and this brand wants its
      // headings to feel carved.
      displaySmall: base.textTheme.displaySmall?.copyWith(
        color: BrandColors.heritageGreen,
        fontWeight: FontWeight.w900,
        letterSpacing: -1.4,
        height: 1.02,
      ),
      headlineLarge: base.textTheme.headlineLarge?.copyWith(
        color: BrandColors.heritageGreen,
        fontWeight: FontWeight.w900,
        letterSpacing: -1,
        height: 1.06,
      ),
      headlineMedium: base.textTheme.headlineMedium?.copyWith(
        color: BrandColors.heritageGreen,
        fontWeight: FontWeight.w900,
        letterSpacing: -0.6,
        height: 1.1,
      ),
      headlineSmall: base.textTheme.headlineSmall?.copyWith(
        color: BrandColors.heritageGreen,
        fontWeight: FontWeight.w800,
        letterSpacing: -0.3,
      ),
      titleLarge: base.textTheme.titleLarge?.copyWith(
        color: BrandColors.ink,
        fontWeight: FontWeight.w800,
        letterSpacing: -0.2,
      ),
      titleMedium: base.textTheme.titleMedium?.copyWith(
        color: BrandColors.ink,
        fontWeight: FontWeight.w700,
      ),
      bodyLarge: base.textTheme.bodyLarge?.copyWith(
        color: BrandColors.ink,
        fontSize: 16,
        height: 1.5,
      ),
      bodyMedium: base.textTheme.bodyMedium?.copyWith(
        color: BrandColors.ink,
        fontSize: 16,
        height: 1.45,
      ),
      labelLarge: base.textTheme.labelLarge?.copyWith(
        fontWeight: FontWeight.w800,
        letterSpacing: 0.1,
      ),
    ),
    appBarTheme: const AppBarTheme(
      backgroundColor: BrandColors.plasterCream,
      foregroundColor: BrandColors.heritageGreen,
      elevation: 0,
      scrolledUnderElevation: 0,
      surfaceTintColor: Colors.transparent,
      centerTitle: false,
      titleTextStyle: TextStyle(
        color: BrandColors.heritageGreen,
        fontSize: 20,
        fontWeight: FontWeight.w900,
        letterSpacing: -0.4,
      ),
    ),
    cardTheme: CardThemeData(
      color: Colors.white,
      elevation: 0,
      margin: EdgeInsets.zero,
      shadowColor: BrandColors.heritageGreen.withValues(alpha: 0.12),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(20),
        side: const BorderSide(color: BrandColors.divider),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: Colors.white,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(16),
        borderSide: const BorderSide(color: BrandColors.divider),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(16),
        borderSide: const BorderSide(color: BrandColors.divider),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(16),
        borderSide: const BorderSide(
          color: BrandColors.heritageGreen,
          width: 2,
        ),
      ),
      labelStyle: const TextStyle(color: BrandColors.mutedInk),
      floatingLabelStyle: const TextStyle(
        color: BrandColors.heritageGreen,
        fontWeight: FontWeight.w700,
      ),
    ),
    navigationBarTheme: NavigationBarThemeData(
      height: 72,
      backgroundColor: BrandColors.heritageGreen,
      indicatorColor: BrandColors.kenteGold.withValues(alpha: 0.2),
      iconTheme: WidgetStateProperty.resolveWith((states) {
        final selected = states.contains(WidgetState.selected);
        return IconThemeData(
          color: selected ? BrandColors.kenteGold : Colors.white60,
          size: selected ? 25 : 22,
        );
      }),
      labelTextStyle: WidgetStateProperty.resolveWith(
        (states) => TextStyle(
          color: states.contains(WidgetState.selected)
              ? BrandColors.kenteGold
              : Colors.white60,
          fontSize: 9,
          fontWeight: FontWeight.w800,
        ),
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        minimumSize: const Size(44, 52),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        minimumSize: const Size(44, 52),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        side: const BorderSide(color: BrandColors.heritageGreen),
        textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: BrandColors.heritageGreen,
        textStyle: const TextStyle(fontWeight: FontWeight.w800),
      ),
    ),
    floatingActionButtonTheme: const FloatingActionButtonThemeData(
      backgroundColor: BrandColors.heritageGreen,
      foregroundColor: BrandColors.kenteGold,
      elevation: 6,
      focusElevation: 8,
      highlightElevation: 10,
    ),
    chipTheme: base.chipTheme.copyWith(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
      side: const BorderSide(color: BrandColors.divider),
      labelStyle: const TextStyle(fontWeight: FontWeight.w600),
    ),
    dividerTheme: const DividerThemeData(
      color: BrandColors.divider,
      thickness: 1,
      space: 1,
    ),
    listTileTheme: ListTileThemeData(
      iconColor: BrandColors.heritageGreen,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
    ),
    // Floating, rounded and dark by default: a message that sits over the
    // floating glass rail rather than fighting it for the bottom edge.
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: BrandColors.heritageGreen,
      contentTextStyle: const TextStyle(
        color: Colors.white,
        fontSize: 14,
        fontWeight: FontWeight.w600,
        height: 1.35,
      ),
      actionTextColor: BrandColors.kenteGold,
      insetPadding: const EdgeInsets.fromLTRB(16, 8, 16, 20),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      elevation: 4,
    ),
    bottomSheetTheme: const BottomSheetThemeData(
      backgroundColor: BrandColors.surface,
      surfaceTintColor: Colors.transparent,
      showDragHandle: true,
      dragHandleColor: BrandColors.divider,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
      ),
    ),
    dialogTheme: DialogThemeData(
      backgroundColor: BrandColors.surface,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
      titleTextStyle: const TextStyle(
        color: BrandColors.heritageGreen,
        fontSize: 20,
        fontWeight: FontWeight.w900,
        letterSpacing: -0.3,
      ),
      contentTextStyle: const TextStyle(
        color: BrandColors.ink,
        fontSize: 15,
        height: 1.5,
      ),
    ),
    progressIndicatorTheme: const ProgressIndicatorThemeData(
      color: BrandColors.heritageGreen,
      linearTrackColor: BrandColors.divider,
      circularTrackColor: Colors.transparent,
    ),
    tooltipTheme: TooltipThemeData(
      decoration: BoxDecoration(
        color: BrandColors.ink.withValues(alpha: 0.92),
        borderRadius: BorderRadius.circular(10),
      ),
      textStyle: const TextStyle(
        color: Colors.white,
        fontSize: 12,
        fontWeight: FontWeight.w600,
      ),
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
