import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/features/collection/collection_data.dart';
import 'package:indigen_world_mobile/features/explore/published_content.dart';

/// Literature is a reading channel.
///
/// TribeStudio asks a creator for a category rather than a channel, and
/// `storytelling`, `folklore`, `oral-history` and `proverb` all resolve to
/// Literature — so a video of an elder telling a story published into the shelf
/// of written work. `publishedCollectionKind` in
/// services/functions/src/publication.ts sends new ones to Video; these are the
/// records already sitting in Firestore, which nothing rewrites.
void main() {
  const filmedStory = PublishedReel(
    id: 'told-at-the-baobab',
    title: 'Told at the baobab',
    creatorName: 'Amina Awe',
    mediaUrl: 'https://example.test/story.mp4',
    mediaType: 'video',
  );
  const documentStory = PublishedReel(
    id: 'the-sky-far-away',
    title: 'The sky far away',
    creatorName: 'Amina Awe',
    mediaUrl: 'https://example.test/story.pdf',
    mediaType: 'document',
  );
  const writtenStory = PublishedReel(
    id: 'the-millet-story',
    title: 'The millet story',
    creatorName: 'Akolgo Nyaaba',
    body: 'A harvest story from Paga.',
  );

  test('a film published under a story category stays off the Literature shelf', () {
    expect(belongsInCollection(filmedStory, CollectionKind.literature), isFalse);
  });

  test('documents and written work are what Literature is made of', () {
    expect(belongsInCollection(documentStory, CollectionKind.literature), isTrue);
    expect(belongsInCollection(writtenStory, CollectionKind.literature), isTrue);
    // A recorded reading filed under Literature is not a film, and the detail
    // screen already hands it to the shared music player.
    const reading = PublishedReel(
      id: 'read-aloud',
      title: 'Read aloud',
      creatorName: 'Amina Awe',
      mediaUrl: 'https://example.test/reading.mp3',
      mediaType: 'audio',
    );
    expect(belongsInCollection(reading, CollectionKind.literature), isTrue);
  });

  test('the rule is Literature only — every other channel keeps its own', () {
    // The same record belongs on the Video shelf, which is where the
    // publication workflow now sends it.
    expect(belongsInCollection(filmedStory, CollectionKind.video), isTrue);
    expect(belongsInCollection(filmedStory, CollectionKind.music), isTrue);
    expect(belongsInCollection(filmedStory, CollectionKind.audiobooks), isTrue);
  });

  test('a record with no mediaType at all is written work, not a film', () {
    // `mediaType` is null on everything published before the workflow began
    // inferring it. Dropping those would empty the shelf it was meant to tidy.
    expect(writtenStory.isVideo, isFalse);
    expect(belongsInCollection(writtenStory, CollectionKind.literature), isTrue);
  });
}
