"""Indigen World contribution assessment worker.

Proposes — never decides — whether a contribution revision is useful,
high-quality training data. Every result routes to a fluent validator; see
services/functions/src/reward-assessment.ts for the backend that validates the
result again and owns every points decision.
"""

WORKER_NAME = "iw-assessment-worker"
WORKER_VERSION = "1.0.0"
RESULT_SCHEMA_VERSION = 1
