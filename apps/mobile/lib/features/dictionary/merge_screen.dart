import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/collection/collection_data.dart';
import 'package:indigen_world_mobile/features/dictionary/data/dictionary_admin.dart';
import 'package:indigen_world_mobile/shared/glass_popup.dart';
import 'package:indigen_world_mobile/shared/glass_surface.dart';

/// Two entries for one word, side by side, and the decision about which stays.
///
/// ── What "merge" actually means here ──────────────────────────────────────
/// One entry keeps its document id and the other stops being a dictionary
/// entry. That is the whole of it, and the id is the part that matters: every
/// saved word, every shared `/entry/…` link, every Kawuri citation and every
/// note a learner wrote points at an id. So the entry that stays is the one
/// with the citations, which is usually the older one — *even when the newer
/// one has the better text*, because the text can move across and the identity
/// cannot.
///
/// ── The default is conservative, and that is what makes it safe ───────────
/// The kept entry keeps every answer it already has and gains only the ones it
/// was missing. Nothing it said is lost, which means merging the wrong pair, or
/// the right pair the wrong way round, is recoverable by merging back. A
/// reviewer who wants the duplicate's wording says so on that row, and that row
/// only.
///
/// ── Retire, not delete ────────────────────────────────────────────────────
/// The duplicate is unpublished and marked `mergedInto`, so a reader who
/// follows an old link is told where the word went instead of being shown a
/// missing page. Deleting it outright is an admin decision and is offered as
/// what it is: a way to remove a row that should never have been written.
class MergeEntriesScreen extends ConsumerStatefulWidget {
  const MergeEntriesScreen({
    required this.keepId,
    required this.keepHeadword,
    required this.duplicateId,
    required this.duplicateHeadword,
    super.key,
  });

  final String keepId;
  final String keepHeadword;
  final String duplicateId;
  final String duplicateHeadword;

  @override
  ConsumerState<MergeEntriesScreen> createState() => _MergeEntriesScreenState();
}

class _MergeEntriesScreenState extends ConsumerState<MergeEntriesScreen> {
  final _reason = TextEditingController();

  /// Which side each conflicting field takes. Absent means the kept entry's.
  final _choices = <String, String>{};

  /// Which of the two keeps its id. Swappable, because a reviewer who opened
  /// this from the newer entry very often decides the older one should stay.
  var _swapped = false;

  var _disposition = MergeDisposition.retire;
  var _merging = false;
  String? _error;
  Future<MergePreview>? _preview;

  String get _targetId => _swapped ? widget.duplicateId : widget.keepId;
  String get _sourceId => _swapped ? widget.keepId : widget.duplicateId;
  String get _targetHeadword =>
      _swapped ? widget.duplicateHeadword : widget.keepHeadword;
  String get _sourceHeadword =>
      _swapped ? widget.keepHeadword : widget.duplicateHeadword;

  @override
  void initState() {
    super.initState();
    // Assigned rather than routed through [_load], which calls `setState` —
    // correct for the swap button and pointless before the first build.
    _preview = _request();
  }

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  Future<MergePreview> _request() {
    final repository = ref.read(dictionaryAdminRepositoryProvider);
    return repository == null
        ? Future.value(
            const MergePreview(
              targetHeadword: '',
              sourceHeadword: '',
              rows: <MergeRow>[],
            ),
          )
        : repository.preview(targetId: _targetId, sourceId: _sourceId);
  }

  /// Fetches the comparison again, after a swap or a failure.
  ///
  /// The per-field choices are cleared with it, and deliberately: "take the
  /// duplicate's wording" means the opposite thing once the two entries have
  /// changed places, and silently carrying the answers across the swap would
  /// apply every one of them backwards.
  void _load() {
    setState(() {
      _choices.clear();
      _preview = _request();
    });
  }

  Future<void> _merge() async {
    final repository = ref.read(dictionaryAdminRepositoryProvider);
    if (repository == null) return;
    final reason = _reason.text.trim();
    if (reason.length < 10) {
      setState(
        () => _error =
            'Say why these are the same word — it is the only record of the merge.',
      );
      return;
    }
    final confirmed = await showGlassConfirm(
      context: context,
      title: 'Merge into “$_targetHeadword”?',
      message: _disposition == MergeDisposition.delete
          ? '“$_sourceHeadword” is removed from the archive. Its whole record is '
                'kept in the audit log, and nothing in the app will point at it '
                'again.'
          : '“$_sourceHeadword” leaves the dictionary and points at '
                '“$_targetHeadword” instead, so links and saved words still '
                'lead somewhere.',
      confirmLabel: 'Merge',
      isDestructive: _disposition == MergeDisposition.delete,
    );
    if (confirmed != true || !mounted) return;

    setState(() {
      _merging = true;
      _error = null;
    });
    try {
      await repository.merge(
        targetId: _targetId,
        sourceId: _sourceId,
        reason: reason,
        choices: _choices,
        disposition: _disposition,
      );
      ref
        ..invalidate(publishedDictionaryEntryProvider(_targetId))
        ..invalidate(publishedDictionaryEntryProvider(_sourceId));
      if (!mounted) return;
      Navigator.of(context).pop(true);
      showGlassToast(context, 'Merged into “$_targetHeadword”.');
    } on DictionaryAdminFailure catch (failure) {
      if (mounted) setState(() => _error = failure.message);
    } finally {
      if (mounted) setState(() => _merging = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return Scaffold(
      backgroundColor: brand.background,
      appBar: AppBar(title: const Text('Merge entries')),
      body: SafeArea(
        bottom: false,
        child: Align(
          alignment: Alignment.topCenter,
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 680),
            child: FutureBuilder<MergePreview>(
              future: _preview,
              builder: (context, snapshot) {
                if (snapshot.connectionState != ConnectionState.done) {
                  return const Center(child: CircularProgressIndicator());
                }
                if (snapshot.hasError) {
                  return _LoadFailed(onRetry: _load);
                }
                final preview = snapshot.data!;
                final conflicts = preview.conflicts;
                return ListView(
                  padding: const EdgeInsets.fromLTRB(18, 12, 18, 40),
                  children: [
                    _WhichStays(
                      targetHeadword: _targetHeadword,
                      sourceHeadword: _sourceHeadword,
                      onSwap: _merging
                          ? null
                          : () {
                              setState(() => _swapped = !_swapped);
                              _load();
                            },
                    ),
                    const SizedBox(height: 16),
                    if (conflicts.isEmpty)
                      GlassSurface(
                        accent: brand.success,
                        padding: const EdgeInsets.all(15),
                        child: Row(
                          children: [
                            Icon(
                              Icons.check_circle_outline_rounded,
                              color: brand.success,
                              size: 19,
                            ),
                            const SizedBox(width: 11),
                            const Expanded(
                              child: Text(
                                'Nothing conflicts. Everything the duplicate '
                                'carries that this entry is missing simply '
                                'moves across.',
                                style: TextStyle(fontSize: 13, height: 1.4),
                              ),
                            ),
                          ],
                        ),
                      )
                    else ...[
                      Text(
                        'BOTH SAY SOMETHING',
                        style: TextStyle(
                          color: brand.terracotta,
                          fontSize: 9,
                          fontWeight: FontWeight.w900,
                          letterSpacing: 1.1,
                        ),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        'Pick one for each. The kept entry’s answer is used '
                        'unless you choose otherwise, so leaving these alone '
                        'loses nothing.',
                        style: TextStyle(
                          color: brand.mutedInk,
                          fontSize: 12.5,
                          height: 1.45,
                        ),
                      ),
                      const SizedBox(height: 12),
                      for (final row in conflicts) ...[
                        _ConflictRow(
                          row: row,
                          chosen: _choices[row.field] ?? 'target',
                          enabled: !_merging,
                          onChoose: (side) => setState(() {
                            if (side == 'target') {
                              _choices.remove(row.field);
                            } else {
                              _choices[row.field] = side;
                            }
                          }),
                        ),
                        const SizedBox(height: 10),
                      ],
                    ],
                    const SizedBox(height: 6),
                    _MovingAcross(rows: preview.rows),
                    const SizedBox(height: 16),
                    Text(
                      'WHAT HAPPENS TO “$_sourceHeadword”',
                      style: TextStyle(
                        color: brand.terracotta,
                        fontSize: 9,
                        fontWeight: FontWeight.w900,
                        letterSpacing: 1.1,
                      ),
                    ),
                    const SizedBox(height: 8),
                    _DispositionChoice(
                      value: MergeDisposition.retire,
                      groupValue: _disposition,
                      title: 'Retire it',
                      body:
                          'Out of the dictionary, but still there. A saved word '
                          'or a shared link that points at it leads to '
                          '“$_targetHeadword” instead of nowhere.',
                      onChanged: _merging
                          ? null
                          : (value) => setState(() => _disposition = value),
                    ),
                    if (ref.watch(canDeleteDictionaryProvider))
                      _DispositionChoice(
                        value: MergeDisposition.delete,
                        groupValue: _disposition,
                        title: 'Delete it',
                        body:
                            'Removed from the archive. For a row that should '
                            'never have been written — a test entry, a paste '
                            'into the wrong box. The record is kept in the '
                            'audit log.',
                        destructive: true,
                        onChanged: _merging
                            ? null
                            : (value) => setState(() => _disposition = value),
                      ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: _reason,
                      minLines: 2,
                      maxLines: 5,
                      maxLength: 2000,
                      textCapitalization: TextCapitalization.sentences,
                      decoration: const InputDecoration(
                        labelText: 'Why these are one word',
                        hintText: 'Required. It is the only record of the merge.',
                        alignLabelWithHint: true,
                        prefixIcon: Icon(Icons.merge_rounded),
                      ),
                    ),
                    if (_error != null) ...[
                      GlassSurface(
                        accent: brand.terracotta,
                        padding: const EdgeInsets.all(14),
                        child: Text(
                          _error!,
                          style: const TextStyle(fontSize: 13, height: 1.4),
                        ),
                      ),
                      const SizedBox(height: 12),
                    ],
                    FilledButton.icon(
                      onPressed: _merging ? null : _merge,
                      style: FilledButton.styleFrom(
                        backgroundColor: _disposition == MergeDisposition.delete
                            ? brand.danger
                            : null,
                      ),
                      icon: _merging
                          ? const SizedBox.square(
                              dimension: 18,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Icon(Icons.merge_rounded),
                      label: Text('Merge into “$_targetHeadword”'),
                    ),
                  ],
                );
              },
            ),
          ),
        ),
      ),
    );
  }
}

/// Which entry keeps its id, and the one control that changes the answer.
class _WhichStays extends StatelessWidget {
  const _WhichStays({
    required this.targetHeadword,
    required this.sourceHeadword,
    required this.onSwap,
  });

  final String targetHeadword;
  final String sourceHeadword;
  final VoidCallback? onSwap;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return GlassSurface(
      accent: brand.accent,
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: _Side(
                  caption: 'STAYS',
                  headword: targetHeadword,
                  colour: brand.success,
                ),
              ),
              IconButton(
                tooltip: 'Swap which entry stays',
                onPressed: onSwap,
                icon: const Icon(Icons.swap_horiz_rounded),
              ),
              Expanded(
                child: _Side(
                  caption: 'FOLDS IN',
                  headword: sourceHeadword,
                  colour: brand.mutedInk,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            'The entry that stays keeps its link, its saved copies and its '
            'sense number. That is usually the older one — the wording can '
            'move across, the address cannot.',
            style: TextStyle(
              color: brand.mutedInk,
              fontSize: 12,
              height: 1.45,
            ),
          ),
        ],
      ),
    );
  }
}

class _Side extends StatelessWidget {
  const _Side({
    required this.caption,
    required this.headword,
    required this.colour,
  });

  final String caption;
  final String headword;
  final Color colour;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(
        caption,
        style: TextStyle(
          color: colour,
          fontSize: 9,
          fontWeight: FontWeight.w900,
          letterSpacing: 1.1,
        ),
      ),
      const SizedBox(height: 4),
      Text(
        headword,
        style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w900),
      ),
    ],
  );
}

class _ConflictRow extends StatelessWidget {
  const _ConflictRow({
    required this.row,
    required this.chosen,
    required this.onChoose,
    required this.enabled,
  });

  final MergeRow row;
  final String chosen;
  final ValueChanged<String> onChoose;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return GlassSurface(
      blur: false,
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            row.label.toUpperCase(),
            style: TextStyle(
              color: brand.mutedInk,
              fontSize: 9,
              fontWeight: FontWeight.w900,
              letterSpacing: 1.1,
            ),
          ),
          const SizedBox(height: 9),
          _Option(
            text: row.target,
            selected: chosen == 'target',
            caption: 'Keep this',
            onTap: enabled ? () => onChoose('target') : null,
          ),
          const SizedBox(height: 7),
          _Option(
            text: row.source,
            selected: chosen == 'source',
            caption: 'Take the duplicate’s',
            onTap: enabled ? () => onChoose('source') : null,
          ),
        ],
      ),
    );
  }
}

class _Option extends StatelessWidget {
  const _Option({
    required this.text,
    required this.selected,
    required this.caption,
    required this.onTap,
  });

  final String text;
  final bool selected;
  final String caption;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return InkWell(
      borderRadius: BorderRadius.circular(10),
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(11),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
            color: selected ? brand.accent : brand.border,
            width: selected ? 1.6 : 1,
          ),
          color: selected ? brand.accentSoft : null,
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(
              selected
                  ? Icons.radio_button_checked_rounded
                  : Icons.radio_button_unchecked_rounded,
              size: 18,
              color: selected ? brand.accent : brand.faintInk,
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    text.isEmpty ? '—' : text,
                    style: const TextStyle(fontSize: 13.5, height: 1.4),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    caption,
                    style: TextStyle(color: brand.mutedInk, fontSize: 11),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// The fields only the duplicate has, which move across without being asked
/// about.
///
/// Shown rather than left implicit: "merge" is a word people are right to be
/// nervous of, and a list of exactly what arrives is what makes the button
/// pressable.
class _MovingAcross extends StatelessWidget {
  const _MovingAcross({required this.rows});

  final List<MergeRow> rows;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final gains = rows
        .where((row) => row.target.isEmpty && row.source.isNotEmpty)
        .toList(growable: false);
    if (gains.isEmpty) return const SizedBox.shrink();
    return GlassSurface(
      blur: false,
      padding: const EdgeInsets.all(15),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'MOVING ACROSS',
            style: TextStyle(
              color: brand.success,
              fontSize: 9,
              fontWeight: FontWeight.w900,
              letterSpacing: 1.1,
            ),
          ),
          const SizedBox(height: 9),
          for (final row in gains)
            Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: RichText(
                text: TextSpan(
                  style: DefaultTextStyle.of(context).style.copyWith(
                    fontSize: 13,
                    height: 1.4,
                  ),
                  children: [
                    TextSpan(
                      text: '${row.label}: ',
                      style: TextStyle(
                        color: brand.mutedInk,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    TextSpan(text: row.source),
                  ],
                ),
              ),
            ),
          Text(
            'Meanings and recorded forms are added rather than replaced, so '
            'nothing either entry says is lost.',
            style: TextStyle(color: brand.mutedInk, fontSize: 11.5, height: 1.4),
          ),
        ],
      ),
    );
  }
}

class _DispositionChoice extends StatelessWidget {
  const _DispositionChoice({
    required this.value,
    required this.groupValue,
    required this.title,
    required this.body,
    required this.onChanged,
    this.destructive = false,
  });

  final MergeDisposition value;
  final MergeDisposition groupValue;
  final String title;
  final String body;
  final bool destructive;
  final ValueChanged<MergeDisposition>? onChanged;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final selected = value == groupValue;
    final accent = destructive ? brand.danger : brand.accent;
    return Padding(
      padding: const EdgeInsets.only(bottom: 9),
      child: InkWell(
        borderRadius: BorderRadius.circular(11),
        onTap: onChanged == null ? null : () => onChanged!(value),
        child: Container(
          padding: const EdgeInsets.all(13),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(11),
            border: Border.all(
              color: selected ? accent : brand.border,
              width: selected ? 1.6 : 1,
            ),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(
                selected
                    ? Icons.radio_button_checked_rounded
                    : Icons.radio_button_unchecked_rounded,
                size: 18,
                color: selected ? accent : brand.faintInk,
              ),
              const SizedBox(width: 11),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: TextStyle(
                        fontWeight: FontWeight.w800,
                        fontSize: 14,
                        color: destructive ? accent : null,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      body,
                      style: TextStyle(
                        color: brand.mutedInk,
                        fontSize: 12.5,
                        height: 1.45,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _LoadFailed extends StatelessWidget {
  const _LoadFailed({required this.onRetry});

  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Text(
            'The two entries could not be compared.',
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 14),
          OutlinedButton.icon(
            onPressed: onRetry,
            icon: const Icon(Icons.refresh_rounded),
            label: const Text('Try again'),
          ),
        ],
      ),
    ),
  );
}
