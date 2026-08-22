# ADR 0002: Keep Firebase Authoritative and Add a Bounded DigitalOcean API

- **Status:** Accepted
- **Date:** 2026-08-21
- **Decision owner:** Francis Pwavwe

## Context

Indigen World already uses Firebase Authentication, custom role claims, Firestore, Cloud Storage, App Check, Remote Config, and trusted Firebase Functions. Its shared contracts preserve governance metadata such as community, dialect, attribution, validation, consent, licensing, cultural permission, publication eligibility, AI-training eligibility, and audit references.

The team also has access to a production Node.js, Express, Prisma, and PostgreSQL backend from another product. That backend contains useful operational patterns, but its identity, schema, routes, scheduled jobs, payments, system accounts, and data model are specific to a university student platform. Copying it wholesale would introduce a second identity system, a second source of truth, and unrelated domain behaviour.

Some Indigen World workloads may still benefit from a persistent custom API on DigitalOcean, especially provider-independent AI orchestration, media processing, long-running jobs, controlled external integrations, and future APIs that do not fit naturally within callable Functions.

## Decision

Adopt a hybrid architecture with explicit authority boundaries.

### Identity and authorization

- Firebase Authentication remains the only end-user identity authority.
- Clients send Firebase ID tokens to custom APIs over HTTPS.
- Custom APIs verify ID tokens with the Firebase Admin SDK and authorize from verified claims.
- The platform does not issue a second application JWT for Firebase-authenticated users.
- Firebase App Check tokens are required for supported first-party client traffic after staged enforcement is verified.
- Role assignment remains a privileged, audited server operation. Clients cannot assign or elevate their own claims.

### Data authority

- Firestore remains authoritative for existing identity-linked, language, cultural, contribution, validation, consent, creator, notification, and audit records.
- Firebase Storage remains the default object store unless a later ADR selects another store for a bounded workload.
- PostgreSQL is not adopted merely because the reference backend uses Prisma.
- A future PostgreSQL database requires a separate ADR naming its bounded context, ownership, migration plan, retention policy, and reconciliation strategy.
- The same mutable business record must not be independently authoritative in both Firestore and PostgreSQL.

### Trusted execution

- `services/functions` continues to own Firebase event triggers, callable workflows, scheduled Firebase work, and operations closely coupled to Firestore or Authentication.
- A planned `services/api` service may run on DigitalOcean for long-lived HTTP APIs, AI/provider adapters, compute-heavy processing, webhooks, and explicitly assigned background work.
- Both runtimes must reuse shared contracts and the same authorization, transition-validation, and audit semantics.
- Shared pure TypeScript backend policy may be extracted into `packages/backend-core` when the first cross-runtime use case exists. It must not contain provider credentials or deployment-specific code.
- Any Admin SDK write bypasses Firestore Security Rules and therefore must authenticate the actor, authorize the role, validate the state transition, enforce consent and cultural permissions, and append an audit event.

### DigitalOcean deployment boundary

- The initial deployment target for `services/api` is DigitalOcean App Platform unless native runtime or operational requirements justify a droplet or container-specific ADR.
- HTTP serving, background workers, and scheduled execution are separate components when scaling could duplicate work.
- Development, staging, and production use distinct Firebase projects and distinct DigitalOcean components/secrets.
- Secrets are injected from approved secret stores and never committed to Git or embedded in deployment commands.
- Every service exposes minimal liveness and readiness endpoints without returning secret values, identity metadata, or provider configuration.

### Reference-backend reuse policy

- Reuse is selective and reviewable: algorithms, tests, operational lessons, and small provider adapters may be ported.
- Reference code is translated to the Indigen World Node 22, TypeScript, ESM, contract, identity, and audit conventions.
- Reference environment files, credentials, migrations, database schema, generated data, product routes, custom JWT flow, system accounts, payment configuration, and deployment paths are excluded.
- A copied module is not accepted until its dependencies, licences, tests, threat model, and data-governance implications are reviewed.

## Intended request flow

```text
First-party client
  -> Firebase Auth ID token + Firebase App Check token
  -> services/api on DigitalOcean
  -> shared authorization, contract validation, and audit policy
  -> Firestore / Firebase Storage / approved provider

Firebase event or callable workflow
  -> services/functions
  -> the same shared policy
  -> Firestore / Firebase Auth / Firebase Storage
```

## Consequences

### Positive

- Existing users, roles, Security Rules, and audit semantics remain authoritative.
- DigitalOcean can host workloads that need a persistent process without forcing a full backend migration.
- The team reuses proven implementation ideas without importing an unrelated product model.
- PostgreSQL and alternative storage remain available when a concrete bounded need appears.
- Client integrations use one identity token and one role system.

### Costs

- Two trusted runtimes must share policy deliberately to prevent authorization drift.
- Custom API clients must attach both Auth and App Check tokens.
- Admin SDK code requires stronger application-level authorization because it bypasses Security Rules.
- Observability must correlate Firebase Functions and DigitalOcean request/audit identifiers.
- Local development needs both Firebase emulators and the custom API when testing cross-runtime flows.

## Guardrails

- No second end-user JWT layer without a superseding ADR.
- No wholesale import of the reference backend.
- No PostgreSQL-backed duplicate of an authoritative Firestore collection.
- No privileged mutation without authentication, authorization, transition validation, and audit generation.
- No provider secret in source, fixtures, documentation, build output, or client bundles.
- No scheduled loop inside every horizontally scaled API replica.
- No production deployment before staging identity, App Check, audit, failure, and rollback verification.

## Revisit conditions

Revisit this decision if measured scale, query requirements, cost, regional availability, regulatory obligations, offline synchronization, or operational reliability show that Firestore or the split runtime is materially unsuitable. Any replacement proposal must include identity migration, data migration, dual-write avoidance, rollback, and client compatibility plans.
