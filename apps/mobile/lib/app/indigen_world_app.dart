import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/app/app_router.dart';
import 'package:indigen_world_mobile/app/app_theme.dart';
import 'package:indigen_world_mobile/core/app_locale.dart';
import 'package:indigen_world_mobile/core/theme_mode.dart';
import 'package:indigen_world_mobile/features/music/widgets/music_overlay.dart';
import 'package:indigen_world_mobile/l10n/app_localizations.dart';

class IndigenWorldApp extends ConsumerWidget {
  const IndigenWorldApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(appRouterProvider);
    final themeMode = ref.watch(themeModeProvider);

    // Which theme the member is actually about to read in. `ThemeMode.system`
    // has to be resolved here rather than left to MaterialApp, because the
    // system bars and the ground behind the router are painted outside it.
    final brightness = switch (themeMode) {
      ThemeMode.light => Brightness.light,
      ThemeMode.dark => Brightness.dark,
      ThemeMode.system => MediaQuery.platformBrightnessOf(context),
    };
    final brand = brandPaletteFor(brightness);
    SystemChrome.setSystemUIOverlayStyle(brandOverlayStyle(brand));

    return MaterialApp.router(
      title: 'Indigen',
      onGenerateTitle: (context) => AppLocalizations.of(context).appTitle,
      debugShowCheckedModeBanner: false,
      theme: buildIndigenTheme(),
      darkTheme: buildIndigenDarkTheme(),
      themeMode: themeMode,
      // Null on almost every device, and that is the point: Flutter then
      // resolves the phone's own language against `supportedLocales`, so a
      // French handset opens a French app without anybody choosing anything.
      // A value here only ever exists because a member asked for something
      // other than what their phone is set to.
      locale: ref.watch(localeProvider),
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      routerConfig: router,
      builder: (context, child) => ColoredBox(
        color: brand.background,
        child: MediaQuery(
          data: MediaQuery.of(context).copyWith(
            textScaler: MediaQuery.textScalerOf(context)
                .clamp(minScaleFactor: 0.9, maxScaleFactor: 2),
          ),
          // Above the Router, so the mini-player survives a pushed route. The
          // palette is handed down rather than looked up: this sits outside
          // the Navigator, and `brand` is already resolved right here.
          child: MusicOverlay(
            brand: brand,
            child: child ?? const SizedBox.shrink(),
          ),
        ),
      ),
    );
  }
}
