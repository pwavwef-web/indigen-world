"""Builds one structured assessment from a job.

Order of evidence, strongest first:
1. deterministic checks (schema, encoding, orthography, duplicates, audio);
2. trusted references (published dictionary entries, published expressions,
   accepted training pairs);
3. Kawuri's proposals, labelled as such and capped;
4. the validator, who decides — this module only recommends, and every result
   says `routing: validator-review`.

Uncertainty is reported separately from quality: a dimension with no
evidence is left unscored (null) and explained, not guessed.
"""

from __future__ import annotations

from datetime import datetime, timezone

from . import RESULT_SCHEMA_VERSION, WORKER_NAME, WORKER_VERSION
from .duplicates import find_duplicates
from .kawuri import review
from .policy import DIMENSIONS, compute_award
from .text import comparison_key, encoding_findings, looks_like_english, normalize_nfc, orthography_findings, tokens

MAX_TEXT = 5000


class JobError(ValueError):
    """A job that cannot be assessed as given. Not retryable."""


def _required(job: dict) -> dict:
    for key in ("submissionId", "contributionKey", "category", "input", "policy"):
        if key not in job:
            raise JobError(f"job is missing {key}")
    data = job["input"]
    if not isinstance(data, dict):
        raise JobError("input must be an object")
    for key in ("kasemText", "englishMeaning"):
        value = data.get(key, "")
        if not isinstance(value, str) or len(value) > MAX_TEXT:
            raise JobError(f"input.{key} must be text up to {MAX_TEXT} characters")
    return data


def relevant_references(data: dict, references: list[dict]) -> list[dict]:
    words = set(tokens(data.get("kasemText", "")))
    key = comparison_key(data.get("kasemText", ""))
    scored = []
    for ref in references:
        rk = comparison_key(ref.get("kasem", ""))
        overlap = len(words & set(tokens(ref.get("kasem", ""))))
        if rk == key or overlap:
            scored.append((rk == key, overlap, ref))
    scored.sort(key=lambda t: (not t[0], -t[1]))
    return [r for _, _, r in scored[:12]]


def assess(job: dict, references: list[dict], candidates: list[dict], generator=None, audio: dict | None = None,
           media_duplicate: dict | None = None) -> dict:
    """references: trusted {kasem, english, source, ref}; candidates: duplicate candidates (see duplicates.py)."""
    data = _required(job)
    category_policy = job["policy"]["category"]
    bands = job["policy"]["bands"]
    kasem, english = data.get("kasemText", ""), data.get("englishMeaning", "")
    context = (data.get("context") or "").strip()
    dialect = data.get("dialect") or ""
    reasons: list[str] = []
    uncertainty: list[dict] = []
    clarifications: list[str] = []
    evidence: list[dict] = []
    eligibility: list[dict] = []

    # Schema and gates (the backend re-checks consent; reported here for completeness).
    permissions = data.get("permissions") or {}
    eligibility.append({"id": "training-permission", "status": "pass" if permissions.get("aiTraining") and permissions.get("consentVersion") else "fail",
                        "detail": "Training permission recorded." if permissions.get("aiTraining") else "No training permission on this revision."})
    eligibility.append({"id": "required-fields", "status": "pass" if kasem.strip() and english.strip() else "fail",
                        "detail": "Kasem and English are both present." if kasem.strip() and english.strip() else "Kasem or its English meaning is missing."})
    if category_policy["requirements"].get("audio"):
        eligibility.append({"id": "audio-usable", "status": "needs-review" if not audio or audio["status"] != "usable" else "pass",
                            "detail": "Recording analysed and usable." if audio and audio["status"] == "usable" else "Recording needs a listen before deciding."})

    # Text: encoding and orthography. The original is preserved; NFC is a separate, derived form.
    findings = encoding_findings(kasem)
    rules, ortho = orthography_findings(kasem, dialect)
    findings += ortho
    for f in findings:
        if f["rule"].startswith("bgl97:"):
            evidence.append({"ref": f"orthography:{f['rule'].split(':', 1)[1]}", "kind": "orthography-rule", "summary": f["message"][:300]})
    if rules == "none":
        uncertainty.append({"aspect": "orthography", "detail": "No verified spelling rules for this variety are on file; spelling was not checked. This is not a penalty."})
    if not dialect or dialect.strip().lower() in ("kasem", "unknown"):
        uncertainty.append({"aspect": "dialect", "detail": "The variety is not specific. The contribution is not penalised; a validator can record it."})

    # Duplicates.
    duplicates = find_duplicates(kasem, english, candidates, job.get("contributorId", ""))
    if category_policy.get("duplicatePolicy") == "speech":
        # Same words from another speaker are legitimate diversity: only an identical file is a duplicate.
        duplicates = [d for d in duplicates if d["scope"] == "pending-same-account" or d["kind"] == "near"]
        if media_duplicate:
            duplicates.insert(0, media_duplicate)
    exact_accepted = any(d["kind"] == "exact" and d["scope"] == "accepted" for d in duplicates)
    if exact_accepted:
        eligibility.append({"id": "not-a-duplicate", "status": "needs-review", "detail": "Identical to an accepted record. A validator decides whether it is a distinct, useful variant."})
        reasons.append("An identical record is already accepted; a copy adds nothing unless it is a distinct variant (e.g. different context).")
    if any(d["scope"] == "pending-other-account" for d in duplicates):
        reasons.append("Similar or identical text is pending from another account. This is a flag only — it can be a common expression.")
    if any(d["scope"] == "pending-same-account" and d["kind"] == "exact" for d in duplicates):
        reasons.append("The same contributor has an identical pending submission.")

    # Trusted references: the only automatic basis for accuracy.
    key, meaning = comparison_key(kasem), comparison_key(english)
    supporting = [r for r in references if comparison_key(r.get("kasem", "")) == key and comparison_key(r.get("english", "")) == meaning and key]
    for r in supporting[:3]:
        evidence.append({"ref": r.get("ref", ""), "kind": "trusted-reference", "summary": f"Published/accepted record with the same Kasem and meaning ({r.get('source', '')})."[:300]})

    # Kawuri.
    kawuri = review(data, relevant_references(data, references), generator)
    for f in kawuri["findings"]:
        evidence.append({"ref": "kawuri", "kind": "model-finding", "summary": f["observation"][:300]})
    if kawuri.get("injectionSuspected"):
        uncertainty.append({"aspect": "model", "detail": "The text appears to contain instructions aimed at reviewers or the model. They were not followed."})
    if kawuri["status"] in ("unavailable", "invalid-output"):
        uncertainty.append({"aspect": "model", "detail": "Kawuri was unavailable or gave an unusable answer; nothing was assumed from it."})
    if kawuri.get("clarification"):
        clarifications.append(kawuri["clarification"][:300])

    # Dimensions.
    dims = {}
    if supporting:
        dims["accuracy"] = {"score": 90, "basis": "reference", "notes": ["Matches a trusted record. A validator still confirms."]}
    elif kawuri["accuracy"] is not None:
        dims["accuracy"] = {"score": kawuri["accuracy"], "basis": "model-proposal",
                            "notes": [f"Kawuri's proposal ({kawuri.get('consistency')}), capped at 79 because a model cannot verify Kasem."]}
    else:
        dims["accuracy"] = {"score": None, "basis": "unavailable", "notes": ["No trusted reference or usable model evidence: a fluent validator must judge accuracy."]}
        uncertainty.append({"aspect": "meaning", "detail": "Accuracy could not be checked automatically."})

    copy_problem = looks_like_english(kasem, english)
    alignment_status = "unavailable"
    alignment_notes: list[str] = []
    if copy_problem:
        alignment_status = "uncertain"
        alignment_notes.append(copy_problem)
    elif kawuri.get("alignment") in ("aligned", "uncertain"):
        alignment_status = kawuri["alignment"]
    elif kawuri.get("alignment") == "misaligned":
        alignment_status = "uncertain"
        alignment_notes.append("Kawuri thinks the English may not match the Kasem. A validator should check.")
    completeness = None
    if kasem.strip() and english.strip():
        completeness = 30 if copy_problem else 75
        if context and len(context.split()) >= 3 and not copy_problem:
            completeness = 95
        elif not context:
            clarifications.append("When or to whom is this said? A short situation makes it far more useful as training data.")
    dims["completeness"] = {"score": completeness, "basis": "deterministic" if completeness is not None else "unavailable",
                            "notes": ([copy_problem] if copy_problem else []) + (["Usage context given."] if completeness == 95 else ["No usage context yet."] if completeness == 75 else [])}

    if category_policy["weights"].get("technical", 0) == 0:
        dims["technical"] = {"score": None, "basis": "not-applicable", "notes": []}
    elif category_policy["requirements"].get("audio"):
        dims["technical"] = {"score": audio.get("score") if audio else None, "basis": "deterministic" if audio and audio.get("score") is not None else "unavailable",
                             "notes": (audio or {}).get("notes", [])[:6]}
    else:
        warnings = sum(1 for f in findings if f["severity"] == "warning")
        dims["technical"] = {"score": max(50, 95 - 10 * warnings), "basis": "deterministic",
                             "notes": [f"{warnings} encoding/spelling warning(s) to check."] if warnings else ["Clean Unicode text."]}

    metadata = 60
    notes = []
    if permissions.get("consentVersion"):
        metadata += 10
    if data.get("sourceType"):
        metadata += 10
        notes.append(f"Source: {data['sourceType']}.")
    if dialect and dialect.strip().lower() not in ("kasem", "unknown"):
        metadata += 15
    else:
        notes.append("Variety not specific.")
    dims["metadata"] = {"score": min(metadata, 95), "basis": "deterministic", "notes": notes}

    scores = {d: dims[d]["score"] for d in DIMENSIONS}
    award = compute_award(category_policy, bands, scores) if dims["accuracy"]["score"] is not None else None
    if award is None:
        recommended, proposed, overall = None, None, None
        reasons.append("No band is recommended because accuracy needs a validator.")
    else:
        overall = award["score"]
        recommended = award["band"] or "below-threshold"
        proposed = award["points"] if award["band"] else 0
        reasons.append(f"Recommendation (not a decision): {award['calculation']}")

    audio_block = None
    if audio is not None:
        audio_block = {k: audio.get(k) for k in ("status", "durationSeconds", "speechSeconds", "clippingRatio", "silenceRatio")}
        audio_block["notes"] = audio.get("notes", [])[:12]
    elif category_policy["requirements"].get("audio"):
        audio_block = {"status": "unavailable", "durationSeconds": None, "speechSeconds": None, "clippingRatio": None, "silenceRatio": None,
                       "notes": ["No recording could be analysed."]}

    nfc = normalize_nfc(kasem)
    result = {
        "schemaVersion": RESULT_SCHEMA_VERSION,
        "submissionId": job["submissionId"], "revisionId": job.get("submissionId"), "contributionKey": job["contributionKey"],
        "category": job["category"],
        "evaluator": {"worker": WORKER_NAME, "version": WORKER_VERSION, "model": kawuri.get("model"), "modelStatus": kawuri["status"],
                      "policyId": job["policy"]["id"], "policyVersion": job["policy"]["version"]},
        "eligibility": eligibility,
        "dimensions": {d: {"score": dims[d]["score"], "basis": dims[d]["basis"], "notes": [n[:500] for n in dims[d]["notes"]][:12]} for d in DIMENSIONS},
        "overallScore": overall, "recommendedBand": recommended, "proposedPoints": proposed,
        "duplicates": duplicates,
        "orthography": {"original": kasem, "normalizedNfc": nfc, "changed": nfc != kasem, "rulesApplied": rules, "findings": findings[:30]},
        "alignment": {"status": alignment_status, "notes": alignment_notes},
        "audio": audio_block,
        "uncertainty": uncertainty[:20],
        "reasons": [r[:500] for r in reasons][:20],
        "clarifications": clarifications[:5],
        "evidence": evidence[:30],
        "kawuri": {"status": kawuri["status"], "findings": kawuri["findings"]},
        "routing": "validator-review",
        "completedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }
    validate_result(result)
    return result


def validate_result(result: dict) -> None:
    """Self-check against the backend contract before writing (the backend validates again)."""
    expected = {"schemaVersion", "submissionId", "revisionId", "contributionKey", "category", "evaluator", "eligibility", "dimensions",
                "overallScore", "recommendedBand", "proposedPoints", "duplicates", "orthography", "alignment", "audio", "uncertainty",
                "reasons", "clarifications", "evidence", "kawuri", "routing", "completedAt"}
    if set(result) != expected:
        raise AssertionError(f"result fields differ: {set(result) ^ expected}")
    acc = result["dimensions"]["accuracy"]
    if acc["basis"] == "model-proposal" and acc["score"] is not None and acc["score"] > 79:
        raise AssertionError("model-only accuracy above 79")
    for d in DIMENSIONS:
        s = result["dimensions"][d]["score"]
        if s is not None and (not isinstance(s, int) or not 0 <= s <= 100):
            raise AssertionError(f"{d} score out of range")
    if result["routing"] != "validator-review":
        raise AssertionError("routing")
