import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/features/explore/published_content.dart';

void main() {
  test('audio media is never treated as image artwork', () {
    const reel = PublishedReel(
      id: 'audio-1',
      title: 'A narrated story',
      creatorName: 'Community narrator',
      mediaType: 'audio',
      mediaUrl: 'https://example.test/story.mp3',
    );

    expect(reel.posterUrl, isNull);
  });

  test('an explicit thumbnail remains valid artwork for audio', () {
    const reel = PublishedReel(
      id: 'audio-2',
      title: 'A narrated story',
      creatorName: 'Community narrator',
      mediaType: 'audio',
      mediaUrl: 'https://example.test/story.mp3',
      thumbnailUrl: 'https://example.test/cover.jpg',
      body: 'The complete text survives publication.',
    );

    expect(reel.posterUrl, 'https://example.test/cover.jpg');
    expect(reel.body, contains('complete text'));
  });
}
