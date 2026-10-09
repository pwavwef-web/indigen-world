import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/features/community/compose_post_screen.dart';
import 'package:indigen_world_mobile/features/community/data/post_category.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'community_test_harness.dart';

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(
          const MethodChannel('com.llfbandit.record/messages'),
          (call) async => null,
        );
  });
  testWidgets(
    'search, no results, clear and selection reach the publication topic',
    (tester) async {
      final repository = _TagPostingRepository();
      await tester.pumpWidget(
        communityHarness(
          repository: repository,
          profile: fakeProfile(),
          child: const ComposePostScreen(),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Tag: Choose a tag'));
      await tester.pumpAndSettle();
      final search = find.widgetWithText(TextField, 'Search tags');
      await tester.enterText(search, 'no-such-topic');
      await tester.pump();
      expect(find.text('No matching tags'), findsOneWidget);
      await tester.tap(find.byTooltip('Clear search'));
      await tester.pump();
      expect(find.text('Questions'), findsOneWidget);
      await tester.enterText(search, 'EVENT');
      await tester.pump();
      expect(find.text('Events'), findsOneWidget);
      expect(find.text('Culture'), findsNothing);
      await tester.tap(find.text('Events'));
      await tester.pumpAndSettle();
      expect(find.text('Tag: Events'), findsOneWidget);
      await tester.enterText(
        find.byKey(const Key('community-composer')),
        'A community gathering.',
      );
      await tester.tap(find.byKey(const Key('community-publish')));
      await tester.pump();
      expect(repository.category, PostCategory.event);
      expect(repository.text, 'A community gathering.');
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump(const Duration(seconds: 1));
      expect(tester.takeException(), isNull);
    },
  );
}

class _TagPostingRepository extends FakeCommunityRepository {
  PostCategory? category;
  String? text;
  @override
  dynamic noSuchMethod(Invocation invocation) {
    if (invocation.memberName == #createPost) {
      category = invocation.namedArguments[#category] as PostCategory?;
      text = invocation.namedArguments[#text] as String?;
      return Future<String>.value('posted');
    }
    return super.noSuchMethod(invocation);
  }
}
