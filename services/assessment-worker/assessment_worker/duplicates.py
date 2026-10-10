"""Exact and near-duplicate detection.

Similarity is a FLAG for a validator, never proof of fraud and never an
automatic rejection:

* text categories (`duplicatePolicy: text`): an exact copy of an ACCEPTED
  record adds nothing to the dataset, so it is reported as needing a decision
  (the backend then requires an explicit "distinct variant" judgement).
  Near matches are listed so a validator can tell a useful variant from spam.
* speech categories (`duplicatePolicy: speech`): the same words from another
  speaker can be legitimate speech diversity, so matching TEXT is only noted;
  an identical audio FILE (same bytes) is the duplicate signal.

Matches against the same account's pending work and other accounts' pending
work are reported separately: repeated submissions across accounts are
visible to the validator without being assumed to be misconduct.
"""

from __future__ import annotations

from .text import comparison_key

NEAR_THRESHOLD = 0.85


def trigrams(text: str) -> set[str]:
    padded = f"  {comparison_key(text)} "
    return {padded[i:i + 3] for i in range(len(padded) - 2)}


def jaccard(a: set[str], b: set[str]) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def find_duplicates(kasem: str, english: str, candidates: list[dict], contributor_id: str, limit: int = 10) -> list[dict]:
    """candidates: {ref, kasem, english, scope: accepted|pending, contributorId}."""
    key = comparison_key(kasem)
    meaning = comparison_key(english)
    grams = trigrams(kasem)
    found = []
    for c in candidates:
        if not c.get("kasem"):
            continue
        scope = "accepted" if c.get("scope") == "accepted" else (
            "pending-same-account" if c.get("contributorId") == contributor_id else "pending-other-account")
        if comparison_key(c["kasem"]) == key and key:
            # Same words with a different meaning is a homograph or a different use, not a copy.
            same_meaning = not meaning or not c.get("english") or comparison_key(c["english"]) == meaning
            found.append({"kind": "exact" if same_meaning else "near", "scope": scope, "ref": c["ref"], "similarity": 1.0 if same_meaning else 0.9})
            continue
        similarity = jaccard(grams, trigrams(c["kasem"]))
        if similarity >= NEAR_THRESHOLD:
            found.append({"kind": "near", "scope": scope, "ref": c["ref"], "similarity": round(similarity, 3)})
    found.sort(key=lambda d: (d["kind"] != "exact", d["scope"] != "accepted", -d["similarity"]))
    return found[:limit]
