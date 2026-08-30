import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/features/community/data/community_providers.dart';
import 'package:indigen_world_mobile/features/community/data/community_repository.dart';
import 'package:indigen_world_mobile/features/explore/explore_feed.dart';

void main() {
  late ProviderContainer container;

  setUp(() => container = ProviderContainer());
  tearDown(() => container.dispose());

  ExploreWindow notifier() =>
      container.read(exploreWindowProvider.notifier);

  group('ExploreWindow', () {
    test('starts at one page', () {
      expect(container.read(exploreWindowProvider), kExploreWindowStep);
    });

    test('grows a page at a time', () {
      expect(notifier().grow(), isTrue);
      expect(container.read(exploreWindowProvider), kExploreWindowStep * 2);
      expect(notifier().grow(), isTrue);
      expect(container.read(exploreWindowProvider), kExploreWindowStep * 3);
    });

    test('stops at the ceiling and says so', () {
      while (notifier().grow()) {
        expect(
          container.read(exploreWindowProvider),
          lessThanOrEqualTo(kExploreWindowMax),
        );
      }
      expect(container.read(exploreWindowProvider), kExploreWindowMax);
      // The false return is what tells a caller there is no more to load,
      // rather than leaving it to ask for ever.
      expect(notifier().grow(), isFalse);
      expect(container.read(exploreCanLoadMoreProvider), isFalse);
    });

    test('resets when the member leaves the tab', () {
      notifier()
        ..grow()
        ..grow()
        ..reset();
      expect(container.read(exploreWindowProvider), kExploreWindowStep);
      expect(container.read(exploreCanLoadMoreProvider), isTrue);
    });
  });

  group('communityFeedWindowProvider', () {
    test('never asks for less than the Community tab needs', () {
      // Explore starts narrower than the community feed's own page, and the
      // Community tab reads the same provider — so it must not be shrunk by
      // somebody else's scroll position.
      expect(
        container.read(communityFeedWindowProvider),
        greaterThanOrEqualTo(CommunityRepository.feedPageSize),
      );
    });

    test('follows Explore once Explore is asking for more', () {
      for (var index = 0; index < 4; index++) {
        notifier().grow();
      }
      expect(
        container.read(communityFeedWindowProvider),
        container.read(exploreWindowProvider),
      );
    });
  });
}
