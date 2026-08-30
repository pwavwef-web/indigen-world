import 'package:flutter/material.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/heroes/heroes_data.dart';
import 'package:indigen_world_mobile/features/heroes/heroes_screen.dart';
import 'package:indigen_world_mobile/shared/app_widgets.dart';
import 'package:url_launcher/url_launcher.dart';

/// One life, in full.
class HeroDetailScreen extends StatelessWidget {
  const HeroDetailScreen({required this.hero, super.key});

  final KasemHero hero;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return Scaffold(
      appBar: AppBar(title: Text(hero.name)),
      body: ScreenContainer(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 40),
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                HeroPortrait(hero: hero, size: 96),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        hero.name,
                        style: Theme.of(context).textTheme.headlineSmall,
                      ),
                      if (hero.alsoKnownAs.isNotEmpty) ...[
                        const SizedBox(height: 3),
                        Text(
                          hero.alsoKnownAs,
                          style: TextStyle(
                            color: brand.mutedInk,
                            fontSize: 14,
                            fontStyle: FontStyle.italic,
                          ),
                        ),
                      ],
                      if (hero.subtitle.isNotEmpty) ...[
                        const SizedBox(height: 8),
                        Text(
                          hero.subtitle.toUpperCase(),
                          style: TextStyle(
                            color: brand.gold,
                            fontSize: 10.5,
                            fontWeight: FontWeight.w900,
                            letterSpacing: 1,
                          ),
                        ),
                      ],
                      if (hero.birthplace.isNotEmpty) ...[
                        const SizedBox(height: 6),
                        Row(
                          children: [
                            Icon(
                              Icons.place_outlined,
                              size: 14,
                              color: brand.mutedInk,
                            ),
                            const SizedBox(width: 5),
                            Flexible(
                              child: Text(
                                hero.birthplace,
                                style: TextStyle(
                                  color: brand.mutedInk,
                                  fontSize: 12.5,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ],
                  ),
                ),
              ],
            ),
            if (hero.summary.isNotEmpty) ...[
              const SizedBox(height: 22),
              Text(
                hero.summary,
                style: TextStyle(
                  color: brand.ink,
                  fontSize: 16,
                  height: 1.5,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
            if (hero.story.isNotEmpty) ...[
              const SizedBox(height: 18),
              Text(
                hero.story,
                style: TextStyle(
                  color: brand.mutedInk,
                  fontSize: 15.5,
                  height: 1.6,
                ),
              ),
            ],
            if (hero.sourceUrl.isNotEmpty) ...[
              const SizedBox(height: 26),
              // An account of somebody's life should say where it came from.
              // A community archive that cannot be checked is a rumour with a
              // logo on it.
              OutlinedButton.icon(
                onPressed: () => unawaitedLaunch(hero.sourceUrl),
                icon: const Icon(Icons.link_rounded, size: 18),
                label: const Text('Where this came from'),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// Opens [url] in the browser, swallowing a refusal — a link that will not open
/// is not worth an error dialogue on a page about somebody's life.
void unawaitedLaunch(String url) {
  final uri = Uri.tryParse(url);
  if (uri == null) return;
  launchUrl(uri, mode: LaunchMode.externalApplication).catchError((_) => false);
}
