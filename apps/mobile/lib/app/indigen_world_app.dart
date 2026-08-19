import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/app/app_router.dart';
import 'package:indigen_world_mobile/app/app_theme.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/l10n/app_localizations.dart';

class IndigenWorldApp extends ConsumerWidget {
  const IndigenWorldApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(appRouterProvider);
    SystemChrome.setSystemUIOverlayStyle(
      const SystemUiOverlayStyle(
        statusBarColor: Colors.transparent,
        statusBarIconBrightness: Brightness.dark,
        systemNavigationBarColor: BrandColors.heritageGreen,
        systemNavigationBarIconBrightness: Brightness.light,
      ),
    );

    return MaterialApp.router(
      title: 'Indigen World',
      onGenerateTitle: (context) => AppLocalizations.of(context).appTitle,
      debugShowCheckedModeBanner: false,
      theme: buildIndigenTheme(),
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      routerConfig: router,
      builder: (context, child) => ColoredBox(
        color: BrandColors.plasterCream,
        child: MediaQuery(
          data: MediaQuery.of(context).copyWith(
            textScaler: MediaQuery.textScalerOf(context)
                .clamp(minScaleFactor: 0.9, maxScaleFactor: 2),
          ),
          child: child ?? const SizedBox.shrink(),
        ),
      ),
    );
  }
}
