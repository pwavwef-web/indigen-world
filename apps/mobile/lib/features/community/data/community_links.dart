/// What counts as a link in a community post, and who is allowed to post one.
///
/// ── The problem ──────────────────────────────────────────────────────────
/// Scams travel on links. An anonymous account posts a shortened URL with an
/// urgent sentence over it, a few people tap it, and the account is gone. The
/// community had no answer to that at all: any signed-in account could post
/// any link, and every link in the timeline was live and tappable.
///
/// ── The answer, and why it is not a ban ──────────────────────────────────
/// A link only works on somebody if it can be tapped. So an unverified account
/// may still *write* one — refusing the post outright would push the same
/// scammer into spelling the address out in words, which is worse because it
/// is invisible to every filter — but the link does not become tappable, and
/// the post says plainly why. The person who wanted to share a real link is
/// asked to verify their number, which takes a minute and attaches a real
/// phone to the account; the person who did not want to be attached to
/// anything now has a post that does not do the thing they posted it for.
///
/// That is accountability rather than prevention, and it is the right trade
/// for a community this size. Verification is cheap for somebody honest and
/// expensive for somebody running twenty accounts.
library;

/// Every link shape a reader would recognise as one.
///
/// ── Three shapes, and the judgement in the third ─────────────────────────
///   1. A full address — `https://example.com/thing`.
///   2. A `www.` address with the scheme left off, which is what most people
///      type and what every phone keyboard autocompletes to.
///   3. A bare host with a recognised ending — `wa.me/2335…`, `bit.ly/x`.
///
/// The third is where the judgement is, and it is deliberately conservative in
/// one direction and not the other. A bare host is only treated as a link when
/// its ending is one of [_linkEndings] — which covers the shorteners, the
/// messaging deep links and the ordinary commercial endings that scams
/// actually use — so an ordinary sentence with a full stop in it is never
/// mistaken for an address. What that misses is a scam on some ending nobody
/// listed; what the looser version would cost is a masked "I saw it on
/// tv.today" in somebody's honest post, and a reader who is shown a warning on
/// ordinary writing stops reading warnings.
///
/// Kept in one place because the composer, the reader and the preview card all
/// have to agree about what a link is. Two of them disagreeing means either a
/// post that was gated and then rendered live, or one that was let through and
/// then masked — and both of those are worse than either rule alone.
final RegExp communityLinkPattern = RegExp(
  r'(?:https?://[^\s<>()]+)'
  r'|(?:www\.[^\s<>()]+)'
  r'|(?:\b[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*'
  // Not a raw string, because the ending list is interpolated into it — so
  // every backslash below is doubled. Kept to this one short segment for
  // exactly that reason.
  '\\.(?:$_linkEndings)\\b(?:/[^\\s<>()]*)?)',
  caseSensitive: false,
);

/// The endings a bare host is recognised by.
///
/// Ordered by nothing and meaning nothing beyond "somebody would read this as
/// an address". Adding one is cheap and safe; the cost of a missing one is a
/// single unmasked link, and the cost of a wrong one is a false warning on
/// ordinary writing, so the list stays short of anything ambiguous. `me` is
/// here because `wa.me` and `t.me` are the two most common shapes a scam
/// takes in this community; `co` and `io` because shorteners live on them.
const String _linkEndings =
    'com|net|org|info|biz|io|co|me|ly|gg|to|cc|tv|app|shop|store|site|online|'
    'link|live|xyz|top|club|vip|win|bet|cash|fund|loan|gift|world|space|icu|'
    'gh|ng|uk|ru|tk|ml|ga|cf|pw';

/// Whether [text] contains anything a reader would take for a link.
bool containsCommunityLink(String text) =>
    text.isNotEmpty && communityLinkPattern.hasMatch(text);

/// The first link in [text], trimmed of the punctuation that ends a sentence,
/// or null.
///
/// The trailing strip matters: "have a look at example.com." ends in a full
/// stop that belongs to the sentence and not to the address, and a preview
/// fetched for `example.com.` is a preview of nothing.
String? firstCommunityLink(String text) {
  final match = communityLinkPattern.firstMatch(text);
  if (match == null) return null;
  final raw = match.group(0)?.replaceFirst(RegExp(r'[.,!?;:]+$'), '');
  return raw == null || raw.isEmpty ? null : raw;
}

/// What a reader is told in place of a link they cannot tap.
///
/// ── Why the address is still shown ───────────────────────────────────────
/// Because hiding it entirely would make the post unintelligible — "click here
/// to claim" with a blank where the link was reads as a rendering bug, and the
/// reader has no way to judge what they are being kept from. Showing it,
/// plainly, unlinked and marked, tells them exactly what happened: somebody
/// who has not proved who they are wants them to go somewhere. That is the
/// information they need in order to decide, and it is more useful than
/// silence.
const String kMaskedLinkNotice =
    'Links from unverified accounts are not tappable. '
    'Copy it only if you trust who posted it.';

/// What somebody is told when they try to post one.
const String kVerifyToPostLinksTitle = 'Verify to post links';

const String kVerifyToPostLinksBody =
    'Links from unverified accounts are shown but cannot be tapped, so nobody '
    'can be sent anywhere by an account with no one behind it. Verifying takes '
    'a minute and needs one phone number — it is never shown to anybody.\n\n'
    'You can post this now if you like. The writing will be there; the link '
    'will not be tappable.';
