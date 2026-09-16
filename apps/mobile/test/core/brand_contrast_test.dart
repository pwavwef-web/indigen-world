import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/core/brand_themes.dart';

/// WCAG relative luminance of an opaque colour.
double _luminance(Color color) {
  double channel(double c) =>
      c <= 0.03928 ? c / 12.92 : math.pow((c + 0.055) / 1.055, 2.4).toDouble();
  return 0.2126 * channel(color.r) +
      0.7152 * channel(color.g) +
      0.0722 * channel(color.b);
}

double _contrast(Color a, Color b) {
  final la = _luminance(a);
  final lb = _luminance(b);
  return (math.max(la, lb) + 0.05) / (math.min(la, lb) + 0.05);
}

void _expectAtLeast(String pair, Color fg, Color bg, double minimum) {
  final ratio = _contrast(fg, bg);
  expect(
    ratio,
    greaterThanOrEqualTo(minimum),
    reason: '$pair is ${ratio.toStringAsFixed(2)}:1',
  );
}

/// Every theme's palettes are hand-picked hexes. These are the pairings every
/// screen leans on, held to the thresholds text needs, so neither a new theme
/// nor a later tweak to an old one can quietly make a label unreadable.
void main() {
  test('the default theme is the blue palette pair', () {
    expect(BrandThemes.fallback.light, BrandPalette.light);
    expect(BrandThemes.fallback.dark, BrandPalette.dark);
    expect(BrandThemes.fallback.isPremium, isFalse);
  });

  test('theme ids are unique and an unknown id falls back to blue', () {
    final ids = BrandThemes.all.map((theme) => theme.id).toList();
    expect(ids.toSet().length, ids.length);
    expect(BrandThemes.byId('from-a-newer-build'), BrandThemes.blue);
    expect(BrandThemes.byId(null), BrandThemes.blue);
  });

  test('blue and heritage green stay free', () {
    expect(BrandThemes.blue.access, BrandThemeAccess.free);
    expect(BrandThemes.green.access, BrandThemeAccess.free);
  });

  for (final theme in BrandThemes.all) {
    group(theme.name, () {
      test('each palette says which brightness it is', () {
        expect(theme.light.brightness, Brightness.light);
        expect(theme.dark.brightness, Brightness.dark);
      });

      test('theme-level colours agree between light and dark', () {
        // Hero bands, Kawuri and the launch screen are dark in both
        // appearances, so they must not change when the appearance does.
        for (final (name, pick) in <(String, Color Function(BrandPalette))>[
          ('highlight', (p) => p.highlight),
          ('heroDeep', (p) => p.heroDeep),
          ('heroMid', (p) => p.heroMid),
          ('heroLit', (p) => p.heroLit),
          ('nightGround', (p) => p.nightGround),
          ('nightGlow', (p) => p.nightGlow),
          ('nightAccent', (p) => p.nightAccent),
        ]) {
          expect(pick(theme.light), pick(theme.dark), reason: name);
        }
      });

      for (final (mode, brand) in [
        ('light', theme.light),
        ('dark', theme.dark),
      ]) {
        for (final (groundName, ground) in [
          ('background', brand.background),
          ('surface', brand.surface),
        ]) {
          test('$mode: text is legible on $groundName', () {
            _expectAtLeast('ink', brand.ink, ground, 4.5);
            _expectAtLeast('mutedInk', brand.mutedInk, ground, 4.5);
            _expectAtLeast('faintInk', brand.faintInk, ground, 3);
          });

          test('$mode: accents are legible on $groundName', () {
            _expectAtLeast('accent', brand.accent, ground, 4.5);
            _expectAtLeast('terracotta', brand.terracotta, ground, 4.5);
            _expectAtLeast('danger', brand.danger, ground, 4.5);
            _expectAtLeast('repost', brand.repost, ground, 3);
            _expectAtLeast('success', brand.success, ground, 3);
          });
        }

        test('$mode: a filled button carries its label', () {
          _expectAtLeast(
            'onAccentFill on accentFill',
            brand.onAccentFill,
            brand.accentFill,
            4.5,
          );
        });
      }

      test('the hero band carries white text', () {
        for (final stop in BrandGradients.heroRamp(theme.light)) {
          _expectAtLeast('white on hero', Colors.white, stop, 4.5);
        }
      });

      test('the night ground carries its highlight and accent', () {
        final night = theme.dark;
        _expectAtLeast(
          'highlight on nightGround',
          night.highlight,
          night.nightGround,
          4.5,
        );
        _expectAtLeast(
          'nightAccent on nightGround',
          night.nightAccent,
          night.nightGround,
          4.5,
        );
        _expectAtLeast(
          'nightAccent on heroMid',
          night.nightAccent,
          night.heroMid,
          3,
        );
        _expectAtLeast(
          'dark mutedInk on nightGround',
          night.mutedInk,
          night.nightGround,
          4.5,
        );
      });
    });
  }
}
