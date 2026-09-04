import 'package:flutter/material.dart';
import 'package:indigen_world_mobile/core/brand.dart';

/// The three pieces every settings page is built from.
///
/// Lifted out of `settings_screen.dart` when the notification controls moved to
/// a page of their own. Two screens drawing the same kind of list out of two
/// private copies of the same widgets is how one of them quietly stops looking
/// like the other — a divider indent here, a font weight there — and a member
/// notices that long before they could say why.

/// The small heading over a group.
class SettingsSectionLabel extends StatelessWidget {
  const SettingsSectionLabel(this.label, {super.key});

  final String label;

  @override
  Widget build(BuildContext context) => Text(
    label,
    style: TextStyle(
      // Muted, not accented. A green stamp over every group turned the section
      // headings into the loudest thing on a screen that is mostly reading.
      color: context.brand.mutedInk,
      fontSize: 11,
      fontWeight: FontWeight.w700,
      letterSpacing: 1.1,
    ),
  );
}

/// A card of rows, hairlined between.
class SettingsGroup extends StatelessWidget {
  const SettingsGroup({required this.children, super.key});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) => Card(
    child: Column(
      children: [
        for (var index = 0; index < children.length; index++) ...[
          if (index > 0) const Divider(height: 1, indent: 62),
          children[index],
        ],
      ],
    ),
  );
}

/// One row that goes somewhere.
class SettingsRow extends StatelessWidget {
  const SettingsRow({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
    this.enabled = true,
    this.destructive = false,
    super.key,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback? onTap;
  final bool enabled;
  final bool destructive;

  @override
  Widget build(BuildContext context) {
    final color = destructive ? context.brand.terracotta : context.brand.accent;
    return ListTile(
      enabled: enabled && onTap != null,
      minVerticalPadding: 12,
      leading: Icon(icon, color: color),
      title: Text(
        title,
        style: TextStyle(
          fontWeight: FontWeight.w700,
          color: destructive ? context.brand.terracotta : null,
        ),
      ),
      subtitle: Text(subtitle),
      trailing: const Icon(Icons.chevron_right_rounded),
      onTap: onTap,
    );
  }
}
