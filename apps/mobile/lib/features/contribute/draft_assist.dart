import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/core/firebase_ready.dart';
import 'package:indigen_world_mobile/shared/glass_surface.dart';

/// A second pair of eyes on a contribution, while the person is still in the
/// form.
///
/// ── Advice, never a gate ─────────────────────────────────────────────────
/// Nothing here can stop a submission. The send button does not consult it,
/// there is no severity that disables anything, and a check that fails to load
/// leaves the form exactly as it was. That is deliberate and it is not a
/// matter of politeness: this project's rule is that language is confirmed by
/// appointed speakers, so a form that could refuse a speaker's own word would
/// have put a heuristic above the people the archive exists to record.
///
/// What it is for is the class of review outcome that never needed a reviewer.
/// "We already have this one." "That is the English in the Kasem box." Those
/// came back days later, from the scarcest resource the project has, to answer
/// a question the contributor could have answered themselves in the moment —
/// and the most useful of them, by a distance, is the one nobody had ever been
/// asked: the dictionary already holds eight words spelled `ni`, is yours a
/// ninth or one of those?
///
/// See `services/functions/src/contribution-assist.ts`.

/// How loudly a check wants to be read. There is no level above [ask].
enum AssistSeverity {
  /// A question only the contributor can answer — is this the same word?
  ask,

  /// Something that looks like a slip, such as the two boxes being swapped.
  warn,

  /// Worth knowing, costs nothing to ignore.
  note;

  static AssistSeverity from(String? wire) => switch (wire) {
    'ask' => AssistSeverity.ask,
    'warn' => AssistSeverity.warn,
    _ => AssistSeverity.note,
  };

  Color color(BrandPalette brand) => switch (this) {
    AssistSeverity.ask => brand.accent,
    AssistSeverity.warn => brand.terracotta,
    AssistSeverity.note => brand.mutedInk,
  };

  IconData get icon => switch (this) {
    AssistSeverity.ask => Icons.help_outline_rounded,
    AssistSeverity.warn => Icons.error_outline_rounded,
    AssistSeverity.note => Icons.info_outline_rounded,
  };
}

/// An existing entry a check is about.
@immutable
class AssistEntry {
  const AssistEntry({
    required this.id,
    required this.kasem,
    required this.english,
    required this.homographIndex,
  });

  final String id;
  final String kasem;
  final String english;
  final int homographIndex;

  static AssistEntry? fromMap(Object? raw) {
    if (raw is! Map) return null;
    final kasem = (raw['kasem'] as String?)?.trim() ?? '';
    if (kasem.isEmpty) return null;
    return AssistEntry(
      id: (raw['id'] as String?) ?? '',
      kasem: kasem,
      english: (raw['english'] as String?)?.trim() ?? '',
      homographIndex: (raw['homographIndex'] as num?)?.toInt() ?? 0,
    );
  }
}

/// One thing worth telling the contributor before they send.
@immutable
class AssistCheck {
  const AssistCheck({
    required this.id,
    required this.severity,
    required this.title,
    required this.detail,
    required this.entries,
  });

  final String id;
  final AssistSeverity severity;
  final String title;
  final String detail;
  final List<AssistEntry> entries;

  static AssistCheck? fromMap(Object? raw) {
    if (raw is! Map) return null;
    final title = (raw['title'] as String?)?.trim() ?? '';
    final detail = (raw['detail'] as String?)?.trim() ?? '';
    // A check with nothing to say would render as an empty notice, which reads
    // as a bug rather than as advice.
    if (title.isEmpty || detail.isEmpty) return null;
    return AssistCheck(
      id: (raw['id'] as String?) ?? '',
      severity: AssistSeverity.from(raw['severity'] as String?),
      title: title,
      detail: detail,
      entries: List<AssistEntry>.unmodifiable(
        (raw['entries'] as List?)
                ?.map(AssistEntry.fromMap)
                .whereType<AssistEntry>() ??
            const <AssistEntry>[],
      ),
    );
  }
}

/// Asks the backend what it notices about a draft.
///
/// Every failure path returns an empty list rather than an error. A form that
/// shows a red box where it meant to show advice has made contributing harder,
/// which is the opposite of the point — and the contribution itself is
/// unaffected either way, because the send button never consults this.
class DraftAssistService {
  const DraftAssistService(this._functions);

  final FirebaseFunctions? _functions;

  static const _timeout = Duration(seconds: 20);

  Future<List<AssistCheck>> review({
    required String kasem,
    required String english,
    required String partOfSpeech,
  }) async {
    final functions = _functions;
    if (functions == null) return const <AssistCheck>[];
    if (kasem.trim().isEmpty || english.trim().isEmpty) {
      return const <AssistCheck>[];
    }

    try {
      final result = await functions
          .httpsCallable(
            'reviewContributionDraft',
            options: HttpsCallableOptions(timeout: _timeout),
          )
          .call<Map<Object?, Object?>>({
            'kasem': kasem.trim(),
            'english': english.trim(),
            'partOfSpeech': partOfSpeech.trim(),
          });
      final checks = result.data['checks'];
      if (checks is! List) return const <AssistCheck>[];
      return List<AssistCheck>.unmodifiable(
        checks.map(AssistCheck.fromMap).whereType<AssistCheck>(),
      );
    } on Object catch (error) {
      debugPrint('reviewContributionDraft failed: $error');
      return const <AssistCheck>[];
    }
  }
}

final draftAssistServiceProvider = Provider<DraftAssistService>((ref) {
  if (!ref.watch(firebaseReadyProvider)) {
    return const DraftAssistService(null);
  }
  return DraftAssistService(FirebaseFunctions.instance);
});

/// The notices, drawn above the send button.
///
/// Renders nothing at all when there is nothing to say — no "looks good" box,
/// no green tick. A form that congratulates somebody for filling it in
/// correctly has added a thing to read to every submission that did not need
/// one.
class DraftAssistNotices extends StatelessWidget {
  const DraftAssistNotices({required this.checks, super.key});

  final List<AssistCheck> checks;

  @override
  Widget build(BuildContext context) {
    if (checks.isEmpty) return const SizedBox.shrink();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final check in checks) ...[
          _AssistNotice(check: check),
          const SizedBox(height: 10),
        ],
      ],
    );
  }
}

class _AssistNotice extends StatelessWidget {
  const _AssistNotice({required this.check});

  final AssistCheck check;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final colour = check.severity.color(brand);
    return GlassSurface(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(check.severity.icon, size: 18, color: colour),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  check.title,
                  style: TextStyle(
                    color: brand.ink,
                    fontSize: 14,
                    fontWeight: FontWeight.w800,
                    height: 1.3,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Padding(
            padding: const EdgeInsets.only(left: 28),
            child: Text(
              check.detail,
              style: TextStyle(
                color: brand.mutedInk,
                fontSize: 12.5,
                height: 1.45,
              ),
            ),
          ),
          if (check.entries.isNotEmpty) ...[
            const SizedBox(height: 10),
            Padding(
              padding: const EdgeInsets.only(left: 28),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  for (final entry in check.entries)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 4),
                      child: Text.rich(
                        TextSpan(
                          children: [
                            TextSpan(
                              text: entry.kasem,
                              style: TextStyle(
                                color: brand.ink,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                            TextSpan(
                              text: ' — ${entry.english}',
                              style: TextStyle(color: brand.mutedInk),
                            ),
                          ],
                        ),
                        style: const TextStyle(fontSize: 12.5, height: 1.4),
                      ),
                    ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}
