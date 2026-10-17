import 'package:flutter/material.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/shared/kassena_pattern.dart';

/// The header a channel with its own rail opens on: the hero band Music
/// opens on, collapsing into a bar as the page scrolls.
///
/// ── Why this is shared and Music's is not ─────────────────────────────────
/// Music's stage is coloured by whatever is playing and carries a play button;
/// none of that belongs to a shop or a reading room. What they do share is the
/// shape — the brand's deep hero gradient, the Kassena frieze along its foot,
/// a title that hands itself to the toolbar as it leaves — and the one rule
/// that makes a channel feel like part of the app instead of a page bolted on
/// to it: the same ground, the same type, the same rail underneath.
///
/// [bottom] stays pinned under the toolbar once the stage has gone. That is
/// where a channel puts the control people reach for mid-scroll — the shop's
/// search, for instance — so it never has to be scrolled back to.
class ChannelStageDelegate extends SliverPersistentHeaderDelegate {
  ChannelStageDelegate({
    required this.title,
    required this.topPadding,
    required this.textScale,
    this.eyebrow,
    this.subtitle,
    this.accent,
    this.actions = const [],
    this.bottom,
    this.bottomHeight = 0,
    this.stageHeight = 118,
  });

  final String title;
  final String? eyebrow;
  final String? subtitle;

  /// Mixed into the hero gradient; the theme's accent when null.
  final Color? accent;
  final List<Widget> actions;
  final Widget? bottom;
  final double bottomHeight;
  final double stageHeight;
  final double topPadding;
  final double textScale;

  static const double toolbarHeight = 56;
  static const double _frieze = 34;

  @override
  double get minExtent => topPadding + toolbarHeight + bottomHeight;

  @override
  double get maxExtent =>
      topPadding + toolbarHeight + stageHeight * textScale + bottomHeight;

  @override
  Widget build(
    BuildContext context,
    double shrinkOffset,
    bool overlapsContent,
  ) {
    final brand = context.brand;
    final range = maxExtent - minExtent;
    final collapse = range <= 0 ? 1.0 : (shrinkOffset / range).clamp(0.0, 1.0);
    final tint = accent ?? brand.accent;
    final contentOpacity = (1 - collapse * 1.6).clamp(0.0, 1.0);
    final canPop = Navigator.of(context).canPop();

    return DecoratedBox(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            brand.heroDeep,
            Color.lerp(brand.heroDeep, tint, 0.55)!,
            Color.lerp(tint, brand.heroLit, 0.3)!,
          ],
          stops: const [0, 0.6, 1],
        ),
        boxShadow: collapse > 0.98
            ? [
                BoxShadow(
                  color: brand.shadow.withValues(alpha: 0.18),
                  blurRadius: 14,
                  offset: const Offset(0, 4),
                ),
              ]
            : null,
      ),
      child: ClipRect(
        child: Stack(
          fit: StackFit.expand,
          children: [
            Positioned(
              left: 0,
              right: 0,
              bottom: bottomHeight,
              height: _frieze,
              child: Opacity(
                opacity: (1 - collapse).clamp(0.0, 1.0),
                child: KassenaBand(
                  tint: brand.highlight,
                  opacity: 0.14,
                  moving: false,
                ),
              ),
            ),
            if (contentOpacity > 0)
              Positioned(
                left: 20,
                right: 20,
                top: topPadding + toolbarHeight - 4 - shrinkOffset * 0.45,
                child: Opacity(
                  opacity: contentOpacity,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      if (eyebrow != null)
                        Text(
                          eyebrow!.toUpperCase(),
                          style: TextStyle(
                            color: Colors.white.withValues(alpha: 0.74),
                            fontSize: 10.5,
                            fontWeight: FontWeight.w900,
                            letterSpacing: 1.3,
                          ),
                        ),
                      const SizedBox(height: 4),
                      Text(
                        title,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 28,
                          height: 1.08,
                          fontWeight: FontWeight.w900,
                          letterSpacing: -0.8,
                        ),
                      ),
                      if (subtitle != null) ...[
                        const SizedBox(height: 6),
                        Text(
                          subtitle!,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            color: Colors.white.withValues(alpha: 0.82),
                            fontSize: 13.5,
                            height: 1.3,
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              ),
            Positioned(
              left: 4,
              right: 4,
              top: topPadding,
              height: toolbarHeight,
              child: IconButtonTheme(
                data: IconButtonThemeData(
                  style: IconButton.styleFrom(foregroundColor: Colors.white),
                ),
                child: Row(
                  children: [
                    if (canPop)
                      const BackButton(color: Colors.white)
                    else
                      const SizedBox(width: 12),
                    Expanded(
                      child: Opacity(
                        opacity: ((collapse - 0.55) / 0.45).clamp(0.0, 1.0),
                        child: Text(
                          title,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 17,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ),
                    ),
                    ...actions,
                  ],
                ),
              ),
            ),
            if (bottom != null)
              Positioned(
                left: 0,
                right: 0,
                bottom: 0,
                height: bottomHeight,
                child: bottom!,
              ),
          ],
        ),
      ),
    );
  }

  @override
  bool shouldRebuild(ChannelStageDelegate oldDelegate) => true;
}

/// A section heading inside a channel: a small terracotta line, then the
/// title — the same pair Music's shelves use.
class ChannelSectionHeader extends StatelessWidget {
  const ChannelSectionHeader({
    required this.title,
    this.eyebrow,
    this.action,
    this.onAction,
    this.padding = const EdgeInsets.fromLTRB(18, 24, 8, 10),
    super.key,
  });

  final String title;
  final String? eyebrow;
  final String? action;
  final VoidCallback? onAction;
  final EdgeInsets padding;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return Padding(
      padding: padding,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Expanded(
            child: Semantics(
              header: true,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (eyebrow != null)
                    Text(
                      eyebrow!.toUpperCase(),
                      style: TextStyle(
                        color: brand.terracotta,
                        fontSize: 10,
                        fontWeight: FontWeight.w900,
                        letterSpacing: 1.1,
                      ),
                    ),
                  Text(
                    title,
                    style: TextStyle(
                      color: brand.ink,
                      fontSize: 20,
                      fontWeight: FontWeight.w900,
                      letterSpacing: -0.4,
                    ),
                  ),
                ],
              ),
            ),
          ),
          if (action != null && onAction != null)
            TextButton(onPressed: onAction, child: Text(action!)),
        ],
      ),
    );
  }
}

/// The search pill that sits pinned under a channel stage.
class ChannelSearchPill extends StatelessWidget {
  const ChannelSearchPill({
    required this.controller,
    required this.hint,
    required this.onChanged,
    this.onClear,
    this.trailing,
    super.key,
  });

  final TextEditingController controller;
  final String hint;
  final ValueChanged<String> onChanged;
  final VoidCallback? onClear;
  final Widget? trailing;

  static const double height = 64;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
      child: Row(
        children: [
          Expanded(
            child: Material(
              color: brand.surface,
              elevation: 0,
              borderRadius: BorderRadius.circular(16),
              child: SizedBox(
                height: 48,
                child: ValueListenableBuilder<TextEditingValue>(
                  valueListenable: controller,
                  builder: (context, value, _) => TextField(
                    controller: controller,
                    onChanged: onChanged,
                    textInputAction: TextInputAction.search,
                    style: TextStyle(color: brand.ink, fontSize: 15),
                    decoration: InputDecoration(
                      hintText: hint,
                      hintStyle: TextStyle(color: brand.mutedInk),
                      filled: false,
                      isDense: true,
                      border: InputBorder.none,
                      enabledBorder: InputBorder.none,
                      focusedBorder: InputBorder.none,
                      contentPadding: const EdgeInsets.symmetric(vertical: 14),
                      prefixIcon: Icon(
                        Icons.search_rounded,
                        color: brand.mutedInk,
                      ),
                      suffixIcon: value.text.isEmpty
                          ? null
                          : IconButton(
                              tooltip: 'Clear search',
                              onPressed: onClear,
                              icon: Icon(
                                Icons.close_rounded,
                                color: brand.mutedInk,
                              ),
                            ),
                    ),
                  ),
                ),
              ),
            ),
          ),
          if (trailing != null) ...[const SizedBox(width: 10), trailing!],
        ],
      ),
    );
  }
}
