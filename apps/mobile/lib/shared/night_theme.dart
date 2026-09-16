import 'package:flutter/material.dart';
import 'package:indigen_world_mobile/app/app_theme.dart';
import 'package:indigen_world_mobile/core/brand_themes.dart';

/// The surfaces that are night whatever the member's appearance choice is.
///
/// A full-bleed reel, Kawuri's fireside, the launch screen and the media
/// viewer are all cinemas rather than pages: they are dark because of what
/// they show, not because of a preference. Wrapping them in the dark theme is
/// what lets everything inside keep reading `context.brand` — text stays
/// legible, hairlines stay visible, and no widget needs an `onDark` flag
/// threaded down to it.
class NightTheme extends StatelessWidget {
  const NightTheme({required this.child, super.key});

  final Widget child;

  /// The night half of whichever theme the member is reading in, so a reel or
  /// Kawuri opened from a green app is green after dark too. The theme data is
  /// cached by [buildBrandTheme]: these screens rebuild on every frame of a
  /// video.
  @override
  Widget build(BuildContext context) => Theme(
    data: buildBrandTheme(ActiveBrandTheme.of(context), Brightness.dark),
    child: child,
  );
}
