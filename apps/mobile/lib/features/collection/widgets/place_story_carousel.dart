import 'dart:async';

import 'package:flutter/material.dart';
import 'package:indigen_world_mobile/features/collection/place_stories.dart';
import 'package:indigen_world_mobile/features/collection/place_story_screen.dart';
import 'package:visibility_detector/visibility_detector.dart';

class PlaceStoryCarousel extends StatefulWidget {
  const PlaceStoryCarousel({this.ad, super.key});
  final Widget? ad;
  @override
  State<PlaceStoryCarousel> createState() => _PlaceStoryCarouselState();
}

class _PlaceStoryCarouselState extends State<PlaceStoryCarousel>
    with WidgetsBindingObserver {
  final _pages = PageController(viewportFraction: .9);
  Timer? _timer;
  int _page = 0;
  bool _visible = true;
  bool _paused = false;
  bool _foreground = true;
  int get _count => placeStories.length + (widget.ad == null ? 0 : 1);

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _schedule();
  }

  void _schedule() {
    _timer?.cancel();
    _timer = Timer.periodic(const Duration(seconds: 3), (_) {
      if (!_visible ||
          _paused ||
          !_foreground ||
          !_pages.hasClients ||
          !(ModalRoute.of(context)?.isCurrent ?? false) ||
          !TickerMode.valuesOf(context).enabled ||
          MediaQuery.disableAnimationsOf(context) ||
          MediaQuery.accessibleNavigationOf(context)) {
        return;
      }
      unawaited(
        _pages.animateToPage(
          (_page + 1) % _count,
          duration: const Duration(milliseconds: 450),
          curve: Curves.easeInOutCubic,
        ),
      );
    });
  }

  @override
  void didUpdateWidget(PlaceStoryCarousel oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (_page >= _count) {
      _page = _count - 1;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted && _pages.hasClients) _pages.jumpToPage(_page);
      });
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    _foreground = state == AppLifecycleState.resumed;
  }

  @override
  void dispose() {
    _timer?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    VisibilityDetectorController.instance.notifyNow();
    _pages.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => VisibilityDetector(
    key: const Key('collection-place-stories'),
    onVisibilityChanged: (info) => _visible = info.visibleFraction > .5,
    child: Column(
      children: [
        SizedBox(
          height: 230 + (MediaQuery.textScalerOf(context).scale(16) - 16) * 7,
          child: Listener(
            onPointerDown: (_) => _timer?.cancel(),
            onPointerUp: (_) => _schedule(),
            onPointerCancel: (_) => _schedule(),
            child: PageView.builder(
              key: const Key('place-story-pages'),
              controller: _pages,
              itemCount: _count,
              onPageChanged: (page) => setState(() => _page = page),
              itemBuilder: (context, index) => Padding(
                padding: const EdgeInsets.symmetric(horizontal: 5),
                child: index == placeStories.length
                    ? widget.ad!
                    : _PlaceCard(story: placeStories[index]),
              ),
            ),
          ),
        ),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            for (var index = 0; index < _count; index++)
              Semantics(
                label: 'Card ${index + 1} of $_count',
                selected: index == _page,
                child: Container(
                  margin: const EdgeInsets.symmetric(horizontal: 3),
                  width: index == _page ? 20 : 6,
                  height: 6,
                  decoration: BoxDecoration(
                    color: index == _page
                        ? Theme.of(context).colorScheme.primary
                        : Theme.of(context).dividerColor,
                    borderRadius: BorderRadius.circular(5),
                  ),
                ),
              ),
            IconButton(
              tooltip: _paused ? 'Resume slideshow' : 'Pause slideshow',
              onPressed: () => setState(() => _paused = !_paused),
              iconSize: 18,
              icon: Icon(
                _paused ? Icons.play_arrow_rounded : Icons.pause_rounded,
              ),
            ),
          ],
        ),
      ],
    ),
  );
}

class _PlaceCard extends StatelessWidget {
  const _PlaceCard({required this.story});
  final PlaceStory story;
  @override
  Widget build(BuildContext context) => Semantics(
    button: true,
    label: 'Read the story of ${story.title}',
    child: Material(
      borderRadius: BorderRadius.circular(22),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () => Navigator.of(context).push<void>(
          MaterialPageRoute(builder: (_) => PlaceStoryScreen(story: story)),
        ),
        child: Stack(
          fit: StackFit.expand,
          children: [
            Image.asset(story.image, fit: BoxFit.cover),
            const DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [Colors.black12, Color(0xE6000000)],
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  Text(
                    story.location,
                    style: const TextStyle(
                      color: Colors.white70,
                      letterSpacing: 1.8,
                      fontSize: 11,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    story.title,
                    maxLines: 3,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 23,
                      height: 1.1,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 12),
                  const Text(
                    'Read the story →',
                    style: TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w600,
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
