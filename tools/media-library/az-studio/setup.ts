import { getApps, initializeApp } from 'firebase-admin/app';

// Imported first by driver.ts, so it runs before any AZ Studio module reads the
// environment or initialises its own Firebase app.
//
// The driver submits work through the same server code AZ Studio's callable API
// runs after its owner check — exactly what AZ Studio's own acceptance suite does
// (tests/acceptance/setup.ts) — with the developer's Application Default
// Credentials. Nothing here mints tokens: Cloud Tasks deliver each job to the
// deployed AZ Studio worker, which holds the model keys.
const PROJECT = process.env.AZS_PROJECT ?? 'az-learner';
process.env.GCLOUD_PROJECT = PROJECT;
process.env.GOOGLE_CLOUD_PROJECT = PROJECT;
// Bill local API calls to the studio project, whatever quota project the ADC file names.
process.env.GOOGLE_CLOUD_QUOTA_PROJECT = PROJECT;

if (!getApps().length) {
  // Tasks are enqueued with an OIDC token for the studio's runtime service
  // account, exactly as the API enqueues them.
  initializeApp({ projectId: PROJECT, serviceAccountId: `az-studio-api@${PROJECT}.iam.gserviceaccount.com` });
}
