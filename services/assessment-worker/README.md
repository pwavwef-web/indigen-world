# Contribution assessment worker (Python)

Proposes — never decides — whether a contribution revision is useful,
high-quality training data. A fluent validator decides on TribeStudio's
Rewards desk; the Node backend (`services/functions/src/reward-assessment.ts`)
validates every result again and owns every points decision. Formulas,
statuses and rollout: `docs/product/contributor-rewards.md`.

## How production calls it

```
submission written ─► onSubmissionForReward (Node) creates contributionAssessmentJobs/{jobId}
                                     │  (Firestore rules: no client can create or read jobs)
                                     ▼
          run_assessment_job (this codebase, Firestore on_document_created, us-central1)
              lease (queued → running) · load trusted references · measure media
              · deterministic checks · Kawuri review · strict self-validation
                                     ▼
          job.status = completed + result   (or failed + retryable)
                                     ▼
          onAssessmentJobWritten (Node) validates the result, computes the
          estimate itself, routes the assessment to a validator
          sweepAssessmentJobs (Node, every 15 min) retries stalled jobs, max 3
```

## Local

```bash
cd services/assessment-worker
python -m venv venv
venv/Scripts/pip install -r requirements.txt      # venv/bin/pip on macOS/Linux
venv/Scripts/python -m unittest discover -s tests -v
venv/Scripts/python -m assessment_worker.cli assess examples/job.example.json
```

Against the emulators (after `npx firebase emulators:start --only auth,firestore --project demo-indigen-world`):

```bash
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 venv/Scripts/python -m assessment_worker.cli run-job JOB_ID --project demo-indigen-world
```

`services/functions/scripts/dev/seed-rewards-ui.mjs` runs it for every seeded job.
The core checks use only the standard library and numpy; Firebase, Storage and
Vertex are imported lazily.

## Deploy

Its own codebase, so a deploy of it never touches the Node functions:

```bash
cd services/assessment-worker
python -m venv venv && venv/Scripts/pip install -r requirements.txt   # Python 3.14 = runtime python314
cp .env.example .env        # ASSESSMENT_KAWURI=vertex to enable Kawuri; off for checks only
cd ../..
npx firebase deploy --only functions:assessment --config firebase.assessment.json --project project-kassena-7e026
```

* The runtime service account needs **Vertex AI User** (`roles/aiplatform.user`)
  for Kawuri and read access to the Storage bucket for recordings — the same
  grants `kawuriChat` already relies on.
* After deploying, switch **Finance → Reward policies → Rollout → Python
  assessment worker: On**. Until then the backend sends assessments straight
  to validators and says so.
* Verified locally on 2026-10-10: the Firebase CLI discovers
  `run_assessment_job` from this venv (`emulators:start --only functions
  --config firebase.assessment.json`). It has **not** been deployed.

## Limits

* Accuracy is scored automatically only when the exact Kasem and meaning match
  a trusted record. Kawuri's proposal is capped at 79; otherwise a validator scores it.
* Orthography flags apply the Ghana BGL 1997 rules only; other varieties are not
  judged and the result says so.
* Speech presence is an energy measure, not recognition. Accent, variety and
  equipment never reject a recording.
* References and duplicate candidates are read per job (up to 5,000 / 2,000 rows),
  which is fine at today's scale; an index would be needed well beyond it.
