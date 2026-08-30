import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/community/data/kasem_names.dart';
import 'package:indigen_world_mobile/features/community/widgets/community_avatar.dart';

/// The offer behind the kente ring.
///
/// The ring on its own is a reward nobody knows how to earn. This is the part
/// that says so, and it sits directly above the handle field where the decision
/// is actually made — a member who has already typed something is far less
/// likely to change it than one who has not typed anything yet.
///
/// Names are shown with what they mean where the project has recorded one, and
/// without a gloss where it has not. An invented meaning would be worse than no
/// meaning at all.
class KasemNamePanel extends ConsumerWidget {
  const KasemNamePanel({
    required this.currentHandle,
    required this.onPick,
    this.title = 'Take a Kassena name',
    super.key,
  });

  /// What is in the handle field now, so the panel can show it as taken.
  final String currentHandle;

  /// Called with the folded ASCII form, ready to go into a handle field.
  final ValueChanged<String> onPick;

  final String title;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final brand = context.brand;
    final names = ref.watch(kasemNamesProvider);
    if (names.isEmpty) return const SizedBox.shrink();
    final chosen = foldKasemToAscii(currentHandle);

    return Container(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
      decoration: BoxDecoration(
        color: brand.surfaceMuted,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: brand.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              // The reward, shown rather than described. It is drawn around the
              // dotted stand-in for a photograph, which is what most people
              // will have when they read this.
              const CommunityAvatar(initials: '··', size: 38, kasem: true),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: TextStyle(
                        color: brand.ink,
                        fontSize: 15,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      'A handle that carries one wears the kente ring.',
                      style: TextStyle(color: brand.mutedInk, fontSize: 12.5),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          // One scrolling line rather than a wrapped block. A curated list can
          // grow to fifty names, and fifty chips would push the handle field
          // this panel is meant to serve off the bottom of the screen.
          SizedBox(
            height: 36,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: names.length,
              separatorBuilder: (context, index) => const SizedBox(width: 8),
              itemBuilder: (context, index) {
                final name = names[index];
                return _NameChip(
                  name: name,
                  selected: chosen == name.ascii,
                  onTap: () {
                    HapticFeedback.selectionClick();
                    onPick(name.ascii);
                  },
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _NameChip extends StatelessWidget {
  const _NameChip({
    required this.name,
    required this.selected,
    required this.onTap,
  });

  final KasemName name;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return Semantics(
      button: true,
      selected: selected,
      label: name.meaning.isEmpty
          ? name.name
          : '${name.name}, ${name.meaning}',
      excludeSemantics: true,
      child: Tooltip(
        // The meaning belongs on the chip somewhere, and there is no room for
        // it beside eight others.
        message: name.meaning.isEmpty ? name.name : name.meaning,
        child: Material(
          color: selected ? brand.accentSoft : brand.surface,
          borderRadius: BorderRadius.circular(999),
          child: InkWell(
            borderRadius: BorderRadius.circular(999),
            onTap: onTap,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 8),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(999),
                border: Border.all(
                  color: selected ? brand.accent : brand.border,
                  width: selected ? 1.6 : 1,
                ),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (selected) ...[
                    Icon(
                      Icons.check_rounded,
                      size: 14,
                      color: brand.accent,
                    ),
                    const SizedBox(width: 5),
                  ],
                  Text(
                    // Written properly, with the letters a handle cannot hold.
                    // What goes into the field is the folded form, and the
                    // difference is the whole reason the ring exists.
                    name.name,
                    style: TextStyle(
                      color: brand.ink,
                      fontSize: 13.5,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
