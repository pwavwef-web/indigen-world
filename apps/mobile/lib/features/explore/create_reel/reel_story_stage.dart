import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/community/communities/community_space_widgets.dart';
import 'package:indigen_world_mobile/features/community/data/community_space_models.dart';
import 'package:indigen_world_mobile/features/community/data/community_space_providers.dart';
import 'package:indigen_world_mobile/features/community/data/reel_post_details.dart';
import 'package:indigen_world_mobile/features/explore/create_reel/reel_draft.dart';
import 'package:indigen_world_mobile/features/explore/create_reel/reel_editor_controller.dart';
import 'package:indigen_world_mobile/features/explore/create_reel/reel_ui.dart';
import 'package:indigen_world_mobile/shared/glass_popup.dart';
import 'package:indigen_world_mobile/shared/glass_surface.dart';

/// Stage two of a new reel: what it means.
///
/// ── Caption and context are different things ─────────────────────────────
/// The caption is what everyone reads over the video. "What is happening?" is
/// the longer account — who, where, the occasion, why it matters — that opens
/// in Explore's Context sheet for whoever wants it. Asking for both keeps the
/// public line short without losing the explanation that makes a cultural
/// recording legible to someone outside it.
///
/// A view over [ReelEditorController]: the text fields' controllers and every
/// choice live there, so moving between stages loses nothing.
class ReelStoryStage extends ConsumerWidget {
  const ReelStoryStage({required this.controller, super.key});

  final ReelEditorController controller;

  @override
  Widget build(BuildContext context, WidgetRef ref) => ListenableBuilder(
    listenable: controller,
    builder: (context, _) {
      final draft = controller.draft;
      final limits = controller.limits;
      final locked = controller.locked;
      String? issue(ReelField field) => controller.issueFor(field)?.message;
      return ListView(
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        padding: const EdgeInsets.fromLTRB(
          kReelStagePadding,
          12,
          kReelStagePadding,
          28,
        ),
        children: [
          _Header(draft: draft),
          const SizedBox(height: 18),
          TextField(
            controller: controller.captionText,
            enabled: !locked,
            minLines: 3,
            maxLines: 8,
            keyboardType: TextInputType.multiline,
            textInputAction: TextInputAction.newline,
            maxLength: limits.maxCaptionLength,
            maxLengthEnforcement: MaxLengthEnforcement.enforced,
            textCapitalization: TextCapitalization.sentences,
            style: const TextStyle(color: Colors.white, height: 1.35),
            cursorColor: context.brand.gold,
            decoration: reelInputDecoration(
              context,
              label: 'Caption (optional)',
              hint: 'What would you like people to read?',
              error: issue(ReelField.caption),
            ),
          ),
          const SizedBox(height: 10),
          ReelSection(
            title: 'Topic',
            subtitle: 'Choose the closest match.',
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    for (final topic in ReelTopic.values)
                      Semantics(
                        inMutuallyExclusiveGroup: true,
                        selected: draft.topic == topic,
                        child: GlassPill(
                          label: topic.label,
                          icon: reelTopicIcon(topic),
                          onDark: true,
                          selected: draft.topic == topic,
                          onTap: locked
                              ? null
                              : () => controller.setTopic(topic),
                        ),
                      ),
                  ],
                ),
                if (issue(ReelField.topic) case final message?)
                  ReelIssueText(message),
              ],
            ),
          ),
          const SizedBox(height: 12),
          _CommunitySection(controller: controller),
          const SizedBox(height: 12),
          ReelSection(
            title: 'What is happening?',
            subtitle:
                'Explain what is shown — who is taking part, where and when, '
                "the occasion, and why it matters. This appears in Explore's "
                'Context panel, not in your caption.',
            child: TextField(
              controller: controller.contextText,
              enabled: !locked,
              minLines: 4,
              maxLines: 10,
              keyboardType: TextInputType.multiline,
              textInputAction: TextInputAction.newline,
              maxLength: limits.maxContextLength,
              maxLengthEnforcement: MaxLengthEnforcement.enforced,
              textCapitalization: TextCapitalization.sentences,
              style: const TextStyle(color: Colors.white, height: 1.35),
              cursorColor: context.brand.gold,
              decoration: reelInputDecoration(
                context,
                hint:
                    'For example: elders of Paga perform the harvest dance at '
                    'the start of the festival…',
                error: issue(ReelField.context),
              ),
            ),
          ),
          const SizedBox(height: 12),
          _AttributionSection(controller: controller),
          const SizedBox(height: 12),
          _RightsSection(controller: controller),
        ],
      );
    },
  );
}

class _Header extends StatelessWidget {
  const _Header({required this.draft});

  final ReelDraft draft;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 64,
          height: 112,
          foregroundDecoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: Colors.white24),
          ),
          decoration: BoxDecoration(
            color: Colors.black,
            borderRadius: BorderRadius.circular(12),
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(12),
            child: Stack(
              fit: StackFit.expand,
              children: [
                ReelCoverImage(
                  path: draft.coverPath,
                  decodeWidth: (64 * MediaQuery.devicePixelRatioOf(context))
                      .round(),
                ),
                Positioned(
                  left: 4,
                  right: 4,
                  bottom: 4,
                  child: Center(
                    child: FittedBox(
                      child: ReelDurationBadge(draft.selectedDuration),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(width: 14),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Semantics(
                header: true,
                child: const Text(
                  'Give this reel meaning',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 21,
                    height: 1.2,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
              const SizedBox(height: 6),
              Text(
                'Your caption is public. The details below help people '
                'understand what they are watching.',
                style: TextStyle(
                  color: brand.mutedInk,
                  fontSize: 13,
                  height: 1.4,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

// ── Community ───────────────────────────────────────────────────────────────

class _CommunitySection extends StatelessWidget {
  const _CommunitySection({required this.controller});

  final ReelEditorController controller;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final community = controller.draft.community;
    final issue = controller.issueFor(ReelField.community);
    final (icon, title, detail) = switch (community) {
      null => (
        Icons.public_rounded,
        'No community',
        'Shown in Explore and the main feed',
      ),
      PostCommunityStamp(isPrivate: false) => (
        Icons.diversity_3_rounded,
        community.name,
        'Public community · also shown in Explore and the feed',
      ),
      _ => (
        Icons.lock_outline_rounded,
        community.name,
        'Private community · only its members will see it. It will not '
            'appear in Explore.',
      ),
    };
    return ReelSection(
      title: 'Community',
      subtitle: 'Where this reel will be posted.',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Icon(icon, color: brand.gold, size: 22),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 14.5,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      detail,
                      style: TextStyle(
                        color: brand.mutedInk,
                        fontSize: 12.5,
                        height: 1.35,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 6),
              TextButton(
                onPressed: controller.locked
                    ? null
                    : () => showReelCommunityPicker(context, controller),
                style: TextButton.styleFrom(
                  foregroundColor: brand.gold,
                  minimumSize: const Size(48, 48),
                ),
                child: Text(community == null ? 'Choose' : 'Change'),
              ),
            ],
          ),
          if (issue != null) ReelIssueText(issue.message),
        ],
      ),
    );
  }
}

/// Picks one of the member's communities, or none.
///
/// Only communities with an *active* membership are offered — a private one
/// the member has asked to join and is waiting on never appears — and the
/// publisher asks the server again before anything is written.
Future<void> showReelCommunityPicker(
  BuildContext context,
  ReelEditorController controller,
) async {
  final chosen = await showGlassPopup<_CommunityChoice>(
    context: context,
    title: 'Post in a community',
    subtitle: 'Only communities you have joined are listed.',
    scrollable: false,
    builder: (context) =>
        _CommunityPickerBody(selected: controller.draft.community?.id),
  );
  if (chosen == null) return;
  final space = chosen.space;
  controller.setCommunity(
    space == null
        ? null
        : PostCommunityStamp(
            id: space.id,
            name: space.name,
            isPrivate: space.isPrivate,
          ),
  );
}

class _CommunityChoice {
  const _CommunityChoice(this.space);

  final CommunitySpace? space;
}

class _CommunityPickerBody extends ConsumerStatefulWidget {
  const _CommunityPickerBody({required this.selected});

  final String? selected;

  @override
  ConsumerState<_CommunityPickerBody> createState() =>
      _CommunityPickerBodyState();
}

class _CommunityPickerBodyState extends ConsumerState<_CommunityPickerBody> {
  final _search = TextEditingController();

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final joined = ref.watch(joinedCommunitiesProvider);
    final query = _search.text.trim();
    final maxHeight = MediaQuery.sizeOf(context).height * 0.5;
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        TextField(
          controller: _search,
          onChanged: (_) => setState(() {}),
          textInputAction: TextInputAction.search,
          decoration: reelInputDecoration(
            context,
            hint: 'Search your communities',
          ).copyWith(prefixIcon: const Icon(Icons.search_rounded)),
        ),
        const SizedBox(height: 10),
        // Flexible so the list scrolls inside whatever height the popup has
        // left on a short phone, rather than pushing past it.
        Flexible(
          child: ConstrainedBox(
            constraints: BoxConstraints(maxHeight: maxHeight),
            child: joined.when(
              loading: () => const Padding(
                padding: EdgeInsets.all(24),
                child: Center(child: CircularProgressIndicator()),
              ),
              error: (_, _) => ListView(
                shrinkWrap: true,
                children: [
                  _noneRow(context),
                  const Padding(
                    padding: EdgeInsets.only(top: 8),
                    child: ReelBanner(
                      isError: true,
                      message:
                          'Your communities could not be loaded. You can still '
                          'publish without one.',
                    ),
                  ),
                ],
              ),
              data: (spaces) {
                final matches = [
                  for (final space in spaces)
                    if (query.isEmpty ||
                        communityMatchesQuery(space, query) ||
                        space.name.toLowerCase().contains(query.toLowerCase()))
                      space,
                ];
                return ListView(
                  shrinkWrap: true,
                  children: [
                    if (query.isEmpty) _noneRow(context),
                    if (spaces.isEmpty)
                      Padding(
                        padding: const EdgeInsets.all(12),
                        child: Text(
                          'You have not joined any communities yet.',
                          style: TextStyle(color: brand.mutedInk),
                        ),
                      )
                    else if (matches.isEmpty)
                      Padding(
                        padding: const EdgeInsets.all(12),
                        child: Text(
                          'None of your communities match "$query".',
                          style: TextStyle(color: brand.mutedInk),
                        ),
                      ),
                    for (final space in matches) _spaceRow(context, space),
                  ],
                );
              },
            ),
          ),
        ),
      ],
    );
  }

  Widget _noneRow(BuildContext context) => _PickerRow(
    selected: widget.selected == null,
    leading: const SizedBox.square(
      dimension: 40,
      child: Icon(Icons.public_rounded, size: 26),
    ),
    title: 'No community',
    detail: 'Explore and the main feed',
    onTap: () => Navigator.of(context).pop(const _CommunityChoice(null)),
  );

  Widget _spaceRow(BuildContext context, CommunitySpace space) => _PickerRow(
    selected: widget.selected == space.id,
    leading: CommunitySpaceAvatar(space: space, size: 40),
    title: space.name,
    detail: [
      space.isPrivate ? 'Private · not in Explore' : 'Public',
      '${space.memberCount} member${space.memberCount == 1 ? '' : 's'}',
    ].join(' · '),
    trailingIcon: space.isPrivate ? Icons.lock_outline_rounded : null,
    onTap: () => Navigator.of(context).pop(_CommunityChoice(space)),
  );
}

class _PickerRow extends StatelessWidget {
  const _PickerRow({
    required this.selected,
    required this.leading,
    required this.title,
    required this.detail,
    required this.onTap,
    this.trailingIcon,
  });

  final bool selected;
  final Widget leading;
  final String title;
  final String detail;
  final IconData? trailingIcon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return Semantics(
      button: true,
      selected: selected,
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 8),
          child: Row(
            children: [
              leading,
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: TextStyle(
                        color: brand.ink,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    Text(
                      detail,
                      style: TextStyle(color: brand.mutedInk, fontSize: 12.5),
                    ),
                  ],
                ),
              ),
              if (trailingIcon != null)
                Icon(trailingIcon, size: 18, color: brand.mutedInk),
              if (selected) ...[
                const SizedBox(width: 6),
                Icon(Icons.check_circle_rounded, color: brand.accent),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

// ── Attribution ─────────────────────────────────────────────────────────────

class _AttributionSection extends StatelessWidget {
  const _AttributionSection({required this.controller});

  final ReelEditorController controller;

  @override
  Widget build(BuildContext context) {
    final draft = controller.draft;
    final locked = controller.locked;
    final limits = controller.limits;
    return ReelSection(
      title: 'Who made this?',
      subtitle: 'Credit the people behind the media.',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SegmentedButton<bool>(
            showSelectedIcon: false,
            style: SegmentedButton.styleFrom(
              foregroundColor: Colors.white,
              selectedForegroundColor: BrandColors.nightInk,
              selectedBackgroundColor: context.brand.gold,
              side: const BorderSide(color: Colors.white30),
              minimumSize: const Size(0, 48),
            ),
            segments: const [
              ButtonSegment(value: true, label: Text('I made it')),
              ButtonSegment(value: false, label: Text('Someone else')),
            ],
            selected: {draft.ownWork},
            onSelectionChanged: locked
                ? null
                : (value) => controller.setOwnWork(value.first),
          ),
          const SizedBox(height: 14),
          TextField(
            controller: controller.originalCreatorText,
            enabled: !locked,
            maxLength: limits.maxCreditLength,
            textCapitalization: TextCapitalization.words,
            style: const TextStyle(color: Colors.white),
            cursorColor: context.brand.gold,
            decoration: reelInputDecoration(
              context,
              label: 'Original creator',
              helper: draft.ownWork
                  ? 'Pre-filled with your name. Change it if you are credited '
                        'differently.'
                  : 'The person or group who created the media.',
              error: controller.issueFor(ReelField.originalCreator)?.message,
            ),
          ),
          const SizedBox(height: 8),
          TextField(
            controller: controller.sourceOrganisationText,
            enabled: !locked,
            maxLength: limits.maxCreditLength,
            textCapitalization: TextCapitalization.words,
            style: const TextStyle(color: Colors.white),
            cursorColor: context.brand.gold,
            decoration: reelInputDecoration(
              context,
              label: 'Source organisation or community (optional)',
              helper: 'For example the archive, school or family it came from.',
              error: controller.issueFor(ReelField.sourceOrganisation)?.message,
            ),
          ),
        ],
      ),
    );
  }
}

// ── Rights ──────────────────────────────────────────────────────────────────

class _RightsSection extends StatelessWidget {
  const _RightsSection({required this.controller});

  final ReelEditorController controller;

  static String _description(ReelRights rights) => switch (rights) {
    ReelRights.created => 'You filmed or made this yourself.',
    ReelRights.permission =>
      'The creator or rights holder agreed to you publishing it.',
    ReelRights.lawfulReuse =>
      'It is public domain or under a licence that allows reuse.',
  };

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final draft = controller.draft;
    final issue = controller.issueFor(ReelField.rights);
    return ReelSection(
      title: 'Your right to publish',
      subtitle: 'Publishing needs one of these.',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          for (final rights in ReelRights.values)
            _RightsRow(
              label: rights.label,
              description: rights == ReelRights.created && !draft.ownWork
                  ? 'Not available: you said someone else made this media.'
                  : _description(rights),
              selected: draft.rights == rights,
              enabled:
                  !controller.locked &&
                  (rights != ReelRights.created || draft.ownWork),
              onTap: () => controller.setRights(rights),
            ),
          if (issue != null) ReelIssueText(issue.message),
          const SizedBox(height: 4),
          Text(
            'False declarations can lead to the reel being removed.',
            style: TextStyle(color: brand.faintInk, fontSize: 12, height: 1.35),
          ),
        ],
      ),
    );
  }
}

class _RightsRow extends StatelessWidget {
  const _RightsRow({
    required this.label,
    required this.description,
    required this.selected,
    required this.enabled,
    required this.onTap,
  });

  final String label;
  final String description;
  final bool selected;
  final bool enabled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final colour = enabled ? Colors.white : Colors.white38;
    return Semantics(
      inMutuallyExclusiveGroup: true,
      checked: selected,
      button: true,
      enabled: enabled,
      label: '$label. $description',
      excludeSemantics: true,
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: enabled ? onTap : null,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 8),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: const EdgeInsets.only(top: 1),
                child: Icon(
                  selected
                      ? Icons.radio_button_checked_rounded
                      : Icons.radio_button_unchecked_rounded,
                  color: selected ? brand.gold : colour,
                  size: 24,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      label,
                      style: TextStyle(
                        color: colour,
                        fontSize: 14.5,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      description,
                      style: TextStyle(
                        color: enabled ? brand.mutedInk : Colors.white30,
                        fontSize: 12.5,
                        height: 1.35,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
