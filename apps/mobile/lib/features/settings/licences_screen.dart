import 'package:flutter/material.dart';
import 'package:indigen_world_mobile/core/brand.dart';

/// One licence the project publishes community content under.
class ContentLicence {
  const ContentLicence({
    required this.code,
    required this.name,
    required this.summary,
    required this.permissions,
    required this.conditions,
  });

  /// The value stored in `governance.licence` on published records.
  final String code;
  final String name;
  final String summary;
  final List<String> permissions;
  final List<String> conditions;
}

/// The licences the Firestore rules accept for publication, in the order they
/// are offered to contributors. Keep this list in step with
/// `publicationLicenceAllowed` in `firebase/firestore.rules`.
const contentLicences = <ContentLicence>[
  ContentLicence(
    code: 'community_restricted',
    name: 'Community restricted',
    summary:
        'Held by the contributing community. Shared inside Indigen World for '
        'learning, and not licensed for outside reuse without a separate '
        'agreement.',
    permissions: ['Learn from it in the app', 'Quote with attribution'],
    conditions: [
      'No commercial reuse',
      'No redistribution outside the community',
      'Community may withdraw consent at any time',
    ],
  ),
  ContentLicence(
    code: 'cc_by',
    name: 'Creative Commons Attribution 4.0 (CC BY 4.0)',
    summary:
        'Anyone may share and adapt the work, including commercially, as long '
        'as the contributor and community are credited.',
    permissions: ['Share', 'Adapt', 'Commercial use'],
    conditions: ['Credit the contributor and community', 'Note any changes'],
  ),
  ContentLicence(
    code: 'cc_by_sa',
    name: 'Creative Commons Attribution-ShareAlike 4.0 (CC BY-SA 4.0)',
    summary:
        'As CC BY, with the added requirement that adaptations carry the same '
        'licence so the work stays open.',
    permissions: ['Share', 'Adapt', 'Commercial use'],
    conditions: [
      'Credit the contributor and community',
      'Licence adaptations under CC BY-SA 4.0',
    ],
  ),
  ContentLicence(
    code: 'cc_by_nc',
    name: 'Creative Commons Attribution-NonCommercial 4.0 (CC BY-NC 4.0)',
    summary:
        'Share and adapt for non-commercial purposes with credit. Commercial '
        'use needs the community’s permission.',
    permissions: ['Share', 'Adapt', 'Educational use'],
    conditions: ['Credit the contributor and community', 'No commercial use'],
  ),
  ContentLicence(
    code: 'public_domain',
    name: 'Public domain',
    summary:
        'Released without restriction. Chosen only where the contributing '
        'community explicitly asked for it.',
    permissions: ['Any use'],
    conditions: ['Attribution appreciated but not required'],
  ),
];

/// Licences, in two parts: the licences community content is published under,
/// and the open-source licences of the software this app is built from.
class LicencesScreen extends StatelessWidget {
  const LicencesScreen({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Licences')),
    body: ListView(
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 40),
      children: [
        Text(
          'Every contribution carries a licence chosen by the person who '
          'shared it and the community it belongs to. Nothing is published '
          'without recorded consent and a licence.',
          style: TextStyle(color: context.brand.mutedInk, height: 1.5),
        ),
        const SizedBox(height: 22),
        const _SectionLabel('CONTENT LICENCES'),
        const SizedBox(height: 10),
        for (final licence in contentLicences) ...[
          _LicenceCard(licence: licence),
          const SizedBox(height: 12),
        ],
        const SizedBox(height: 14),
        const _SectionLabel('COMMUNITY POSTS'),
        const SizedBox(height: 10),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(18),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Posts you write',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                const SizedBox(height: 8),
                const Text(
                  'You keep ownership of what you post in the community feed. '
                  'By posting you give Indigen World permission to show it to '
                  'other members and to keep it available while your account '
                  'exists. Deleting a post withdraws that permission.',
                  style: TextStyle(height: 1.5),
                ),
                const SizedBox(height: 12),
                Text(
                  'Community posts are not automatically added to the '
                  'validated language record. Material only enters the '
                  'dictionary through the contribution flow, where a licence '
                  'and consent are recorded explicitly.',
                  style: TextStyle(height: 1.5, color: context.brand.mutedInk),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 26),
        const _SectionLabel('SOFTWARE'),
        const SizedBox(height: 10),
        Card(
          child: ListTile(
            minVerticalPadding: 14,
            leading: Icon(Icons.code_rounded, color: context.brand.accent),
            title: const Text(
              'Open-source licences',
              style: TextStyle(fontWeight: FontWeight.w700),
            ),
            subtitle: const Text(
              'The libraries this app is built from, and their licences',
            ),
            trailing: const Icon(Icons.chevron_right_rounded),
            onTap: () => showLicensePage(
              context: context,
              applicationName: 'Indigen World',
              applicationLegalese:
                  '© Indigen World · Project Kassena. Community content remains '
                  'the property of the communities that shared it.',
            ),
          ),
        ),
      ],
    ),
  );
}

class _SectionLabel extends StatelessWidget {
  const _SectionLabel(this.label);

  final String label;

  @override
  Widget build(BuildContext context) => Text(
    label,
    style: TextStyle(
      color: context.brand.accent,
      fontSize: 11,
      fontWeight: FontWeight.w900,
      letterSpacing: 1.2,
    ),
  );
}

class _LicenceCard extends StatelessWidget {
  const _LicenceCard({required this.licence});

  final ContentLicence licence;

  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(licence.name, style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 4),
          Text(
            licence.code,
            style: TextStyle(
              color: context.brand.mutedInk,
              fontSize: 11,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.4,
            ),
          ),
          const SizedBox(height: 10),
          Text(licence.summary, style: const TextStyle(height: 1.5)),
          const SizedBox(height: 14),
          Wrap(
            spacing: 7,
            runSpacing: 7,
            children: [
              for (final permission in licence.permissions)
                _Tag(
                  label: permission,
                  color: context.brand.success,
                  icon: Icons.check_rounded,
                ),
              for (final condition in licence.conditions)
                _Tag(
                  label: condition,
                  color: context.brand.terracotta,
                  icon: Icons.priority_high_rounded,
                ),
            ],
          ),
        ],
      ),
    ),
  );
}

class _Tag extends StatelessWidget {
  const _Tag({required this.label, required this.color, required this.icon});

  final String label;
  final Color color;
  final IconData icon;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
    decoration: BoxDecoration(
      color: color.withValues(alpha: 0.1),
      borderRadius: BorderRadius.circular(999),
    ),
    child: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 12, color: color),
        const SizedBox(width: 5),
        Text(
          label,
          style: TextStyle(
            color: color,
            fontSize: 11,
            fontWeight: FontWeight.w800,
          ),
        ),
      ],
    ),
  );
}
