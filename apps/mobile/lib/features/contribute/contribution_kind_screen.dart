import 'package:flutter/material.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/contribute/contribution_form_screen.dart';
import 'package:indigen_world_mobile/features/contribute/contribution_kinds.dart';
import 'package:indigen_world_mobile/features/contribute/words/word_queue_screen.dart';
import 'package:indigen_world_mobile/shared/app_widgets.dart';
import 'package:indigen_world_mobile/shared/frosted_nav_bar.dart';
import 'package:indigen_world_mobile/shared/glass_surface.dart';

/// One question, and nothing else on the screen.
///
/// "What are you contributing?" used to be a two-column grid of five word-wide
/// tiles sitting above the form it configured, which made it look like the
/// first field of a long questionnaire rather than a fork in the road. It is
/// its own step now: each offer gets a card wide enough to say what it
/// actually is, and choosing one opens a screen that asks about that and only
/// that.
///
/// ── Why this iterates offers rather than [CollectionKind]s ───────────────
/// Because Dictionary is one shelf and two completely different acts.
/// Answering a word we hand you and bringing us a proverb nobody could have
/// asked you for share a destination and share nothing else — and while they
/// shared a card, that card led to a blank field labelled "English or source
/// word". An open question with tens of thousands of right answers is the same
/// as no question at all, and most people who picked it froze and left.
///
/// [kContributionOffers] is the split, and it is a list of offers rather than
/// a second enum bolted onto `CollectionKind` so that one shelf can appear
/// twice here without the Collection tab, the review desk, the player or the
/// submissions list learning anything new.
class ContributionKindScreen extends StatelessWidget {
  const ContributionKindScreen({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: context.brand.background,
    appBar: AppBar(title: const Text('Contribute')),
    body: ScreenContainer(
      child: ListView(
        padding: EdgeInsets.fromLTRB(20, 4, 20, 32 + musicInset(context)),
        children: [
          Text(
            'What are you contributing?',
            style: Theme.of(context).textTheme.headlineSmall,
          ),
          const SizedBox(height: 8),
          Text(
            'Every kind is reviewed by a person before it is published. '
            'Pick the one that fits and we will only ask what that kind needs.',
            style: TextStyle(color: context.brand.mutedInk, height: 1.5),
          ),
          const SizedBox(height: 18),
          for (final offer in kContributionOffers) ...[
            _OfferCard(offer: offer, onTap: () => _open(context, offer)),
            const SizedBox(height: 11),
          ],
        ],
      ),
    ),
  );

  Future<void> _open(BuildContext context, ContributionOffer offer) async {
    final navigator = Navigator.of(context);

    // The guided queue is a place rather than a form: it has no end, it
    // submits many times, and a member leaving it is going back to choose
    // something else. So the chooser stays underneath it and is what Back
    // lands on — the opposite of the rule below, and for the opposite reason.
    if (offer.isGuidedQueue) {
      await navigator.push<void>(
        MaterialPageRoute<void>(builder: (context) => const WordQueueScreen()),
      );
      return;
    }

    final submitted = await navigator.push<bool>(
      MaterialPageRoute<bool>(
        builder: (context) => ContributionFormScreen(
          kind: offer.kind,
          lexicalKind: offer.lexicalKind,
        ),
      ),
    );
    // The chooser's question has been answered and acted on, so it leaves with
    // the form rather than reappearing behind it. Backing out of the form
    // without submitting still lands here, which is where somebody who picked
    // the wrong kind wants to be.
    if (submitted == true && navigator.canPop()) navigator.pop();
  }
}

class _OfferCard extends StatelessWidget {
  const _OfferCard({required this.offer, required this.onTap});

  final ContributionOffer offer;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return GlassCard(
      onTap: onTap,
      blur: false,
      padding: const EdgeInsets.fromLTRB(15, 15, 13, 15),
      semanticLabel: '${offer.title}. ${offer.blurb}',
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          GlassIconPlate(icon: offer.glyph, size: 46),
          const SizedBox(width: 13),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  offer.title,
                  style: TextStyle(
                    color: brand.ink,
                    fontSize: 16,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  offer.blurb,
                  style: TextStyle(
                    color: brand.mutedInk,
                    fontSize: 12.5,
                    height: 1.4,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 6),
          Padding(
            padding: const EdgeInsets.only(top: 10),
            child: Icon(
              Icons.chevron_right_rounded,
              color: brand.faintInk,
              size: 22,
            ),
          ),
        ],
      ),
    );
  }
}
