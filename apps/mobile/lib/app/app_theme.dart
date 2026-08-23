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
  );

  return base.copyWith(
    textTheme: base.textTheme.copyWith(
      headlineLarge: base.textTheme.headlineLarge?.copyWith(
        color: BrandColors.heritageGreen,
        fontWeight: FontWeight.w800,
        letterSpacing: -0.8,
      ),
      headlineMedium: base.textTheme.headlineMedium?.copyWith(
        color: BrandColors.heritageGreen,
        fontWeight: FontWeight.w800,
        letterSpacing: -0.4,
      ),
      titleLarge: base.textTheme.titleLarge?.copyWith(
        color: BrandColors.ink,
        fontWeight: FontWeight.w700,
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
    ),
    appBarTheme: const AppBarTheme(
      backgroundColor: BrandColors.plasterCream,
      foregroundColor: BrandColors.heritageGreen,
      elevation: 0,
      surfaceTintColor: Colors.transparent,
    ),
    cardTheme: CardThemeData(
      color: Colors.white,
      elevation: 0,
      margin: EdgeInsets.zero,
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
    chipTheme: base.chipTheme.copyWith(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
      side: const BorderSide(color: BrandColors.divider),
      labelStyle: const TextStyle(fontWeight: FontWeight.w600),
    ),
  );
}
