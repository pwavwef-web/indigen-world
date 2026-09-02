/// Turning what a member typed into the list of translations they meant.
///
/// ── This is a mirror, and the original is authoritative ──────────────────
/// `parseTranslations` in `services/functions/src/lexical-kinds.ts` is the
/// rule; this is the same rule, in Dart, so the chips the member watches
/// appear under the field are exactly the entries the server will store. The
/// server parses again on arrival regardless — a client is not allowed to
/// decide what goes into the dictionary — so a drift here is not a data bug,
/// it is worse in its own way: the member sees five chips, four are saved, and
/// nothing anywhere tells them which one went. Hence a pure function with its
/// own tests rather than a `split(',')` inlined in the widget.
///
/// The alternative that was rejected: asking the server to parse and echoing
/// its answer back as the preview. Correct by construction, and it puts a
/// network round trip between a keystroke and the chip it draws — on the
/// connections this screen is built for, that is a preview that appears
/// several seconds after the thing it is previewing.
library;

/// The most translations one entry may carry.
///
/// Mirrors `MAX_TRANSLATIONS`. Eight is past the point of usefulness for a
/// dictionary row and well short of the point where somebody has pasted a
/// paragraph into the box.
const int kMaxTranslations = 8;

/// The most characters one translation may carry; longer is truncated.
/// Mirrors `MAX_TRANSLATION_LENGTH`.
const int kMaxTranslationLength = 120;

/// Splits on commas, forward slashes and line breaks.
///
/// Newlines are in here as well as the two separators the helper text names,
/// because a phone keyboard's return key is a separator in everybody's head
/// and treating it as part of a word produces an entry with an invisible line
/// break in the middle of it. The field does not advertise it; it just works.
final RegExp _separators = RegExp(r'[,/\n\r]+');

/// Collapses runs of whitespace, so "good   morning" and "good morning" are
/// the same answer rather than two entries that look identical.
final RegExp _whitespace = RegExp(r'\s+');

/// What a member typed, as the list of translations it means.
///
/// The rules, and why each one is here:
///
///   * Commas and slashes split, because those are what people actually use.
///     "greeting, hello" and "water / rain water" are both a list, and storing
///     either one whole gave the entry a headword no search will ever match
///     and no learner will ever type.
///   * Internal whitespace collapses.
///   * De-duplication is case-insensitive and keeps the FIRST spelling seen.
///     The first spelling is the one the member reached for without thinking,
///     which is better evidence about the language than a later repetition —
///     and keeping the first makes the function order-stable, so re-parsing
///     text that has already been parsed changes nothing.
///   * Over-long entries are truncated rather than dropped. A 400-character
///     "translation" is a sentence pasted into the wrong box, and throwing the
///     whole answer away over it costs a member on a metered connection the
///     six good translations sitting beside it.
///   * The cap is applied last, after de-duplication, so eight distinct
///     translations survive somebody who typed twelve with repeats.
///
/// Pure and total: it never throws, whatever is in the field. It is called on
/// every keystroke.
List<String> parseTranslations(String raw) =>
    _split(raw, cap: kMaxTranslations);

/// How many distinct translations are in [raw], ignoring the cap.
///
/// Only the field's helper line uses this, and it earns its place there: a
/// member who typed twelve answers and watched eight chips appear is owed the
/// sentence "8 of 12 kept" rather than being left to count. Saying nothing
/// would mean four translations vanished silently, which is the failure mode
/// the whole chip preview exists to prevent.
int distinctTranslationCount(String raw) => _split(raw, cap: null).length;

List<String> _split(String raw, {required int? cap}) {
  if (raw.isEmpty) return const <String>[];
  final seen = <String>{};
  final out = <String>[];
  for (final piece in raw.split(_separators)) {
    var value = piece.trim().replaceAll(_whitespace, ' ');
    if (value.length > kMaxTranslationLength) {
      value = value.substring(0, kMaxTranslationLength).trim();
    }
    if (value.isEmpty) continue;
    if (!seen.add(value.toLowerCase())) continue;
    out.add(value);
    if (cap != null && out.length >= cap) break;
  }
  return List.unmodifiable(out);
}

/// Whether what is in the field would survive the trip.
///
/// Asked separately from [parseTranslations] so the submit button can be
/// disabled without the caller re-deriving "is the list empty" at three
/// different call sites and getting one of them subtly wrong.
bool hasUsableTranslation(String raw) => parseTranslations(raw).isNotEmpty;
