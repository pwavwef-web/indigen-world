import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/collection/collection_data.dart';
import 'package:indigen_world_mobile/features/contribute/collection_contribution_repository.dart';
import 'package:indigen_world_mobile/features/contribute/contribution_form_screen.dart';
import 'package:indigen_world_mobile/features/contribute/contribution_kind_screen.dart';
import 'package:indigen_world_mobile/features/contribute/contribution_kinds.dart';
import 'package:indigen_world_mobile/features/contribute/leaderboard/top_contributors_pill.dart';
import 'package:indigen_world_mobile/features/contribute/my_submissions_screen.dart';
import 'package:indigen_world_mobile/features/kawuri/kawuri_fab.dart';
import 'package:indigen_world_mobile/features/validate/data/ad_review_queue.dart';
import 'package:indigen_world_mobile/features/validate/data/review_queue.dart';
import 'package:indigen_world_mobile/features/validate/validate_screen.dart';
import 'package:indigen_world_mobile/shared/app_widgets.dart';
import 'package:indigen_world_mobile/shared/frosted_nav_bar.dart';
import 'package:indigen_world_mobile/shared/glass_surface.dart';

/// The Contribute tab: a door, not a desk.
///
/// This screen used to be the whole feature — the review desk, a five-way type
/// picker, every field of every form, a submit button and the last five things
/// you had sent, stacked on top of each other and roughly fourteen hundred
/// lines long. A member opening the tab to check whether last week's song had
/// been reviewed had to scroll past an empty dictionary form to find out, and
/// one who wanted to send a film met a page of questions before being asked
/// which of five things they were even doing.
///
/// It is a hub now. Two rows, plus the reviewers' door for the accounts that
/// have one, and each row opens a screen with a single job.
class ContributeScreen extends StatelessWidget {
  const ContributeScreen({
    this.initialSource = '',
    this.relatedEntryId,
    this.reserveTopRight = false,
    this.initialKind,
    this.standalone = false,
    super.key,
  });

  /// A word the member was already looking at. Carried through to the form.
  final String initialSource;

  /// The published entry a correction refers to.
  final String? relatedEntryId;

  final bool reserveTopRight;

  /// The kind the caller already knows about — a Collection shelf standing
  /// empty, the dictionary's "Suggest a correction". Null from the shell tab,
  /// where the whole point is that nobody has decided yet.
  final CollectionKind? initialKind;

  final bool standalone;

  @override
  Widget build(BuildContext context) {
    // A caller who already knows the kind has answered the chooser's only
    // question, and putting it in front of them again would be theatre.
    if (initialKind case final kind?) {
      // Except for an audiobook, which is no longer offered here at all — the
      // Collection's audiobook shelf still links to Contribute, so that link
      // has to land somewhere honest rather than on a form we have withdrawn.
      return kMobileContributionKinds.contains(kind)
          ? ContributionFormScreen(
              kind: kind,
              initialSource: initialSource,
              relatedEntryId: relatedEntryId,
            )
          : const ContributionKindScreen();
    }

    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: standalone ? AppBar(title: const Text('Contribute')) : null,
      floatingActionButton: Padding(
        padding: EdgeInsets.only(bottom: shellBottomReserve(context) - 26),
        child: const KawuriFab(),
      ),
      body: ScreenContainer(
        child: ListView(
          key: const PageStorageKey('contribute-scroll'),
          padding: EdgeInsets.only(bottom: 40 + shellBottomReserve(context)),
          children: [
            BrandHeader(
              reserveTopRight: reserveTopRight,
              // No eyebrow over "Contribute": a label above a heading that says
              // the same word twice is decoration, not orientation.
              eyebrow: null,
              title: 'Contribute',
              subtitle:
                  'What you send is read by a reviewer before anybody else '
                  'sees it.',
            ),
            // The one strip on a page of doors that has people on it. It sits
            // above the review desk rather than below it because it is a line,
            // not a door: it is thirty-odd pixels of faces, and the desk is
            // still the first thing anybody who has one can act on. What it
            // buys is that a member arriving to send their first word sees who
            // else is doing this before they see the form.
            const TopContributorsPill(),
            // Staff only, and deliberately near the top of *this* screen: the
            // work the desk reviews is the work these rows send, so the two
            // belong next to each other. It used to be a sixth tab on the
            // shell rail, which changed the shape of the one strip of the app
            // everybody shares depending on who was holding the phone.
            const _ReviewDeskCard(),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  _ContributeAction(
                    icon: Icons.library_add_rounded,
                    title: 'Submit to Collections',
                    subtitle: 'Add a song, a word, a story or a film',
                    onTap: () => Navigator.of(context).push(
                      MaterialPageRoute<void>(
                        builder: (context) => const ContributionKindScreen(),
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),
                  const _MySubmissionsAction(),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// One row of the hub.
///
/// Deliberately taller and plainer than [GlassRow]: this is a page with two
/// choices on it, and a row that fits a whole sentence of explanation is worth
/// more here than one that fits eight of them down a settings list.
class _ContributeAction extends StatelessWidget {
  const _ContributeAction({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
    this.badge = 0,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  /// A count worth showing on the right instead of the chevron. Zero means
  /// there is nothing to count, and the chevron says "there is more this way"
  /// better than a nought says anything at all.
  final int badge;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return GlassCard(
      onTap: onTap,
      blur: false,
      padding: const EdgeInsets.fromLTRB(15, 16, 13, 16),
      semanticLabel: '$title. $subtitle',
      child: Row(
        children: [
          GlassIconPlate(icon: icon, size: 48),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: TextStyle(
                    color: brand.ink,
                    fontSize: 16.5,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  subtitle,
                  style: TextStyle(
                    color: brand.mutedInk,
                    fontSize: 12.5,
                    height: 1.35,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          if (badge > 0)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
              decoration: BoxDecoration(
                color: brand.accentFill,
                borderRadius: BorderRadius.circular(999),
              ),
              child: Text(
                badge > 99 ? '99+' : '$badge',
                style: TextStyle(
                  color: brand.onAccentFill,
                  fontSize: 12,
                  fontWeight: FontWeight.w900,
                ),
              ),
            )
          else
            Icon(Icons.chevron_right_rounded, color: brand.faintInk, size: 22),
        ],
      ),
    );
  }
}

/// The submissions row, which says what is actually happening.
///
/// A row labelled only "Your submissions" makes somebody open the screen to
/// find out whether anything has moved. The count is the answer, so it belongs
/// on the row that would otherwise have made them go and look.
class _MySubmissionsAction extends ConsumerWidget {
  const _MySubmissionsAction();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final submissions = ref.watch(myCollectionContributionsProvider);
    final items =
        submissions.asData?.value ?? const <CollectionContributionRecord>[];
    final waiting = items
        .where((item) => contributionAwaitingReview(item.status))
        .length;

    return _ContributeAction(
      icon: Icons.outbox_rounded,
      title: 'Your submissions',
      subtitle: switch ((submissions.hasValue, items.length, waiting)) {
        // Before the first snapshot arrives, and after a failed one, this says
        // what the row is for rather than inventing a number for it.
        (false, _, _) => 'Follow what you have sent for review',
        (_, 0, _) => 'Nothing yet',
        (_, _, 0) => 'All reviewed',
        (_, _, final count) => '$count in review',
      },
      badge: waiting,
      onTap: () => Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (context) => const MySubmissionsScreen(),
        ),
      ),
    );
  }
}

/// The way into the review desk, for the accounts that have one.
///
/// Renders nothing at all for everybody else — not a locked card, not a
/// greyed-out row. A door somebody can never open is worse than no door: it
/// invites the question and then refuses to answer it.
///
/// Kept as its own shape rather than folded into [_ContributeAction]: the two
/// rows under it are things anybody may do, and this one is a job. The filled
/// accent panel is what says so before the words do.
class _ReviewDeskCard extends ConsumerWidget {
  const _ReviewDeskCard();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (!ref.watch(isReviewerProvider)) return const SizedBox.shrink();

    final waitingWork = ref.watch(reviewWaitingCountProvider).asData?.value ?? 0;
    final waitingAds =
        ref.watch(adReviewWaitingCountProvider).asData?.value ?? 0;
    final waiting = waitingWork + waitingAds;
    final brand = context.brand;

    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
      child: Semantics(
        button: true,
        label: waiting > 0
            ? 'Review desk, $waiting waiting'
            : 'Review desk, nothing waiting',
        excludeSemantics: true,
        child: Material(
          color: brand.accentSoft,
          borderRadius: BorderRadius.circular(22),
          child: InkWell(
            borderRadius: BorderRadius.circular(22),
            onTap: () => Navigator.of(context).push(
              MaterialPageRoute<void>(
                builder: (context) => const ValidateScreen(),
              ),
            ),
            child: Container(
              padding: const EdgeInsets.fromLTRB(16, 15, 14, 15),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(22),
                border: Border.all(
                  color: brand.accent.withValues(alpha: 0.35),
                ),
              ),
              child: Row(
                children: [
                  Container(
                    width: 44,
                    height: 44,
                    decoration: BoxDecoration(
                      color: brand.accent,
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: Icon(
                      Icons.fact_check_rounded,
                      color: brand.onAccentFill,
                      size: 22,
                    ),
                  ),
                  const SizedBox(width: 13),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'REVIEW DESK',
                          style: TextStyle(
                            color: brand.terracotta,
                            fontSize: 9.5,
                            fontWeight: FontWeight.w900,
                            letterSpacing: 1.1,
                          ),
                        ),
                        const SizedBox(height: 3),
                        Text(
                          waiting == 0
                              ? 'Nothing is waiting'
                              : '$waiting waiting on you',
                          style: TextStyle(
                            color: brand.ink,
                            fontSize: 15.5,
                            fontWeight: FontWeight.w800,
                            height: 1.2,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          // Named rather than summed into one word, because
                          // they are two different jobs with two different
                          // urgencies — an unpublished song and an advert
                          // somebody has already paid for.
                          waiting == 0
                              ? 'Contributions and adverts, when they arrive'
                              : '$waitingWork contribution'
                                    '${waitingWork == 1 ? '' : 's'} · '
                                    '$waitingAds advert'
                                    '${waitingAds == 1 ? '' : 's'}',
                          style: TextStyle(
                            color: brand.mutedInk,
                            fontSize: 12,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  if (waiting > 0)
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 9,
                        vertical: 4,
                      ),
                      decoration: BoxDecoration(
                        color: brand.terracotta,
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: Text(
                        waiting > 99 ? '99+' : '$waiting',
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 12,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                    )
                  else
                    Icon(
                      Icons.chevron_right_rounded,
                      color: brand.mutedInk,
                      size: 22,
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
