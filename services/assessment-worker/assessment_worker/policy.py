"""Award arithmetic, ported from services/functions/src/reward-policy.ts.

The backend recomputes every number itself; this port exists so the worker's
`proposedPoints` can be checked against the server's. Integer arithmetic only:
multipliers are basis points and rounding is half up, exactly as in TypeScript.
Cross-checked by tests/test_policy.py against vectors from the TS tests.
"""

from __future__ import annotations

DIMENSIONS = ("accuracy", "completeness", "technical", "metadata")


def round_half_up(numerator: int, denominator: int) -> int:
    return (numerator * 2 + denominator) // (denominator * 2)


def overall_score(scores: dict, weights: dict):
    """Weighted score over applicable dimensions, or None when none apply."""
    weighted = total = 0
    applied = []
    for d in DIMENSIONS:
        score = scores.get(d)
        if weights.get(d, 0) > 0 and isinstance(score, int) and not isinstance(score, bool):
            if not 0 <= score <= 100:
                raise ValueError(f"{d} must be 0-100")
            weighted += weights[d] * score
            total += weights[d]
            applied.append(d)
    if not total:
        return None
    return {"numerator": weighted, "denominator": total, "display": round(weighted / total * 10) / 10, "applied": applied}


def band_for(score: dict, bands: list):
    chosen = None
    for band in bands:
        if score["numerator"] >= band["minScore"] * score["denominator"]:
            chosen = band
    return chosen


def compute_award(category: dict, bands: list, scores: dict, verified_effort: int = 0) -> dict:
    """Mirror of computeAward(): returns band id (or None), points and the calculation text."""
    if not isinstance(scores.get("accuracy"), int):
        return {"score": None, "band": None, "points": None, "calculation": "Accuracy needs a score from a trusted reference or a validator."}
    overall = overall_score(scores, category["weights"])
    if overall is None:
        return {"score": None, "band": None, "points": None, "calculation": "No applicable dimension has a score."}
    band = band_for(overall, bands)
    effort = category.get("effortUnit")
    units = min(max(0, verified_effort) // effort["unitSize"], effort["maxUnits"]) if effort else 0
    effort_points = units * effort["pointsPerUnit"] if effort else 0
    if band is None:
        return {"score": overall["display"], "band": None, "points": 0,
                "calculation": f"Score {overall['display']} is below {bands[0]['minScore']}: no automatic award."}
    raw = round_half_up((category["basePoints"] + effort_points) * band["multiplierBps"], 10000)
    points = min(max(raw, category["minPoints"]), category["maxPoints"])
    return {"score": overall["display"], "band": band["id"], "points": points,
            "calculation": f"{category['basePoints']} category points × {band['multiplierBps'] / 10000:.2f} {band['label'].lower()}-quality multiplier = {raw} points"}
