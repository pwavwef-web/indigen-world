/// The one piece of Kasem morphology the phone computes for itself.
///
/// ── This file has a twin, and it is deliberately the smaller half ────────
/// The canonical module is `services/functions/src/kasem-morphology.ts`. Only
/// the indefinite rule is mirrored here. The noun-class table and the
/// induction that reads it stay on the server on purpose: a class inventory
/// for a language with few written sources will be corrected as contributions
/// come in, and a correction should be one deploy rather than one deploy plus
/// an app release plus waiting for members to update.
///
/// What is mirrored is mirrored because it cannot go wrong: `mo` is invariant,
/// it is attested, and a displayed indefinite form has to appear instantly on
/// an entry screen that may be open with no connection at all.
///
/// ── Why the indefinite is computed and never read from a field ───────────
/// Because it is a rule, not data. Storing it on every entry would turn one
/// fact about Kasem into thousands of copies that all become wrong together
/// the day it is refined. Computing it here means every noun already in the
/// dictionary — including the ones contributed long before any of this existed
/// — shows its indefinite form the moment this ships, with no backfill.
library;

/// The particle that makes a Kasem noun indefinite.
const String kIndefiniteParticle = 'mo';

/// The indefinite form of [headword]: the noun, then `mo`.
///
/// Returns an empty string for an empty headword rather than a bare `"mo"`.
/// The particle on its own is not the indefinite of anything, and showing it
/// would state something false about the language on an entry whose data is
/// simply missing.
///
/// Total and never throws — it is called from a display getter on rows that
/// predate every field around it.
String indefiniteForm(String headword) {
  final stem = headword.trim().replaceAll(RegExp(r'\s+'), ' ');
  if (stem.isEmpty) return '';
  return '$stem $kIndefiniteParticle';
}
