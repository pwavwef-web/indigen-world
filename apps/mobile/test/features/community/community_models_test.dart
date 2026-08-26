import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/features/community/data/community_models.dart';
import 'package:indigen_world_mobile/features/community/data/community_repository.dart';

void main() {
  group('normaliseUsername', () {
    test('lowercases and strips everything outside [a-z0-9_]', () {
      expect(normaliseUsername('  Amina Ayaribisa! '), 'aminaayaribisa');
      expect(normaliseUsername('Nyaaba-Atanga'), 'nyaabaatanga');
      expect(normaliseUsername('project.kasena'), 'projectkasena');
    });

    test('collapses runs of underscores and caps the length at 20', () {
      expect(normaliseUsername('a__b___c'), 'a_b_c');
      expect(normaliseUsername('a' * 40).length, 20);
    });

    test('returns an empty string when nothing usable survives', () {
      expect(normaliseUsername('!!! ???'), '');
    });
  });

  group('validateUsername', () {
    test('accepts a well-formed handle', () {
      expect(validateUsername('amina_paga'), isNull);
      expect(validateUsername('abc'), isNull);
    });

    test('rejects handles that are too short or too long', () {
      expect(validateUsername('ab'), isNotNull);
      expect(validateUsername('a' * 21), isNotNull);
    });

    test('rejects handles that do not start with a letter', () {
      expect(validateUsername('1amina'), isNotNull);
      expect(validateUsername('_amina'), isNotNull);
    });

    test('rejects characters outside the allowed set', () {
      expect(validateUsername('amina paga'), isNotNull);
      expect(validateUsername('Amina'), isNotNull);
    });

    test('agrees with the pattern the Firestore rules enforce', () {
      // firebase/firestore.rules: username.matches('^[a-z][a-z0-9_]{2,19}$')
      final rulesPattern = RegExp(r'^[a-z][a-z0-9_]{2,19}$');
      for (final candidate in [
        'amina_paga',
        'abc',
        'ab',
        '1amina',
        '_amina',
        'Amina',
        'a' * 21,
        'a' * 20,
      ]) {
        expect(
          validateUsername(candidate) == null,
          rulesPattern.hasMatch(candidate),
          reason: 'client and rules disagree about "$candidate"',
        );
      }
    });
  });

  group('communityAgeLabel', () {
    final now = DateTime(2026, 8, 23, 12);

    test('reads NOW for anything under a minute old', () {
      expect(communityAgeLabel(now, now: now), 'NOW');
      expect(
        communityAgeLabel(now.subtract(const Duration(seconds: 30)), now: now),
        'NOW',
      );
    });

    test('steps through minutes, hours, days, weeks and years', () {
      expect(
        communityAgeLabel(now.subtract(const Duration(minutes: 12)), now: now),
        '12 MIN',
      );
      expect(
        communityAgeLabel(now.subtract(const Duration(hours: 3)), now: now),
        '3 HR',
      );
      expect(
        communityAgeLabel(now.subtract(const Duration(days: 5)), now: now),
        '5 D',
      );
      expect(
        communityAgeLabel(now.subtract(const Duration(days: 21)), now: now),
        '3 W',
      );
      expect(
        communityAgeLabel(now.subtract(const Duration(days: 800)), now: now),
        '2 Y',
      );
    });

    test('treats a missing or future timestamp as NOW', () {
      // A pending serverTimestamp reads as null on the local write echo.
      expect(communityAgeLabel(null, now: now), 'NOW');
      expect(
        communityAgeLabel(now.add(const Duration(minutes: 5)), now: now),
        'NOW',
      );
    });
  });

  group('communityCountLabel', () {
    test('shows plain numbers below a thousand', () {
      expect(communityCountLabel(0), '0');
      expect(communityCountLabel(-3), '0');
      expect(communityCountLabel(999), '999');
    });

    test('abbreviates thousands and millions', () {
      expect(communityCountLabel(1000), '1K');
      expect(communityCountLabel(1200), '1.2K');
      expect(communityCountLabel(1000000), '1M');
      expect(communityCountLabel(2500000), '2.5M');
    });
  });

  group('CommunityMedia', () {
    test('parses a stored attachment', () {
      final media = CommunityMedia.fromMap({
        'url': 'https://example.test/a.mp4',
        'type': 'video',
        'storagePath': 'community-media/u1/p1/0_a.mp4',
        'aspectRatio': 0.5625,
      });

      expect(media, isNotNull);
      expect(media!.isVideo, isTrue);
      expect(media.aspectRatio, closeTo(0.5625, 1e-9));
      expect(media.storagePath, 'community-media/u1/p1/0_a.mp4');
    });

    test('drops entries without a usable url', () {
      expect(CommunityMedia.fromMap({'type': 'image'}), isNull);
      expect(CommunityMedia.fromMap({'url': ''}), isNull);
      expect(CommunityMedia.fromMap('not a map'), isNull);
    });

    test('falls back to an image at 4:3 for unknown metadata', () {
      final media = CommunityMedia.fromMap({'url': 'https://example.test/a'});
      expect(media!.isVideo, isFalse);
      expect(media.aspectRatio, closeTo(4 / 3, 1e-9));
    });

    test('round-trips through toMap', () {
      const original = CommunityMedia(
        url: 'https://example.test/a.jpg',
        type: 'image',
        storagePath: 'community-media/u1/p1/0_a.jpg',
        aspectRatio: 1.5,
      );
      final restored = CommunityMedia.fromMap(original.toMap())!;

      expect(restored.url, original.url);
      expect(restored.type, original.type);
      expect(restored.storagePath, original.storagePath);
      expect(restored.aspectRatio, original.aspectRatio);
    });

    test('voice notes retain their kind and duration', () {
      final media = CommunityMedia.fromMap({
        'url': 'https://example.test/voice.m4a',
        'type': 'audio',
        'durationSeconds': 42,
      })!;
      expect(media.isAudio, isTrue);
      expect(media.isVideo, isFalse);
      expect(media.durationSeconds, 42);
      expect(media.toMap()['durationSeconds'], 42);
    });
  });

  group('polls and quote posts', () {
    test('a valid poll parses its choices and totals', () {
      final poll = CommunityPoll.fromMap({
        'options': [
          {'id': 'one', 'text': 'Paga', 'voteCount': 3},
          {'id': 'two', 'text': 'Navrongo', 'voteCount': 2},
        ],
        'endsAt': DateTime(2026, 8, 30),
        'totalVotes': 5,
      })!;
      expect(poll.options, hasLength(2));
      expect(poll.options.first.voteCount, 3);
      expect(poll.totalVotes, 5);
    });

    test('a fresh ballot shows before the server tally catches up', () {
      final poll = CommunityPoll.fromMap({
        'options': [
          {'id': 'one', 'text': 'Paga'},
          {'id': 'two', 'text': 'Navrongo'},
        ],
        'endsAt': DateTime(2026, 8, 30),
      })!;

      final counted = poll.includingBallot('two');

      expect(counted.totalVotes, 1);
      expect(counted.options.firstWhere((o) => o.id == 'two').voteCount, 1);
      // Only the chosen option moves.
      expect(counted.options.firstWhere((o) => o.id == 'one').voteCount, 0);
    });

    test('a server tally that already counted the ballot is left alone', () {
      final poll = CommunityPoll.fromMap({
        'options': [
          {'id': 'one', 'text': 'Paga', 'voteCount': 3},
          {'id': 'two', 'text': 'Navrongo', 'voteCount': 2},
        ],
        'endsAt': DateTime(2026, 8, 30),
        'totalVotes': 5,
      })!;

      expect(poll.includingBallot('two'), same(poll));
      expect(poll.includingBallot(null), same(poll));
      expect(poll.includingBallot('no-such-option'), same(poll));
    });

    test('posts expose every SRC-style count and nested quote', () {
      final post = CommunityPost.fromMap('quote1', {
        'authorId': 'u2',
        'author': {'displayName': 'Nyaaba', 'username': 'nyaaba'},
        'text': 'N kana de.',
        'media': [],
        'likeCount': 4,
        'replyCount': 2,
        'repostCount': 7,
        'quoteCount': 3,
        'viewCount': 81,
        'quotedPostId': 'source1',
        'quotedPost': {
          'id': 'source1',
          'authorId': 'u1',
          'author': {'displayName': 'Amina', 'username': 'amina'},
          'text': 'De zaanem.',
          'media': [],
          'likeCount': 1,
          'replyCount': 0,
        },
      });
      expect(post.isQuote, isTrue);
      expect(post.quotedPost?.text, 'De zaanem.');
      expect(post.reshareAndQuoteCount, 10);
      expect(post.viewCount, 81);
    });

    test('the first safe web link is exposed for the preview card', () {
      final post = CommunityPost.fromMap('link1', {
        'authorId': 'u1',
        'author': {'displayName': 'Amina', 'username': 'amina'},
        'text': 'Read https://indigenworld.com/learn, then tell us.',
        'media': [],
      });
      expect(post.firstLink, 'https://indigenworld.com/learn');
    });
  });

  group('initials', () {
    test('uses two words when the display name has them', () {
      const profile = CommunityProfile(
        uid: 'u1',
        username: 'amina_paga',
        displayName: 'Amina Ayaribisa',
      );
      expect(profile.initials, 'AA');
      expect(profile.handle, '@amina_paga');
    });

    test('falls back to the first two letters of a single word', () {
      const profile = CommunityProfile(
        uid: 'u1',
        username: 'nyaaba',
        displayName: 'Nyaaba',
      );
      expect(profile.initials, 'NY');
    });

    test('falls back to the handle when there is no display name', () {
      const profile = CommunityProfile(
        uid: 'u1',
        username: 'kasena',
        displayName: '',
      );
      expect(profile.initials, 'KA');
    });
  });

  group('PendingUpload', () {
    test('derives a content type from the file extension', () {
      expect(
        const PendingUpload(path: '/tmp/a/b.JPG', isVideo: false).contentType,
        'image/jpeg',
      );
      expect(
        const PendingUpload(
          path: r'C:\tmp\clip.mov',
          isVideo: true,
        ).contentType,
        'video/quicktime',
      );
    });

    test('falls back on the media kind when the extension is unknown', () {
      expect(
        const PendingUpload(path: '/tmp/capture', isVideo: true).contentType,
        'video/mp4',
      );
      expect(
        const PendingUpload(path: '/tmp/capture', isVideo: false).contentType,
        'image/jpeg',
      );
      expect(
        const PendingUpload(
          path: '/tmp/voice.m4a',
          isVideo: false,
          isAudio: true,
        ).contentType,
        'audio/mp4',
      );
    });

    test('reads the file name from either path separator', () {
      expect(
        const PendingUpload(path: r'C:\tmp\clip.mov', isVideo: true).fileName,
        'clip.mov',
      );
      expect(
        const PendingUpload(path: '/tmp/clip.mov', isVideo: true).fileName,
        'clip.mov',
      );
    });
  });

  group('CommunityRepository.edgeId', () {
    test('composes the id the Firestore rules validate against', () {
      // firebase/firestore.rules: communityOwnsEdge(edgeId, uid, otherId)
      expect(CommunityRepository.edgeId('uid1', 'post1'), 'uid1_post1');
    });
  });
}
