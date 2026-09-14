import 'package:flutter/material.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/collection/place_stories.dart';
import 'package:indigen_world_mobile/shared/glass_popup.dart';
import 'package:url_launcher/url_launcher.dart';

class PlaceStoryScreen extends StatelessWidget {
  const PlaceStoryScreen({required this.story, super.key});
  final PlaceStory story;

  Future<void> _open(BuildContext context, String url) async {
    try {
      if (await launchUrl(
        Uri.parse(url),
        mode: LaunchMode.externalApplication,
      )) {
        return;
      }
    } on Object {
      /* Show the same retry message for platform failures. */
    }
    if (context.mounted) {
      showGlassToast(context, 'Could not open the link. Try again.');
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: Text(story.location)),
    body: ListView(
      children: [
        Image.asset(
          story.image,
          width: double.infinity,
          height: 280,
          fit: BoxFit.cover,
        ),
        Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 700),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(24, 26, 24, 40),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    story.title,
                    style: Theme.of(context).textTheme.headlineMedium
                        ?.copyWith(fontWeight: FontWeight.w800),
                  ),
                  const SizedBox(height: 12),
                  Text(
                    story.subtitle,
                    style: TextStyle(
                      fontSize: 18,
                      color: context.brand.mutedInk,
                      height: 1.5,
                    ),
                  ),
                  const SizedBox(height: 24),
                  for (final paragraph in story.paragraphs)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 20),
                      child: Text(
                        paragraph,
                        style: const TextStyle(fontSize: 17, height: 1.7),
                      ),
                    ),
                  const Divider(),
                  Text(
                    'Photo: ${story.photographer} · ${story.license}',
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                  const Text(
                    'Photo displayed with a crop; original file unchanged.',
                  ),
                  Wrap(
                    spacing: 8,
                    children: [
                      TextButton(
                        onPressed: () => _open(context, story.source),
                        child: const Text('Story source'),
                      ),
                      TextButton(
                        onPressed: () => _open(context, story.photoSource),
                        child: const Text('Original photo'),
                      ),
                      TextButton(
                        onPressed: () => _open(context, story.licenseUrl),
                        child: Text(story.license),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
    ),
  );
}
