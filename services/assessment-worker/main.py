"""Firebase Functions (Python) entry point for the assessment worker.

Deployed as its own codebase (`assessment`) with firebase.assessment.json, so
it never touches the Node functions in services/functions. It is not callable
from the internet: it runs only when the backend creates a document in
`contributionAssessmentJobs`, which Firestore rules deny to every client.
"""

from firebase_admin import firestore, initialize_app
from firebase_functions import firestore_fn, options

from assessment_worker.runner import run_job

initialize_app()


@firestore_fn.on_document_created(
    document="contributionAssessmentJobs/{jobId}",
    region="us-central1",
    memory=options.MemoryOption.GB_1,
    timeout_sec=300,
    max_instances=5,
    # No platform retry: the backend sweep retries with a fresh job id and an attempt limit.
)
def run_assessment_job(event: firestore_fn.Event[firestore_fn.DocumentSnapshot | None]) -> None:
    if event.data is None:
        return
    run_job(firestore.client(), event.params["jobId"])
