"""Runs one assessment job against Firestore (production or emulator).

The job document is created only by the backend (`onSubmissionForReward`,
Firestore rules deny every client). The worker:

1. leases it in a transaction (queued → running, with a lease time), so a
   duplicate trigger delivery does nothing;
2. loads trusted references and duplicate candidates;
3. downloads and measures the recording when the category needs one;
4. writes the result and `completed`, or `failed` with a retryable flag.

The backend's `onAssessmentJobWritten` validates the result again before
anything reaches an assessment, and the scheduled sweep retries stalled jobs.
"""

from __future__ import annotations

import hashlib
import logging
import os
import tempfile
from datetime import datetime, timedelta, timezone

from .assess import JobError, assess
from .kawuri import vertex_generator

LEASE_SECONDS = 300
REFERENCE_LIMIT = 5000
CANDIDATE_LIMIT = 2000
log = logging.getLogger("assessment-worker")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(value: datetime) -> str:
    return value.isoformat().replace("+00:00", "Z")


def lease(db, job_ref) -> dict | None:
    from google.cloud import firestore  # type: ignore

    @firestore.transactional
    def take(tx):
        snap = job_ref.get(transaction=tx)
        if not snap.exists:
            return None
        job = snap.to_dict()
        lease_until = job.get("leaseUntil")
        if job.get("status") == "running" and isinstance(lease_until, str) and lease_until > _iso(_now()):
            return None
        if job.get("status") not in ("queued", "running"):
            return None
        tx.update(job_ref, {"status": "running", "leaseUntil": _iso(_now() + timedelta(seconds=LEASE_SECONDS)), "startedAt": _iso(_now())})
        return job

    return take(db.transaction())


def load_references(db) -> list[dict]:
    """Trusted records only: published dictionary entries, published expressions, accepted training pairs."""
    refs: list[dict] = []
    for doc in db.collection("dictionaryEntries").limit(REFERENCE_LIMIT).stream():
        d = doc.to_dict() or {}
        if d.get("status") not in (None, "published", "PUBLISHED") and d.get("published") is not True:
            continue
        kasem = d.get("kasemText") or d.get("headword") or d.get("kasem") or ""
        english = d.get("englishText") or d.get("translation") or d.get("english") or d.get("definition") or ""
        if isinstance(kasem, str) and isinstance(english, str) and kasem:
            refs.append({"kasem": kasem, "english": english, "source": "published dictionary", "ref": f"dictionaryEntries/{doc.id}"})
    for doc in db.collection("expressionEntries").where("isPublished", "==", True).limit(REFERENCE_LIMIT).stream():
        d = doc.to_dict() or {}
        refs.append({"kasem": d.get("phrase", ""), "english": d.get("meaning", ""), "source": "published expression", "ref": f"expressionEntries/{doc.id}"})
    for doc in db.collection("contributorTrainingPairs").limit(REFERENCE_LIMIT).stream():
        d = doc.to_dict() or {}
        refs.append({"kasem": d.get("kasem", ""), "english": d.get("english", ""), "source": "accepted training pair",
                     "ref": f"contributorTrainingPairs/{doc.id}", "contributorId": d.get("contributorId")})
    return refs


def load_candidates(db, job: dict, references: list[dict]) -> list[dict]:
    candidates = [{**r, "scope": "accepted"} for r in references if r["source"] != "published dictionary"]
    query = db.collection("submissions").where("collectionKind", "==", job["category"]).where(
        "status", "in", ["SUBMITTED", "RESUBMITTED", "UNDER_REVIEW", "APPROVED"]).limit(CANDIDATE_LIMIT)
    for doc in query.stream():
        if doc.id == job["submissionId"]:
            continue
        d = doc.to_dict() or {}
        expression = d.get("expression") or {}
        candidates.append({"kasem": expression.get("phrase") or d.get("body", ""), "english": expression.get("meaning") or d.get("title", ""),
                           "scope": "pending", "contributorId": d.get("authUid"), "ref": f"submissions/{doc.id}"})
    return candidates


def measure_media(job: dict) -> tuple[dict | None, dict | None]:
    media = (job.get("input") or {}).get("media")
    if not media or not job["policy"]["category"]["requirements"].get("audio"):
        return None, None
    from firebase_admin import storage  # type: ignore
    from .audio import MAX_BYTES, analyse
    blob = storage.bucket().blob(media["storagePath"])
    blob.reload()
    if (blob.size or 0) > MAX_BYTES:
        return {"status": "issues", "durationSeconds": None, "speechSeconds": None, "clippingRatio": None, "silenceRatio": None,
                "notes": ["The file is too large to analyse."], "score": None}, None
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "media")
        blob.download_to_filename(path)
        digest = hashlib.sha256(open(path, "rb").read()).hexdigest()
        return analyse(path), {"digest": digest}


def run_job(db, job_id: str, generator=None) -> str:
    job_ref = db.collection("contributionAssessmentJobs").document(job_id)
    job = lease(db, job_ref)
    if job is None:
        return "skipped"
    try:
        references = load_references(db)
        candidates = load_candidates(db, job, references)
        audio, media = measure_media(job)
        media_duplicate = None
        if media:
            seen = db.collection("contributionMediaDigests").document(media["digest"])
            snap = seen.get()
            if snap.exists and snap.get("submissionId") != job["submissionId"]:
                media_duplicate = {"kind": "exact", "scope": "accepted" if snap.get("accepted") else "pending-other-account",
                                   "ref": f"submissions/{snap.get('submissionId')}", "similarity": 1.0}
            elif not snap.exists:
                seen.set({"submissionId": job["submissionId"], "contributorId": job.get("contributorId"), "accepted": False, "at": _iso(_now())})
        result = assess(job, references, candidates, generator if generator is not None else vertex_generator(), audio, media_duplicate)
        job_ref.update({"status": "completed", "result": result, "completedAt": _iso(_now()), "leaseUntil": None})
        return "completed"
    except JobError as error:
        job_ref.update({"status": "failed", "error": str(error)[:300], "retryable": False, "leaseUntil": None})
        return "failed"
    except Exception as error:  # noqa: BLE001 — recorded for the sweep to retry; the validator is never blocked
        log.exception("assessment job failed", extra={"jobId": job_id})
        job_ref.update({"status": "failed", "error": type(error).__name__, "retryable": True, "leaseUntil": None})
        return "failed"
