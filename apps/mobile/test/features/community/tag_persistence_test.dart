import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/features/community/data/compose_draft_store.dart';
import 'package:indigen_world_mobile/features/community/data/post_category.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test(
    'selected tag survives storage alongside text and media paths',
    () async {
      SharedPreferences.setMockInitialValues({});
      const store = ComposeDraftStore();
      await store.save(
        const ComposeDraft(
          text: 'Words',
          category: PostCategory.event,
          attachmentPaths: ['photo.jpg'],
        ),
      );
      final restored = await store.read();
      expect(restored?.category, PostCategory.event);
      expect(restored?.attachmentPaths, ['photo.jpg']);
      expect(restored?.text, 'Words');
    },
  );
  test(
    'older drafts and moderator announcement permissions remain compatible',
    () {
      expect(ComposeDraft.fromJson({'text': 'Words'})?.category, isNull);
      expect(
        PostCategory.choosable(canAnnounce: false),
        isNot(contains(PostCategory.announcement)),
      );
      expect(PostCategory.fromWire('language'), PostCategory.language);
    },
  );
}
