import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/community/community_profile_screen.dart';
import 'package:indigen_world_mobile/features/community/community_setup_screen.dart';
import 'package:indigen_world_mobile/features/community/data/community_models.dart';
import 'package:indigen_world_mobile/features/community/data/community_providers.dart';
import 'package:indigen_world_mobile/features/community/data/kasem_names.dart';
import 'package:indigen_world_mobile/features/community/phone_verification_screen.dart';
import 'package:indigen_world_mobile/features/community/request_kasem_name_screen.dart';
import 'package:indigen_world_mobile/features/community/widgets/community_avatar.dart';
import 'package:indigen_world_mobile/features/community/widgets/people_widgets.dart';
import 'package:indigen_world_mobile/shared/glass_surface.dart';

/// What a new account is walked through the moment it exists.
///
/// ── Why this exists ───────────────────────────────────────────────────────
/// Signing in with Google used to do nothing you could see. The card closed,
/// the screen behind it came back exactly as it was, and the member was left to
/// discover on their own that they still had no handle, no name the community
/// would know them by, no verified mark and nobody to read. Every one of those
/// was reachable — from the Profile tab, from a gate that fired the next time
/// they tried to post — and none of them was ever *offered*. Joining looked
/// identical to nothing happening.
///
/// So the sign-in card now hands over to this: one page, five steps, each of
/// them the thing the app would otherwise have asked for later and out of
/// order. It runs once, for an account with no `communityProfiles` record —
/// somebody who already has one signs in and lands exactly where they were,
/// which is what they wanted.
///
/// ── What is compulsory, and what is not ───────────────────────────────────
/// Only the handle. It is the one thing nothing else in the community works
/// without, and it cannot be changed afterwards, so it is the only step with no
/// way past it. The Kassena name, the birthday, the phone and the people to
/// follow are all offered and all skippable — and every one of them is still
/// reachable from Settings and the Profile tab afterwards, exactly as it was.
class AccountSetupFlow extends ConsumerStatefulWidget {
  const AccountSetupFlow({super.key});

  @override
  ConsumerState<AccountSetupFlow> createState() => _AccountSetupFlowState();
}

/// The steps, in the order they are walked.
enum _Step { welcome, kasemName, profile, phone, follow, done }

extension on _Step {
  /// The line under the progress bar. Short: it is a label, not the heading.
  String get label => switch (this) {
    _Step.welcome => 'Welcome',
    _Step.kasemName => 'Your name',
    _Step.profile => 'Your profile',
    _Step.phone => 'Your number',
    _Step.follow => 'People',
    _Step.done => 'Done',
  };
}

/// How long a step takes to slide out of the way of the next one.
///
/// Long enough to read as a movement rather than a cut, short enough that
/// somebody filling in five steps never waits on it.
const _kStepDuration = Duration(milliseconds: 420);
const _kStepCurve = Curves.easeOutCubic;

class _AccountSetupFlowState extends ConsumerState<AccountSetupFlow> {
  final _pages = PageController();

  var _step = _Step.welcome;

  /// The Kassena name taken at the second step, folded ready for a handle.
  /// Empty when it was skipped, or when nothing is published to choose from.
  var _chosenName = '';

  /// The properly-written form of the same name, for saying it back.
  var _chosenNameWritten = '';

  /// The profile, once the third step has actually written one. Everything
  /// after that step needs it to exist.
  CommunityProfile? _profile;

  var _phoneVerified = false;

  @override
  void dispose() {
    _pages.dispose();
    super.dispose();
  }

  bool get _hasProfile => _profile != null;

  void _goTo(_Step step) {
    if (step == _step) return;
    FocusScope.of(context).unfocus();
    setState(() => _step = step);
    _pages.animateToPage(
      step.index,
      duration: _kStepDuration,
      curve: _kStepCurve,
    );
  }

  void _next() {
    final next = _Step.values[(_step.index + 1).clamp(0, _Step.values.length - 1)];
    HapticFeedback.selectionClick();
    _goTo(next);
  }

  /// Whether the arrow in the header can walk back from here.
  ///
  /// Only before the profile is written. After that the handle is claimed and
  /// permanent, so a step that offered to choose one again would be offering
  /// something the registry will refuse.
  bool get _canGoBack => !_hasProfile && _step.index > 0;

  void _back() {
    if (!_canGoBack) return;
    HapticFeedback.selectionClick();
    _goTo(_Step.values[_step.index - 1]);
  }

  void _takeName(KasemName name) {
    HapticFeedback.selectionClick();
    setState(() {
      _chosenName = name.ascii;
      _chosenNameWritten = name.name;
    });
    _next();
  }

  void _skipName() {
    setState(() {
      _chosenName = '';
      _chosenNameWritten = '';
    });
    _next();
  }

  Future<void> _askForName() async {
    await Navigator.of(context).push<bool>(
      MaterialPageRoute<bool>(
        builder: (context) => const RequestKasemNameScreen(),
      ),
    );
    if (mounted) setState(() {});
  }

  void _onProfileCreated(CommunityProfile profile) {
    HapticFeedback.heavyImpact();
    setState(() => _profile = profile);
    _next();
  }

  void _finish() {
    HapticFeedback.mediumImpact();
    Navigator.of(context).pop(_profile != null);
  }

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    // Read here rather than inside the PageView's itemBuilder: that builder is
    // called lazily by the sliver, outside this widget's own build, and a
    // `ref.watch` out there is not a watch at all.
    final displayName = ref.watch(currentDisplayNameProvider) ?? '';
    return PopScope<bool>(
      // The system back gesture walks the flow backwards while that still
      // means something, and only leaves once it does not.
      canPop: !_canGoBack,
      onPopInvokedWithResult: (didPop, result) {
        if (!didPop) _back();
      },
      child: Scaffold(
        backgroundColor: brand.background,
        body: SafeArea(
          child: Column(
            children: [
              _FlowHeader(
                step: _step,
                onBack: _canGoBack ? _back : null,
                // Somebody who has a handle has everything the community needs;
                // the rest can be finished from Settings whenever they like.
                // The last step has its own way out, so it needs no second one.
                onLeave: _step == _Step.done ? null : _finish,
              ),
              Expanded(
                child: PageView.builder(
                  controller: _pages,
                  physics: const NeverScrollableScrollPhysics(),
                  itemCount: _Step.values.length,
                  itemBuilder: (context, index) => _SlidingPage(
                    controller: _pages,
                    index: index,
                    child: _pageFor(_Step.values[index], displayName),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _pageFor(_Step step, String displayName) => switch (step) {
    _Step.welcome => _WelcomeStep(name: displayName, onContinue: _next),
    _Step.kasemName => _KasemNameStep(
      chosen: _chosenName,
      onTake: _takeName,
      onAsk: _askForName,
      onSkip: _skipName,
    ),
    // Keyed on the chosen name so picking one, walking back and picking
    // another rebuilds the form around the new handle rather than keeping a
    // field seeded with the first.
    _Step.profile => _ProfileStep(
      key: ValueKey('profile-$_chosenName'),
      chosenName: _chosenNameWritten,
      initialHandle: _chosenName,
      onCreated: _onProfileCreated,
    ),
    _Step.phone => _PhoneStep(
      onDone: (verified) {
        setState(() => _phoneVerified = verified);
        _next();
      },
      onSkip: _next,
    ),
    _Step.follow => _FollowStep(profile: _profile, onContinue: _next),
    _Step.done => _DoneStep(
      profile: _profile,
      phoneVerified: _phoneVerified,
      onFinish: _finish,
    ),
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// Chrome
// ═════════════════════════════════════════════════════════════════════════════

/// The progress bar, the step name, and the two ways out.
///
/// The bar is animated rather than snapped: the whole point of a flow is that
/// it is one thing with a length, and a bar that jumps is five screens again.
class _FlowHeader extends StatelessWidget {
  const _FlowHeader({
    required this.step,
    required this.onBack,
    required this.onLeave,
  });

  final _Step step;
  final VoidCallback? onBack;
  final VoidCallback? onLeave;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final total = _Step.values.length - 1;
    final progress = (step.index / total).clamp(0.0, 1.0);

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              // Held in place rather than added and removed: a row that gains
              // a button shifts the title sideways every time the step changes.
              SizedBox(
                width: 44,
                child: onBack == null
                    ? null
                    : IconButton(
                        tooltip: 'Back',
                        onPressed: onBack,
                        icon: const Icon(Icons.arrow_back_rounded),
                      ),
              ),
              Expanded(
                child: AnimatedSwitcher(
                  duration: const Duration(milliseconds: 260),
                  child: Text(
                    step.label,
                    key: ValueKey(step),
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: brand.mutedInk,
                      fontSize: 12,
                      fontWeight: FontWeight.w900,
                      letterSpacing: 1.1,
                    ),
                  ),
                ),
              ),
              SizedBox(
                width: 64,
                child: onLeave != null
                    ? TextButton(
                        key: const Key('setup-leave'),
                        onPressed: onLeave,
                        child: const Text('Later'),
                      )
                    : null,
              ),
            ],
          ),
          const SizedBox(height: 6),
          TweenAnimationBuilder<double>(
            tween: Tween<double>(end: progress),
            duration: _kStepDuration,
            curve: _kStepCurve,
            builder: (context, value, child) => ClipRRect(
              borderRadius: BorderRadius.circular(999),
              child: LinearProgressIndicator(
                value: value,
                minHeight: 4,
                color: brand.gold,
                backgroundColor: brand.border,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// One page of the flow, moving with the [PageView] rather than only across it.
///
/// A plain `PageView` slides its pages sideways at a constant speed, which
/// reads as a filmstrip being dragged past. Fading and lifting each page by how
/// far it is from centre turns the same gesture into one screen handing over to
/// the next — the arriving page settles into place, and the leaving one gets
/// out of the way rather than being towed off.
class _SlidingPage extends StatelessWidget {
  const _SlidingPage({
    required this.controller,
    required this.index,
    required this.child,
  });

  final PageController controller;
  final int index;
  final Widget child;

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: controller,
    child: child,
    builder: (context, child) {
      // Before the first layout the controller has no page yet, so the page it
      // was created on stands in — otherwise every page renders at full
      // distance and the first frame of the flow is blank.
      final page = controller.hasClients && controller.position.haveDimensions
          ? controller.page ?? controller.initialPage.toDouble()
          : controller.initialPage.toDouble();
      final distance = (page - index).abs().clamp(0.0, 1.0);
      return Opacity(
        opacity: 1 - distance,
        child: Transform.translate(
          offset: Offset(0, 26 * distance),
          child: child,
        ),
      );
    },
  );
}

/// The shared shape of a step: a heading, a sentence, a body, and the actions
/// pinned under it.
class _StepScaffold extends StatelessWidget {
  const _StepScaffold({
    required this.title,
    required this.body,
    this.subtitle,
    this.actions = const [],
    this.padded = true,
  });

  final String title;
  final String? subtitle;
  final Widget body;
  final List<Widget> actions;

  /// Off for a step that embeds a screen bringing its own padding.
  final bool padded;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return Align(
      alignment: Alignment.topCenter,
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 560),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Bounded and scrollable rather than free to grow. The heading and
            // its sentence are the only part of a step whose height is set by
            // prose, and prose doubles at the largest reading sizes — on a
            // small phone at that setting an unbounded header pushes the body
            // clean off the bottom of the Column. Held to two fifths, it takes
            // its natural height in every ordinary case and scrolls in the one
            // it does not.
            LayoutBuilder(
              builder: (context, box) => ConstrainedBox(
                constraints: BoxConstraints(maxHeight: box.maxHeight * 0.4),
                child: SingleChildScrollView(
                  padding: const EdgeInsets.fromLTRB(20, 10, 20, 0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        title,
                        style: Theme.of(context).textTheme.headlineSmall,
                      ),
                      if (subtitle != null) ...[
                        const SizedBox(height: 8),
                        Text(
                          subtitle!,
                          style: TextStyle(color: brand.mutedInk, height: 1.5),
                        ),
                      ],
                    ],
                  ),
                ),
              ),
            ),
            SizedBox(height: padded ? 18 : 8),
            Expanded(child: body),
            if (actions.isNotEmpty)
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 10, 20, 16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: actions,
                ),
              ),
          ],
        ),
      ),
    );
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// Steps
// ═════════════════════════════════════════════════════════════════════════════

/// The beat that used to be missing entirely.
///
/// Signing in with Google returned somebody to the screen they came from with
/// no acknowledgement that anything had happened. This says it did, by name,
/// and then says what the next four steps are for — because a flow somebody can
/// see the end of is a flow they finish.
class _WelcomeStep extends StatelessWidget {
  const _WelcomeStep({required this.name, required this.onContinue});

  final String name;
  final VoidCallback onContinue;

  @override
  Widget build(BuildContext context) {
    final first = name.trim().split(RegExp(r'\s+')).first;
    return _StepScaffold(
      title: first.isEmpty ? 'Welcome' : 'Welcome, $first',
      subtitle:
          'You are signed in. Four short steps and the community knows who '
          'you are — you can leave any of them for later.',
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 4, 20, 20),
        children: const [
          _AheadRow(
            icon: Icons.workspace_premium_outlined,
            title: 'Take a Kassena name',
            detail: 'A handle that carries one wears the kente ring',
          ),
          SizedBox(height: 10),
          _AheadRow(
            icon: Icons.badge_outlined,
            title: 'Set up your profile',
            detail: 'The name, the handle and the day people wish you well on',
          ),
          SizedBox(height: 10),
          _AheadRow(
            icon: Icons.verified_outlined,
            title: 'Verify your number',
            detail: 'One number, one member — it earns you the blue mark',
          ),
          SizedBox(height: 10),
          _AheadRow(
            icon: Icons.groups_outlined,
            title: 'Find people to follow',
            detail: 'A feed with nobody in it has nothing to show you',
          ),
        ],
      ),
      actions: [
        FilledButton(
          key: const Key('setup-welcome-continue'),
          onPressed: onContinue,
          style: FilledButton.styleFrom(minimumSize: const Size(0, 52)),
          child: const Text('Let us begin'),
        ),
      ],
    );
  }
}

class _AheadRow extends StatelessWidget {
  const _AheadRow({
    required this.icon,
    required this.title,
    required this.detail,
  });

  final IconData icon;
  final String title;
  final String detail;

  @override
  Widget build(BuildContext context) =>
      GlassRow(icon: icon, title: title, detail: detail);
}

/// Choosing a Kassena name before choosing a handle, rather than after.
///
/// The panel that offers these names has always sat above the handle field on
/// the setup form, and it has always been the wrong way round: by the time
/// somebody scrolls to it they have usually already decided what to be called.
/// Asked first, on a page of its own, the name is the decision and the handle
/// follows from it.
class _KasemNameStep extends ConsumerWidget {
  const _KasemNameStep({
    required this.chosen,
    required this.onTake,
    required this.onAsk,
    required this.onSkip,
  });

  final String chosen;
  final ValueChanged<KasemName> onTake;
  final VoidCallback onAsk;
  final VoidCallback onSkip;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final brand = context.brand;
    final names = ref.watch(kasemNamesProvider);

    return _StepScaffold(
      title: 'Take a Kassena name',
      subtitle: names.isEmpty
          // The published list is the only list there is, and an empty one is a
          // real state rather than a moment of loading to be hidden.
          ? 'No names have been published yet. Choose your own handle on the '
                'next step — and if your family name should be on this list, '
                'ask for it.'
          : 'A handle carrying one of these wears the kente ring. Pick the one '
                'that is yours, or choose your own handle on the next step.',
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
        children: [
          for (final name in names) ...[
            _NameCard(
              name: name,
              selected: chosen == name.ascii,
              onTap: () => onTake(name),
            ),
            const SizedBox(height: 8),
          ],
          const SizedBox(height: 6),
          GlassRow(
            key: const Key('setup-ask-for-name'),
            icon: Icons.add_circle_outline_rounded,
            color: brand.terracotta,
            title: "My name isn't here",
            detail: 'Ask for it to be added to the list',
            onTap: onAsk,
          ),
        ],
      ),
      actions: [
        TextButton(
          key: const Key('setup-skip-name'),
          onPressed: onSkip,
          child: Text(
            names.isEmpty ? 'Continue' : 'Skip — I will use my own handle',
          ),
        ),
      ],
    );
  }
}

/// One offered name, with what it means where the project has recorded one.
///
/// The fold is drawn beside it, because the handle a name earns is its fold and
/// the two are otherwise never on screen together — somebody picking `Awɛlɩmwɛ`
/// has no other way to learn they are about to become `@awelimwe`.
class _NameCard extends StatelessWidget {
  const _NameCard({
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
    return Material(
      color: selected ? brand.accentSoft : brand.surface,
      borderRadius: BorderRadius.circular(18),
      child: InkWell(
        borderRadius: BorderRadius.circular(18),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(18),
            border: Border.all(
              color: selected ? brand.accent : brand.border,
              width: selected ? 1.6 : 1,
            ),
          ),
          child: Row(
            children: [
              const CommunityAvatar(initials: '··', size: 40, kasem: true),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      name.name,
                      style: TextStyle(
                        color: brand.ink,
                        fontSize: 15.5,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      name.meaning.isEmpty
                          ? '@${name.ascii} · ${name.kindLabel}'
                          : '@${name.ascii} · ${name.meaning}',
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: brand.mutedInk,
                        fontSize: 12.5,
                        height: 1.35,
                      ),
                    ),
                  ],
                ),
              ),
              if (selected)
                Icon(Icons.check_circle_rounded, color: brand.accent),
            ],
          ),
        ),
      ),
    );
  }
}

/// What a curated name's `kind` is called on a card.
extension on KasemName {
  String get kindLabel => switch (kind) {
    'clan' => 'Clan name',
    'place' => 'Place',
    _ => 'Given name',
  };
}

/// The one step with no way past it — and the only one, because a handle is
/// what everything else in the community is keyed on.
class _ProfileStep extends StatelessWidget {
  const _ProfileStep({
    required this.chosenName,
    required this.initialHandle,
    required this.onCreated,
    super.key,
  });

  final String chosenName;
  final String initialHandle;
  final ValueChanged<CommunityProfile> onCreated;

  @override
  Widget build(BuildContext context) => _StepScaffold(
    title: 'Who the community meets',
    subtitle: chosenName.isEmpty
        ? 'Your handle is public and cannot be changed later, so take a moment '
              'over it.'
        : 'You took $chosenName. Your handle is set to match — it is public and '
              'cannot be changed later.',
    padded: false,
    body: CommunitySetupScreen(
      initialHandle: initialHandle,
      embedded: true,
      submitLabel: 'Save and continue',
      onCreated: onCreated,
    ),
  );
}

/// Offered here rather than discovered in Settings six weeks later.
///
/// Skippable, and said to be: a number is what earns the member mark, not what
/// buys admission, and a flow that will not let somebody past without one is a
/// flow that loses them at step four.
class _PhoneStep extends StatelessWidget {
  const _PhoneStep({required this.onDone, required this.onSkip});

  final ValueChanged<bool> onDone;
  final VoidCallback onSkip;

  @override
  Widget build(BuildContext context) => _StepScaffold(
    title: 'Prove there is somebody here',
    padded: false,
    body: PhoneVerificationScreen(embedded: true, onDone: onDone),
    actions: [
      TextButton(
        key: const Key('setup-skip-phone'),
        onPressed: onSkip,
        child: const Text('Skip for now'),
      ),
    ],
  );
}

/// A feed with nobody in it.
///
/// The community screen's own empty state has always said "follow somebody" and
/// left the member to work out who. This is the list, at the moment it is
/// actually useful — before they have seen an empty feed and decided the app
/// has nothing in it.
class _FollowStep extends ConsumerWidget {
  const _FollowStep({required this.profile, required this.onContinue});

  final CommunityProfile? profile;
  final VoidCallback onContinue;

  /// Everybody but the member themselves. `suggestedProfiles` is "newest
  /// first", and the newest profile in the community is the one that was
  /// written ninety seconds ago on the step before this one.
  List<CommunityProfile> _others(List<CommunityProfile> people) => people
      .where((person) => person.uid != profile?.uid)
      .toList(growable: false);

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final suggestions = ref.watch(suggestedProfilesProvider);

    return _StepScaffold(
      title: 'People to read',
      subtitle:
          'Follow a few and your feed has something in it from the first day. '
          'You can unfollow anyone, any time.',
      body: switch (suggestions) {
        AsyncValue(:final value?) when _others(value).isEmpty =>
          const CommunityEmptyState(
            icon: Icons.groups_outlined,
            title: 'You are early',
            message:
                'Nobody else has joined yet. They will appear under Find '
                'people as they do.',
          ),
        AsyncValue(:final value?) => _PeopleToFollow(people: _others(value)),
        AsyncValue(hasError: true) => const CommunityEmptyState(
          icon: Icons.cloud_off_rounded,
          title: 'Could not load members',
          message: 'You can find people from the community tab instead.',
        ),
        _ => const Center(child: CircularProgressIndicator()),
      },
      actions: [
        FilledButton(
          key: const Key('setup-follow-continue'),
          onPressed: onContinue,
          style: FilledButton.styleFrom(minimumSize: const Size(0, 52)),
          child: const Text('Continue'),
        ),
      ],
    );
  }
}

/// The suggestion list itself.
///
/// [ProfileTile] already carries the follow control the rest of the app uses,
/// so a follow made here is the same edge, written the same way, and shows as
/// "Following" everywhere the moment it lands.
class _PeopleToFollow extends StatelessWidget {
  const _PeopleToFollow({required this.people});

  final List<CommunityProfile> people;

  @override
  Widget build(BuildContext context) => ListView.separated(
    key: const Key('setup-follow-list'),
    padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
    itemCount: people.length,
    separatorBuilder: (context, index) => const Divider(height: 1),
    itemBuilder: (context, index) => ProfileTile(
      profile: people[index],
      onTap: () => Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (context) => CommunityProfileScreen(uid: people[index].uid),
        ),
      ),
    ),
  );
}

/// Where the flow ends, saying what was actually done.
///
/// Not a generic congratulation: it names the handle that was claimed and says
/// plainly which of the optional steps are still open, and where they live — so
/// somebody who skipped the phone knows both that they did and how to come back
/// to it.
class _DoneStep extends StatelessWidget {
  const _DoneStep({
    required this.profile,
    required this.phoneVerified,
    required this.onFinish,
  });

  final CommunityProfile? profile;
  final bool phoneVerified;
  final VoidCallback onFinish;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final handle = profile?.username ?? '';
    return _StepScaffold(
      title: handle.isEmpty ? 'You are in' : 'You are in, @$handle',
      subtitle:
          'Everything from here is yours to change — except the handle, which '
          'is how people find you.',
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
        children: [
          if (!phoneVerified)
            GlassRow(
              icon: Icons.verified_outlined,
              color: brand.mutedInk,
              title: 'Your number is still unverified',
              detail: 'Settings › Verify your number, whenever you like',
            ),
          if (!phoneVerified) const SizedBox(height: 10),
          if (profile != null && !profile!.hasBirthday) ...[
            GlassRow(
              icon: Icons.cake_outlined,
              color: brand.mutedInk,
              title: 'No birthday yet',
              detail: 'Add it from Edit profile — month and day only',
            ),
            const SizedBox(height: 10),
          ],
          GlassRow(
            icon: Icons.edit_outlined,
            color: brand.accent,
            title: 'Everything else lives in your profile',
            detail: 'Photo, cover, about you, the dialect you speak',
          ),
        ],
      ),
      actions: [
        FilledButton(
          key: const Key('setup-finish'),
          onPressed: onFinish,
          style: FilledButton.styleFrom(minimumSize: const Size(0, 52)),
          child: const Text('Enter the community'),
        ),
      ],
    );
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// The gate
// ═════════════════════════════════════════════════════════════════════════════

/// Runs [AccountSetupFlow] for an account that has never had a profile.
///
/// Called from the sign-in card the moment authentication succeeds, so every
/// one of the ten places in the app that can raise that card gets the flow
/// without knowing anything about it.
///
/// Does nothing at all — no route, no frame — for somebody who already has a
/// `communityProfiles` record. Signing back in on a new phone should land you
/// where you were, not walk you through choosing a handle you chose in 2026.
Future<void> ensureAccountSetup(BuildContext context) async {
  final container = ProviderScope.containerOf(context, listen: false);
  final repository = container.read(communityRepositoryProvider);
  if (repository == null) return;

  final uid = await _awaitUid(container);
  if (uid == null || !context.mounted) return;

  // Read straight through rather than off the profile stream: a moment after
  // sign-in that stream is still carrying the guest's null, and treating it as
  // the answer would walk an existing member through setup all over again.
  try {
    if (await repository.getProfile(uid) != null) return;
  } on Object {
    // A profile that cannot be read is not a profile that does not exist.
    // Offering setup on a failed read risks a second handle claim, which the
    // registry would refuse and the member could not explain.
    return;
  }
  if (!context.mounted) return;

  await Navigator.of(context).push<bool>(accountSetupRoute());
}

/// `authStateChanges()` delivers asynchronously, so the uid can lag a completed
/// sign-in by a frame or two. The same poll `CommunityActions` uses.
Future<String?> _awaitUid(ProviderContainer container) async {
  for (var attempt = 0; attempt < 20; attempt++) {
    final uid = container.read(currentUidProvider);
    if (uid != null) return uid;
    await Future<void>.delayed(const Duration(milliseconds: 50));
  }
  return container.read(currentUidProvider);
}

/// The flow's own arrival: a fade with a breath of scale under it.
///
/// Not the platform's sideways push. The sign-in card has just dissolved in the
/// middle of the screen and this takes its place; sliding in from the right
/// would read as a page somebody navigated to rather than as the same moment
/// continuing.
Route<bool> accountSetupRoute() => PageRouteBuilder<bool>(
  transitionDuration: const Duration(milliseconds: 460),
  reverseTransitionDuration: const Duration(milliseconds: 280),
  pageBuilder: (context, animation, secondaryAnimation) =>
      const AccountSetupFlow(),
  transitionsBuilder: (context, animation, secondaryAnimation, child) {
    final curved = CurvedAnimation(
      parent: animation,
      curve: Curves.easeOutCubic,
      reverseCurve: Curves.easeInCubic,
    );
    return FadeTransition(
      opacity: curved,
      child: ScaleTransition(
        scale: Tween<double>(begin: 0.96, end: 1).animate(curved),
        child: child,
      ),
    );
  },
);
