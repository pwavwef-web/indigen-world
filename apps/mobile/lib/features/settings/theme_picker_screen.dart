import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:indigen_world_mobile/app/active_brand_theme.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/core/brand_theme_choice.dart';
import 'package:indigen_world_mobile/core/brand_themes.dart';
import 'package:indigen_world_mobile/core/theme_mode.dart';
import 'package:indigen_world_mobile/features/settings/settings_widgets.dart';
import 'package:indigen_world_mobile/shared/glass_popup.dart';

/// Every theme, each drawn as a small picture of the app in its own colours.
///
/// A swatch row of five dots would say which colours a theme has and nothing
/// about what reading in it is like. So each tile is a miniature of the thing
/// itself — the hero band, a card, a button — in the appearance the member is
/// using right now, and switching light or dark at the top repaints every
/// miniature, which is how somebody finds out that a theme they liked by day
/// is one they do not like at night.
///
/// The supporters' themes are shown to everybody, locked or not, and can be
/// previewed by anybody. Hiding them would make them a secret; locking them
/// without showing them would make them a pitch. Shown, they are just a thank
/// you that somebody can see.
class ThemePickerScreen extends ConsumerWidget {
  const ThemePickerScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final brand = context.brand;
    final chosenId = ref.watch(brandThemeChoiceProvider);
    final active = ref.watch(activeBrandThemeProvider);
    final unlocked = ref.watch(premiumThemesUnlockedProvider);
    final brightness = Theme.of(context).brightness;

    final free = BrandThemes.all.where((theme) => !theme.isPremium).toList();
    final premium = BrandThemes.all.where((theme) => theme.isPremium).toList();

    Widget grid(List<BrandTheme> themes) => LayoutBuilder(
      builder: (context, constraints) {
        final columns = constraints.maxWidth >= 560 ? 3 : 2;
        const gap = 12.0;
        final width = (constraints.maxWidth - gap * (columns - 1)) / columns;
        return Wrap(
          spacing: gap,
          runSpacing: gap,
          children: [
            for (final theme in themes)
              SizedBox(
                width: width,
                child: _ThemeTile(
                  theme: theme,
                  brightness: brightness,
                  selected: active.id == theme.id,
                  locked: theme.isPremium && !unlocked,
                  onTap: () => _choose(context, ref, theme, unlocked),
                ),
              ),
          ],
        );
      },
    );

    // A supporters' theme the member picked while subscribed, now drawn in
    // blue because the subscription lapsed. Said once, at the top, so the
    // blue app is not a mystery.
    final chosen = BrandThemes.byId(chosenId);
    final heldBack = chosen.isPremium && !unlocked;

    return Scaffold(
      appBar: AppBar(title: const Text('Theme')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 4, 20, 40),
        children: [
          Text(
            'Choose the colours the app is drawn in. Your choice stays on '
            'this phone.',
            style: TextStyle(color: brand.mutedInk, height: 1.45),
          ),
          const SizedBox(height: 16),
          const _AppearanceSwitch(),
          if (heldBack) ...[
            const SizedBox(height: 16),
            _Notice(
              icon: Icons.info_outline_rounded,
              text:
                  '${chosen.name} comes back when your Patron or Creator '
                  'membership does. Until then the app is in '
                  '${BrandThemes.fallback.name}.',
            ),
          ],
          const SizedBox(height: 24),
          const SettingsSectionLabel('FOR EVERYONE'),
          const SizedBox(height: 10),
          grid(free),
          const SizedBox(height: 28),
          Row(
            children: [
              const Expanded(
                child: SettingsSectionLabel('PATRON & STUDIO MEMBERS'),
              ),
              if (unlocked)
                Icon(Icons.favorite_rounded, size: 14, color: brand.like),
            ],
          ),
          const SizedBox(height: 10),
          if (!unlocked) ...[
            _Notice(
              icon: Icons.palette_outlined,
              text:
                  'A thank-you for the members who carry the cost of this '
                  'archive. Every theme can be previewed; Indigen Patron and '
                  'Indigen Creator unlock them. Nothing else in the app is '
                  'held back.',
              action: TextButton(
                onPressed: () => context.push('/subscribe'),
                child: const Text('See memberships'),
              ),
            ),
            const SizedBox(height: 12),
          ],
          grid(premium),
        ],
      ),
    );
  }

  Future<void> _choose(
    BuildContext context,
    WidgetRef ref,
    BrandTheme theme,
    bool unlocked,
  ) async {
    if (theme.isPremium && !unlocked) {
      await _previewLocked(context, theme);
      return;
    }
    unawaited(HapticFeedback.selectionClick());
    await ref.read(brandThemeChoiceProvider.notifier).choose(theme);
  }

  Future<void> _previewLocked(BuildContext context, BrandTheme theme) async {
    final brightness = Theme.of(context).brightness;
    final wantsMembership = await showGlassPopup<bool>(
      context: context,
      title: theme.name,
      subtitle: theme.description,
      builder: (popupContext) => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          Center(
            child: SizedBox(
              width: 220,
              child: ExcludeSemantics(
                child: _ThemeMiniature(
                  palette: theme.paletteFor(brightness),
                  scale: 1.35,
                ),
              ),
            ),
          ),
          const SizedBox(height: 16),
          Text(
            'This theme comes with Indigen Patron and Indigen Creator.',
            textAlign: TextAlign.center,
            style: TextStyle(color: popupContext.brand.mutedInk, height: 1.45),
          ),
          const SizedBox(height: 16),
          FilledButton.icon(
            onPressed: () => Navigator.of(popupContext).pop(true),
            icon: const Icon(Icons.favorite_outline_rounded),
            label: const Text('See memberships'),
          ),
          const SizedBox(height: 4),
          TextButton(
            onPressed: () => Navigator.of(popupContext).pop(false),
            child: const Text('Not now'),
          ),
        ],
      ),
    );
    if (wantsMembership == true && context.mounted) {
      unawaited(context.push('/subscribe'));
    }
  }
}

/// Light, dark or the phone's own — here as well as on the Settings list,
/// because it is the thing that most changes what a theme looks like.
class _AppearanceSwitch extends ConsumerWidget {
  const _AppearanceSwitch();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final mode = ref.watch(themeModeProvider);
    return SegmentedButton<ThemeMode>(
      key: const Key('theme-picker-appearance'),
      showSelectedIcon: false,
      segments: [
        for (final option in ThemeMode.values)
          ButtonSegment(
            value: option,
            icon: Icon(themeModeIcon(option), size: 18),
            label: Text(switch (option) {
              ThemeMode.system => 'Device',
              ThemeMode.light => 'Light',
              ThemeMode.dark => 'Dark',
            }),
          ),
      ],
      selected: {mode},
      onSelectionChanged: (selection) => unawaited(
        ref.read(themeModeProvider.notifier).setMode(selection.first),
      ),
    );
  }
}

class _Notice extends StatelessWidget {
  const _Notice({required this.icon, required this.text, this.action});

  final IconData icon;
  final String text;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 8),
      decoration: BoxDecoration(
        color: brand.accentSoft,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: brand.accent.withValues(alpha: 0.2)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(icon, size: 18, color: brand.accent),
              const SizedBox(width: 10),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.only(bottom: 4),
                  child: Text(
                    text,
                    style: TextStyle(
                      color: brand.ink,
                      fontSize: 13,
                      height: 1.45,
                    ),
                  ),
                ),
              ),
            ],
          ),
          if (action != null)
            Align(alignment: Alignment.centerRight, child: action),
        ],
      ),
    );
  }
}

class _ThemeTile extends StatelessWidget {
  const _ThemeTile({
    required this.theme,
    required this.brightness,
    required this.selected,
    required this.locked,
    required this.onTap,
  });

  final BrandTheme theme;
  final Brightness brightness;
  final bool selected;
  final bool locked;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final palette = theme.paletteFor(brightness);
    final state = selected
        ? 'In use'
        : locked
        ? 'Patron and Studio members. Tap to preview.'
        : 'Tap to use';

    return Semantics(
      button: true,
      selected: selected,
      label: '${theme.name}. ${theme.description} $state',
      excludeSemantics: true,
      child: Material(
        color: brand.surface,
        borderRadius: BorderRadius.circular(20),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          key: Key('theme-tile-${theme.id}'),
          onTap: onTap,
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 180),
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(20),
              border: Border.all(
                color: selected ? brand.accent : brand.border,
                width: selected ? 2 : 1,
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Stack(
                  children: [
                    _ThemeMiniature(palette: palette),
                    if (locked)
                      Positioned(
                        top: 6,
                        right: 6,
                        child: _Badge(
                          icon: Icons.lock_rounded,
                          label: 'Patron',
                          palette: palette,
                        ),
                      ),
                  ],
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(4, 10, 2, 4),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          theme.name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            color: brand.ink,
                            fontSize: 14,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ),
                      AnimatedSwitcher(
                        duration: const Duration(milliseconds: 180),
                        child: selected
                            ? Icon(
                                Icons.check_circle_rounded,
                                key: const ValueKey('selected'),
                                size: 20,
                                color: brand.accent,
                              )
                            : const SizedBox(
                                key: ValueKey('idle'),
                                width: 20,
                                height: 20,
                              ),
                      ),
                    ],
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(4, 0, 4, 4),
                  child: Text(
                    theme.description,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      color: brand.mutedInk,
                      fontSize: 11.5,
                      height: 1.3,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _Badge extends StatelessWidget {
  const _Badge({
    required this.icon,
    required this.label,
    required this.palette,
  });

  final IconData icon;
  final String label;
  final BrandPalette palette;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.fromLTRB(6, 3, 8, 3),
    decoration: BoxDecoration(
      color: Colors.black.withValues(alpha: 0.55),
      borderRadius: BorderRadius.circular(999),
    ),
    child: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 11, color: palette.highlight),
        const SizedBox(width: 3),
        Text(
          label,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 10,
            fontWeight: FontWeight.w800,
          ),
        ),
      ],
    ),
  );
}

/// A small picture of the app in [palette]: the hero band with the theme's
/// highlight, a card of text on the page ground, and a filled button.
///
/// Built only from the palette handed in — never from `context.brand` — so a
/// theme the member is not using still previews in its own colours.
class _ThemeMiniature extends StatelessWidget {
  const _ThemeMiniature({required this.palette, this.scale = 1});

  final BrandPalette palette;
  final double scale;

  @override
  Widget build(BuildContext context) {
    double s(double value) => value * scale;
    Widget bar(Color color, double widthFactor, {double height = 5}) =>
        FractionallySizedBox(
          alignment: Alignment.centerLeft,
          widthFactor: widthFactor,
          child: Container(
            height: s(height),
            decoration: BoxDecoration(
              color: color,
              borderRadius: BorderRadius.circular(99),
            ),
          ),
        );

    return AspectRatio(
      aspectRatio: 1.05,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(s(14)),
        child: ColoredBox(
          color: palette.background,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Expanded(
                flex: 5,
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: BrandGradients.heroRich(palette),
                  ),
                  child: Padding(
                    padding: EdgeInsets.all(s(9)),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Container(
                          width: s(9),
                          height: s(9),
                          decoration: BoxDecoration(
                            color: palette.highlight,
                            shape: BoxShape.circle,
                          ),
                        ),
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            bar(Colors.white, 0.72, height: 6),
                            SizedBox(height: s(4)),
                            bar(Colors.white.withValues(alpha: 0.6), 0.45),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
              ),
              Expanded(
                flex: 6,
                child: Padding(
                  padding: EdgeInsets.all(s(8)),
                  child: Container(
                    padding: EdgeInsets.all(s(8)),
                    decoration: BoxDecoration(
                      color: palette.surface,
                      borderRadius: BorderRadius.circular(s(10)),
                      border: Border.all(color: palette.border),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        bar(palette.ink, 0.8),
                        bar(palette.mutedInk, 0.55, height: 4),
                        Row(
                          children: [
                            Container(
                              width: s(38),
                              height: s(13),
                              decoration: BoxDecoration(
                                color: palette.accentFill,
                                borderRadius: BorderRadius.circular(99),
                              ),
                              alignment: Alignment.center,
                              child: Container(
                                width: s(18),
                                height: s(3),
                                color: palette.onAccentFill,
                              ),
                            ),
                            SizedBox(width: s(6)),
                            Container(
                              width: s(8),
                              height: s(8),
                              decoration: BoxDecoration(
                                color: palette.accent,
                                shape: BoxShape.circle,
                              ),
                            ),
                            SizedBox(width: s(4)),
                            Container(
                              width: s(8),
                              height: s(8),
                              decoration: BoxDecoration(
                                color: palette.terracotta,
                                shape: BoxShape.circle,
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
