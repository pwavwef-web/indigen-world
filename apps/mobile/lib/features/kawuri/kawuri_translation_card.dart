import 'package:flutter/material.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/dictionary/entry_detail_screen.dart';
import 'package:just_audio/just_audio.dart';

/// A snapshot of a published match, with the live record one tap away.
class KawuriTranslationCard extends StatefulWidget {
  const KawuriTranslationCard({required this.source, super.key});
  final Map<String, Object?> source;
  @override
  State<KawuriTranslationCard> createState() => _KawuriTranslationCardState();
}

class _KawuriTranslationCardState extends State<KawuriTranslationCard> {
  AudioPlayer? _player;
  bool _busy = false;
  String? _error;
  @override
  void dispose() {
    _player?.dispose();
    super.dispose();
  }

  Future<void> _play() async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final player = _player ??= AudioPlayer();
      await player
          .setUrl(widget.source['audioUrl'] as String)
          .timeout(const Duration(seconds: 15));
      await player.play().timeout(const Duration(minutes: 2));
    } on Object {
      await _player?.stop();
      if (mounted) {
        setState(
          () => _error =
              'Recording could not play. Check your connection and retry.',
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final source = widget.source;
    final alternatives = (source['alternatives'] as List?)?.join('; ') ?? '';
    final audio = source['audioUrl'] as String? ?? '';
    return Container(
      margin: const EdgeInsets.only(top: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: context.brand.surfaceMuted,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: context.brand.nightAccent.withValues(alpha: .5)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '${source['direction']}',
            style: TextStyle(color: context.brand.nightAccent, fontSize: 12),
          ),
          const SizedBox(height: 8),
          SelectableText(
            '${source['sourceText']}',
            style: const TextStyle(color: Colors.white70),
          ),
          SelectableText(
            '${source['headword']} — ${source['translation']}',
            style: const TextStyle(
              color: Colors.white,
              fontWeight: FontWeight.w700,
              fontSize: 17,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'Published dictionary · Saved match',
            style: TextStyle(color: context.brand.nightAccent, fontSize: 11),
          ),
          Text(
            'Source: ${(source['source'] as String?)?.isNotEmpty == true ? source['source'] : 'Indigen World dictionary'}',
            style: const TextStyle(color: Colors.white70, fontSize: 12),
          ),
          if (alternatives.isNotEmpty)
            Text(
              'Meanings: $alternatives',
              style: const TextStyle(color: Colors.white70),
            ),
          if ((source['pronunciation'] as String?)?.isNotEmpty == true)
            Text(
              'Pronunciation: ${source['pronunciation']}',
              style: const TextStyle(color: Colors.white70),
            ),
          if (audio.isNotEmpty)
            TextButton.icon(
              onPressed: _busy ? null : _play,
              icon: Icon(
                _busy ? Icons.hourglass_top_rounded : Icons.volume_up_outlined,
              ),
              label: Text(_busy ? 'Playing recording…' : 'Hear pronunciation'),
            ),
          if (_error != null)
            Text(_error!, style: const TextStyle(color: Colors.amber)),
          TextButton.icon(
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute<void>(
                builder: (_) =>
                    EntryDetailScreen(entryId: source['id'] as String),
              ),
            ),
            icon: const Icon(Icons.menu_book_outlined, size: 18),
            label: const Text('View source / suggest correction'),
          ),
        ],
      ),
    );
  }
}
