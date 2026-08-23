import 'package:flutter/material.dart';
import 'package:indigen_world_mobile/core/brand.dart';

/// The plain-language documents surfaced from Settings.
enum PolicyDocument { privacy, terms, guidelines }

/// Renders one policy document. The text lives in the app rather than behind a
/// link so it is readable offline and reviewable in the repository.
class PolicyScreen extends StatelessWidget {
  const PolicyScreen({required this.document, super.key});

  final PolicyDocument document;

  @override
  Widget build(BuildContext context) {
    final sections = switch (document) {
      PolicyDocument.privacy => _privacySections,
      PolicyDocument.terms => _termsSections,
      PolicyDocument.guidelines => _guidelineSections,
    };
    final title = switch (document) {
      PolicyDocument.privacy => 'Privacy and community data',
      PolicyDocument.terms => 'Terms of use',
      PolicyDocument.guidelines => 'Community guidelines',
    };

    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: ListView.separated(
        padding: const EdgeInsets.fromLTRB(20, 14, 20, 40),
        itemCount: sections.length,
        separatorBuilder: (context, index) => const SizedBox(height: 22),
        itemBuilder: (context, index) {
          final section = sections[index];
          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                section.heading,
                style: Theme.of(context).textTheme.titleMedium,
              ),
              const SizedBox(height: 8),
              Text(
                section.body,
                style: const TextStyle(
                  fontSize: 15,
                  height: 1.55,
                  color: BrandColors.ink,
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _PolicySection {
  const _PolicySection(this.heading, this.body);

  final String heading;
  final String body;
}

const _privacySections = <_PolicySection>[
  _PolicySection(
    'What stays on your device',
    'Saved words, contribution drafts, lesson progress and your onboarding '
        'choices are stored locally. They are not uploaded unless you sign in '
        'and publish them.',
  ),
  _PolicySection(
    'What your account stores',
    'Signing in creates a Firebase Authentication record holding your email '
        'address and, for Google sign-in, the name and photo Google supplies. '
        'Joining the community feed adds a public profile: your handle, '
        'display name, photo, cover image, bio, location and dialect. Anyone '
        'using the app can see that profile.',
  ),
  _PolicySection(
    'What the community feed shows',
    'Your posts, replies, photos and videos are visible to everyone in the '
        'community, along with who wrote them and when. Appreciations and '
        'follows are visible too. Saved posts are private to your account.',
  ),
  _PolicySection(
    'Contributions to the language record',
    'Words, sentences and recordings you contribute travel through the '
        'validation workflow. Nothing is published without a recorded consent '
        'entry and a licence you chose. You can withdraw consent, and '
        'withdrawal is handled by the project team so the audit record stays '
        'intact.',
  ),
  _PolicySection(
    'Diagnostics',
    'Release builds report crashes and basic performance data to help fix '
        'faults. These reports carry device and app details, not the content '
        'of your posts or contributions.',
  ),
  _PolicySection(
    'Deleting your data',
    'Deleting a post removes it and its media. Requesting account deletion '
        'from Settings removes your community profile, posts, saves and '
        'follows. Validated contributions already in the language record stay '
        'with the community; your name is removed from them on request.',
  ),
];

const _termsSections = <_PolicySection>[
  _PolicySection(
    'Who this agreement is between',
    'These terms cover your use of the Indigen World mobile app, run by the '
        'Indigen World project together with the Kasena communities whose '
        'language and culture the app carries.',
  ),
  _PolicySection(
    'Your account',
    'You are responsible for what happens under your account. One person, '
        'one account. Handles are claimed once and cannot be transferred.',
  ),
  _PolicySection(
    'What you post',
    'You keep ownership of what you post. By posting you allow Indigen World '
        'to show it to other members while your account exists. Do not post '
        'material you do not have the right to share, and do not post '
        'restricted cultural knowledge without the permission of the people '
        'it belongs to.',
  ),
  _PolicySection(
    'Cultural material',
    'Some knowledge is not ours to publish. Where a community marks material '
        'as restricted, the app keeps it restricted. Attempting to extract, '
        'scrape or republish restricted material outside the app is a breach '
        'of these terms.',
  ),
  _PolicySection(
    'Moderation',
    'Posts that are not in Kasem, are abusive, or breach cultural permissions '
        'may be removed, and accounts may be suspended. Reports go to project '
        'moderators.',
  ),
  _PolicySection(
    'The app is provided as it is',
    'The project works to keep the app accurate and available but cannot '
        'guarantee either. Language material is community knowledge under '
        'active validation, not certified linguistic advice.',
  ),
];

const _guidelineSections = <_PolicySection>[
  _PolicySection(
    'Kasem first',
    'This room exists so Kasem is spoken and read every day. Write your posts '
        'and replies in Kasem. Translations and glosses are welcome alongside '
        'the Kasem, not instead of it.',
  ),
  _PolicySection(
    'Learners are welcome',
    'Beginners will make mistakes. Correct gently and specifically. A '
        'community that laughs at learners stops having learners.',
  ),
  _PolicySection(
    'Respect what is not public',
    'Some songs, rites and stories belong to particular families, shrines or '
        'occasions. If something is not yours to share, do not post it — and '
        'do not press someone else to.',
  ),
  _PolicySection(
    'Credit people and places',
    'When you post a photo, a recording or a saying you learned from someone, '
        'name them if they agreed to be named. Attribution is how this record '
        'stays honest.',
  ),
  _PolicySection(
    'Report rather than argue',
    'If a post breaks these guidelines, use the report action. Moderators '
        'read every report and act on the ones that need action.',
  ),
];
