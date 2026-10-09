import 'dart:async';
import 'dart:io' show Platform;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/app/active_brand_theme.dart';
import 'package:indigen_world_mobile/app/app_router.dart';
import 'package:indigen_world_mobile/app/app_theme.dart';
import 'package:indigen_world_mobile/core/app_locale.dart';
import 'package:indigen_world_mobile/core/brand_theme_choice.dart';
import 'package:indigen_world_mobile/core/theme_mode.dart';
import 'package:indigen_world_mobile/features/music/widgets/music_overlay.dart';
import 'package:indigen_world_mobile/l10n/app_localizations.dart';

class IndigenWorldApp extends ConsumerStatefulWidget {
  const IndigenWorldApp({super.key});

  @override
  ConsumerState<IndigenWorldApp> createState() => _IndigenWorldAppState();
}

class _IndigenWorldAppState extends ConsumerState<IndigenWorldApp> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        unawaited(
          _syncKeyboardTheme(ref.read(activeBrandThemeProvider).id == 'black'),
        );
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final router = ref.watch(appRouterProvider);
    final themeMode = ref.watch(themeModeProvider);
    final brandTheme = ref.watch(activeBrandThemeProvider);
    ref.listen(
      activeBrandThemeProvider,
      (_, theme) => unawaited(_syncKeyboardTheme(theme.id == 'black')),
    );

    // Keeps the remembered answer in step with the real one, so the next
    // launch opens in the right theme before the entitlement has arrived.
    ref.listen<bool>(
      premiumThemesUnlockedProvider,
      (_, unlocked) => ref
          .read(lastKnownPremiumThemesUnlockedProvider.notifier)
          .remember(unlocked),
    );

    // Which theme the member is actually about to read in. `ThemeMode.system`
    // has to be resolved here rather than left to MaterialApp, because the
    // system bars and the ground behind the router are painted outside it.
    final brightness = switch (themeMode) {
      ThemeMode.light => Brightness.light,
      ThemeMode.dark => Brightness.dark,
      ThemeMode.system => MediaQuery.platformBrightnessOf(context),
    };
    final brand = brandPaletteFor(brightness, brandTheme);
    SystemChrome.setSystemUIOverlayStyle(brandOverlayStyle(brand));

    return MaterialApp.router(
      title: 'Indigen',
      onGenerateTitle: (context) => AppLocalizations.of(context).appTitle,
      debugShowCheckedModeBanner: false,
      theme: buildBrandTheme(brandTheme, Brightness.light),
      darkTheme: buildBrandTheme(brandTheme, Brightness.dark),
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

Future<void> _syncKeyboardTheme(bool black) async {
  if (!Platform.isAndroid) return;
  try {
    await const MethodChannel('world.indigen.mobile/kasem_keyboard')
        .invokeMethod<Object?>('setPreference', {
          'key': 'blackTheme',
          'value': black,
        });
  } on Object {
    /* Keyboard setup is independent from app rendering. */
  }
}
