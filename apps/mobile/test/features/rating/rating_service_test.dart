import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/features/rating/rating_service.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// The rules deciding who is asked to rate the app.
///
/// The highest-value tests in this feature, because the real thing cannot be
/// observed: `requestReview` reports nothing, Play discards requests over quota
/// in silence, and every mistimed ask spends one of a handful a member gets in
/// a year. If this logic is wrong, nothing anywhere says so.
void main() {
  final installed = DateTime(2026, 1, 1);

  Set<String> days(int count, {DateTime? from}) => {
    for (var index = 0; index < count; index++)
      ratingDayKey((from ?? installed).add(Duration(days: index))),
  };

  RatingState state({
    Set<String>? activeDays,
    DateTime? lastAskedAt,
    String? lastAskedVersion,
    String currentVersion = '1.0.0+2',
  }) => RatingState(
    firstLaunch: installed,
    activeDays: activeDays ?? days(5),
    currentVersion: currentVersion,
    lastAskedAt: lastAskedAt,
    lastAskedVersion: lastAskedVersion,
  );

  const rules = RatingRules(
    enabled: true,
    minDays: 7,
    minActiveDays: 3,
    cooldownDays: 120,
  );

  bool ask({
    RatingState? on,
    RatingRules using = rules,
    DateTime? at,
    bool online = true,
  }) => shouldRequestReview(
    state: on ?? state(),
    rules: using,
    now: at ?? installed.add(const Duration(days: 30)),
    online: online,
  );

  group('shouldRequestReview', () {
    test('asks an established member who has never been asked', () {
      expect(ask(), isTrue);
    });

    test('the Remote Config switch overrides everything', () {
      // The only way to stop the prompt without shipping a release, so it has
      // to win against a member who otherwise qualifies on every count.
      expect(ask(using: RatingRules.disabled), isFalse);
    });

    test('never asks somebody who installed the app this week', () {
      expect(ask(at: installed.add(const Duration(days: 6))), isFalse);
      expect(ask(at: installed.add(const Duration(days: 7))), isTrue);
    });

    test('never asks on one long session', () {
      // Three distinct days, not three openings — the question is really
      // whether this has become part of somebody's week.
      expect(ask(on: state(activeDays: days(2))), isFalse);
      expect(ask(on: state(activeDays: days(3))), isTrue);
    });

    test('never asks while offline', () {
      // Play needs the network to fetch the flow. Offline it fails silently,
      // which is indistinguishable from a member declining — and spends the
      // attempt anyway.
      expect(ask(online: false), isFalse);
    });

    test('never asks twice on the same version', () {
      final asked = state(
        lastAskedAt: installed.add(const Duration(days: 10)),
        lastAskedVersion: '1.0.0+2',
        currentVersion: '1.0.0+2',
      );
      // Even long after the cooldown: the member has already answered this
      // question about this app.
      expect(
        ask(on: asked, at: installed.add(const Duration(days: 400))),
        isFalse,
      );
    });

    test('a new version alone is not enough', () {
      final asked = state(
        lastAskedAt: installed.add(const Duration(days: 10)),
        lastAskedVersion: '1.0.0+2',
        currentVersion: '1.1.0+9',
      );
      // Shipping twice in a fortnight must not mean asking twice in one.
      expect(
        ask(on: asked, at: installed.add(const Duration(days: 24))),
        isFalse,
      );
    });

    test('asks again after both the cooldown and a release', () {
      final asked = state(
        lastAskedAt: installed.add(const Duration(days: 10)),
        lastAskedVersion: '1.0.0+2',
        currentVersion: '1.1.0+9',
      );
      expect(
        ask(on: asked, at: installed.add(const Duration(days: 131))),
        isTrue,
      );
    });
  });

  group('recordRatingActivity', () {
    setUp(() => SharedPreferences.setMockInitialValues({}));

    test('stamps first launch once and never moves it', () async {
      // The clock the whole gate hangs off. Resetting it on a later launch
      // would push the first ask permanently out of reach.
      await recordRatingActivity(now: installed);
      await recordRatingActivity(now: installed.add(const Duration(days: 9)));
      final preferences = await SharedPreferences.getInstance();
      expect(
        preferences.getInt(ratingFirstLaunchKey),
        installed.millisecondsSinceEpoch,
      );
    });

    test('counts a day once however many times the app is opened', () async {
      await recordRatingActivity(now: DateTime(2026, 1, 1, 9));
      await recordRatingActivity(now: DateTime(2026, 1, 1, 18));
      await recordRatingActivity(now: DateTime(2026, 1, 2, 7));
      final read = await readRatingState(version: '1.0.0+1');
      expect(read.activeDays, {'2026-01-01', '2026-01-02'});
    });

    test('a day key is stable across times of day', () {
      expect(ratingDayKey(DateTime(2026, 3, 4, 23, 59)), '2026-03-04');
      expect(ratingDayKey(DateTime(2026, 3, 4, 0, 1)), '2026-03-04');
      // Zero-padded, so the set never holds two spellings of one day.
      expect(ratingDayKey(DateTime(2026, 12, 25)), '2026-12-25');
    });
  });

  group('recordReviewRequested', () {
    setUp(() => SharedPreferences.setMockInitialValues({}));

    test('an attempt closes the door on this version immediately', () async {
      // Written before the request, because the request reports nothing — a
      // failure that read as "did not happen" would ask again on the next
      // lesson, and the one after that.
      await recordRatingActivity(now: installed);
      await recordReviewRequested(
        version: '1.0.0+2',
        now: installed.add(const Duration(days: 30)),
      );
      final read = await readRatingState(version: '1.0.0+2');
      expect(
        shouldRequestReview(
          state: read,
          rules: rules,
          now: installed.add(const Duration(days: 31)),
          online: true,
        ),
        isFalse,
      );
    });
  });
}
