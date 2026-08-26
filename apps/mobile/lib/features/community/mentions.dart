import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/community/data/community_models.dart';
import 'package:indigen_world_mobile/features/community/data/community_providers.dart';
import 'package:indigen_world_mobile/features/community/widgets/community_avatar.dart';

/// The handle that summons the assistant into a thread.
///
/// Reserved rather than owned by an account: nobody can register it, and a
/// post that names it is answered by the backend rather than by a member.
const kawuriHandle = 'kawuri';

/// The assistant's identity as it appears anywhere a member is listed. It is
/// not a `communityProfiles` document the app reads — the backend writes
/// Kawuri's replies with a matching stamp — so the two have to agree, and this
/// is the copy the app renders from.
const kawuriProfile = CommunityProfile(
  uid: 'kawuri',
  username: kawuriHandle,
  displayName: 'Kawuri',
  bio: 'The guide inside Indigen World. Mention me in a thread and I will answer.',
  isVerified: true,
);

/// The `@handle` fragment being typed at [cursor], if the caret sits inside
/// one.
///
/// A mention is only offered while the caret is still in the word: moving away
/// means the member has moved on, and a picker that keeps hanging around after
/// that is in the way rather than helpful. An `@` immediately after a word
/// character is skipped for the same reason an email address is not a mention.
@immutable
class MentionQuery {
  const MentionQuery({
    required this.start,
    required this.end,
    required this.term,
  });

  /// Index of the `@`.
  final int start;

  /// Index just past the last character typed so far.
  final int end;

  /// What follows the `@`, lowercased. Empty right after the `@` is typed.
  final String term;

  static MentionQuery? at(String text, int cursor) {
    if (cursor < 0 || cursor > text.length) return null;
    var index = cursor - 1;
    final buffer = StringBuffer();
    while (index >= 0) {
      final char = text[index];
      if (char == '@') {
        // `a@b` is an address, not a mention.
        if (index > 0 && RegExp(r'[\w@]').hasMatch(text[index - 1])) return null;
        final term = String.fromCharCodes(
          buffer.toString().codeUnits.reversed,
        ).toLowerCase();
        if (term.length > 20) return null;
        return MentionQuery(start: index, end: cursor, term: term);
      }
      if (!RegExp(r'[A-Za-z0-9_]').hasMatch(char)) return null;
      buffer.write(char);
      index--;
    }
    return null;
  }

  /// [text] with the fragment replaced by `@username `, and where the caret
  /// belongs afterwards.
  ({String text, int cursor}) applied(String text, String username) {
    final replacement = '@$username ';
    return (
      text: text.replaceRange(start, end, replacement),
      cursor: start + replacement.length,
    );
  }
}

/// Handles matching a typed fragment, assistant first.
///
/// Kawuri leads whenever the fragment is a prefix of its handle, because
/// summoning the assistant is the one suggestion that is never in the member
/// list and would otherwise be undiscoverable.
final mentionSuggestionsProvider =
    FutureProvider.autoDispose.family<List<CommunityProfile>, String>((
      ref,
      term,
    ) async {
      final suggestions = <CommunityProfile>[
        if (kawuriHandle.startsWith(term)) kawuriProfile,
      ];
      final repository = ref.watch(communityRepositoryProvider);
      if (repository == null) return suggestions;

      final people = term.isEmpty
          ? await repository.suggestedProfiles(limit: 8)
          : await repository.searchProfiles(term);
      final ranked = people.where((p) => p.username != kawuriHandle).toList()
        ..sort((left, right) {
          // Handle matches before display-name matches: somebody typing "@ab"
          // is reaching for a handle.
          final leftRank = left.username.startsWith(term) ? 0 : 1;
          final rightRank = right.username.startsWith(term) ? 0 : 1;
          if (leftRank != rightRank) return leftRank.compareTo(rightRank);
          return left.username.compareTo(right.username);
        });
      return [...suggestions, ...ranked.take(8)];
    });

/// The picker that sits above the keyboard while a mention is being typed.
///
/// Shown only while [query] is non-null, and never taller than a few rows —
/// it shares the screen with the thing being written, which stays the point.
class MentionSuggestions extends ConsumerWidget {
  const MentionSuggestions({
    required this.query,
    required this.onSelected,
    super.key,
  });

  final MentionQuery? query;
  final void Function(CommunityProfile profile) onSelected;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final active = query;
    if (active == null) return const SizedBox.shrink();
    final suggestions = ref
        .watch(mentionSuggestionsProvider(active.term))
        .asData
        ?.value;
    if (suggestions == null || suggestions.isEmpty) {
      return const SizedBox.shrink();
    }

    return Container(
      constraints: const BoxConstraints(maxHeight: 216),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: BrandColors.divider),
        boxShadow: const [
          BoxShadow(
            color: Color(0x14000000),
            blurRadius: 18,
            offset: Offset(0, -4),
          ),
        ],
      ),
      clipBehavior: Clip.antiAlias,
      child: ListView.separated(
        shrinkWrap: true,
        padding: EdgeInsets.zero,
        itemCount: suggestions.length,
        separatorBuilder: (_, _) =>
            const Divider(height: 1, color: BrandColors.divider),
        itemBuilder: (context, index) {
          final profile = suggestions[index];
          final isAssistant = profile.username == kawuriHandle;
          return ListTile(
            dense: true,
            leading: isAssistant
                ? Container(
                    width: 34,
                    height: 34,
                    decoration: const BoxDecoration(
                      color: BrandColors.heritageGreen,
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(
                      Icons.auto_awesome_rounded,
                      size: 17,
                      color: BrandColors.kenteGold,
                    ),
                  )
                : CommunityAvatar(
                    initials: profile.initials,
                    imageUrl: profile.avatarUrl,
                    size: 34,
                  ),
            title: Row(
              children: [
                Flexible(
                  child: Text(
                    profile.displayName,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontWeight: FontWeight.w800),
                  ),
                ),
                if (profile.isVerified) ...[
                  const SizedBox(width: 4),
                  const Icon(
                    Icons.verified_rounded,
                    size: 14,
                    color: BrandColors.heritageGreen,
                  ),
                ],
              ],
            ),
            subtitle: Text(
              isAssistant ? '${profile.handle} · ask the guide' : profile.handle,
              overflow: TextOverflow.ellipsis,
            ),
            onTap: () {
              HapticFeedback.selectionClick();
              onSelected(profile);
            },
          );
        },
      ),
    );
  }
}

/// Keeps a text field and a [MentionSuggestions] picker in step.
///
/// Owning this in one place is what stops three composers — a post, a reply,
/// a reel comment — from each growing their own slightly different version of
/// "where is the caret and is it inside a handle".
class MentionComposerController extends ChangeNotifier {
  MentionComposerController(this.textController) {
    textController.addListener(_reevaluate);
  }

  final TextEditingController textController;

  MentionQuery? _query;
  MentionQuery? get query => _query;

  void _reevaluate() {
    final selection = textController.selection;
    final next = selection.isValid && selection.isCollapsed
        ? MentionQuery.at(textController.text, selection.baseOffset)
        : null;
    if (next?.start == _query?.start && next?.term == _query?.term) return;
    _query = next;
    notifyListeners();
  }

  /// Completes the fragment under the caret with [profile]'s handle.
  void complete(CommunityProfile profile) {
    final active = _query;
    if (active == null) return;
    final applied = active.applied(textController.text, profile.username);
    textController.value = TextEditingValue(
      text: applied.text,
      selection: TextSelection.collapsed(offset: applied.cursor),
    );
    _query = null;
    notifyListeners();
  }

  @override
  void dispose() {
    textController.removeListener(_reevaluate);
    super.dispose();
  }
}
