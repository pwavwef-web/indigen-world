import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/community/community_actions.dart';
import 'package:indigen_world_mobile/features/community/data/community_providers.dart';
import 'package:indigen_world_mobile/features/community/data/community_repository.dart';
import 'package:indigen_world_mobile/features/community/data/community_space_models.dart';
import 'package:indigen_world_mobile/features/community/data/community_space_providers.dart';
import 'package:indigen_world_mobile/features/explore/explore_analytics.dart';
import 'package:indigen_world_mobile/features/explore/reel_view.dart';
import 'package:indigen_world_mobile/shared/glass_popup.dart';

/// What sits at the lower left of a reel: where it was posted, what it is, who
/// made it, what they said about it, what you are hearing, and how many have
/// watched.
///
/// ── Sized as reading, not as a poster ───────────────────────────────────────
/// The caption used to be set at 34 points in black weight — a headline over
/// the video that on a long title covered a third of the frame. It is body text
/// now, two lines until the member asks for more, and it folds back the moment
/// they move on so the next reel does not open behind the last one's words.
class ReelDetails extends StatefulWidget {
  const ReelDetails({
    required this.reel,
    required this.displayName,
    required this.handle,
    required this.isActive,
    required this.viewCount,
    required this.soundMuted,
    required this.onOpenCreator,
    required this.onOpenCommunity,
    required this.onToggleSound,
    this.onTranslate,
    this.onCommunityJoined,
    super.key,
  });

  final Reel reel;
  final String displayName;

  /// Without the @. Empty when none is known.
  final String handle;

  final bool isActive;
  final int viewCount;
  final bool soundMuted;
  final VoidCallback onOpenCreator;
  final VoidCallback onOpenCommunity;
  final VoidCallback onToggleSound;

  /// Null when there is nothing to translate.
  final VoidCallback? onTranslate;

  final ValueChanged<MembershipStatus>? onCommunityJoined;

  @override
  State<ReelDetails> createState() => _ReelDetailsState();
}

class _ReelDetailsState extends State<ReelDetails> {
  var _expanded = false;

  @override
  void didUpdateWidget(ReelDetails oldWidget) {
    super.didUpdateWidget(oldWidget);
    if ((!widget.isActive && _expanded) ||
        oldWidget.reel.id != widget.reel.id) {
      _expanded = false;
    }
  }

  @override
  Widget build(BuildContext context) {
    final reel = widget.reel;
    final brand = context.brand;
    final category = [
      reel.categoryLabel,
      if (reel.languageLabel.isNotEmpty && !reel.isSponsored)
        reel.languageLabel.toUpperCase(),
    ].join(' · ');

    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (reel.community case final community? when !reel.isSponsored) ...[
          ReelCommunityRow(
            stamp: community,
            onOpen: widget.onOpenCommunity,
            onJoined: widget.onCommunityJoined,
          ),
          const SizedBox(height: 8),
        ],
        Text(
          category,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: TextStyle(
            color: brand.gold,
            fontSize: 11,
            height: 1.2,
            fontWeight: FontWeight.w800,
            letterSpacing: 1.1,
            shadows: const [Shadow(blurRadius: 10, color: Colors.black)],
          ),
        ),
        if (!reel.isSponsored) ...[
          const SizedBox(height: 5),
          _Byline(
            name: widget.displayName,
            handle: widget.handle,
            onTap: widget.onOpenCreator,
          ),
        ],
        ..._caption(context),
        if (widget.onTranslate case final translate?) ...[
          const SizedBox(height: 2),
          _InlineLink(
            icon: Icons.translate_rounded,
            label: 'See translation',
            onTap: translate,
          ),
        ],
        if (!reel.isSponsored) ...[
          const SizedBox(height: 4),
          _SoundRow(
            sound: reel.sound,
            playsSound: reel.isVideo,
            muted: widget.soundMuted,
            onToggle: widget.onToggleSound,
          ),
        ],
        if (widget.viewCount > 0 && !reel.isSponsored)
          Padding(
            padding: const EdgeInsets.only(top: 2),
            child: Text(
              '${reelCountLabel(widget.viewCount)} '
              '${widget.viewCount == 1 ? 'view' : 'views'}',
              style: const TextStyle(
                color: Colors.white70,
                fontSize: 12,
                fontWeight: FontWeight.w600,
                shadows: [Shadow(blurRadius: 8, color: Colors.black)],
              ),
            ),
          ),
      ],
    );
  }

  /// The caption, with a published piece's title leading it in bold.
  ///
  /// A published piece has a title *and* a description; a community post has
  /// only what its author wrote, which [Reel.fromCommunityPost] carries as both
  /// fields — so the title is only drawn when it says something the caption
  /// does not, and nothing is ever written twice.
  List<Widget> _caption(BuildContext context) {
    final reel = widget.reel;
    final caption = reel.caption.trim();
    final title = reel.title.trim();
    final showTitle =
        title.isNotEmpty &&
        title != caption &&
        !caption.toLowerCase().startsWith(title.toLowerCase());
    if (caption.isEmpty && !showTitle) return const [];

    const style = TextStyle(
      color: Colors.white,
      fontSize: 14.5,
      height: 1.38,
      shadows: [Shadow(blurRadius: 10, color: Colors.black)],
    );
    final span = TextSpan(
      style: style,
      children: [
        if (showTitle)
          TextSpan(
            text: caption.isEmpty ? title : '$title  ',
            style: const TextStyle(fontWeight: FontWeight.w800),
          ),
        if (caption.isNotEmpty) TextSpan(text: caption),
      ],
    );

    return [
      const SizedBox(height: 4),
      LayoutBuilder(
        builder: (context, constraints) {
          // Measured in the same font the Text below will inherit, or a line
          // that wraps on screen could count as fitting here.
          final painter = TextPainter(
            text: TextSpan(
              style: DefaultTextStyle.of(context).style,
              children: [span],
            ),
            maxLines: 2,
            textDirection: Directionality.of(context),
            textScaler: MediaQuery.textScalerOf(context),
          )..layout(maxWidth: constraints.maxWidth);
          final overflows = painter.didExceedMaxLines;
          painter.dispose();

          if (_expanded) {
            // Capped and scrollable, so an essay of a caption can be read in
            // full without ever becoming a wall over the whole frame.
            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                ConstrainedBox(
                  constraints: BoxConstraints(
                    maxHeight: MediaQuery.sizeOf(context).height * 0.3,
                  ),
                  child: SingleChildScrollView(child: Text.rich(span)),
                ),
                _InlineLink(
                  label: 'less',
                  onTap: () => setState(() => _expanded = false),
                ),
              ],
            );
          }
          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text.rich(span, maxLines: 2, overflow: TextOverflow.ellipsis),
              if (overflows)
                _InlineLink(
                  label: 'more',
                  onTap: () {
                    HapticFeedback.selectionClick();
                    setState(() => _expanded = true);
                  },
                ),
            ],
          );
        },
      ),
    ];
  }
}

class _Byline extends StatelessWidget {
  const _Byline({
    required this.name,
    required this.handle,
    required this.onTap,
  });

  final String name;
  final String handle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Semantics(
    button: true,
    label: handle.isEmpty ? 'By $name' : 'By $name, @$handle',
    excludeSemantics: true,
    child: GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: onTap,
      child: ConstrainedBox(
        constraints: const BoxConstraints(minHeight: 28),
        child: Align(
          alignment: Alignment.centerLeft,
          widthFactor: 1,
          child: Text.rich(
            TextSpan(
              children: [
                TextSpan(
                  text: name,
                  style: const TextStyle(
                    fontSize: 15.5,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                if (handle.isNotEmpty)
                  TextSpan(
                    text: '  @$handle',
                    style: const TextStyle(
                      color: Colors.white70,
                      fontSize: 13.5,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
              ],
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              color: Colors.white,
              shadows: [Shadow(blurRadius: 10, color: Colors.black)],
            ),
          ),
        ),
      ),
    ),
  );
}

/// A small text action under the caption: more, less, See translation.
class _InlineLink extends StatelessWidget {
  const _InlineLink({required this.label, required this.onTap, this.icon});

  final String label;
  final IconData? icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Semantics(
    button: true,
    label: label,
    excludeSemantics: true,
    child: GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 7),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (icon != null) ...[
              Icon(icon, size: 15, color: Colors.white),
              const SizedBox(width: 5),
            ],
            Text(
              label,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 13,
                fontWeight: FontWeight.w800,
                shadows: [Shadow(blurRadius: 8, color: Colors.black)],
              ),
            ),
          ],
        ),
      ),
    ),
  );
}

/// What is playing, and the switch for hearing it.
///
/// The speaker lives on the sound line because that is the line about sound.
/// Muting here mutes every reel after it, until it is switched back.
class _SoundRow extends StatelessWidget {
  const _SoundRow({
    required this.sound,
    required this.playsSound,
    required this.muted,
    required this.onToggle,
  });

  final String sound;
  final bool playsSound;
  final bool muted;
  final VoidCallback onToggle;

  @override
  Widget build(BuildContext context) {
    final label = Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(
          playsSound ? Icons.music_note_rounded : Icons.photo_outlined,
          color: Colors.white70,
          size: 15,
        ),
        const SizedBox(width: 5),
        Flexible(
          child: Text(
            sound,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 12.5,
              fontWeight: FontWeight.w600,
              shadows: [Shadow(blurRadius: 8, color: Colors.black)],
            ),
          ),
        ),
      ],
    );
    if (!playsSound) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: label,
      );
    }
    return Row(
      children: [
        Semantics(
          button: true,
          toggled: muted,
          label: muted ? 'Sound off. Turn sound on' : 'Sound on. Mute',
          excludeSemantics: true,
          child: Tooltip(
            message: muted ? 'Turn sound on' : 'Mute',
            excludeFromSemantics: true,
            // Its own ink: the feed is drawn over a bare Stack with no
            // Material behind it.
            child: Material(
              type: MaterialType.transparency,
              child: InkResponse(
                onTap: onToggle,
                radius: 22,
                child: SizedBox.square(
                  dimension: 40,
                  child: Icon(
                    muted ? Icons.volume_off_rounded : Icons.volume_up_rounded,
                    color: Colors.white,
                    size: 20,
                    shadows: const [Shadow(blurRadius: 8, color: Colors.black)],
                  ),
                ),
              ),
            ),
          ),
        ),
        Expanded(child: label),
      ],
    );
  }
}

/// The slim line that says which community a reel belongs to, with the way in.
///
/// ── Not a card ──────────────────────────────────────────────────────────────
/// A picture, a name and one button, on a pill no taller than a line of text.
/// A community card over a video — cover image, member count, description — is
/// an advert for the community painted over somebody's performance.
///
/// ── Join, and what it shows afterwards ──────────────────────────────────────
/// Join means join for a public community and "ask" for a private one; the
/// button says Join either way, because that is what the member wants, and
/// the result says which it was — Joined or Requested. It flips before the
/// write lands and flips back, with the reason, if the write is refused.
/// Existing members see Joined rather than nothing, so the row never implies
/// they still have something to do.
class ReelCommunityRow extends ConsumerStatefulWidget {
  const ReelCommunityRow({
    required this.stamp,
    required this.onOpen,
    this.onJoined,
    super.key,
  });

  final PostCommunityStamp stamp;
  final VoidCallback onOpen;
  final ValueChanged<MembershipStatus>? onJoined;

  @override
  ConsumerState<ReelCommunityRow> createState() => _ReelCommunityRowState();
}

class _ReelCommunityRowState extends ConsumerState<ReelCommunityRow> {
  /// The status drawn ahead of the server while a join is in flight or has
  /// not yet reached the membership stream.
  MembershipStatus? _optimistic;
  var _busy = false;

  Future<void> _join(CommunitySpace? space) async {
    if (_busy) return;
    final profile = await CommunityActions(ref).requireProfile(context);
    if (profile == null || !mounted) return;
    final repository = ref.read(communitySpaceRepositoryProvider);
    final target = space ?? await repository?.getCommunity(widget.stamp.id);
    if (!mounted) return;
    if (repository == null || target == null || !target.isAvailable) {
      showGlassToast(context, 'This community is not available right now.');
      return;
    }
    HapticFeedback.selectionClick();
    setState(() {
      _busy = true;
      _optimistic = target.isPrivate
          ? MembershipStatus.pending
          : MembershipStatus.active;
    });
    try {
      final status = await repository.join(space: target, uid: profile.uid);
      ref.invalidate(joinedCommunitiesProvider);
      widget.onJoined?.call(status);
      if (!mounted) return;
      setState(() => _optimistic = status);
      if (status == MembershipStatus.pending) {
        showGlassToast(context, 'Request sent to ${target.name}.');
      }
    } on CommunityFailure catch (error) {
      if (!mounted) return;
      setState(() => _optimistic = null);
      showGlassToast(context, error.message);
    } on Object {
      if (!mounted) return;
      setState(() => _optimistic = null);
      showGlassToast(context, 'Could not join ${target.name}. Try again.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final space = ref
        .watch(communitySpaceProvider(widget.stamp.id))
        .asData
        ?.value;
    final membership = ref
        .watch(myMembershipProvider(widget.stamp.id))
        .asData
        ?.value;
    final uid = ref.watch(currentUidProvider);
    final serverStatus = uid == null ? null : membership?.status;
    final status = _optimistic ?? serverStatus;
    final name = space?.name ?? widget.stamp.name;
    final removed = space != null && !space.isAvailable;

    final Widget? action = switch (status) {
      _ when removed => null,
      MembershipStatus.banned => null,
      MembershipStatus.active => const _JoinState(
        icon: Icons.check_rounded,
        label: 'Joined',
      ),
      MembershipStatus.pending => const _JoinState(
        icon: Icons.schedule_rounded,
        label: 'Requested',
      ),
      null => Semantics(
        button: true,
        label: 'Join $name',
        excludeSemantics: true,
        child: TextButton(
          onPressed: _busy ? null : () => _join(space),
          style: TextButton.styleFrom(
            foregroundColor: const Color(0xFF1A1206),
            backgroundColor: brand.gold,
            disabledBackgroundColor: brand.gold.withValues(alpha: 0.6),
            minimumSize: const Size(0, 30),
            padding: const EdgeInsets.symmetric(horizontal: 14),
            tapTargetSize: MaterialTapTargetSize.padded,
            shape: const StadiumBorder(),
            textStyle: const TextStyle(
              fontSize: 12.5,
              fontWeight: FontWeight.w800,
            ),
          ),
          child: const Text('Join'),
        ),
      ),
    };

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Flexible(
          child: Semantics(
            button: true,
            label: 'Open the $name community',
            excludeSemantics: true,
            child: GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTap: widget.onOpen,
              child: Container(
                constraints: const BoxConstraints(minHeight: 36),
                padding: const EdgeInsets.fromLTRB(4, 4, 12, 4),
                decoration: BoxDecoration(
                  color: Colors.black.withValues(alpha: 0.3),
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(color: Colors.white24),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    _CommunityMark(space: space, name: name),
                    const SizedBox(width: 8),
                    Flexible(
                      child: Text(
                        name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 13,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
        if (action != null) ...[const SizedBox(width: 6), action],
      ],
    );
  }
}

class _JoinState extends StatelessWidget {
  const _JoinState({required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) => Semantics(
    label: label,
    child: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 14, color: Colors.white),
        const SizedBox(width: 3),
        Text(
          label,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 12.5,
            fontWeight: FontWeight.w700,
            shadows: [Shadow(blurRadius: 8, color: Colors.black)],
          ),
        ),
      ],
    ),
  );
}

/// The community's picture, or a cultural motif standing in for one.
class _CommunityMark extends StatelessWidget {
  const _CommunityMark({required this.space, required this.name});

  final CommunitySpace? space;
  final String name;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final url = space?.avatarUrl;
    return Container(
      width: 26,
      height: 26,
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: brand.terracotta,
        border: Border.all(color: brand.gold.withValues(alpha: 0.7)),
      ),
      child: url != null
          ? CachedNetworkImage(
              imageUrl: url,
              fit: BoxFit.cover,
              memCacheWidth: 78,
              errorWidget: (context, url, error) => _motif(brand),
            )
          : _motif(brand),
    );
  }

  Widget _motif(BrandPalette brand) =>
      Icon(Icons.diversity_3_rounded, size: 15, color: brand.gold);
}

/// Logs a community join from Explore. Kept here beside the row that causes it.
void logExploreCommunityJoin(
  ExploreAnalytics analytics,
  Reel reel,
  MembershipStatus status,
) => analytics.logReel(
  ExploreEvent.communityJoin,
  reel,
  extra: {
    'result': status == MembershipStatus.pending ? 'requested' : 'joined',
  },
);
