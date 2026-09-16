import 'package:flutter/material.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/kawuri/kawuri_media_models.dart';

/// A media analysis, drawn so that what Kawuri saw can never be mistaken for
/// what it guessed.
///
/// Observations, possible context and the notes on what cannot be known each
/// get their own labelled section, and anything touching culture or language
/// carries the community-verification banner the backend requires.
class KawuriAnalysisCard extends StatelessWidget {
  const KawuriAnalysisCard({required this.result, super.key});

  final KawuriAnalysisResult result;

  @override
  Widget build(BuildContext context) {
    Widget section(String title, List<String> lines, {IconData? icon}) {
      if (lines.isEmpty) return const SizedBox.shrink();
      return Padding(
        padding: const EdgeInsets.only(top: 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                if (icon != null) ...[
                  Icon(icon, size: 15, color: context.brand.nightAccent),
                  const SizedBox(width: 6),
                ],
                Flexible(
                  child: Text(
                    title,
                    style: TextStyle(
                      color: context.brand.nightAccent,
                      fontSize: 12.5,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 4),
            for (final line in lines)
              Padding(
                padding: const EdgeInsets.only(bottom: 3),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      '•  ',
                      style: TextStyle(color: Color(0xFFE7C574), height: 1.45),
                    ),
                    Expanded(
                      child: SelectableText(
                        line,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 13.5,
                          height: 1.45,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
          ],
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (result.answer.isNotEmpty)
          SelectableText(
            result.answer,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 14.5,
              height: 1.5,
            ),
          ),
        if (result.summary.isNotEmpty && result.summary != result.answer)
          Padding(
            padding: EdgeInsets.only(top: result.answer.isEmpty ? 0 : 8),
            child: SelectableText(
              result.summary,
              style: TextStyle(
                color: Colors.white.withValues(alpha: 0.85),
                fontSize: 13.5,
                height: 1.45,
              ),
            ),
          ),
        section(
          'Seen directly',
          result.observations,
          icon: Icons.visibility_outlined,
        ),
        section(
          'Possible context · not verified',
          result.possibleContext,
          icon: Icons.help_outline_rounded,
        ),
        section(
          'Text found',
          result.detectedText,
          icon: Icons.text_snippet_outlined,
        ),
        section(
          'Suggested languages · not verified',
          result.suggestedLanguages,
          icon: Icons.translate_rounded,
        ),
        section(
          'Suggested topics',
          result.suggestedTopics,
          icon: Icons.sell_outlined,
        ),
        section(
          'What cannot be known from this',
          result.confidenceNotes,
          icon: Icons.info_outline_rounded,
        ),
        if (result.requiresCommunityVerification)
          Container(
            margin: const EdgeInsets.only(top: 12),
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: const Color(0xFF3A2F12),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: const Color(0xFF8A6D2B)),
            ),
            child: const Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(
                  Icons.groups_2_outlined,
                  size: 18,
                  color: Color(0xFFE7C574),
                ),
                SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'Needs community verification. Kawuri cannot confirm people, places, languages, rituals or meanings from media alone — ask in Community before treating any of this as fact.',
                    style: TextStyle(
                      color: Color(0xFFF2E2B8),
                      fontSize: 12,
                      height: 1.4,
                    ),
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }
}
