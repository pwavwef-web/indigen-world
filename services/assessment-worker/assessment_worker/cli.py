"""Run the worker locally.

Offline, on a job JSON file (no Firebase, no network):
    python -m assessment_worker.cli assess examples/job.example.json [--references refs.json] [--audio file.wav]

Against Firestore (the emulator when FIRESTORE_EMULATOR_HOST is set, otherwise
production with application default credentials):
    python -m assessment_worker.cli run-job JOB_ID --project PROJECT

Kawuri is used only when ASSESSMENT_KAWURI=vertex and google-genai is installed;
otherwise the result says `disabled` and accuracy is left to the validator.
"""

from __future__ import annotations

import argparse
import json
import sys

from .assess import assess
from .kawuri import vertex_generator


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="assessment_worker")
    sub = parser.add_subparsers(dest="command", required=True)
    a = sub.add_parser("assess", help="assess a job file offline")
    a.add_argument("job")
    a.add_argument("--references", help="JSON list of {kasem, english, source, ref}")
    a.add_argument("--candidates", help="JSON list of duplicate candidates")
    a.add_argument("--audio", help="a local recording to measure")
    r = sub.add_parser("run-job", help="lease and run one job in Firestore")
    r.add_argument("job_id")
    r.add_argument("--project", required=True)
    args = parser.parse_args(argv)
    if args.command == "assess":
        job = json.load(open(args.job, encoding="utf-8"))
        refs = json.load(open(args.references, encoding="utf-8")) if args.references else []
        candidates = json.load(open(args.candidates, encoding="utf-8")) if args.candidates else []
        audio = None
        if args.audio:
            from .audio import analyse
            audio = analyse(args.audio)
        result = assess(job, refs, candidates, vertex_generator(), audio)
        json.dump(result, sys.stdout, ensure_ascii=False, indent=2)
        print()
        return 0
    import firebase_admin  # type: ignore
    from firebase_admin import firestore  # type: ignore
    from .runner import run_job
    firebase_admin.initialize_app(options={"projectId": args.project})
    print(run_job(firestore.client(), args.job_id))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
