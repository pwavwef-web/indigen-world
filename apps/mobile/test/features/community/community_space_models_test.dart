// Sub-communities: the rules a community has to satisfy before it can be
// created, the address it gets, how it is found, and who may read it.
//
// These are the same checks the create form runs as you type and the
// repository runs again before writing, so a wrong answer here is a community
// that fails to publish — or, worse, one that publishes when it should not.

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/features/community/data/community_models.dart';
import 'package:indigen_world_mobile/features/community/data/community_prompt.dart';
import 'package:indigen_world_mobile/features/community/data/community_space_models.dart';
import 'package:indigen_world_mobile/features/community/data/post_category.dart';

void main() {
  group('addresses', () {
    test('a name becomes a lowercase hyphenated address', () {
      expect(
        slugifyCommunityName('Navrongo Kasem Circle'),
        'navrongo-kasem-circle',
      );
      expect(slugifyCommunityName('  Paga -- Youth!! '), 'paga-youth');
    });

    test('Kasem letters and tone marks fold to plain Latin', () {
      expect(slugifyCommunityName('Kɔrɔ Ŋwaaŋa'), 'koro-ngwaanga');
      // A combining acute over a vowel is a tone mark, not a letter.
      expect(slugifyCommunityName('Ka\u0301sem Ba\u0300'), 'kasem-ba');
      expect(
        slugifyCommunityName('Tiébélé Wall Painters'),
        'tiebele-wall-painters',
      );
    });

    test('a long name is cut to the limit without a trailing hyphen', () {
      final slug = slugifyCommunityName(
        'The Kassena Nankana Traditional Wall Painting Society of Sirigu',
      );
      expect(slug.length, lessThanOrEqualTo(kCommunitySlugMax));
      expect(slug.endsWith('-'), isFalse);
      expect(validateCommunitySlug(slug), isNull);
    });

    test('only well-formed, unreserved addresses are accepted', () {
      expect(validateCommunitySlug('kasem-circle'), isNull);
      expect(validateCommunitySlug('paga2026'), isNull);
      expect(validateCommunitySlug(''), isNotNull);
      expect(validateCommunitySlug('ab'), isNotNull);
      expect(validateCommunitySlug('Kasem-Circle'), isNotNull);
      expect(validateCommunitySlug('-kasem'), isNotNull);
      expect(validateCommunitySlug('kasem-'), isNotNull);
      expect(validateCommunitySlug('kasem--circle'), isNotNull);
      expect(validateCommunitySlug('kasem_circle'), isNotNull);
      expect(validateCommunitySlug('a' * (kCommunitySlugMax + 1)), isNotNull);
      expect(validateCommunitySlug('kawuri'), contains('reserved'));
      expect(validateCommunitySlug('admin'), contains('reserved'));
    });
  });

  group('creating a community', () {
    CommunityDraft draft({
      String name = 'Navrongo Kasem Circle',
      String? slug,
      String description = 'Words from home.',
      List<String> rules = const [
        'Be kind.',
        '  ',
        'Speak Kasem when you can.',
      ],
    }) => CommunityDraft(
      name: name,
      slug: slug ?? slugifyCommunityName(name),
      description: description,
      language: 'Kasem',
      location: 'Navrongo',
      visibility: CommunityVisibility.private,
      rules: rules,
    );

    test('empty, short, overlong and symbol-only names are refused', () {
      expect(validateCommunityName(''), 'Give the community a name.');
      expect(validateCommunityName('   '), 'Give the community a name.');
      expect(validateCommunityName('Ab'), isNotNull);
      expect(validateCommunityName('x' * (kCommunityNameMax + 1)), isNotNull);
      expect(validateCommunityName('!!! ???'), isNotNull);
      expect(validateCommunityName('Paga'), isNull);
    });

    test('a description past the limit is refused', () {
      expect(
        validateCommunityDescription('x' * kCommunityDescriptionMax),
        isNull,
      );
      expect(
        validateCommunityDescription('x' * (kCommunityDescriptionMax + 1)),
        isNotNull,
      );
      expect(
        draft(description: 'x' * (kCommunityDescriptionMax + 1)).validate(),
        contains('Descriptions'),
      );
    });

    test('too many or too long rules are refused', () {
      expect(
        draft(rules: List.filled(kCommunityRulesMax + 1, 'Be kind.'))
            .validate(),
        isNotNull,
      );
      expect(
        draft(rules: ['x' * (kCommunityRuleMax + 1)]).validate(),
        isNotNull,
      );
    });

    test('only JPG, PNG and WebP pictures under the limit are accepted', () {
      expect(validateCommunityImage(path: '/tmp/a.jpg', bytes: 1024), isNull);
      expect(
        validateCommunityImage(path: r'C:\pics\B.PNG', bytes: 1024),
        isNull,
      );
      expect(validateCommunityImage(path: '/tmp/c.webp', bytes: 1024), isNull);
      expect(
        validateCommunityImage(path: '/tmp/d.gif', bytes: 1024),
        isNotNull,
      );
      expect(
        validateCommunityImage(path: '/tmp/e.heic', bytes: 1024),
        isNotNull,
      );
      expect(
        validateCommunityImage(path: '/tmp/noextension', bytes: 1024),
        isNotNull,
      );
      expect(validateCommunityImage(path: '/tmp/f.jpg', bytes: 0), isNotNull);
      expect(
        validateCommunityImage(
          path: '/tmp/g.jpg',
          bytes: kCommunityImageMaxBytes + 1,
        ),
        isNotNull,
      );
    });

    test('a valid draft writes exactly what the rules expect', () {
      final valid = draft();
      expect(valid.validate(), isNull);
      final map = valid.toCreateMap(ownerId: 'owner-uid');
      expect(map['slug'], 'navrongo-kasem-circle');
      expect(map['name'], 'Navrongo Kasem Circle');
      expect(map['nameLower'], 'navrongo kasem circle');
      expect(map['ownerId'], 'owner-uid');
      expect(map['memberCount'], 1);
      expect(map['status'], 'active');
      expect(map['visibility'], 'private');
      expect(map['category'], 'language');
      // Blank rules the form leaves behind are not published.
      expect(map['rules'], ['Be kind.', 'Speak Kasem when you can.']);
      expect(map['createdAt'], isA<FieldValue>());
      final tokens = map['searchTokens']! as List<String>;
      expect(tokens, containsAll(['na', 'nav', 'navrongo', 'ka', 'kasem']));
      expect(tokens.length, lessThanOrEqualTo(120));
    });
  });

  group('finding a community', () {
    const circle = CommunitySpace(
      id: 'paga-singers',
      name: 'Paga Singers',
      ownerId: 'owner',
      category: CommunityCategory.music,
      language: 'Kasem',
      location: 'Paga',
    );

    test('matches by name, language, place, category and address prefixes', () {
      expect(communityMatchesQuery(circle, 'paga'), isTrue);
      expect(communityMatchesQuery(circle, 'sing'), isTrue);
      expect(communityMatchesQuery(circle, 'KASEM'), isTrue);
      expect(communityMatchesQuery(circle, 'music'), isTrue);
      expect(communityMatchesQuery(circle, 'kasem singers'), isTrue);
      expect(communityMatchesQuery(circle, 'navrongo'), isFalse);
      expect(communityMatchesQuery(circle, 'kasem navrongo'), isFalse);
      // A single character is not a search.
      expect(communityMatchesQuery(circle, 'p'), isFalse);
    });

    test('folds the query the same way the tokens were folded', () {
      expect(communityQueryWords('Kɔrɔ, Pága!'), ['koro', 'paga']);
    });
  });

  group('access', () {
    const public = CommunitySpace(id: 'open', name: 'Open', ownerId: 'o');
    const private = CommunitySpace(
      id: 'closed',
      name: 'Closed',
      ownerId: 'o',
      visibility: CommunityVisibility.private,
    );
    CommunityMembership row(MembershipStatus status) => CommunityMembership(
      communityId: 'closed',
      uid: 'me',
      role: CommunityRole.member,
      status: status,
    );

    test('resolves every state the join button and locked feed draw', () {
      expect(
        resolveCommunityAccess(space: null, uid: 'me', membership: null),
        CommunityAccess.unavailable,
      );
      expect(
        resolveCommunityAccess(
          space: const CommunitySpace(
            id: 'gone',
            name: 'Gone',
            ownerId: 'o',
            status: 'removed',
          ),
          uid: 'me',
          membership: null,
        ),
        CommunityAccess.unavailable,
      );
      expect(
        resolveCommunityAccess(space: private, uid: null, membership: null),
        CommunityAccess.guest,
      );
      expect(
        resolveCommunityAccess(space: private, uid: 'me', membership: null),
        CommunityAccess.none,
      );
      expect(
        resolveCommunityAccess(
          space: private,
          uid: 'me',
          membership: row(MembershipStatus.pending),
        ),
        CommunityAccess.pending,
      );
      expect(
        resolveCommunityAccess(
          space: private,
          uid: 'me',
          membership: row(MembershipStatus.banned),
        ),
        CommunityAccess.banned,
      );
      expect(
        resolveCommunityAccess(
          space: private,
          uid: 'me',
          membership: row(MembershipStatus.active),
        ),
        CommunityAccess.member,
      );
    });

    test('a private community is readable by members only', () {
      expect(canReadCommunityContent(public, CommunityAccess.guest), isTrue);
      expect(canReadCommunityContent(public, CommunityAccess.none), isTrue);
      expect(canReadCommunityContent(private, CommunityAccess.guest), isFalse);
      expect(
        canReadCommunityContent(private, CommunityAccess.pending),
        isFalse,
      );
      expect(canReadCommunityContent(private, CommunityAccess.member), isTrue);
      expect(
        canReadCommunityContent(public, CommunityAccess.unavailable),
        isFalse,
      );
    });

    test('roles only act on the ranks below them', () {
      expect(CommunityRole.owner.outranks(CommunityRole.admin), isTrue);
      expect(CommunityRole.admin.outranks(CommunityRole.moderator), isTrue);
      expect(CommunityRole.moderator.outranks(CommunityRole.member), isTrue);
      expect(
        CommunityRole.moderator.outranks(CommunityRole.moderator),
        isFalse,
      );
      expect(CommunityRole.member.outranks(CommunityRole.member), isFalse);
      expect(CommunityRole.moderator.canModerate, isTrue);
      expect(CommunityRole.moderator.canAdminister, isFalse);
    });
  });

  group('documents', () {
    test('a community reads defensively from Firestore data', () {
      final space = CommunitySpace.fromMap('kasem-circle', {
        'name': '  Kasem Circle ',
        'ownerId': 'owner',
        'visibility': 'private',
        'category': 'not-a-category',
        'memberCount': -3,
        'rules': ['Be kind.', 42, '   '],
      });
      expect(space.name, 'Kasem Circle');
      expect(space.isPrivate, isTrue);
      expect(space.category, CommunityCategory.other);
      expect(space.memberCount, 0);
      expect(space.rules, ['Be kind.']);
      expect(space.isAvailable, isTrue);
      expect(space.initials, 'KC');
    });

    test('a post knows its community, its category and where it lives', () {
      final public = CommunityPost.fromMap('p1', {
        'authorId': 'a',
        'communityId': 'kasem-circle',
        'communityName': 'Kasem Circle',
        'communityVisibility': 'public',
        'category': 'question',
      });
      expect(public.community?.name, 'Kasem Circle');
      expect(public.category, PostCategory.question);
      expect(public.privateCommunityId, isNull);

      final private = CommunityPost.fromMap('p2', {
        'authorId': 'a',
        'communityId': 'closed',
        'communityVisibility': 'private',
      });
      expect(private.privateCommunityId, 'closed');
      expect(private.isPrivateCommunityPost, isTrue);

      final plain = CommunityPost.fromMap('p3', {
        'authorId': 'a',
        'category': 'gossip',
      });
      expect(plain.community, isNull);
      expect(plain.category, isNull);
    });

    test('a reshared copy keeps the community and category', () {
      final post = CommunityPost.fromMap('p1', {
        'authorId': 'a',
        'communityId': 'kasem-circle',
        'category': 'music',
      });
      final reshared = post.withReshare(
        uid: 'b',
        displayName: 'B',
        username: 'b',
        createdAt: DateTime(2026, 9),
      );
      expect(reshared.community?.id, 'kasem-circle');
      expect(reshared.category, PostCategory.music);
      expect(post.withLikeCount(-4).likeCount, 0);
    });

    test('announcements are offered only to those allowed to make them', () {
      expect(
        PostCategory.choosable(canAnnounce: false),
        isNot(contains(PostCategory.announcement)),
      );
      expect(
        PostCategory.choosable(canAnnounce: true),
        contains(PostCategory.announcement),
      );
    });
  });

  group('daily prompts', () {
    final now = DateTime(2026, 9, 13, 12);

    test('a live prompt is read with its category and hint', () {
      final prompt = CommunityPrompt.fromMap('home', {
        'title': 'Today in Kasem',
        'subtitle': 'Share a word from home',
        'composeHint': 'A word, and what it means…',
        'category': 'language',
        'startsAt': Timestamp.fromDate(DateTime(2026, 9, 13)),
        'endsAt': Timestamp.fromDate(DateTime(2026, 9, 14)),
      }, now: now);
      expect(prompt?.title, 'Today in Kasem');
      expect(prompt?.category, PostCategory.language);
      expect(prompt?.composeHint, 'A word, and what it means…');
    });

    test(
      'switched off, not started, finished or untitled prompts are hidden',
      () {
        expect(
          CommunityPrompt.fromMap('home', {
            'title': 'Off',
            'active': false,
          }, now: now),
          isNull,
        );
        expect(
          CommunityPrompt.fromMap('home', {
            'title': 'Tomorrow',
            'startsAt': Timestamp.fromDate(DateTime(2026, 9, 14)),
          }, now: now),
          isNull,
        );
        expect(
          CommunityPrompt.fromMap('home', {
            'title': 'Yesterday',
            'endsAt': Timestamp.fromDate(DateTime(2026, 9, 13, 11)),
          }, now: now),
          isNull,
        );
        expect(
          CommunityPrompt.fromMap('home', {'title': ' '}, now: now),
          isNull,
        );
      },
    );
  });
}
