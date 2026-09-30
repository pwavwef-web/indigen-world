// The one submissions list, narrowed four ways.
//
// My Space and Contribute used to open two different lists of the same
// records. There is one now, and the Approved count on My Space opens it
// already narrowed — so what "approved", "in review" and "needs changes" mean
// has to be written down once, here, and agree with the counts beside it.

import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/features/contribute/collection_contribution_repository.dart';
import 'package:indigen_world_mobile/features/contribute/contribution_kinds.dart';

void main() {
  const statuses = [
    'submitted',
    'under_review',
    'needs_changes',
    'needs_revision',
    'approved',
    'published',
    'scheduled',
    'archived',
    'rejected',
    'withdrawn',
  ];

  List<String> matching(SubmissionFilter filter) => [
    for (final status in statuses)
      if (filter.matches(status)) status,
  ];

  test('All is everything', () {
    expect(matching(SubmissionFilter.all), statuses);
  });

  test('In review is what a reviewer has not reached yet', () {
    expect(matching(SubmissionFilter.inReview), ['submitted', 'under_review']);
  });

  test('Needs changes is what came back with a note', () {
    expect(matching(SubmissionFilter.needsChanges), [
      'needs_changes',
      'needs_revision',
    ]);
  });

  test('Approved includes work approved without being made public', () {
    expect(matching(SubmissionFilter.approved), [
      'approved',
      'published',
      'scheduled',
      'archived',
    ]);
  });

  test('statuses are read whatever their case', () {
    expect(SubmissionFilter.approved.matches('PUBLISHED'), isTrue);
    expect(SubmissionFilter.needsChanges.matches('Needs_Changes'), isTrue);
  });

  group('contributionCountLabel', () {
    test('an exact count is printed as it is', () {
      expect(contributionCountLabel(12, capped: false), '12');
      expect(contributionCountLabel(180, capped: false), '180');
    });

    test('a full list that could not be counted says there may be more', () {
      expect(
        contributionCountLabel(kMyContributionsLimit, capped: true),
        '$kMyContributionsLimit+',
      );
      expect(contributionCountLabel(3, capped: true), '3');
    });
  });
}
