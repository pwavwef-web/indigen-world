# Firebase Functions

This service contains trusted backend execution shared by the Indigen World website, TribeStudio, and mobile app.

## Responsibilities

- Privileged APIs and callable functions
- Role and permission enforcement beyond client checks
- Validation workflow transitions
- Reward and bounty calculations
- Notification and transactional-message orchestration
- Scheduled jobs, exports, and accountability reports
- AI gateway endpoints and safety controls
- Audit-log generation
- Data-integrity enforcement across related Firestore records

## Rules

- Clients must not be trusted to assign roles, approve content, award points, settle rewards, or change consent and licence states.
- Every privileged mutation must authenticate the actor, authorise the role, validate the transition, and write an audit event.
- AI credentials and external-provider secrets belong in Firebase Secret Manager, never in source or client bundles.
- Functions must preserve community-governance metadata and reject publication or model-training operations when permissions are incomplete.

## Expected stack

TypeScript on Firebase Functions. Add package metadata, local emulator scripts, tests, linting, and build configuration when the service is scaffolded.

## Module direction

Prefer domain modules such as `identity`, `language-cells`, `content`, `validation`, `campaigns`, `rewards`, `consent`, `notifications`, `ai`, and `audit` instead of one oversized functions entry file.
